// Serves the owner console (console/dist) to signed-in store members, with Bob's own agent's approvals at /agent from his person server. See two-laptops.md.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { consoleToken as aliceToken } from './alice-state.mjs'
import { consoleToken as bobToken } from './bob-state.mjs'
import { BOB_NAME, DATA_DIR, LOOPBACK, PORTS, PS, RESOURCE } from './config.mjs'
import { sha256 } from './store.mjs'

const USAGE = `usage: node agent-console.mjs [--port <port>] [--store <store URL>]
       node agent-console.mjs link bob|alice`
const args = process.argv.slice(2)
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1] ?? fail(`--${name} needs a value\n${USAGE}`) }
const fail = msg => { console.error(`✗ ${msg}`); process.exit(1) }

const PORT = Number(flag('port', 4531))
const STORE = flag('store', `http://127.0.0.1:${process.env.STORE_PORT || 8790}`).replace(/\/+$/, '')
const ORIGIN = process.env.RP_ID?.trim() ? `https://${process.env.RP_ID.trim()}` : `http://localhost:${PORT}`
const DIST = new URL('../../console/dist/', import.meta.url)
const MEMBERS = new URL('console-members.json', DATA_DIR)
const LINK = new URL('console-link.json', DATA_DIR)
const LINK_MINUTES = 10
const ROLES = { bob: BOB_NAME, alice: 'Alice' }
// A *.aauth.test server is reached on its loopback port, as pair.mjs does; a public one through its tunnel.
const base = (id, port) => (LOOPBACK[new URL(id).hostname] ? `http://127.0.0.1:${port}` : id)
const BOB_API = `${base(PS, PORTS.ps)}/api`
const ALICE_API = `${base(RESOURCE, PORTS.resource)}/api`

const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return fallback } }
const writeJson = (file, value) => { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2)) }

if (args[0] === 'link') {
  const role = args[1]
  if (!ROLES[role]) fail(USAGE)
  const code = randomBytes(18).toString('base64url')
  writeJson(LINK, { role, hash: sha256(code), expires_at: new Date(Date.now() + LINK_MINUTES * 60_000).toISOString() })
  const url = `${ORIGIN}/agent/link?code=${code}`
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }))
  console.log(`${ROLES[role]}: sign in at ${ORIGIN}/dev on your phone first, then scan this with it, or open ${url}`)
  console.log(`It works once, for ${LINK_MINUTES} minutes. That store account then sees ${role === 'bob' ? `${BOB_NAME}'s person server` : "Alice's server"} in the console.`)
  process.exit(0)
}

const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
const page = (res, title, body) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><body style="font: 16px/1.5 system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 16px">${body}</body></html>`)
}
const readBody = req => new Promise((resolve, reject) => {
  let s = ''
  req.on('data', d => { s += d; if (s.length > 64_000) req.destroy() }).on('end', () => resolve(s)).on('error', reject)
})
const parse = s => { try { return JSON.parse(s) } catch { return {} } }
// A post must be JSON from the console's own page; cloudflared keeps the public Host.
const fromConsole = req => {
  try { return new URL(req.headers.origin).host === req.headers.host && req.headers['content-type']?.startsWith('application/json') } catch { return false }
}

// The store says who the sid cookie belongs to; console-members.json says whether that member is Bob or Alice.
async function member(req) {
  if (!req.headers.cookie) return null
  const res = await fetch(`${STORE}/auth/me`, { headers: { cookie: req.headers.cookie }, signal: AbortSignal.timeout(5000) }).catch(() => null)
  const user = res?.ok ? (await res.json().catch(() => ({}))).user : null
  if (!user) return null
  const members = readJson(MEMBERS, {})
  return { ...user, role: Object.keys(ROLES).find(r => members[r] === user.id) }
}

async function upstream(url, token, method = 'GET', body) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body,
    signal: AbortSignal.timeout(10_000),
  })
  return { status: res.status, type: res.headers.get('content-type') ?? 'application/json', bytes: Buffer.from(await res.arrayBuffer()) }
}

const isOpen = x => x.status === 'pending' && Date.parse(x.pending_until) > Date.now()
const byAge = (a, b) => a.created_at.localeCompare(b.created_at)

// Bob's /api/state, cut down to what is waiting for him, oldest first.
async function agentState(res) {
  const r = await upstream(`${BOB_API}/state`, bobToken())
  if (r.status !== 200) return json(res, 502, { error: 'person_server', error_description: `${BOB_NAME}'s person server answered ${r.status}` })
  const { missions = [], reviews = [] } = parse(r.bytes.toString('utf8'))
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

