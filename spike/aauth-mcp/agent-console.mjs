// Serves the owner console (console/dist) on the console's hostname, with Bob's own agent's approvals at /agent from his person server. See two-laptops.md.
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { consoleToken } from './bob-state.mjs'
import { BOB_NAME, LOOPBACK, PORTS, PS } from './config.mjs'
import { memberMap } from './people.mjs'

const USAGE = 'usage: node agent-console.mjs [--port <port>]   (STORE_URL and MEMBER_MAP as for Alice\'s server)'
const fail = msg => { console.error(`✗ ${msg}`); process.exit(1) }
const args = process.argv.slice(2)
if (args.length && (args[0] !== '--port' || !/^\d+$/.test(args[1] ?? '') || args.length > 2)) fail(USAGE)

const PORT = Number(args[1] ?? 4531)
const STORE = (process.env.STORE_URL || 'http://localhost:8790').replace(/\/+$/, '')
const members = memberMap(process.env.MEMBER_MAP)
const DIST = new URL('../../console/dist/', import.meta.url)
// A *.aauth.test server is reached on its loopback port, as pair.mjs does; a public one through its tunnel.
const BOB_API = `${LOOPBACK[new URL(PS).hostname] ? `http://127.0.0.1:${PORTS.ps}` : PS}/api`

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
const readBody = req => new Promise((resolve, reject) => {
  let s = ''
  req.on('data', d => { s += d; if (s.length > 64_000) req.destroy() }).on('end', () => resolve(s)).on('error', reject)
})
const parse = s => { try { return JSON.parse(s) } catch { return {} } }
// A post must be JSON from the console's own page; cloudflared keeps the public Host.
const fromConsole = req => {
  try { return new URL(req.headers.origin).host === req.headers.host && req.headers['content-type']?.startsWith('application/json') } catch { return false }
}

// The store says whose sid cookie this is; MEMBER_MAP says whether that member is the one Bob's person server speaks for.
async function member(req) {
  if (!req.headers.cookie) return null
  const res = await fetch(`${STORE}/auth/me`, { headers: { cookie: req.headers.cookie }, signal: AbortSignal.timeout(5000) }).catch(() => null)
  const user = res?.ok ? (await res.json().catch(() => ({}))).user : null
  if (!user) return null
  let map = {}
  try { map = members() } catch (err) { console.error(`MEMBER_MAP: ${err.message}`) }
  return { ...user, bob: Object.entries(map).some(([key, id]) => id === user.id && key.split(' ')[0] === PS) }
}

async function bob(path, body) {
  const res = await fetch(`${BOB_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${consoleToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const isOpen = x => x.status === 'pending' && Date.parse(x.pending_until) > Date.now()
const byAge = (a, b) => a.created_at.localeCompare(b.created_at)

// Bob's /api/state, cut down to what is waiting for him, oldest first.
async function agentState(res) {
  const r = await bob('/state')
  if (r.status !== 200) return json(res, 502, { error: 'person_server', error_description: `${BOB_NAME}'s person server answered ${r.status}` })
  const { missions = [], reviews = [] } = r.body
  const text = id => { const m = missions.find(x => x.id === id); return m?.approved_description ?? m?.description ?? '' }
  json(res, 200, {
    missions: missions.filter(isOpen).sort(byAge).map(m => ({
      kind: 'mission', id: m.id, code: m.code, agent: m.agent, description: m.description, resources: m.resources ?? [], pending_until: m.pending_until,
    })),
    holds: reviews.filter(isOpen).sort(byAge).map(v => ({
      kind: 'hold', id: v.id, code: v.code, agent: v.agent, resource: v.resource, mission: text(v.mission), justification: v.justification ?? '',
      items: v.scopes.map(scope => {
        const verdict = v.verdicts?.find(x => x.scope === scope)
        return { name: scope.replace(/^item:/, ''), held: verdict?.decision !== 'ALLOW', reason: verdict?.reason ?? '' }
      }),
      pending_until: v.pending_until,
    })),
  })
}

async function agent(req, res, url) {
  const who = await member(req)
  if (!who) return json(res, 401, { error: 'not_signed_in' })
  if (url.pathname === '/agent/state' && req.method === 'GET') return who.bob ? agentState(res) : json(res, 200, { missions: [], holds: [] })
  const [, kind, id] = url.pathname.match(/^\/agent\/(missions|holds)\/([\w-]+)$/) ?? []
  if (!kind || req.method !== 'POST') return json(res, 404, { error: 'not_found' })
  if (!who.bob) return json(res, 403, { error: 'forbidden', error_description: `MEMBER_MAP does not name this account for ${BOB_NAME}'s person server` })
  if (!fromConsole(req)) return json(res, 403, { error: 'bad_origin' })
  const b = parse(await readBody(req))
  const r = kind === 'missions'
    ? await bob(`/missions/${id}`, { decision: b.decision, description: b.description, ...(b.rules_only === true ? { supervisor: 'rules' } : {}) })
    : await bob(`/reviews/${id}`, { decision: b.decision })
  json(res, r.status, r.body)
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
function file(res, url, cache) {
  let bytes
  try { bytes = readFileSync(url) } catch { return json(res, 404, { error: 'not_found' }) }
  res.writeHead(200, { 'content-type': TYPES[extname(fileURLToPath(url))] ?? 'application/octet-stream', 'cache-control': cache })
  res.end(bytes)
}

// The console shows its own passkey sign-in, so / is served signed in or not.
async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://console')
  if (url.pathname.startsWith('/agent/')) return agent(req, res, url)
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' })
  if (url.pathname === '/' || url.pathname === '/index.html') return file(res, new URL('index.html', DIST), 'no-store')
  if (/^\/assets\/[\w-]+\.\w+$/.test(url.pathname)) return file(res, new URL(`.${url.pathname}`, DIST), 'public, max-age=31536000, immutable')
  json(res, 404, { error: 'not_found' })
}

if (!existsSync(new URL('index.html', DIST))) fail('console/dist is missing. Build it first: cd console && VITE_API=live npm run build')
if (!process.env.MEMBER_MAP) console.error(`MEMBER_MAP is unset, so no account sees ${BOB_NAME}'s approvals`)
createServer((req, res) => handle(req, res).catch(err => {
  console.error(err)
  if (!res.headersSent) json(res, 502, { error: 'upstream', error_description: err.cause?.code ?? err.message })
})).listen(PORT, '127.0.0.1', () => console.log(`console on http://127.0.0.1:${PORT}; store ${STORE}; ${BOB_NAME}'s person server ${BOB_API}`))
