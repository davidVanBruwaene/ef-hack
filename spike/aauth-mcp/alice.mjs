// Alice's side: the AAuth-protected MCP server holding Alice's links, and the /api her owner console calls.
import { SignJWT } from 'jose'
import { z } from 'zod'
import { verify as httpSigVerify } from '@hellocoop/httpsig'
import { buildAAuthHeader, createResourceToken, verifyToken } from '@aauth/resource'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { RULES, consoleToken, openState, requesterId, tokenMatches } from './alice-state.mjs'
import { PORTS, RESOURCE } from './config.mjs'
import { isMain, json, listen, logger, readBody, short } from './http.mjs'
import { resourceKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'

const log = logger('alice')
// Kept under Cloudflare's 100 s origin timeout, so a held call answers before the tunnel drops it.
const ASK_WAIT_MS = Number(process.env.ALICE_ASK_WAIT_S || 55) * 1000
const BASE_SCOPE = 'context'
const itemScope = id => `item:${id}`

const state = openState(new URL('./alice.json', import.meta.url))
const first = state.owner.first_name
const ownerName = `${state.owner.first_name} ${state.owner.last_name}`

// mockin's auth token names the agent's key (cnf), not the agent, so remember who signed with each key.
const agentByKey = new Map()

const reject = (status, error, requirement, description) => ({
  ok: false,
  status,
  body: { error, ...(description ? { error_description: description } : {}) },
  headers: requirement ? { 'aauth-requirement': requirement } : {},
})

// Every item a call would disclose needs its own scope, so each new item goes back through Bob's person server.
function requiredScopes(rid, message) {
  const calls = (Array.isArray(message) ? message : [message])
    .filter(m => m?.method === 'tools/call' && m.params?.name === 'search_context')
  const ids = new Set(calls.flatMap(m => state.resolve(rid, m.params.arguments ?? {}).items.map(i => i.id)))
  return [BASE_SCOPE, ...[...ids].map(itemScope)]
}

async function aauthGate(req, url, raw, message, key, sign) {
  const sig = await httpSigVerify({
    method: req.method ?? 'POST',
    authority: req.headers.host ?? '',
    path: url.pathname,
    query: url.search.replace(/^\?/, '') || undefined,
    headers: req.headers,
    body: raw.length ? raw : undefined,
  }, { supportedAlgorithms: ['Ed25519'] })
  if (!sig.verified || !sig.jwt?.raw) {
    log('✗ unsigned request or bad signature', sig.error ?? '')
    return reject(401, 'agent_token_required', buildAAuthHeader('agent-token'))
  }

  let token
  try {
    token = await verifyToken({
      jwt: sig.jwt.raw,
      httpSignatureThumbprint: sig.thumbprint,
      resource: RESOURCE,
      accept: ['agent', 'person', 'auth'],
    })
  } catch (err) {
    log('✗ token rejected:', err.code ?? '', err.message)
    return reject(401, err.code ?? 'invalid_token', buildAAuthHeader('agent-token'), err.message)
  }

  if (token.type === 'agent') {
    agentByKey.set(sig.thumbprint, token.sub)
    log(`1. agent ${token.sub} signed in → asking for a person token`)
    return reject(401, 'person_token_required', buildAAuthHeader('person-token'))
  }

  const ps = token.type === 'person' ? token.iss : token.ps
  const rid = requesterId(ps, token.sub)
  const known = state.requester(rid)
  if (known?.status === 'revoked') {
    log(`✗ ${known.label} (${rid}) is revoked → 403`)
    return reject(403, 'requester_revoked', undefined, `${first} has revoked access for this requester`)
  }

  const needed = requiredScopes(rid, message)
  const held = token.type === 'auth' ? (token.scope ?? '').split(' ').filter(Boolean) : []
  const missing = needed.filter(s => !held.includes(s))
  if (token.type === 'person' || missing.length) {
    const scope = [...new Set([...held, ...needed])].join(' ')
    const resourceToken = await createResourceToken({
      resource: RESOURCE, audience: ps, presentedToken: token, agentJkt: sig.thumbprint, scope, kid: key.kid,
    }, sign)
    log(token.type === 'person'
      ? `2. person ${short(token.sub)} under mission ${short(token.mission_s256)} → resource token [${scope}], asking for an auth token`
      : `step-up: this call needs [${missing.join(' ')}] → resource token [${scope}], back to the person server`)
    return reject(401, 'auth_token_required', buildAAuthHeader('auth-token', { resourceToken }))
  }

  const agent = agentByKey.get(sig.thumbprint) ?? null
  const requester = state.seen({ id: rid, ps, sub: token.sub, label: token.claims?.name, agent })
  return { ok: true, auth: token, requester, agent, scopes: held }
}

const text = body => ({ content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] })

