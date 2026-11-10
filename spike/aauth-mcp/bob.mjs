// The person server for every member: missions, the supervisor on auth tokens, and person and auth tokens for the member each mission belongs to; plus the agent provider.
import { decodeJwt } from 'jose'
import { consoleToken, openBobState, tokenMatches } from './bob-state.mjs'
import { AGENT, PORTS, PS } from './config.mjs'
import { decide } from '../../supervisor/decide.mjs'
import { isMain, json, listen, logger, readBody, short } from './http.mjs'
import { agentIdentityKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'
import { badResource, issueAuthToken, issuePersonToken, jwks, subjectFor, verifyPresentedToken, verifyResourceToken } from './ps-tokens.mjs'
import { verifySignedRequest } from './verify.mjs'

const log = logger('ps')
const state = openBobState()
const apiToken = consoleToken()
// Members answer in the console, signed in with their store passkey; without one, only /api answers.
const CONSOLE_URL = process.env.RP_ID ? `https://${process.env.RP_ID.trim()}/` : undefined
const INTERACT_URL = CONSOLE_URL ?? `${PS}/interact`

async function startAgentProvider() {
  const identity = await agentIdentityKey()
  const keys = { keys: [identity.publicJwk] }
  await listen(PORTS.agent, (req, res) => {
    const path = new URL(req.url ?? '/', AGENT).pathname
    const body = path === '/.well-known/aauth-agent.json'
      ? { issuer: AGENT, name: 'Parley agent provider', jwks_uri: `${AGENT}/jwks.json` }
      : path === '/jwks.json' ? keys : undefined
    json(res, body ? 200 : 404, body ?? { error: 'not_found' })
  }, log)
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
const nameOf = m => m?.person?.name ?? 'the member'

// Agents read refusals as the resource's, and Jev as a person: name the member's side and the mission. The bracketed scopes are what the proxy asks again without.
function refusal(m, resource, scopes, why) {
  const text = state.blob(m)?.description ?? ''
  return `${nameOf(m)}'s own person server refused [${scopes.join(' ')}], so ${hostOf(resource)} was not asked. ${why} The mission ${nameOf(m)} approved: "${text.length > 300 ? `${text.slice(0, 300)}…` : text}"`
}
const forAgent = (m, v) => (v.by === 'jev'
  ? `${v.scope}: ${nameOf(m)}'s supervisor model judged it outside the mission${v.p != null ? ` (p ${v.p.toFixed(2)})` : ''}.`
  : `${v.scope}: ${v.reason.replace(/\bJev\b/g, `${nameOf(m)}'s supervisor model`)}`)

// Auth token requests waiting on their member; memory only, and the token is minted only once the member allows it.
const held = new Map()

const parseJson = raw => { try { return JSON.parse(raw.toString('utf8') || '{}') } catch { return undefined } }

// -11 deferred response: poll Location; the member answers at url?code=code.
const interaction = x => ({
  'retry-after': '1',
  'cache-control': 'no-store',
  'aauth-requirement': `requirement=interaction; url="${INTERACT_URL}"; code="${x.code}"`,
})
const pendingHeaders = m => ({ location: `${PS}/mission/pending/${m.id}`, ...interaction(m) })
const reviewHeaders = r => ({ location: `${PS}/review/pending/${r.id}`, ...interaction(r) })

async function agentOf(req, url, raw) {
  const v = await verifySignedRequest(req, url, raw, { resource: PS, accept: ['agent'] })
  return v.error ? v : { agent: v.token.sub, jwk: v.token.cnf.jwk, exp: v.token.exp, jkt: v.sig.thumbprint }
}

function metadata(res) {
  json(res, 200, {
    issuer: PS,
    name: 'Parley person server',
    jwks_uri: `${PS}/aauth/jwks.json`,
    person_token_endpoint: `${PS}/aauth/token/person`,
    auth_token_endpoint: `${PS}/aauth/token/auth`,
    mission_endpoint: `${PS}/mission`,
  }, { 'cache-control': 'public, max-age=300' })
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
  const owner = state.ownerOf(who.agent)
  log(`mission proposed by ${who.agent}${owner ? ` (${owner.name}'s agent)` : ''}: "${m.description}" → waiting at ${INTERACT_URL}`)
  json(res, 202, { status: 'pending' }, pendingHeaders(m))
}

async function pollMission(req, res, url, raw, id) {
  const who = await agentOf(req, url, raw)
  if (who.error) return unsigned(res, who)
  const m = state.mission(id)
  if (!m || m.agent !== who.agent) return problem(res, 404, 'mission_not_found')
  if (m.status === 'pending') {
    return state.isOpen(m) ? json(res, 202, { status: 'pending' }, pendingHeaders(m)) : problem(res, 408, 'expired', 'no member answered in time')
  }
  if (m.status === 'denied') return problem(res, 403, 'denied', `${nameOf(m)} denied the mission`)
  json(res, 200, { s256: m.s256, mission: m.blob_b64 }, { 'cache-control': 'no-store' })
}

// Person tokens only under an approved, unexpired mission, for the agent that proposed it, naming the member who approved it.
async function personToken(req, res, url, raw) {
  const who = await agentOf(req, url, raw)
  if (who.error) return unsigned(res, who)
  const body = parseJson(raw) ?? {}
  const refuse = (why, send) => {
    log(`✗ person token for ${body.resource ?? '?'} ${why} → refused`)
    state.record({ mission_s256: body.mission_s256, event: 'person_token_refused', agent: who.agent, detail: `${body.resource ?? ''} ${why}` })
    return send()
  }
  if (badResource(body.resource)) return problem(res, 400, 'invalid_request', badResource(body.resource))
  if (body.upstream_token !== undefined) return problem(res, 400, 'invalid_request', 'upstream_token (call chaining) is not supported')
  if (!body.mission_s256) {
    return refuse('with no mission', () => problem(res, 403, 'mission_required', 'this person server issues person tokens only under a mission its member approved'))
  }
  const m = state.byS256(body.mission_s256)
  if (!m || m.agent !== who.agent || m.status !== 'approved') return refuse(`under mission ${short(body.mission_s256)}, unknown for this agent`, () => noSuchMission(res))
  if (state.expired(m)) return refuse(`under mission ${short(m.s256)}, which has expired`, () => terminated(res))
  log(`person token for ${m.person.name} at ${body.resource} under mission ${short(m.s256)}`)
  state.record({ mission: m.id, mission_s256: m.s256, event: 'person_token', agent: who.agent, detail: body.resource })
  state.noteSubject(body.resource, subjectFor(m.person.id, body.resource), m.person)
  json(res, 200, await issuePersonToken({ member: m.person.id, resource: body.resource, agentJwk: who.jwk, agentExp: who.exp, mission: m }), { 'cache-control': 'no-store' })
}

// The supervisor seam: each scope the agent does not yet hold is judged against the approved mission (never by Jev if its member chose rules only) and logged.
async function supervise(m, agent, resource, scopes, justification) {
  const mission = { s256: m.s256, status: m.status, blob_b64: m.blob_b64 }
  const opts = m.supervisor === 'rules' ? { jev: false } : {}
  const named = (state.blob(m)?.approved_resources ?? []).includes(resource)
  const verdicts = []
  for (const scope of scopes) {
    const act = { type: 'token_request', agent, resource, scope, ...(justification ? { justification } : {}) }
    // context is access to the resource itself, which the mission's resources settle; decide() judges the items.
    const d = scope.startsWith('item:')
      ? await decide({ mission, act, log: state.missionLog(m.s256) }, opts)
        .catch(err => ({ decision: 'REVIEW', by: 'rule', rule: 'supervisor_failed', p: null, model: null, reason: `the supervisor failed (${err.message}), so ${nameOf(m)} decides` }))
      : { decision: named ? 'ALLOW' : 'REVIEW', by: 'rule', rule: named ? 'resource_named' : 'resource_not_named', p: null, model: null,
          reason: named ? 'the mission names this resource' : 'the mission does not name this resource' }
    verdicts.push({ scope, act, ...d })
    state.record({ mission: m.id, mission_s256: m.s256, event: 'supervised', act, ...d })
  }
  const decision = verdicts.some(v => v.decision === 'DENY') ? 'DENY' : verdicts.some(v => v.decision === 'REVIEW') ? 'REVIEW' : 'ALLOW'
  return { decision, verdicts }
}

const issue = async (res, args) => {
  const t = await issueAuthToken(args)
  return t.error ? problem(res, t.status, t.error, t.detail) : json(res, 200, t, { 'cache-control': 'no-store' })
}

async function authToken(req, res, url, raw) {
  const who = await agentOf(req, url, raw)
  if (who.error) return unsigned(res, who)
  const body = parseJson(raw) ?? {}
  if (body.upstream_token !== undefined) return problem(res, 400, 'invalid_request', 'upstream_token (call chaining) is not supported')
  if (body.subagent_token !== undefined) return problem(res, 400, 'invalid_request', 'subagent_token is not supported')
  const v = await verifyResourceToken(body.resource_token, who.jkt)
  if (v.error) return problem(res, v.status, v.error, v.detail)
  const p = await verifyPresentedToken(body.presented_token, v.rt)
  if (p.error) return problem(res, p.status, p.error, p.detail)
  const { rt } = v
  const m = state.byS256(rt.mission_s256)
  if (!m || m.agent !== who.agent || m.status !== 'approved' || rt.sub !== subjectFor(m.person.id, rt.iss)) return noSuchMission(res)
  if (state.expired(m)) return terminated(res)
  const holds = new Set((claimsOf(body.presented_token).scope ?? '').split(' ').filter(Boolean))
  const fresh = (rt.scope ?? '').split(' ').filter(sc => sc && !holds.has(sc))
  const justification = typeof body.justification === 'string' && body.justification ? body.justification : undefined
  const { decision, verdicts } = await supervise(m, who.agent, rt.iss, fresh, justification)
  log(`supervisor on [${fresh.join(' ')}] under ${nameOf(m)}'s mission ${short(m.s256)}${justification ? ` ("${justification}")` : ''}: ${verdicts.map(x => `${x.scope} ${x.decision} (${x.rule ?? x.by}: ${x.reason})`).join('; ') || 'nothing new'} → ${decision}`)
  if (decision === 'DENY') {
    const denied = verdicts.filter(x => x.decision === 'DENY')
    return problem(res, 403, 'denied', refusal(m, rt.iss, denied.map(x => x.scope), denied.map(x => forAgent(m, x)).join(' ')))
  }
  const args = { rt, presentedExp: p.presented.exp, agentJwk: who.jwk, name: m.person.name }
  if (decision === 'ALLOW') return issue(res, args)
  const r = state.openReview({ mission: m, agent: who.agent, resource: rt.iss, scopes: fresh, acts: verdicts.map(x => x.act), justification, verdicts })
  held.set(r.id, args)
  log(`holding [${fresh.join(' ')}] until ${nameOf(m)} answers in the console`)
  json(res, 202, { status: 'pending' }, reviewHeaders(r))
}

async function pollReview(req, res, url, raw, id) {
  const who = await agentOf(req, url, raw)
  if (who.error) return unsigned(res, who)
  const r = state.review(id)
  if (!r || r.agent !== who.agent) return problem(res, 404, 'not_found')
  const m = state.mission(r.mission)
  if (r.status === 'pending') {
    if (state.isOpen(r)) return json(res, 202, { status: 'pending' }, reviewHeaders(r))
    held.delete(id)
    return problem(res, 408, 'expired', `${nameOf(m)} did not answer in time`)
  }
  const args = held.get(id)
  held.delete(id)
  // Only the scopes held for the member are refused; ones the supervisor allowed come back when the agent asks again without them.
  const heldScopes = r.verdicts?.filter(v => v.decision !== 'ALLOW').map(v => v.scope) ?? r.scopes
  if (r.status === 'denied') return problem(res, 403, 'denied', refusal(m, r.resource, heldScopes.length ? heldScopes : r.scopes, `${nameOf(m)} declined the request.`))
  if (!args) return problem(res, 408, 'expired', 'the held request is gone; request access again')
  return issue(res, args)
}

// The member answering, as the console server vouches for them after checking their store sign-in.
const memberIn = body => (typeof body?.member?.id === 'string' && body.member.id && typeof body.member.name === 'string'
  ? { id: body.member.id, name: body.member.name.trim() || 'A member' } : null)

// Whether this member may answer x: a held request or a bound agent's mission belongs to one member; an unbound agent's first mission goes to whoever holds its code.
function mayAnswer(x, member, code) {
  const m = x.scopes ? state.mission(x.mission) : x
  const owner = x.scopes ? m?.person : state.ownerOf(m.agent)
  if (owner) return owner.id === member.id ? null : 'this agent belongs to another member'
  return state.byCode(code) === x ? null : 'the first mission of an agent needs the code it showed'
}

function decideMission(m, decision, body, member) {
  const before = m.status
  const d = state.decide(m.id, decision, body.description, { supervisor: body.supervisor, member })
  if (d.status !== before) {
    log(d.status === 'approved'
      ? `${member.name} approved mission ${short(d.s256)}${d.supervisor === 'rules' ? ' (rules only)' : ''}: "${d.approved_description}"`
      : `${member.name} denied mission ${m.id}`)
  }
  return d
}

function decideReview(r, decision, member) {
  const before = r.status
  const d = state.decideReview(r.id, decision, member)
  if (d.status !== before) {
    log(`${member.name} ${d.status === 'approved' ? 'allowed' : 'denied'} [${d.scopes.join(' ')}]`)
    if (d.status === 'denied') held.delete(d.id)
  }
  return d
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

// The console server's API: it checks the member's store sign-in, then names that member here.
async function api(req, res, url) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  const reply = (status, body) => json(res, status, body, CORS)
  if (!tokenMatches(req.headers.authorization, apiToken)) return reply(401, { error: 'unauthorized' })
  if (req.method === 'GET' && url.pathname === '/api/state') return reply(200, { ...state.view(url.searchParams.get('member') || undefined), interact_url: INTERACT_URL })
  const code = url.pathname.match(/^\/api\/codes\/([\w-]+)$/)?.[1]
  if (req.method === 'GET' && code) {
    const x = state.byCode(code)
    if (!x) return reply(404, { error: 'not_found' })
    // §11.9.4: a code already answered, or whose request expired, is invalid_code.
    if (!state.isOpen(x)) return reply(410, { error: 'invalid_code', status: x.status })
    return reply(200, x.scopes ? { kind: 'review', review: x, mission: state.mission(x.mission) } : { kind: 'mission', mission: x, owner: state.ownerOf(x.agent) ?? null })
  }
  if (req.method === 'GET' && url.pathname === '/api/subjects') {
    const member = state.subject(url.searchParams.get('aud') ?? '', url.searchParams.get('sub') ?? '')
    return member ? reply(200, { member }) : reply(404, { error: 'not_found' })
  }
  if (req.method === 'POST' && url.pathname === '/api/agents') {
    const body = parseJson(await readBody(req))
    const member = memberIn(body)
    if (!member || typeof body?.agent !== 'string' || !body.agent) return reply(400, { error: 'invalid_request', error_description: 'agent and member {id, name} are required' })
    const bound = state.bind(body.agent, member)
    if (!bound) return reply(403, { error: 'forbidden', error_description: 'this agent belongs to another member' })
    log(`${member.name} connected agent ${body.agent}`)
    return reply(200, { ok: true, agent: body.agent, owner: bound })
  }
  const [, kind, id] = url.pathname.match(/^\/api\/(missions|reviews)\/([\w-]+)$/) ?? []
  if (req.method === 'POST' && kind) {
    const body = parseJson(await readBody(req))
    if (!['approve', 'deny'].includes(body?.decision)) return reply(400, { error: 'invalid_request', error_description: 'decision must be approve or deny' })
    const member = memberIn(body)
    if (!member) return reply(400, { error: 'invalid_request', error_description: 'member {id, name} is required' })
    const x = kind === 'missions' ? state.mission(id) : state.review(id)
    if (!x) return reply(404, { error: 'not_found' })
    if (!state.isOpen(x)) return reply(409, { error: 'not_pending', status: x.status })
    const why = mayAnswer(x, member, body.code)
    if (why) return reply(403, { error: 'forbidden', error_description: why })
    const d = kind === 'missions' ? decideMission(x, body.decision, body, member) : decideReview(x, body.decision, member)
    return reply(200, { ok: true, status: d.status, ...(d.s256 && kind === 'missions' ? { s256: d.s256 } : {}) })
  }
  return reply(404, { error: 'not_found' })
}

// Without a console there is nowhere to sign in, so the interaction URL only says so.
function interactPage(res, url) {
  if (CONSOLE_URL) {
    const code = url.searchParams.get('code')
    res.writeHead(303, { location: code ? `${CONSOLE_URL}?code=${encodeURIComponent(code)}` : CONSOLE_URL, 'cache-control': 'no-store' })
    return res.end()
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end('This person server has no console configured (RP_ID), so requests are answered through its /api.\n')
}

async function startPersonServer() {
  await listen(PORTS.ps, async (req, res) => {
    const url = new URL(req.url ?? '/', PS)
    const path = url.pathname
    if (path === '/.well-known/aauth-person.json') return metadata(res)
    if (path === '/aauth/jwks.json') return json(res, 200, jwks, { 'cache-control': 'public, max-age=300' })
    if (path === '/interact' && req.method === 'GET') return interactPage(res, url)
    if (path.startsWith('/api/')) return api(req, res, url)
    if (path === '/mission' && req.method === 'POST') return createMission(req, res, url, await readBody(req))
    const pendingId = path.match(/^\/mission\/pending\/([\w-]+)$/)?.[1]
    if (pendingId && req.method === 'GET') return pollMission(req, res, url, await readBody(req), pendingId)
    if (path === '/aauth/token/person' && req.method === 'POST') return personToken(req, res, url, await readBody(req))
    if (path === '/aauth/token/auth' && req.method === 'POST') return authToken(req, res, url, await readBody(req))
    const reviewId = path.match(/^\/review\/pending\/([\w-]+)$/)?.[1]
    if (reviewId && req.method === 'GET') return pollReview(req, res, url, await readBody(req), reviewId)
    json(res, 404, { error: 'not_found' })
  }, log)
}

export async function startBob() {
  routeTestHostsToLoopback()
  await startAgentProvider()
  await startPersonServer()
  log(`up: person server ${PS} (missions at ${PS}/mission, members answer at ${INTERACT_URL}, supervisor/decide.mjs on auth tokens), agent provider ${AGENT}`)
}

if (isMain(import.meta)) await startBob()
