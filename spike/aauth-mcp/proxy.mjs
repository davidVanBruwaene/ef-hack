// stdio MCP proxy for Bob's agent: signs every request with AAuth, under the mission Bob approved.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createAAuthFetch } from '@aauth/agent'
import { bridgeTransports, serializeAuthFlows } from '@aauth/mcp-stdio'
import { agentSession } from './agent.mjs'
import { AGENT_SUB, LOOPBACK, PS, RESOURCE } from './config.mjs'
import { currentMission } from './missions.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'

routeTestHostsToLoopback()

// stdout carries MCP frames; everything human-readable goes to stderr.
const say = (...a) => console.error('[aauth-proxy]', ...a)

const mission = currentMission()
const { getKeyMaterial } = await agentSession()

// A tool call's `reason` goes to Bob's person server as the -11 justification; toJSON reads it when the token request is serialized.
let reason
const justification = { toJSON: () => reason }
const reasonOf = body => {
  try { const r = JSON.parse(body)?.params?.arguments?.reason; return typeof r === 'string' && r ? r : undefined } catch { return undefined }
}
// Inside serializeAuthFlows, so only one POST, and its auth flow, runs at a time.
const withReason = inner => async (url, init) => {
  if (init?.method !== 'POST') return inner(url, init)
  reason = typeof init.body === 'string' ? reasonOf(init.body) : undefined
  try { return await inner(url, init) } finally { reason = undefined }
}

// Bob's person server refuses a whole token request over any one item; the detail lists the item scopes it refused in brackets.
const REFUSED = /\[((?:item:[^\s\]]+ ?)+)\]/
const withHeader = (headers, name, value) => { const h = new Headers(headers); h.set(name, value); return h }

// The reason quotes Bob's mission, so it goes into the tool result here and never to Alice's server, which learns only the scopes.
async function addReasons(res, reasons) {
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return res
  const body = await res.json()
  for (const msg of Array.isArray(body) ? body : [body]) {
    const part = msg?.result?.content?.find?.(c => c.type === 'text')
    if (!part) continue
    try { part.text = JSON.stringify({ ...JSON.parse(part.text), refused_why: reasons.join(' ') }, null, 2) } catch { part.text += `\n${reasons.join(' ')}` }
  }
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  return new Response(JSON.stringify(body), { status: res.status, headers })
}

// Asks again without the items Bob's side refused, so the call answers with the rest instead of failing.
const withRefusals = inner => async (url, init) => {
  const refused = [], reasons = []
  for (;;) {
    try {
      const res = await inner(url, refused.length ? { ...init, headers: withHeader(init.headers, 'x-refused-scopes', refused.join(' ')) } : init)
      return reasons.length ? addReasons(res, reasons) : res
    } catch (err) {
      const named = init?.method === 'POST' && err?.error === 'denied' ? REFUSED.exec(err.detail ?? '')?.[1].trim().split(' ') ?? [] : []
      if (!named.length || named.some(s => refused.includes(s)) || reasons.length >= 3) throw err
      say(`${PS} refused [${named.join(' ')}]; asking again without them`)
      refused.push(...named)
      reasons.push(err.detail)
    }
  }
}

const aauthFetch = serializeAuthFlows(withRefusals(withReason(createAAuthFetch({
  getKeyMaterial,
  personServerUrl: PS,
  justification,
  ...(mission ? { missionS256: mission.s256 } : {}),
  onInteraction: (url, code) => {
    const { hostname, pathname } = new URL(url)
    const local = LOOPBACK[hostname] ? ` (on this machine: http://127.0.0.1:${LOOPBACK[hostname]}${pathname}?code=${code})` : ''
    say(`consent needed: open ${url}?code=${code}${local}`)
  },
  ...(process.env.AAUTH_DEBUG ? { onEvent: e => say(JSON.stringify(e).slice(0, 300)) } : {}),
}))))

say(`agent ${AGENT_SUB} → ${RESOURCE}/mcp, mission ${mission ? `${mission.s256.slice(0, 8)}…` : '(none: run npm run mission first)'}`)
const remote = new StreamableHTTPClientTransport(new URL(`${RESOURCE}/mcp`), { fetch: aauthFetch })
await bridgeTransports(new StdioServerTransport(), remote)
