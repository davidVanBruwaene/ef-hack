// An agent proposes a mission at the person server (-11 §8.1) and waits for its member's answer (§8.2).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createSignedFetch, pollDeferred } from '@aauth/agent'
import { parseRequirementHeader } from '@aauth/protocol'
import { agentSession } from './agent.mjs'
import { KEY_DIR, PS, RESOURCE } from './config.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'
import { sha256 } from './store.mjs'

const MISSION_FILE = new URL('mission.json', KEY_DIR)

export async function requestMission(description, { onInteraction, resources = [RESOURCE], session } = {}) {
  routeTestHostsToLoopback()
  const agent = session ?? await agentSession()
  const { getKeyMaterial } = agent
  const signedFetch = createSignedFetch(getKeyMaterial, { signBody: true })
  const meta = await (await fetch(`${PS}/.well-known/aauth-person.json`)).json()
  if (!meta.mission_endpoint) throw new Error(`${PS} publishes no mission_endpoint`)

  let res = await signedFetch(meta.mission_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description, resources }),
  })
  if (res.status === 202) {
    const challenge = parseRequirementHeader(res.headers.get('aauth-requirement') ?? '')
    ;({ response: res } = await pollDeferred({
      signedFetch,
      locationUrl: new URL(res.headers.get('location'), meta.mission_endpoint).href,
      interactionUrl: challenge.url,
      interactionCode: challenge.code,
      onInteraction,
    }))
  }
  const body = await res.json().catch(() => ({}))
  if (res.status !== 200) throw new Error(`mission refused (${res.status}): ${body.error ?? ''} ${body.detail ?? ''}`.trim())
  // §8.2: s256 is the hash of the exact blob bytes, so check it before using the mission.
  const bytes = Buffer.from(body.mission, 'base64url')
  if (sha256(bytes) !== body.s256) throw new Error('mission s256 does not match the blob the person server returned')
  return { ps: PS, agent: agent.sub, s256: body.s256, mission: body.mission, blob: JSON.parse(bytes.toString('utf8')) }
}

export function saveMission(m) {
  mkdirSync(KEY_DIR, { recursive: true })
  writeFileSync(MISSION_FILE, `${JSON.stringify(m, null, 2)}\n`)
}

// AAUTH_MISSION_S256 when set (empty means no mission); otherwise the saved mission, if it is for this person server and unexpired.
export function currentMission() {
  const fromEnv = process.env.AAUTH_MISSION_S256
  if (fromEnv !== undefined) return fromEnv ? { s256: fromEnv } : undefined
  if (!existsSync(MISSION_FILE)) return undefined
  const m = JSON.parse(readFileSync(MISSION_FILE, 'utf8'))
  return m.ps === PS && Date.parse(m.blob.expires_at) > Date.now() ? m : undefined
}
