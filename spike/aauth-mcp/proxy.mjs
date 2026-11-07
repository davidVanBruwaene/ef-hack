// stdio MCP proxy for Bob's agent: signs every request with AAuth and names the mission from AAUTH_MISSION.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createAAuthFetch } from '@aauth/agent'
import { bridgeTransports, serializeAuthFlows } from '@aauth/mcp-stdio'
import { DWK, SIGNING_ALG, TOKEN_TYP } from '@aauth/protocol'
import { SignJWT } from 'jose'
import { AGENT, AGENT_SUB, PORTS, PS, RESOURCE, missionHash } from './config.mjs'
import { agentIdentityKey, newKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'

routeTestHostsToLoopback()

// stdout carries MCP frames; everything human-readable goes to stderr.
const say = (...a) => console.error('[aauth-proxy]', ...a)

const mission = process.env.AAUTH_MISSION ?? ''
const missionS256 = mission ? missionHash(mission) : undefined

const identity = await agentIdentityKey()
const session = await newKey('bob-agent-session-1')
const now = Math.floor(Date.now() / 1000)
const agentToken = await new SignJWT({
  iss: AGENT, dwk: DWK.agent, sub: AGENT_SUB, ps: PS, cnf: { jwk: session.publicJwk }, iat: now, exp: now + 3600,
}).setProtectedHeader({ alg: SIGNING_ALG, typ: TOKEN_TYP.agent, kid: identity.kid }).sign(identity.privateKey)

const aauthFetch = serializeAuthFlows(createAAuthFetch({
  getKeyMaterial: async () => ({ signingKey: session.privateJwk, signatureKey: { type: 'jwt', jwt: agentToken } }),
  personServerUrl: PS,
  ...(missionS256 ? { missionS256 } : {}),
  onInteraction: (url, code) => {
    const { hostname, pathname } = new URL(url)
    const local = PORTS[hostname] ? ` (on this machine: http://127.0.0.1:${PORTS[hostname]}${pathname}?code=${code})` : ''
    say(`consent needed: open ${url}?code=${code}${local}`)
  },
  ...(process.env.AAUTH_DEBUG ? { onEvent: e => say(JSON.stringify(e).slice(0, 300)) } : {}),
}))

say(`agent ${AGENT_SUB} → ${RESOURCE}/mcp, mission ${missionS256 ? missionS256.slice(0, 8) + '…' : '(none)'}`)
const remote = new StreamableHTTPClientTransport(new URL(`${RESOURCE}/mcp`), { fetch: aauthFetch })
await bridgeTransports(new StdioServerTransport(), remote)
