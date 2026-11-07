// Bob's side: the agent provider, and Bob's person server: mockin behind a front that owns missions and the public identifier.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { missionPage, notFoundPage } from './bob-pages.mjs'
import { consoleToken, openBobState, tokenMatches } from './bob-state.mjs'
import { AGENT, BOB_NAME, PORTS, PS } from './config.mjs'
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

const problem = (res, status, error, detail) => {
  res.writeHead(status, { 'content-type': 'application/problem+json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ error, detail }))
}

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
  if (!m || m.agent !== who.agent) return problem(res, 404, 'not_found', 'no such mission for this agent')
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

// The page behind the QR code: the code in the link is what lets Bob approve.
async function interact(req, res, url) {
  if (req.method === 'GET') {
    const m = state.byCode(url.searchParams.get('code') ?? '')
    return m ? html(res, 200, missionPage(m, { bobName: BOB_NAME })) : html(res, 404, notFoundPage())
  }
  if (req.method !== 'POST') return html(res, 405, notFoundPage())
  const form = new URLSearchParams((await readBody(req)).toString('utf8'))
  const m = state.byCode(form.get('code') ?? '')
  if (!m) return html(res, 404, notFoundPage())
  if (m.status === 'pending') decideMission(m, form.get('decision') === 'approve' ? 'approve' : 'deny', form.get('description'))
  html(res, 200, missionPage(state.mission(m.id), { bobName: BOB_NAME }))
}

// Person tokens only under a mission Bob approved, for the agent that proposed it.
async function personToken(req, res, url, raw) {
  const who = await agentOf(req, url, raw)
  if (!who.error) {
    const body = parseJson(raw) ?? {}
    const m = state.approved(body.mission_s256)
    if (!m || m.agent !== who.agent) {
      const error = body.mission_s256 ? 'mission_not_approved' : 'mission_required'
      log(`✗ person token for ${body.resource ?? '?'} ${body.mission_s256 ? `under mission ${short(body.mission_s256)}, which ${BOB_NAME} has not approved` : 'with no mission'} → 403`)
      state.record({ mission_s256: body.mission_s256, event: 'person_token_refused', agent: who.agent, detail: body.resource })
      return problem(res, 403, error, `${BOB_NAME}'s person server issues person tokens only under a mission ${BOB_NAME} approved`)
    }
    log(`person token for ${body.resource} under mission ${short(m.s256)} → mockin`)
    state.record({ mission: m.id, mission_s256: m.s256, event: 'person_token', agent: who.agent, detail: body.resource })
  }
  relay(res, await forward(req, raw, PORTS.mockin))
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
  return reply(404, { error: 'not_found' })
}

async function startPersonServerFront() {
  const token = consoleToken()
  await listen(PORTS.ps, async (req, res) => {
    const url = new URL(req.url ?? '/', PS)
    const path = url.pathname
    if (path === '/.well-known/aauth-person.json') return metadata(req, res)
    if (path === '/interact') return interact(req, res, url)
    if (path.startsWith('/api/')) return bobApi(req, res, url, token)
    if (path === '/mission' && req.method === 'POST') return createMission(req, res, url, await readBody(req))
    const pendingId = path.match(/^\/mission\/pending\/([\w-]+)$/)?.[1]
    if (pendingId && req.method === 'GET') return pollMission(req, res, url, await readBody(req), pendingId)
    if (path === '/aauth/token/person' && req.method === 'POST') return personToken(req, res, url, await readBody(req))
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
  log(`up: person server ${PS} (missions at ${PS}/mission, mockin behind the front, ${consent ? 'consent required' : 'auto-approve'}), agent provider ${AGENT}`)
}

if (isMain(import.meta)) await startBob()
