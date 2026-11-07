// Drives proxy.mjs over stdio with the MCP SDK client. Usage: node client-check.mjs [granted | none | "<intent text>"]
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const arg = process.argv[2] ?? 'granted'
const alice = JSON.parse(readFileSync(new URL('./alice.json', import.meta.url), 'utf8'))
const mission = arg === 'granted' ? alice.grants[0].intent : arg === 'none' ? '' : arg

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('./proxy.mjs', import.meta.url))],
  env: { ...process.env, AAUTH_MISSION: mission },
  stderr: 'inherit',
})
const client = new Client({ name: 'round-trip-check', version: '0.0.1' })
try {
  await client.connect(transport)
  const { tools } = await client.listTools()
  console.log('tools:', tools.map(t => t.name).join(', '))
  const result = await client.callTool({ name: 'get_shared_context', arguments: {} })
  console.log(result.content[0].text)
} catch (err) {
  console.log('FAILED:', err.message)
  process.exitCode = 1
} finally {
  await client.close()
}
