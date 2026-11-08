// Bob's side: the agent provider, and Bob's person server: mockin behind a front that owns missions and the public identifier.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { decodeJwt } from 'jose'
import { codeEntryPage, codeProblemPage, homePage, missionPage, needsYou, notFoundPage, pairFirstPage, previewPage, reviewPage } from './bob-pages.mjs'
import { consoleToken, openBobState, tokenMatches } from './bob-state.mjs'
import { AGENT, BOB_NAME, PORTS, PS } from './config.mjs'
import { decide } from '../../supervisor/decide.mjs'
import { forward, isMain, json, listen, logger, readBody, relay, short } from './http.mjs'
import { agentIdentityKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'
import { verifySignedRequest } from './verify.mjs'

const log = logger('bob')
const MOCKIN = `http://127.0.0.1:${PORTS.mockin}`
const state = openBobState()
const bobToken = consoleToken()
const CONSOLE_URL = process.env.RP_ID ? `https://${process.env.RP_ID.trim()}/` : undefined

async function startAgentProvider() {
  const identity = await agentIdentityKey()
  const jwks = { keys: [identity.publicJwk] }
  await listen(PORTS.agent, (req, res) => {
    const path = new URL(req.url ?? '/', AGENT).pathname
    const body = path === '/.well-known/aauth-agent.json'
      ? { issuer: AGENT, name: "Bob's agent provider", jwks_uri: `${AGENT}/jwks.json` }
      : path === '/jwks.json' ? jwks : undefined
    json(res, body ? 200 : 404, body ?? { error: 'not_found' })
  }, log)
}

async function startMockin(consent) {
  const pkg = createRequire(import.meta.url).resolve('@hellocoop/mockin/package.json')
  const entry = join(dirname(pkg), JSON.parse(readFileSync(pkg, 'utf8')).bin.mockin)
  const preload = new URL('./loopback-preload.mjs', import.meta.url).href
  const child = spawn(process.execPath, ['--no-warnings', '--import', preload, entry], {
    env: { ...process.env, PORT: String(PORTS.mockin), IP: '127.0.0.1', ISSUER: PS },
    cwd: dirname(pkg),
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  process.on('exit', () => child.kill('SIGKILL'))
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0))

  for (let i = 0; ; i++) {
    try { if ((await fetch(`${MOCKIN}/.well-known/aauth-person.json`)).ok) break } catch { /* not up yet */ }
    if (i > 200) throw new Error('mockin did not start')
    await new Promise(r => setTimeout(r, 50))
  }
  const configured = await fetch(`${MOCKIN}/mock/aauth`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      claims: { name: BOB_NAME },
      ...(consent ? { person_requirement: 'interaction', auto_approve: false } : {}),
    }),
  })
  if (!configured.ok) throw new Error(`mockin config failed: ${configured.status} ${await configured.text()}`)
}

const problem = (res, status, error, detail, extra = {}, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/problem+json', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify({ error, ...(detail ? { detail } : {}), ...extra }))
}

// §11.9.1: a 401 names the failure in Signature-Error, with the codes of the signature-key draft.
const unsigned = (res, who) => problem(res, 401, who.error, who.detail, {}, {
  'signature-error': `error=${who.error === 'invalid_signature' ? 'invalid_signature' : /expir/i.test(`${who.error} ${who.detail}`) ? 'expired_jwt' : 'invalid_jwt'}`,
})

// §8.7: the same answer whether the mission does not exist or belongs to another agent.
const noSuchMission = res => problem(res, 400, 'invalid_request', 'mission_s256 names no mission of this agent')
const terminated = res => problem(res, 403, 'mission_terminated', undefined, { mission_status: 'terminated', termination_reason: 'expired' })
const claimsOf = jwt => { try { return decodeJwt(jwt) } catch { return {} } }
const hostOf = url => { try { return new URL(url).hostname } catch { return 'the resource' } }

// Agents read refusals as the resource's, and Jev as a person: name Bob's side and the mission. The bracketed scopes are what the proxy asks again without.
function refusal(m, resource, scopes, why) {
  const text = state.blob(m)?.description ?? ''
  return `${BOB_NAME}'s own person server refused [${scopes.join(' ')}], so ${hostOf(resource)} was not asked. ${why} The mission ${BOB_NAME} approved: "${text.length > 300 ? `${text.slice(0, 300)}…` : text}"`
}
const forAgent = v => (v.by === 'jev'
  ? `${v.scope}: ${BOB_NAME}'s supervisor model judged it outside the mission${v.p != null ? ` (p ${v.p.toFixed(2)})` : ''}.`
  : `${v.scope}: ${v.reason.replace(/\bJev\b/g, `${BOB_NAME}'s supervisor model`)}`)

// Auth tokens mockin minted for requests Bob is still reviewing; memory only, never written to disk.
const heldTokens = new Map()

const html = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'",
  })
  res.end(body)
}
const see = (res, location, headers = {}) => { res.writeHead(303, { location, 'cache-control': 'no-store', ...headers }); res.end() }

