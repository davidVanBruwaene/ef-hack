// Runs the network on one machine: the passkey store, the people-mode world, the console server, and each cloudflared config in TUNNEL_CONFIGS. Usage: node demo.mjs
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { LOOPBACK, PORTS, PS } from './config.mjs'
import { bearerToken } from './store.mjs'

const fail = msg => { console.error(`✗ ${msg}`); process.exit(1) }
const at = rel => fileURLToPath(new URL(rel, import.meta.url))
const env = process.env

if (LOOPBACK[new URL(PS).hostname]) fail('set AAUTH_PS, AAUTH_AGENT and AAUTH_RESOURCE in .env at the repo root to the tunnel hostnames (README "Run it")')
if (!env.RP_ID) fail('set RP_ID in .env at the repo root to the console\'s hostname (README "Run it")')
for (const [dir, cmd] of [['../../store/', 'npm ci'], ['../../console/', 'npm ci'], ['./', 'npm ci --ignore-scripts']]) {
  if (!existsSync(at(`${dir}node_modules`))) fail(`run ${cmd} in ${at(dir)} first`)
}

const STORE_PORT = Number(env.STORE_PORT) || 8790
const CONSOLE_PORT = Number(env.CONSOLE_PORT) || 4531
const CONSOLE_URL = `https://${env.RP_ID}`
const STORE_URL = `http://127.0.0.1:${STORE_PORT}`
const STORE_INTERNAL_TOKEN = bearerToken('STORE_INTERNAL_TOKEN', 'store-internal-token')
// Created here so the world and the console server read one token instead of racing to generate two.
bearerToken('BOB_CONSOLE_TOKEN', 'bob-console-token')
bearerToken('ALICE_CONSOLE_TOKEN', 'alice-console-token')
const MEMBER_MAP = env.MEMBER_MAP || at('.keys/member-map.json')
if (!MEMBER_MAP.trim().startsWith('{') && !existsSync(MEMBER_MAP)) writeFileSync(MEMBER_MAP, '{}\n', { mode: 0o600 })
const tunnels = (env.TUNNEL_CONFIGS ?? '').split(',').map(s => s.trim().replace(/^~(?=\/)/, homedir())).filter(Boolean)
for (const file of tunnels) if (!existsSync(file)) fail(`TUNNEL_CONFIGS names ${file}, which does not exist`)

const listening = port => new Promise(resolve => {
  const socket = connect(port, '127.0.0.1', () => { socket.end(); resolve(true) })
  socket.on('error', () => resolve(false))
})
const ports = [STORE_PORT, PORTS.ps, PORTS.resource, PORTS.agent, CONSOLE_PORT]
const taken = (await Promise.all(ports.map(listening))).map((on, i) => on && ports[i]).filter(Boolean)
if (taken.length) fail(`port ${taken.join(', ')} already in use; stop the other world, store or console first`)

console.log('building the console with VITE_API=live')
try {
  execFileSync('npm', ['run', 'build'], { cwd: at('../../console/'), env: { ...env, VITE_API: 'live' }, stdio: 'pipe' })
} catch (err) {
  process.stderr.write(`${err.stdout ?? ''}${err.stderr ?? ''}`)
  fail('the console build failed')
}

const children = []
let stopping = false
// Each child leads its own process group, so stopping it also stops what it started.
function stop(code) {
  if (stopping) return
  stopping = true
  for (const child of children) try { process.kill(-child.pid, 'SIGTERM') } catch {}
  setTimeout(() => process.exit(code), 500)
}
function start(name, command, args, options) {
  const child = spawn(command, args, { ...options, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const stream of [child.stdout, child.stderr]) {
    let rest = ''
    stream.on('data', chunk => {
      const lines = (rest + chunk).split('\n')
      rest = lines.pop()
      for (const line of lines) console.log(`[${name}] ${line}`)
    })
  }
  child.on('error', err => { console.error(`✗ ${name}: ${err.message}`); stop(1) })
  child.on('exit', (code, signal) => {
    if (stopping) return
    console.error(`✗ ${name} stopped (${signal ?? `exit ${code}`}); stopping the rest`)
    stop(1)
  })
  children.push(child)
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))

start('store', process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.ts'], {
  cwd: at('../../store/'),
  env: { ...env, STORE_PORT: String(STORE_PORT), RP_ORIGINS: env.RP_ORIGINS || CONSOLE_URL, PUBLIC_URL: env.PUBLIC_URL || CONSOLE_URL, STORE_INTERNAL_TOKEN },
})
start('world', process.execPath, ['world.mjs'], { cwd: at('./'), env: { ...env, STORE_URL, STORE_INTERNAL_TOKEN, MEMBER_MAP } })
start('console', process.execPath, ['agent-console.mjs', '--port', String(CONSOLE_PORT)], { cwd: at('./'), env: { ...env, STORE_URL } })
for (const file of tunnels) start('tunnel', 'cloudflared', ['tunnel', '--config', file, 'run'], { env })

async function allListening() {
  for (let i = 0; i < 120 && !stopping; i++) {
    if ((await Promise.all(ports.map(listening))).every(Boolean)) return true
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

if (!(await allListening())) {
  if (!stopping) { console.error('✗ not every server was listening after 60 s; stopping'); stop(1) }
} else {
  console.log(`
✓ Up. The console is ${CONSOLE_URL}/${tunnels.length ? '' : ' once your tunnels run (TUNNEL_CONFIGS is unset)'}
Each member creates an account there with a passkey, once. To run an agent, in spike/aauth-mcp:
  npm run member-map -- <first name>   # who the directory takes this agent's requests to be from, until linking replaces MEMBER_MAP
  npm run mission -- "<what the agent should do>"
  npm run mcp-config
  claude --mcp-config mcp.json --strict-mcp-config --allowedTools mcp__alice__find_people,mcp__alice__search_context
The member who approves an agent's first mission in the console owns that agent. Ctrl-C stops everything.
`)
}