function contextServer({ auth, requester, agent, scopes }) {
  const server = new McpServer({ name: 'alice-context', version: '0.1.0' })
  const mission = auth.mission_s256 ?? ''

  server.registerTool('get_context_schema', {
    title: `What ${first} shares`,
    description: `Lists the items of ${ownerName}'s context you may request, without their values. "shared" items come back at once; for "ask" items ${first} is asked first.`,
  }, async () => {
    const items = state.visible(requester.id)
      .map(i => ({ id: i.id, label: i.label, access: state.shared(requester.id, i) ? 'shared' : 'ask' }))
    log(`schema for ${requester.label}: ${items.length} items visible`)
    return text({ owner: ownerName, items })
  })

  server.registerTool('search_context', {
    title: `Search ${first}'s context`,
    description: `Returns items of ${ownerName}'s context, by id or by words matched against their labels. With neither, returns the shared items. For items ${first} must answer, the call waits up to ${ASK_WAIT_MS / 1000} s; call again later for any still pending. Say why you need them in reason: ${first} reads it.`,
    inputSchema: {
      ids: z.array(z.string()).optional().describe('Item ids from get_context_schema'),
      query: z.string().optional().describe('Words to match against item labels'),
      reason: z.string().optional().describe(`Why you need these items; ${first} sees it when asked`),
    },
  }, async ({ ids, query, reason }) => {
    const found = state.resolve(requester.id, { ids, query })
    const results = found.items.map(item => ({
      item,
      ...(scopes.includes(itemScope(item.id))
        ? state.decision(requester.id, mission, item, { agent, reason })
        : { state: 'unscoped' }),
    }))

    const pending = results.filter(r => r.state === 'pending')
    if (pending.length) {
      log(`asking ${first} about [${pending.map(r => r.item.id).join(', ')}] for ${requester.label}; holding the call up to ${ASK_WAIT_MS / 1000}s`)
      await state.waitDecided(pending.map(r => r.ask.id), ASK_WAIT_MS)
      for (const r of pending) Object.assign(r, state.decision(requester.id, mission, r.item, { agent, reason }))
    }

    const idsIn = st => results.filter(r => r.state === st).map(r => r.item.id)
    const shared = Object.fromEntries(results.filter(r => r.state === 'approved').map(r => [r.item.id, { label: r.item.label, url: r.item.url }]))
    const out = {
      owner: ownerName,
      shared,
      pending: idsIn('pending'),
      declined: idsIn('denied'),
      not_found: [...found.hidden, ...found.unknown, ...idsIn('unscoped')],
    }
    if (out.pending.length) out.note = `${first} has not answered about ${out.pending.join(', ')} yet. Call search_context with those ids again later.`

    const decisions = Object.fromEntries([
      ...results.map(r => [r.item.id, r.by ?? r.state]),
      ...found.hidden.map(id => [id, 'hidden']),
    ])
    state.disclose({
      requester: requester.id,
      agent,
      mission_s256: mission,
      tool: 'search_context',
      query: [query, ...(ids ?? [])].filter(Boolean).join(', '),
      disclosed: Object.keys(shared),
      withheld: [...out.declined, ...out.pending, ...found.hidden],
      decided_by: [...new Set(results.map(r => r.by).filter(Boolean))].join(', ') || 'rule',
      reason: reason ?? '',
      decisions,
    })
    log(`4. ${requester.label}: shared [${Object.keys(shared).join(', ')}]; declined [${out.declined.join(', ')}]; pending [${out.pending.join(', ')}]; hidden [${found.hidden.join(', ')}]`)
    return text(out)
  })
  return server
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

// Carries no state, only a revision number: the console refetches /api/state, which needs the token.
function events(req, res) {
  res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' })
  const send = rev => res.write(`event: changed\ndata: {"rev":${rev}}\n\n`)
  send(state.rev())
  const off = state.onChange(send)
  const ping = setInterval(() => res.write(': ping\n\n'), 20_000)
  req.on('close', () => { off(); clearInterval(ping) })
}

async function consoleApi(req, res, url, token) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  if (req.method === 'GET' && url.pathname === '/api/events') return events(req, res)
  const reply = (status, body) => json(res, status, body, CORS)
  if (!tokenMatches(req.headers.authorization, token)) return reply(401, { error: 'unauthorized' })
  if (req.method === 'GET' && url.pathname === '/api/state') return reply(200, state.view())
  if (req.method !== 'POST') return reply(404, { error: 'not_found' })

  let body
  try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}') } catch { return reply(400, { error: 'invalid_json' }) }
  const bad = description => reply(400, { error: 'invalid_request', error_description: description })
  const [, kind, id] = url.pathname.match(/^\/api\/(asks|requesters|items)(?:\/([\w-]+))?$/) ?? []

  if (kind === 'asks') {
    const decisions = id ? [{ id, decision: body.decision, remember: body.remember }] : body.decisions
    if (!Array.isArray(decisions) || !decisions.every(d => ['approve', 'deny'].includes(d?.decision))) {
      return bad('decision must be approve or deny')
    }
    const { missing } = state.decideAsks(decisions)
    if (missing.length) return reply(404, { error: 'not_found', missing })
    log(`${first} decided: ${decisions.map(d => `${d.id} ${d.decision}${d.remember ? ' (remember)' : ''}`).join(', ')}`)
    return reply(200, { ok: true, rev: state.rev() })
  }
  if (kind === 'requesters' && id) {
    if (body.status && !['active', 'revoked'].includes(body.status)) return bad('status must be active or revoked')
    if (!state.setRequester(id, body)) return reply(404, { error: 'not_found' })
    log(`${first} set requester ${id}: ${body.status ?? ''} ${body.label ?? ''}`)
    return reply(200, { ok: true, rev: state.rev() })
  }
  if (kind === 'items' && id) {
    if (!RULES.includes(body.rule)) return bad(`rule must be one of ${RULES.join(', ')}`)
    if (!state.setRule(id, body.rule)) return reply(404, { error: 'not_found' })
    return reply(200, { ok: true, rev: state.rev() })
  }
  if (kind === 'items') {
    if (typeof body.label !== 'string' || !body.label.trim() || typeof body.url !== 'string' || !body.url.trim()) {
      return bad('label and url are required')
    }
    if (body.rule && !RULES.includes(body.rule)) return bad(`rule must be one of ${RULES.join(', ')}`)
    return reply(200, { ok: true, item: state.addLink(body.label.trim(), body.url.trim(), body.rule), rev: state.rev() })
  }
  return reply(404, { error: 'not_found' })
}