const parseJson = raw => { try { return JSON.parse(raw.toString('utf8') || '{}') } catch { return undefined } }

// -11 deferred response: poll Location; the person answers at url?code=code.
const interaction = x => ({
  'retry-after': '1',
  'cache-control': 'no-store',
  'aauth-requirement': `requirement=interaction; url="${PS}/interact"; code="${x.code}"`,
})
const pendingHeaders = m => ({ location: `${PS}/mission/pending/${m.id}`, ...interaction(m) })
const reviewHeaders = r => ({ location: `${PS}/review/pending/${r.id}`, ...interaction(r) })

async function agentOf(req, url, raw) {
  const v = await verifySignedRequest(req, url, raw, { resource: PS, accept: ['agent'] })
  return v.error ? v : { agent: v.token.sub }
}

async function metadata(req, res) {
  const up = await forward({ method: 'GET', url: req.url, headers: { ...req.headers, 'accept-encoding': 'identity' } }, Buffer.alloc(0), PORTS.mockin)
  if (up.status !== 200) return relay(res, up)
  json(res, 200, { ...JSON.parse(up.body.toString('utf8')), mission_endpoint: `${PS}/mission` })
}

async function createMission(req, res, url, raw) {
  const who = await agentOf(req, url, raw)
  if (who.error) return unsigned(res, who)
  const body = parseJson(raw)
  if (typeof body?.description !== 'string' || !body.description.trim()) {
    return problem(res, 400, 'invalid_request', 'description is required')
  }
  const m = state.propose({
    agent: who.agent,
    description: body.description.trim(),
    tools: Array.isArray(body.tools) ? body.tools.filter(t => typeof t?.name === 'string') : undefined,
    resources: Array.isArray(body.resources) ? body.resources.filter(r => typeof r === 'string') : undefined,
  })
  log(`mission proposed by ${who.agent}: "${m.description}" → waiting for ${BOB_NAME} at ${PS}/interact`)
  json(res, 202, { status: 'pending' }, pendingHeaders(m))
}

async function pollMission(req, res, url, raw, id) {
  const who = await agentOf(req, url, raw)
  if (who.error) return unsigned(res, who)
  const m = state.mission(id)
  if (!m || m.agent !== who.agent) return problem(res, 404, 'mission_not_found')
  if (m.status === 'pending') {
    return state.isOpen(m) ? json(res, 202, { status: 'pending' }, pendingHeaders(m)) : problem(res, 408, 'expired', `${BOB_NAME} did not answer in time`)
  }
  if (m.status === 'denied') return problem(res, 403, 'denied', `${BOB_NAME} denied the mission`)
  json(res, 200, { s256: m.s256, mission: m.blob_b64 }, { 'cache-control': 'no-store' })
}

function decideMission(m, decision, description, supervisor) {
  const before = m.status
  const d = state.decide(m.id, decision, description, { supervisor })
  if (d.status === before) return d
  log(d.status === 'approved'
    ? `${BOB_NAME} approved mission ${short(d.s256)}${d.supervisor === 'rules' ? ' (rules only)' : ''}: "${d.approved_description}"`
    : `${BOB_NAME} denied mission ${m.id}`)
  return d
}

function decideReview(r, decision) {
  const before = r.status
  const d = state.decideReview(r.id, decision)
  if (d.status === before) return d
  log(`${BOB_NAME} ${d.status === 'approved' ? 'allowed' : 'denied'} [${d.scopes.join(' ')}]`)
  if (d.status === 'denied') heldTokens.delete(d.id)
  return d
}

const answer = (x, form) => {
  const decision = form.get('decision') === 'approve' ? 'approve' : 'deny'
  return x.scopes ? decideReview(x, decision) : decideMission(x, decision, form.get('description'), form.get('supervisor'))
}

const SESSION = 'bob_session'
const cookie = (req, name) => (req.headers.cookie ?? '').split(/;\s*/).find(c => c.startsWith(`${name}=`))?.slice(name.length + 1)
// The authenticated channel §11.6.3.1 requires for Bob's answers: a browser paired through /pair, or a script holding Bob's console token.
const isBob = req => tokenMatches(req.headers.authorization, bobToken) || !!state.session(cookie(req, SESSION))

