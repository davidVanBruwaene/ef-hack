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

const aauthFetch = serializeAuthFlows(createAAuthFetch({
  getKeyMaterial,
  personServerUrl: PS,
  ...(mission ? { missionS256: mission.s256 } : {}),
  onInteraction: (url, code) => {
    const { hostname, pathname } = new URL(url)
    const local = LOOPBACK[hostname] ? ` (on this machine: http://127.0.0.1:${LOOPBACK[hostname]}${pathname}?code=${code})` : ''
    say(`consent needed: open ${url}?code=${code}${local}`)
  },
  ...(process.env.AAUTH_DEBUG ? { onEvent: e => say(JSON.stringify(e).slice(0, 300)) } : {}),
}))

say(`agent ${AGENT_SUB} → ${RESOURCE}/mcp, mission ${mission ? `${mission.s256.slice(0, 8)}…` : '(none: run npm run mission first)'}`)
const remote = new StreamableHTTPClientTransport(new URL(`${RESOURCE}/mcp`), { fetch: aauthFetch })
await bridgeTransports(new StdioServerTransport(), remote)
