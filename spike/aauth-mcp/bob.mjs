// Bob's side: the agent provider, and Bob's person server: mockin behind a front that owns missions and the public identifier.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { decodeJwt } from 'jose'
import { missionPage, notFoundPage, reviewCards, reviewPage } from './bob-pages.mjs'
import { consoleToken, openBobState, tokenMatches } from './bob-state.mjs'
import { AGENT, BOB_NAME, PORTS, PS } from './config.mjs'
import { decide } from './decide-rules.mjs'
import { forward, isMain, json, listen, logger, readBody, relay, short } from './http.mjs'
import { agentIdentityKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'
import { verifySignedRequest } from './verify.mjs'

const log = logger('bob')
const MOCKIN = `http://127.0.0.1:${PORTS.mockin}`
const state = openBobState()

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

const problem = (res, status, error, detail, extra = {}) => {
  res.writeHead(status, { 'content-type': 'application/problem+json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ error, ...(detail ? { detail } : {}), ...extra }))
}

// §8.7: the same answer whether the mission does not exist or belongs to another agent.
const noSuchMission = res => problem(res, 400, 'invalid_request', 'mission_s256 names no mission of this agent')
const terminated = res => problem(res, 403, 'mission_terminated', undefined, { mission_status: 'terminated', termination_reason: 'expired' })
const claimsOf = jwt => { try { return decodeJwt(jwt) } catch { return {} } }

// Auth tokens mockin minted for requests Bob is still reviewing; memory only, never written to disk.
const heldTokens = new Map()

const html = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

const parseJson = raw => { try { return JSON.parse(raw.toString('utf8') || '{}') } catch { return undefined } }

// -11 deferred response: poll Location; the person approves at url?code=code.
const pendingHeaders = m => ({
  location: `${PS}/mission/pending/${m.id}`,
  'retry-after': '1',
  'cache-control': 'no-store',
  'aauth-requirement': `requirement=interaction; url="${PS}/interact"; code="${m.code}"`,
})

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
  if (who.error) return problem(res, 401, who.error, who.detail)
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
  if (who.error) return problem(res, 401, who.error, who.detail)
  const m = state.mission(id)
  if (!m || m.agent !== who.agent) return problem(res, 404, 'mission_not_found')
  if (m.status === 'pending') return json(res, 202, { status: 'pending' }, pendingHeaders(m))
  if (m.status === 'denied') return problem(res, 403, 'access_denied', `${BOB_NAME} denied the mission`)
  json(res, 200, { s256: m.s256, mission: m.blob_b64 }, { 'cache-control': 'no-store' })
}

function decideMission(m, decision, description) {
  const d = state.decide(m.id, decision, description)
  log(d.status === 'approved'
    ? `${BOB_NAME} approved mission ${short(d.s256)}: "${d.approved_description}"`
    : `${BOB_NAME} denied mission ${m.id}`)
  return d
}

// The pages behind the QR code: the code in the link is what lets Bob answer.
async function interact(req, res, url) {
  if (url.pathname === '/interact/reviews') {
    const m = state.byCode(url.searchParams.get('code') ?? '')
    return m && !m.scopes ? json(res, 200, reviewCards(state.pendingReviews(m.id), m.code), { 'cache-control': 'no-store' }) : json(res, 404, [])
  }
  const show = item => html(res, 200, item.scopes
    ? reviewPage(item, state.mission(item.mission), { bobName: BOB_NAME })
    : missionPage(item, { bobName: BOB_NAME }))
  if (req.method === 'GET') {
    const item = state.byCode(url.searchParams.get('code') ?? '')
    return item ? show(item) : html(res, 404, notFoundPage())
  }
  if (req.method !== 'POST') return html(res, 405, notFoundPage())
  const form = new URLSearchParams((await readBody(req)).toString('utf8'))
  const item = state.byCode(form.get('code') ?? '')
  if (!item) return html(res, 404, notFoundPage())
  const decision = form.get('decision') === 'approve' ? 'approve' : 'deny'
  if (item.status === 'pending') item.scopes ? decideReview(item, decision) : decideMission(item, decision, form.get('description'))
  // Redirect after answering, so reloading the page on a phone does not resend the form.
  const back = state.byCode(form.get('back') ?? '')
  res.writeHead(303, { location: `/interact?code=${encodeURIComponent((back && !back.scopes ? back : item).code)}` })
  res.end()
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

const reviewHeaders = r => ({
  location: `${PS}/review/pending/${r.id}`,
  'retry-after': '1',
  'cache-control': 'no-store',
  'aauth-requirement': `requirement=interaction; url="${PS}/interact"; code="${r.code}"`,
})

// The supervisor seam: every scope the agent does not already hold is judged against the mission Bob approved.
async function supervise(m, agent, resource, scopes, justification) {
  const mission = {
    s256: m.s256, agent: m.agent, description: m.approved_description,
    approved_resources: m.resources ?? [], approved_at: m.approved_at, expires_at: m.expires_at,
  }
  const verdicts = []
  for (const scope of scopes) {
    if (!scope.startsWith('item:')) {
      const named = mission.approved_resources.includes(resource)
      verdicts.push({ scope, decision: named ? 'ALLOW' : 'REVIEW', by: 'rule', p: null, model: null,
        reason: named ? 'the mission names this resource' : 'the mission does not name this resource' })
      continue
    }
    try {
      const act = { type: 'token_request', agent, resource, scope, ...(justification ? { justification } : {}) }
      verdicts.push({ scope, ...(await decide({ mission, act, log: state.missionLog(m.s256) })) })
    } catch (err) {
      verdicts.push({ scope, decision: 'REVIEW', by: 'rule', p: null, model: null, reason: `the supervisor failed (${err.message}), so Bob decides` })
    }
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
  log(`supervisor on [${fresh.join(' ')}] under mission ${short(m.s256)}${justification ? ` ("${justification}")` : ''}: ${verdicts.map(v => `${v.scope} ${v.decision} (${v.by}: ${v.reason})`).join('; ') || 'nothing new'} → ${decision}`)
  state.record({ mission: m.id, mission_s256: m.s256, event: 'auth_token', decision, agent: who.agent, detail: fresh.join(' '), justification, verdicts })
  if (decision === 'DENY') {
    const why = verdicts.filter(v => v.decision === 'DENY').map(v => `${v.scope}: ${v.reason}`).join('; ')
    return problem(res, 403, 'access_denied', `${BOB_NAME}'s supervisor refused ${why}`)
  }
  const up = await forward(req, raw, PORTS.mockin)
  if (decision === 'ALLOW' || up.status !== 200) return relay(res, up)
  const r = state.openReview({ mission: m, agent: who.agent, resource: rt.iss, scopes: fresh, justification, verdicts })
  heldTokens.set(r.id, up)
  log(`holding the auth token for [${fresh.join(' ')}] until ${BOB_NAME} answers at ${PS}/interact`)
  json(res, 202, { status: 'pending' }, reviewHeaders(r))
}

async function pollReview(req, res, url, raw, id) {
  const who = await agentOf(req, url, raw)
  if (who.error) return problem(res, 401, who.error, who.detail)
  const r = state.review(id)
  if (!r || r.agent !== who.agent) return problem(res, 404, 'not_found')
  if (r.status === 'pending') return json(res, 202, { status: 'pending' }, reviewHeaders(r))
  const up = heldTokens.get(id)
  heldTokens.delete(id)
  if (r.status === 'denied') return problem(res, 403, 'access_denied', `${BOB_NAME} declined the request`)
  if (!up) return problem(res, 410, 'expired_request', 'the held auth token is gone; request a new one')
  relay(res, up)
}

function decideReview(r, decision) {
  const d = state.decideReview(r.id, decision)
  log(`${BOB_NAME} ${d.status === 'approved' ? 'allowed' : 'denied'} [${d.scopes.join(' ')}]`)
  if (d.status === 'denied') heldTokens.delete(d.id)
  return d
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

async function bobApi(req, res, url, token) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  const reply = (status, body) => json(res, status, body, CORS)
  if (!tokenMatches(req.headers.authorization, token)) return reply(401, { error: 'unauthorized' })
  if (req.method === 'GET' && url.pathname === '/api/state') return reply(200, { ...state.view(), interact_url: `${PS}/interact` })
  const id = url.pathname.match(/^\/api\/missions\/([\w-]+)$/)?.[1]
  if (req.method === 'POST' && id) {
    const body = parseJson(await readBody(req))
    if (!['approve', 'deny'].includes(body?.decision)) return reply(400, { error: 'invalid_request', error_description: 'decision must be approve or deny' })
    const m = state.mission(id)
    if (!m) return reply(404, { error: 'not_found' })
    if (m.status !== 'pending') return reply(409, { error: 'already_decided', status: m.status })
    const d = decideMission(m, body.decision, body.description)
    return reply(200, { ok: true, status: d.status, s256: d.s256 })
  }
  const reviewId = url.pathname.match(/^\/api\/reviews\/([\w-]+)$/)?.[1]
  if (req.method === 'POST' && reviewId) {
    const body = parseJson(await readBody(req))
    if (!['approve', 'deny'].includes(body?.decision)) return reply(400, { error: 'invalid_request', error_description: 'decision must be approve or deny' })
    const r = state.review(reviewId)
    if (!r) return reply(404, { error: 'not_found' })
    if (r.status !== 'pending') return reply(409, { error: 'already_decided', status: r.status })
    return reply(200, { ok: true, status: decideReview(r, body.decision).status })
  }
  return reply(404, { error: 'not_found' })
}

async function startPersonServerFront() {
  const token = consoleToken()
  await listen(PORTS.ps, async (req, res) => {
    const url = new URL(req.url ?? '/', PS)
    const path = url.pathname
    if (path === '/.well-known/aauth-person.json') return metadata(req, res)
    if (path === '/interact' || path === '/interact/reviews') return interact(req, res, url)
    if (path.startsWith('/api/')) return bobApi(req, res, url, token)
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
  log(`up: person server ${PS} (missions at ${PS}/mission, supervisor on auth tokens, mockin behind the front, ${consent ? 'consent required' : 'auto-approve'}), agent provider ${AGENT}`)
}

if (isMain(import.meta)) await startBob()