// §11.6.3.1 rate limit: after ten unknown codes in ten minutes, a client's codes stop matching for a while.
const misses = new Map()
const clientOf = req => String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress)
const recentMisses = req => (misses.get(clientOf(req)) ?? []).filter(t => t > Date.now() - 600_000)
const limited = req => recentMisses(req).length >= 10
const missed = req => misses.set(clientOf(req), [...recentMisses(req), Date.now()])

function presented(req, code) {
  if (limited(req)) return { status: 429, kind: 'limited' }
  const x = state.byCode(code)
  if (!x) { missed(req); return { status: 410, kind: 'unknown' } }
  if (x.code_used_at || x.status !== 'pending') return { status: 410, kind: 'used' }
  if (!state.isOpen(x)) return { status: 408, kind: 'expired' }
  return { x }
}

// The interaction URL (§11.6.3). The code only says which request; Bob, signed in, is what answers it, and his arrival uses the code up.
async function interact(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'POST') return html(res, 405, notFoundPage())
  if (req.method === 'GET' && !url.searchParams.get('code')) return html(res, 200, codeEntryPage())
  const form = req.method === 'POST' ? new URLSearchParams((await readBody(req)).toString('utf8')) : url.searchParams
  const p = presented(req, form.get('code'))
  if (!p.x) return html(res, p.status, codeProblemPage(p.kind))
  if (!isBob(req)) {
    return req.method === 'GET'
      ? html(res, 200, previewPage(p.x, state.mission(p.x.mission), { bobName: BOB_NAME, consoleUrl: CONSOLE_URL }))
      : html(res, 401, pairFirstPage({ bobName: BOB_NAME, consoleUrl: CONSOLE_URL }))
  }
  state.useCode(p.x)
  if (req.method === 'GET') return see(res, p.x.scopes ? `/bob/reviews/${p.x.id}` : `/bob/missions/${p.x.id}`)
  answer(p.x, form)
  see(res, '/bob')
}

// Bob's own pages, signed in: what needs him, live, and each mission or held request.
async function bobPages(req, res, url) {
  const path = url.pathname
  if (!isBob(req)) return path === '/bob/live' ? json(res, 401, { error: 'unauthorized' }) : html(res, 401, pairFirstPage({ bobName: BOB_NAME, consoleUrl: CONSOLE_URL }))
  if (path === '/bob' && req.method === 'GET') return html(res, 200, homePage({ bobName: BOB_NAME, open: state.open(), active: state.active() }))
  if (path === '/bob/live' && req.method === 'GET') return json(res, 200, { html: needsYou(state.open()) }, { 'cache-control': 'no-store' })
  const [, kind, id] = path.match(/^\/bob\/(missions|reviews)\/([\w-]+)$/) ?? []
  const x = kind === 'missions' ? state.mission(id) : kind === 'reviews' ? state.review(id) : undefined
  if (!x) return html(res, 404, notFoundPage())
  if (req.method === 'POST') {
    answer(x, new URLSearchParams((await readBody(req)).toString('utf8')))
    return see(res, '/bob')
  }
  const open = state.isOpen(x)
  html(res, 200, x.scopes ? reviewPage(x, state.mission(x.mission), { bobName: BOB_NAME, open }) : missionPage(x, { bobName: BOB_NAME, open }))
}

// Opening a link from npm run pair signs this browser in as Bob.
function pair(req, res, url) {
  if (limited(req)) return html(res, 429, codeProblemPage('limited'))
  const id = state.pair(url.searchParams.get('code'), String(req.headers['user-agent'] ?? '').slice(0, 120))
  if (!id) { missed(req); return html(res, 410, codeProblemPage('unknown')) }
  log(`a browser signed in as ${BOB_NAME}`)
  const secure = !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')
  see(res, '/bob', { 'set-cookie': `${SESSION}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${secure ? '; Secure' : ''}` })
}

