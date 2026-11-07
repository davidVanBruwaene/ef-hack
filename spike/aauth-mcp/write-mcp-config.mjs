// Writes mcp.json for Claude Code: the alice server runs proxy.mjs, under the mission npm run mission saved.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const config = {
  mcpServers: {
    alice: {
      command: process.execPath,
      args: [fileURLToPath(new URL('./proxy.mjs', import.meta.url))],
    },
  },
}
writeFileSync(new URL('./mcp.json', import.meta.url), `${JSON.stringify(config, null, 2)}\n`)
console.log('wrote mcp.json; the proxy runs under the mission in .keys/mission.json (npm run mission)')
