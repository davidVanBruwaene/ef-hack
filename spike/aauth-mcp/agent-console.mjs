// Serves the console (console/dist), at /agent each signed-in member's own agents' requests from the person server, and the hosted MCP endpoint (gateway.mjs). See two-laptops.md.
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { consoleToken } from './bob-state.mjs'
import { LOOPBACK, PORTS, PS } from './config.mjs'
import { openGateway } from './gateway.mjs'
import { logger } from './http.mjs'

const USAGE = 'usage: node agent-console.mjs [--port <port>]   (STORE_URL as for the directory)'
const fail = msg => { console.error(`✗ ${msg}`); process.exit(1) }
const args = process.argv.slice(2)
if (args.length && (args[0] !== '--port' || !/^\d+$/.test(args[1] ?? '') || args.length > 2)) fail(USAGE)

const PORT = Number(args[1] ?? 4531)
const STORE = (process.env.STORE_URL || 'http://localhost:8790').replace(/\/+$/, '')
const DIST = new URL('../../console/dist/', import.meta.url)
// A *.aauth.test server is reached on its loopback port; a public one through its tunnel.
const PS_API = `${LOOPBACK[new URL(PS).hostname] ? `http://127.0.0.1:${PORTS.ps}` : PS}/api`

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

// The store says whose sid cookie this is; that member is who answers at the person server.
async function member(req) {
  if (!req.headers.cookie) return null
  const res = await fetch(`${STORE}/auth/me`, { headers: { cookie: req.headers.cookie }, signal: AbortSignal.timeout(5000) }).catch(() => null)
  const user = res?.ok ? (await res.json().catch(() => ({}))).user : null
  if (!user?.id) return null
  return { id: user.id, name: user.first_name || user.display_name || 'A member' }
}