// Person tokens only under a mission Bob approved, for the agent that proposed it.
async function personToken(req, res, url, raw) {
  const who = await agentOf(req, url, raw)
  if (!who.error) {
    const body = parseJson(raw) ?? {}
    const m = state.byS256(body.mission_s256)
    const refuse = (why, send) => {
      log(`✗ person token for ${body.resource ?? '?'} ${why} → refused`)
      state.record({ mission_s256: body.mission_s256, event: 'person_token_refused', agent: who.agent, detail: `${body.resource ?? ''} ${why}` })
      return send()
    }
    if (!body.mission_s256) {
      return refuse('with no mission', () => problem(res, 403, 'mission_required', `${BOB_NAME}'s person server issues person tokens only under a mission ${BOB_NAME} approved`))
    }
    if (!m || m.agent !== who.agent) return refuse(`under mission ${short(body.mission_s256)}, unknown for this agent`, () => noSuchMission(res))
    if (state.expired(m)) return refuse(`under mission ${short(m.s256)}, which has expired`, () => terminated(res))
    log(`person token for ${body.resource} under mission ${short(m.s256)} → mockin`)
    state.record({ mission: m.id, mission_s256: m.s256, event: 'person_token', agent: who.agent, detail: body.resource })
  }
  relay(res, await forward(req, raw, PORTS.mockin))
}

// The supervisor seam: each scope the agent does not yet hold is judged against the approved mission (never by Jev if Bob chose rules only) and logged.
async function supervise(m, agent, resource, scopes, justification) {
  const mission = { s256: m.s256, status: m.status, blob_b64: m.blob_b64 }
  const opts = m.supervisor === 'rules' ? { jev: false } : {}
  const named = (state.blob(m)?.approved_resources ?? []).includes(resource)
  const verdicts = []
  for (const scope of scopes) {
    const act = { type: 'token_request', agent, resource, scope, ...(justification ? { justification } : {}) }
    // context is access to the resource itself, which the mission's resources settle; decide() judges Alice's items.
    const d = scope.startsWith('item:')
      ? await decide({ mission, act, log: state.missionLog(m.s256) }, opts)
        .catch(err => ({ decision: 'REVIEW', by: 'rule', rule: 'supervisor_failed', p: null, model: null, reason: `the supervisor failed (${err.message}), so ${BOB_NAME} decides` }))
      : { decision: named ? 'ALLOW' : 'REVIEW', by: 'rule', rule: named ? 'resource_named' : 'resource_not_named', p: null, model: null,
          reason: named ? 'the mission names this resource' : 'the mission does not name this resource' }
    verdicts.push({ scope, act, ...d })
    state.record({ mission: m.id, mission_s256: m.s256, event: 'supervised', act, ...d })
  }
  const decision = verdicts.some(v => v.decision === 'DENY') ? 'DENY' : verdicts.some(v => v.decision === 'REVIEW') ? 'REVIEW' : 'ALLOW'
  return { decision, verdicts }
}

async function authToken(req, res, url, raw) {
  const who = await agentOf(req, url, raw)
  if (who.error) return relay(res, await forward(req, raw, PORTS.mockin))
  const body = parseJson(raw) ?? {}
  // mockin verifies both tokens; the front only reads what the supervisor needs.
  const rt = claimsOf(body.resource_token)
  const m = state.byS256(rt.mission_s256)
  if (!m || m.agent !== who.agent) return noSuchMission(res)
  if (state.expired(m)) return terminated(res)
  const holds = new Set((claimsOf(body.presented_token).scope ?? '').split(' ').filter(Boolean))
  const fresh = (rt.scope ?? '').split(' ').filter(sc => sc && !holds.has(sc))
  const justification = typeof body.justification === 'string' && body.justification ? body.justification : undefined
  const { decision, verdicts } = await supervise(m, who.agent, rt.iss, fresh, justification)
  log(`supervisor on [${fresh.join(' ')}] under mission ${short(m.s256)}${justification ? ` ("${justification}")` : ''}: ${verdicts.map(v => `${v.scope} ${v.decision} (${v.rule ?? v.by}: ${v.reason})`).join('; ') || 'nothing new'} → ${decision}`)
  if (decision === 'DENY') {
    const denied = verdicts.filter(v => v.decision === 'DENY')
    return problem(res, 403, 'denied', refusal(m, rt.iss, denied.map(v => v.scope), denied.map(forAgent).join(' ')))
  }
  const up = await forward(req, raw, PORTS.mockin)
  if (decision === 'ALLOW' || up.status !== 200) return relay(res, up)
  const r = state.openReview({ mission: m, agent: who.agent, resource: rt.iss, scopes: fresh, acts: verdicts.map(v => v.act), justification, verdicts })
  heldTokens.set(r.id, up)
  log(`holding the auth token for [${fresh.join(' ')}] until ${BOB_NAME} answers at ${PS}/bob`)
  json(res, 202, { status: 'pending' }, reviewHeaders(r))
}

