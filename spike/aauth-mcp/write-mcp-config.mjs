// Writes mcp.json for Claude Code: the alice server runs proxy.mjs with the mission text given, or the default one.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEFAULT_MISSION } from './config.mjs'

const mission = process.argv[2] ?? DEFAULT_MISSION
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