async function ps(path, body) {
  const res = await fetch(`${PS_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${consoleToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const isOpen = x => x.status === 'pending' && Date.parse(x.pending_until) > Date.now()
const byAge = (a, b) => a.created_at.localeCompare(b.created_at)

const asMission = m => ({
  kind: 'mission', id: m.id, code: m.code, agent: m.agent, description: m.description, resources: m.resources ?? [], pending_until: m.pending_until,
})
const asHold = (v, missionText) => ({
  kind: 'hold', id: v.id, code: v.code, agent: v.agent, resource: v.resource, mission: missionText, justification: v.justification ?? '',
  items: v.scopes.map(scope => {
    const verdict = v.verdicts?.find(x => x.scope === scope)
    return { name: scope.replace(/^item:/, ''), held: verdict?.decision !== 'ALLOW', reason: verdict?.reason ?? '' }
  }),
  pending_until: v.pending_until,
})
const missionText = m => m?.approved_description ?? m?.description ?? ''
const unreachable = (res, r) => json(res, 502, { error: 'person_server', error_description: `the person server answered ${r.status}` })

// This member's part of the person server's state, cut down to what is waiting, oldest first.
async function agentState(res, who) {
  const r = await ps(`/state?member=${encodeURIComponent(who.id)}`)
  if (r.status !== 200) return unreachable(res, r)
  const { missions = [], reviews = [] } = r.body
  json(res, 200, {
    missions: missions.filter(isOpen).sort(byAge).map(asMission),
    holds: reviews.filter(isOpen).sort(byAge).map(v => asHold(v, missionText(missions.find(x => x.id === v.mission)))),
  })
}

// Wrong codes per client address, so the 50 bits are not guessed online (§11.6.3.1).
const misses = new Map()
const MAX_MISSES = 10
const MISS_WINDOW = 15 * 60_000
const clientOf = req => req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '?'
function limited(req) {
  const m = misses.get(clientOf(req))
  return !!m && m.since > Date.now() - MISS_WINDOW && m.n >= MAX_MISSES
}
function miss(req) {
  const k = clientOf(req)
  const m = misses.get(k)
  misses.set(k, m && m.since > Date.now() - MISS_WINDOW ? { ...m, n: m.n + 1 } : { since: Date.now(), n: 1 })
}

// A used or expired code; only the member it belongs to learns how it ended.
function answered(b, who) {
  if (b?.member !== who.id || !['approved', 'denied', 'expired'].includes(b.status)) {
    return { error: 'invalid_code', error_description: 'that code was already answered, or its request expired' }
  }
  const what = b.kind === 'review' ? 'request' : 'mission'
  const when = b.decided_at ? ` at ${new Date(b.decided_at).toISOString().slice(11, 16)} UTC` : ''
  const error_description = b.status === 'expired' ? `This ${what} expired before anyone answered it. Your agent can ask again.` : `You ${b.status} this ${what}${when}.`
  return { error: 'invalid_code', status: b.status, decided_at: b.decided_at, error_description }
}

// The request an agent's code names, if this member may answer it: an unbound agent's mission, or one of their own.
async function byCode(req, res, who, code) {
  if (limited(req)) return json(res, 429, { error: 'too_many_codes', error_description: 'too many wrong codes; wait fifteen minutes' })
  const r = await ps(`/codes/${encodeURIComponent(code)}`)
  if (r.status === 404) { miss(req); return json(res, 404, { error: 'not_found', error_description: 'no request is waiting for that code' }) }
  if (r.status === 410) return json(res, 410, answered(r.body, who))
  if (r.status !== 200) return unreachable(res, r)
  const { kind, mission, review, owner } = r.body
  const mine = kind === 'review' ? mission?.person?.id === who.id : !owner || owner.id === who.id
  if (!mine) return json(res, 403, { error: 'forbidden', error_description: 'that agent belongs to another member' })
  json(res, 200, kind === 'review' ? asHold(review, missionText(mission)) : { ...asMission(mission), claim: !owner })
}

async function agent(req, res, url) {
  const who = await member(req)
  if (!who) return json(res, 401, { error: 'not_signed_in' })
  if (url.pathname === '/agent/state' && req.method === 'GET') return agentState(res, who)
  const code = url.pathname.match(/^\/agent\/code\/([\w-]+)$/)?.[1]
  if (code && req.method === 'GET') return byCode(req, res, who, code)
  const [, kind, id] = url.pathname.match(/^\/agent\/(missions|holds)\/([\w-]+)$/) ?? []
  if (!kind || req.method !== 'POST') return json(res, 404, { error: 'not_found' })
  if (!fromConsole(req)) return json(res, 403, { error: 'bad_origin' })
  const b = parse(await readBody(req))
  const r = kind === 'missions'
    ? await ps(`/missions/${id}`, {
      decision: b.decision, description: b.description, member: who,
      ...(typeof b.code === 'string' ? { code: b.code } : {}), ...(b.rules_only === true ? { supervisor: 'rules' } : {}),
    })
    : await ps(`/reviews/${id}`, { decision: b.decision, member: who })
  if (r.status === 403 && typeof b.code === 'string') miss(req)
  json(res, r.status, r.body)
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
function file(res, url, cache) {
  let bytes
  try { bytes = readFileSync(url) } catch { return json(res, 404, { error: 'not_found' }) }
  res.writeHead(200, { 'content-type': TYPES[extname(fileURLToPath(url))] ?? 'application/octet-stream', 'cache-control': cache })
  res.end(bytes)
}

// The public origin agents and members reach this server at; the passkey's RP_ID host behind a tunnel.
const ORIGIN = (process.env.PUBLIC_URL || (process.env.RP_ID ? `https://${process.env.RP_ID.trim()}` : `http://127.0.0.1:${PORT}`)).replace(/\/+$/, '')
const gateway = openGateway({ origin: ORIGIN, memberOf: member, ps, fromConsole, log: logger('gateway') })

// The console shows its own passkey sign-in, so / is served signed in or not.
async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://console')
  if (await gateway(req, res, url)) return
  if (url.pathname.startsWith('/agent/')) return agent(req, res, url)
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' })
  if (url.pathname === '/' || url.pathname === '/index.html') return file(res, new URL('index.html', DIST), 'no-store')
  if (/^\/assets\/[\w-]+\.\w+$/.test(url.pathname)) return file(res, new URL(`.${url.pathname}`, DIST), 'public, max-age=31536000, immutable')
  json(res, 404, { error: 'not_found' })
}

if (!existsSync(new URL('index.html', DIST))) fail('console/dist is missing. Build it first: cd console && VITE_API=live npm run build')
createServer((req, res) => handle(req, res).catch(err => {
  console.error(err)
  if (!res.headersSent) json(res, 502, { error: 'upstream', error_description: err.cause?.code ?? err.message })
})).listen(PORT, '127.0.0.1', () => console.log(`console on http://127.0.0.1:${PORT}; store ${STORE}; person server ${PS_API}; MCP endpoint ${ORIGIN}/mcp`))