async function pollReview(req, res, url, raw, id) {
  const who = await agentOf(req, url, raw)
  if (who.error) return unsigned(res, who)
  const r = state.review(id)
  if (!r || r.agent !== who.agent) return problem(res, 404, 'not_found')
  if (r.status === 'pending') {
    if (state.isOpen(r)) return json(res, 202, { status: 'pending' }, reviewHeaders(r))
    heldTokens.delete(id)
    return problem(res, 408, 'expired', `${BOB_NAME} did not answer in time`)
  }
  const up = heldTokens.get(id)
  heldTokens.delete(id)
  if (r.status === 'denied') {
    return problem(res, 403, 'denied', refusal(state.mission(r.mission), r.resource, r.scopes, `${BOB_NAME} declined the request on ${BOB_NAME}'s own page.`))
  }
  if (!up) return problem(res, 408, 'expired', 'the held auth token is gone; request access again')
  relay(res, up)
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

async function bobApi(req, res, url) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  const reply = (status, body) => json(res, status, body, CORS)
  if (!tokenMatches(req.headers.authorization, bobToken)) return reply(401, { error: 'unauthorized' })
  if (req.method === 'GET' && url.pathname === '/api/state') return reply(200, { ...state.view(), interact_url: `${PS}/interact`, bob_url: `${PS}/bob` })
  if (req.method === 'POST' && url.pathname === '/api/pair') {
    const p = state.newPairing()
    return reply(200, { url: `${PS}/pair?code=${p.code}`, code: p.code, expires_at: p.expires_at })
  }
  const [, kind, id] = url.pathname.match(/^\/api\/(missions|reviews)\/([\w-]+)$/) ?? []
  if (req.method === 'POST' && kind) {
    const body = parseJson(await readBody(req))
    if (!['approve', 'deny'].includes(body?.decision)) return reply(400, { error: 'invalid_request', error_description: 'decision must be approve or deny' })
    const x = kind === 'missions' ? state.mission(id) : state.review(id)
    if (!x) return reply(404, { error: 'not_found' })
    if (!state.isOpen(x)) return reply(409, { error: 'not_pending', status: x.status })
    const d = kind === 'missions' ? decideMission(x, body.decision, body.description, body.supervisor) : decideReview(x, body.decision)
    return reply(200, { ok: true, status: d.status, ...(d.s256 && kind === 'missions' ? { s256: d.s256 } : {}) })
  }
  return reply(404, { error: 'not_found' })
}

async function startPersonServerFront() {
  await listen(PORTS.ps, async (req, res) => {
    const url = new URL(req.url ?? '/', PS)
    const path = url.pathname
    if (path === '/.well-known/aauth-person.json') return metadata(req, res)
    if (path === '/interact') return interact(req, res, url)
    if (path === '/bob' || path.startsWith('/bob/')) return bobPages(req, res, url)
    if (path === '/pair' && req.method === 'GET') return pair(req, res, url)
    if (path.startsWith('/api/')) return bobApi(req, res, url)
    if (path === '/mission' && req.method === 'POST') return createMission(req, res, url, await readBody(req))
    const pendingId = path.match(/^\/mission\/pending\/([\w-]+)$/)?.[1]
    if (pendingId && req.method === 'GET') return pollMission(req, res, url, await readBody(req), pendingId)
    if (path === '/aauth/token/person' && req.method === 'POST') return personToken(req, res, url, await readBody(req))
    if (path === '/aauth/token/auth' && req.method === 'POST') return authToken(req, res, url, await readBody(req))
    const reviewId = path.match(/^\/review\/pending\/([\w-]+)$/)?.[1]
    if (reviewId && req.method === 'GET') return pollReview(req, res, url, await readBody(req), reviewId)
    // mockin's /mock control API and OAuth mock stay on its private port.
    if (path.startsWith('/aauth/')) return relay(res, await forward(req, await readBody(req), PORTS.mockin))
    json(res, 404, { error: 'not_found' })
  }, log)
}

export async function startBob({ consent = process.env.CONSENT === '1' } = {}) {
  routeTestHostsToLoopback()
  await startAgentProvider()
  await startMockin(consent)
  await startPersonServerFront()
  log(`up: person server ${PS} (missions at ${PS}/mission, Bob's page ${PS}/bob, supervisor/decide.mjs on auth tokens, mockin behind the front, ${consent ? 'consent required' : 'auto-approve'}), agent provider ${AGENT}`)
}

if (isMain(import.meta)) await startBob()
