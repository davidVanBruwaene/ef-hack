// Writes mcp.json for Claude Code: the alice server runs proxy.mjs with the intent text as its mission.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const alice = JSON.parse(readFileSync(new URL('./alice.json', import.meta.url), 'utf8'))
const mission = process.argv[2] ?? alice.grants[0].intent
const config = {
  mcpServers: {
    alice: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./proxy.mjs', import.meta.url))],
      env: { AAUTH_MISSION: mission },
    },
  },
}
writeFileSync(new URL('./mcp.json', import.meta.url), `${JSON.stringify(config, null, 2)}\n`)
console.log(`wrote mcp.json with mission: "${mission}"`)