export async function startAlice() {
  routeTestHostsToLoopback()
  const key = await resourceKey()
  const jwks = { keys: [key.publicJwk] }
  const sign = (payload, header) => new SignJWT(payload).setProtectedHeader(header).sign(key.privateKey)
  const token = consoleToken()

  await listen(PORTS.resource, async (req, res) => {
    const url = new URL(req.url ?? '/', RESOURCE)
    if (url.pathname === '/.well-known/aauth-resource.json') {
      return json(res, 200, { issuer: RESOURCE, name: `${first}'s context`, jwks_uri: `${RESOURCE}/jwks.json` })
    }
    if (url.pathname === '/jwks.json') return json(res, 200, jwks)
    if (url.pathname.startsWith('/api/')) return consoleApi(req, res, url, token)
    if (url.pathname !== '/mcp') return json(res, 404, { error: 'not_found' })
    // Stateless MCP: no standalone SSE stream and no session to delete.
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' })

    const raw = await readBody(req)
    let message
    try { message = JSON.parse(raw.toString('utf8')) } catch { return json(res, 400, { error: 'invalid_json' }) }
    const gate = await aauthGate(req, url, raw, message, key, sign)
    if (!gate.ok) return json(res, gate.status, gate.body, gate.headers)

    log(`3. auth token ok for ${gate.requester.label} [${gate.scopes.join(' ')}] → MCP ${message.method ?? 'response'}`)
    const server = contextServer(gate)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => { transport.close(); server.close() })
    await server.connect(transport)
    await transport.handleRequest(req, res, message)
  }, log)

  log(`up: resource ${RESOURCE}/mcp, console API ${RESOURCE}/api (token: ${process.env.ALICE_CONSOLE_TOKEN ? 'ALICE_CONSOLE_TOKEN' : '.keys/alice-console-token'})`)
}

if (isMain(import.meta)) await startAlice()