async function agent(req, res, url, who) {
  if (url.pathname === '/agent/link' && req.method === 'GET') return link(res, url, who)
  if (!who) return json(res, 401, { error: 'not_signed_in' })
  if (url.pathname === '/agent/state' && req.method === 'GET') return who.role === 'bob' ? agentState(res) : json(res, 200, { missions: [], holds: [] })
  const [, kind, id] = url.pathname.match(/^\/agent\/(missions|holds)\/([\w-]+)$/) ?? []
  if (!kind || req.method !== 'POST') return json(res, 404, { error: 'not_found' })
  if (who.role !== 'bob') return json(res, 403, { error: 'forbidden', error_description: `This account is not linked to ${BOB_NAME}'s person server` })
  if (!fromConsole(req)) return json(res, 403, { error: 'bad_origin' })
  const b = parse(await readBody(req))
  const body = kind === 'missions'
    ? { decision: b.decision, description: b.description, ...(b.rules_only === true ? { supervisor: 'rules' } : {}) }
    : { decision: b.decision }
  const r = await upstream(`${BOB_API}/${kind === 'missions' ? 'missions' : 'reviews'}/${id}`, bobToken(), 'POST', JSON.stringify(body))
  res.writeHead(r.status, { 'content-type': r.type, 'cache-control': 'no-store' })
  res.end(r.bytes)
}

// Joins the signed-in store account to Bob's or Alice's side, once, with a code from `node agent-console.mjs link`.
function link(res, url, who) {
  if (!who) return page(res, 'Sign in first', `<h1>Sign in first</h1><p><a href="/dev">Sign in or create an account</a> in this browser, then scan the code again.</p>`)
  const l = readJson(LINK, null)
  if (!l || Date.parse(l.expires_at) <= Date.now() || l.hash !== sha256(url.searchParams.get('code') ?? '')) {
    return page(res, 'Link expired', '<h1>This link has expired or was already used</h1><p>Run <code>node agent-console.mjs link bob</code> again on the laptop.</p>')
  }
  rmSync(LINK, { force: true })
  writeJson(MEMBERS, { ...readJson(MEMBERS, {}), [l.role]: who.id })
  res.writeHead(302, { location: '/', 'cache-control': 'no-store' })
  res.end()
}

// Alice's account gets Alice's /api with her token; any other account gets its own name and nothing waiting.
async function api(req, res, url, who) {
  if (!who) return json(res, 401, { error: 'not_signed_in' })
  if (who.role === 'alice') {
    if (req.method !== 'GET' && !fromConsole(req)) return json(res, 403, { error: 'bad_origin' })
    const body = req.method === 'GET' ? undefined : await readBody(req)
    const r = await upstream(`${ALICE_API}${url.pathname.slice('/api'.length)}${url.search}`, aliceToken(), req.method, body)
    res.writeHead(r.status, { 'content-type': r.type, 'cache-control': 'no-store' })
    return res.end(r.bytes)
  }
  if (url.pathname === '/api/state' && req.method === 'GET') {
    return json(res, 200, { owner: { first_name: who.first_name, last_name: who.last_name }, items: [], requesters: [], asks: [], disclosures: [] })
  }
  json(res, 404, { error: 'not_found' })
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
function file(res, url, cache) {
  let bytes
  try { bytes = readFileSync(url) } catch { return json(res, 404, { error: 'not_found' }) }
  res.writeHead(200, { 'content-type': TYPES[extname(fileURLToPath(url))] ?? 'application/octet-stream', 'cache-control': cache })
  res.end(bytes)
}

async function handle(req, res) {
  const url = new URL(req.url ?? '/', ORIGIN)
  const who = await member(req)
  if (url.pathname.startsWith('/agent/')) return agent(req, res, url, who)
  if (url.pathname.startsWith('/api/')) return api(req, res, url, who)
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' })
  if (url.pathname === '/' || url.pathname === '/index.html') {
    if (!who) { res.writeHead(302, { location: '/dev', 'cache-control': 'no-store' }); return res.end() }
    return file(res, new URL('index.html', DIST), 'no-store')
  }
  if (/^\/assets\/[\w-]+\.\w+$/.test(url.pathname)) return file(res, new URL(`.${url.pathname}`, DIST), 'public, max-age=31536000, immutable')
  json(res, 404, { error: 'not_found' })
}

if (args.length && !args[0].startsWith('--')) fail(USAGE)
if (!existsSync(new URL('index.html', DIST))) fail('console/dist is missing. Build it first: cd console && VITE_API=live npm run build')
createServer((req, res) => handle(req, res).catch(err => {
  console.error(err)
  if (!res.headersSent) json(res, 502, { error: 'upstream', error_description: err.cause?.code ?? err.message })
})).listen(PORT, '127.0.0.1', () => {
  console.log(`console on http://127.0.0.1:${PORT} for ${ORIGIN}; store ${STORE}; ${BOB_NAME}'s person server ${BOB_API}; Alice's server ${ALICE_API}`)
})
