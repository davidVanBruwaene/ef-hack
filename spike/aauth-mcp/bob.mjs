// Bob's side: the agent provider, and Bob's person server (mockin behind a front that owns the public identifier).
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AGENT, BOB_NAME, PORTS, PS } from './config.mjs'
import { forward, isMain, json, listen, logger, readBody, relay } from './http.mjs'
import { agentIdentityKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'

const log = logger('bob')
const MOCKIN = `http://127.0.0.1:${PORTS.mockin}`

async function startAgentProvider() {
  const identity = await agentIdentityKey()
  const jwks = { keys: [identity.publicJwk] }
  await listen(PORTS.agent, (req, res) => {
    const path = new URL(req.url ?? '/', AGENT).pathname
    const body = path === '/.well-known/aauth-agent.json'
      ? { issuer: AGENT, name: "Bob's agent provider", jwks_uri: `${AGENT}/jwks.json` }
      : path === '/jwks.json' ? jwks : undefined
    json(res, body ? 200 : 404, body ?? { error: 'not_found' })
  }, log)
}

async function startMockin(consent) {
  const pkg = createRequire(import.meta.url).resolve('@hellocoop/mockin/package.json')
  const entry = join(dirname(pkg), JSON.parse(readFileSync(pkg, 'utf8')).bin.mockin)
  const preload = new URL('./loopback-preload.mjs', import.meta.url).href
  const child = spawn(process.execPath, ['--no-warnings', '--import', preload, entry], {
    env: { ...process.env, PORT: String(PORTS.mockin), IP: '127.0.0.1', ISSUER: PS },
    cwd: dirname(pkg),
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  process.on('exit', () => child.kill('SIGKILL'))
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0))

  for (let i = 0; ; i++) {
    try { if ((await fetch(`${MOCKIN}/.well-known/aauth-person.json`)).ok) break } catch { /* not up yet */ }
    if (i > 200) throw new Error('mockin did not start')
    await new Promise(r => setTimeout(r, 50))
  }
  const configured = await fetch(`${MOCKIN}/mock/aauth`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      claims: { name: BOB_NAME },
      ...(consent ? { person_requirement: 'interaction', auto_approve: false } : {}),
    }),
  })
  if (!configured.ok) throw new Error(`mockin config failed: ${configured.status} ${await configured.text()}`)
}

// Only the AAuth surface is public; mockin's /mock control API and its OAuth mock stay on the private port.
const isPublic = path => path === '/.well-known/aauth-person.json' || path.startsWith('/aauth/')

async function startPersonServerFront() {
  await listen(PORTS.ps, async (req, res) => {
    const url = new URL(req.url ?? '/', PS)
    if (!isPublic(url.pathname)) return json(res, 404, { error: 'not_found' })
    relay(res, await forward(req, await readBody(req), PORTS.mockin))
  }, log)
}

export async function startBob({ consent = process.env.CONSENT === '1' } = {}) {
  routeTestHostsToLoopback()
  await startAgentProvider()
  await startMockin(consent)
  await startPersonServerFront()
  log(`up: person server ${PS} (mockin behind the front, ${consent ? 'consent required' : 'auto-approve'}), agent provider ${AGENT}`)
}

if (isMain(import.meta)) await startBob()
