// stdio MCP proxy for a local agent: signs every request with AAuth, under the mission its member approved.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { bridgeTransports } from '@aauth/mcp-stdio'
import { agentFetch } from './aauth-fetch.mjs'
import { agentSession } from './agent.mjs'
import { AGENT_SUB, LOOPBACK, RESOURCE } from './config.mjs'
import { currentMission } from './missions.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'

routeTestHostsToLoopback()

// stdout carries MCP frames; everything human-readable goes to stderr.
const say = (...a) => console.error('[aauth-proxy]', ...a)

const mission = currentMission()
const { getKeyMaterial } = await agentSession()

const aauthFetch = agentFetch({
  getKeyMaterial,
  missionS256: mission?.s256,
  say,
  onInteraction: (url, code) => {
    const { hostname, pathname } = new URL(url)
    const local = LOOPBACK[hostname] ? ` (on this machine: http://127.0.0.1:${LOOPBACK[hostname]}${pathname}?code=${code})` : ''
    say(`consent needed: open ${url}?code=${code}${local}`)
  },
})

say(`agent ${AGENT_SUB} → ${RESOURCE}/mcp, mission ${mission ? `${mission.s256.slice(0, 8)}…` : '(none: run npm run mission first)'}`)
const remote = new StreamableHTTPClientTransport(new URL(`${RESOURCE}/mcp`), { fetch: aauthFetch })
await bridgeTransports(new StdioServerTransport(), remote)
