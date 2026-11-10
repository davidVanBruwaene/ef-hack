// Alice's side: the AAuth-protected MCP server holding Alice's links, or every member's on the people network when STORE_URL is set, and the /api owner consoles call.
import { SignJWT } from 'jose'
import { z } from 'zod'
import { buildAAuthHeader, createResourceToken } from '@aauth/resource'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { RULES, consoleToken, openState, requesterId, slug, tokenMatches } from './alice-state.mjs'
import { PORTS, PS, RESOURCE } from './config.mjs'
import { isMain, json, listen, logger, readBody, short } from './http.mjs'
import { resourceKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'
import { openPeople } from './people.mjs'
import { psApi } from './ps-api.mjs'
import { verifySignedRequest } from './verify.mjs'

const log = logger('alice')
// Kept under Cloudflare's 100 s origin timeout, so a held call answers before the tunnel drops it.
const ASK_WAIT_MS = Number(process.env.ALICE_ASK_WAIT_S || 55) * 1000
const BASE_SCOPE = 'context'
const itemScope = item => `item:${item.scope_id ?? item.id}`

const state = openState(new URL('./alice.json', import.meta.url))
const first = state.owner.first_name
const ownerName = `${state.owner.first_name} ${state.owner.last_name}`
// The directory trusts this deployment's person server, which says which member each pairwise sub it issued is.
const people = openPeople(process.env, {
  resolve: (ps, sub) => (ps === PS
    ? psApi().call(`/subjects?aud=${encodeURIComponent(RESOURCE)}&sub=${encodeURIComponent(sub)}`).then(r => r.member?.id ?? null, err => {
      if (/answered 404/.test(err.message)) return null
      throw err
    })
    : null),
})
const aliceOnly = { items: undefined, owner: undefined, name: ownerName, first }

// mockin's auth token names the agent's key (cnf), not the agent, so remember who signed with each key.
const agentByKey = new Map()

const reject = (status, error, requirement, description) => ({
  ok: false,
  status,
  body: { error, ...(description ? { error_description: description } : {}) },
  headers: requirement ? { 'aauth-requirement': requirement } : {},
})

const DISCOVERY = new Set(['initialize', 'ping', 'tools/list'])
const discoveryOnly = message => [message].flat().every(m => typeof m?.method === 'string' && (DISCOVERY.has(m.method) || m.method.startsWith('notifications/')))
const toolCalls = (message, name) => (Array.isArray(message) ? message : [message])
  .filter(m => m?.method === 'tools/call' && m.params?.name === name)

// One owner's items as the store rules them for this member; first and last name come back as the owner's name, not as items.
async function listing(person, member) {
  if (typeof person !== 'string' || !person || !member) return null
  let rows
  try {
    rows = await people.itemsOf(person, member)
  } catch (err) {
    if (err.status === 404) return null
    throw err
  }
  const named = id => rows.find(r => r.id === id && r.rule === 'everyone')?.value
  const name = [named('first'), named('last')].filter(Boolean).join(' ') || 'This member'
  // Scopes show on Bob's page and to his supervisor, so they name the owner readably; the id prefix keeps namesakes apart.
  const handle = `${slug(name)}-${person.replace(/-/g, '').slice(0, 6)}`
  return {
    owner: person,
    name,
    first: named('first') || 'This member',
    items: rows.filter(r => r.id !== 'first' && r.id !== 'last').map(r => ({
      id: `${person}/${r.id}`, item_id: r.id, scope_id: `${handle}/${r.id}`, owner: person, label: r.label, url: r.value, rule: r.rule,
    })),
  }
}

// Each item an owner must answer for needs its own scope from Bob's person server; Everyone items are anyone's, and refused scopes are not asked for again.
async function requiredScopes(rid, member, message, refused) {
  const scopes = new Set()
  for (const m of toolCalls(message, 'search_context')) {
    const args = m.params.arguments ?? {}
    const items = people ? (await listing(args.person, member))?.items ?? [] : undefined
    for (const i of state.resolve(rid, args, items).items) if (i.rule !== 'everyone') scopes.add(itemScope(i))
  }
  return [BASE_SCOPE, ...[...scopes].filter(s => !refused.has(s))]
}

async function aauthGate(req, url, raw, message, key, sign) {
  const v = await verifySignedRequest(req, url, raw, { resource: RESOURCE, accept: ['agent', 'person', 'auth'] })
  if (v.error === 'invalid_signature') {
    log('✗ unsigned request or bad signature', v.detail)
    return reject(401, 'agent_token_required', buildAAuthHeader('agent-token'))
  }
  if (v.error) {
    log('✗ token rejected:', v.error, v.detail)
    return reject(401, v.error, buildAAuthHeader('agent-token'), v.detail)
  }
  const { sig, token } = v

  if (token.type === 'agent') {
    agentByKey.set(sig.thumbprint, token.sub)
    // Listing the tools says nothing about anyone, so an agent may do it before its member approves a mission.
    if (discoveryOnly(message)) {
      log(`agent ${token.sub} lists the tools → MCP ${[message].flat().map(m => m.method).join(', ')}`)
      return { ok: true, discovery: true, auth: token, requester: null, member: null, agent: token.sub, scopes: [], refused: new Set() }
    }
    log(`1. agent ${token.sub} signed in → asking for a person token`)
    return reject(401, 'person_token_required', buildAAuthHeader('person-token'))
  }

  const ps = token.type === 'person' ? token.iss : token.ps
  const rid = requesterId(ps, token.sub)
  const known = state.requester(rid)
  const member = (await people?.memberFor(ps, token.sub)) ?? null
  const revokedBy = people && toolCalls(message, 'search_context').map(m => m.params.arguments?.person).find(p => state.revokedBy(rid, p))
  if (known?.status === 'revoked' || revokedBy) {
    log(`✗ ${known.label} (${rid}) is revoked${revokedBy ? ` by ${short(revokedBy)}` : ''} → 403`)
    return reject(403, 'requester_revoked', undefined, `${people ? 'This member' : first} has revoked access for this requester`)
  }

  // Bob's proxy names the scopes his person server refused, so the call answers with the rest; naming a scope can only withhold its item.
  const refused = new Set(String(req.headers['x-refused-scopes'] ?? '').split(/\s+/).filter(s => s.startsWith('item:')))
  const needed = await requiredScopes(rid, member, message, refused)
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
  const requester = state.seen({ id: rid, ps, sub: token.sub, label: token.claims?.name, agent, member })
  return { ok: true, auth: token, requester, agent, member, scopes: held, refused }
}

const text = body => ({ content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] })
const failure = (error, description) => ({ ...text({ error, error_description: description }), isError: true })

// search_context for one owner's items: alice.json's, or a member's from the store.
async function answerSearch({ requester, agent, mission, scopes, refused, ids, query, reason, list }) {
  const key = item => item.item_id ?? item.id
  const found = state.resolve(requester.id, { ids, query }, list.items)
  const results = found.items.map(item => ({
    item,
    ...(item.rule === 'everyone' || scopes.includes(itemScope(item))
      ? state.decision(requester.id, mission, item, { agent, reason })
      : { state: refused.has(itemScope(item)) ? 'refused' : 'unscoped' }),
  }))

  const pending = results.filter(r => r.state === 'pending')
  if (pending.length) {
    log(`asking ${list.first} about [${pending.map(r => key(r.item)).join(', ')}] for ${requester.label}; holding the call up to ${ASK_WAIT_MS / 1000}s`)
    await state.waitDecided(pending.map(r => r.ask.id), ASK_WAIT_MS)
    for (const r of pending) Object.assign(r, state.decision(requester.id, mission, r.item, { agent, reason }))
  }

  const idsIn = st => results.filter(r => r.state === st).map(r => key(r.item))
  const shared = Object.fromEntries(results.filter(r => r.state === 'approved').map(r => [key(r.item), { label: r.item.label, url: r.item.url }]))
  const out = {
    owner: list.name,
    ...(list.owner ? { person: list.owner } : {}),
    shared,
    pending: idsIn('pending'),
    declined: idsIn('denied'),
    refused: idsIn('refused'),
    not_found: [...found.hidden, ...found.unknown, ...idsIn('unscoped')],
  }
  const notes = [
    out.pending.length && `${list.first} has not answered about ${out.pending.join(', ')} yet. Call search_context with those ids again later.`,
    out.declined.length && `${list.first} declined ${out.declined.join(', ')}.`,
    out.refused.length && `Your own person server refused ${out.refused.join(', ')} under your mission, so ${list.first} was never asked.`,
  ].filter(Boolean)
  if (notes.length) out.note = notes.join(' ')

  const decisions = Object.fromEntries([
    ...results.map(r => [key(r.item), r.by ?? r.state]),
    ...found.hidden.map(id => [id, 'hidden']),
  ])
  state.disclose({
    ...(list.owner ? { owner: list.owner } : {}),
    requester: requester.id,
    agent,
    mission_s256: mission,
    tool: 'search_context',
    query: [query, ...(ids ?? [])].filter(Boolean).join(', '),
    disclosed: Object.keys(shared),
    withheld: [...out.declined, ...out.pending, ...out.refused, ...found.hidden],
    decided_by: [...new Set(results.map(r => r.by).filter(Boolean))].join(', ') || 'rule',
    reason: reason ?? '',
    decisions,
  })
  log(`4. ${requester.label} from ${list.name}: shared [${Object.keys(shared).join(', ')}]; declined [${out.declined.join(', ')}]; refused by the requester's side [${out.refused.join(', ')}]; pending [${out.pending.join(', ')}]; hidden [${found.hidden.join(', ')}]`)
  return text(out)
}

function contextServer({ auth, requester, agent, scopes, refused }) {
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
    description: `Returns items of ${ownerName}'s context, by id or by words matched against their labels. With neither, returns the shared items. For items ${first} must answer, the call waits up to ${ASK_WAIT_MS / 1000} s; call again later for any still pending. Say why you need them in reason: ${first} reads it. In the answer, declined means ${first} said no; refused means your own person server refused the item under your mission, and ${first} was never asked.`,
    inputSchema: {
      ids: z.array(z.string()).optional().describe('Item ids from get_context_schema'),
      query: z.string().optional().describe('Words to match against item labels'),
      reason: z.string().optional().describe(`Why you need these items; ${first} sees it when asked`),
    },
  }, ({ ids, query, reason }) => answerSearch({ requester, agent, mission, scopes, refused, ids, query, reason, list: aliceOnly }))
  return server
}

function networkServer({ auth, requester, member, agent, scopes, refused }) {
  const server = new McpServer({ name: 'people-network', version: '0.1.0' })
  const mission = auth.mission_s256 ?? ''
  const notMember = () => failure('not_a_member', `${requester.label}'s person server is not linked to a member of the network.`)

  server.registerTool('find_people', {
    title: 'Find people in the network',
    description: 'Finds members of the people network by name, or by words in what they share with everyone. Lists each person\'s items without their values: "shared" items come back at once from search_context; for "ask" items the person is asked first.',
    inputSchema: { query: z.string().optional().describe('A name, or words to match; leave it out to list everyone you can see') },
  }, async ({ query }) => {
    if (!member) return notMember()
    const access = (owner, i, rule) => {
      const item = { id: `${owner}/${i.id}`, rule }
      return state.hidden(requester.id, item) ? null : state.shared(requester.id, item) ? 'shared' : 'ask'
    }
    let members
    try {
      members = await people.search(member, query ?? '')
    } catch (err) {
      if (err.status === 404) return notMember()
      throw err
    }
    const found = members.filter(m => !state.revokedBy(requester.id, m.id))
    const out = found.map(m => ({
      person: m.id,
      name: `${m.first_name} ${m.last_name}`.trim(),
      items: [...m.items.map(i => ({ ...i, rule: 'everyone' })), ...m.ask.map(i => ({ ...i, rule: 'ask' }))]
        .map(i => ({ id: i.id, label: i.label, access: access(m.id, i, i.rule) }))
        .filter(i => i.access),
    }))
    log(`find_people for ${requester.label}: ${out.length} found for "${query ?? ''}"`)
    return text({ people: out })
  })

  server.registerTool('search_context', {
    title: "Get a person's items",
    description: `Returns items one member of the network shares, by id or by words matched against their labels. With neither, returns their shared items. Take the person id from find_people. For items the person must answer, the call waits up to ${ASK_WAIT_MS / 1000} s; call again later for any still pending. Say why you need them in reason: the person reads it. In the answer, declined means the person said no; refused means your own person server refused the item under your mission, and the person was never asked.`,
    inputSchema: {
      person: z.string().describe('The person id from find_people'),
      ids: z.array(z.string()).optional().describe('Item ids from find_people'),
      query: z.string().optional().describe('Words to match against item labels'),
      reason: z.string().optional().describe('Why you need these items; the person sees it when asked'),
    },
  }, async ({ person, ids, query, reason }) => {
    if (!member) return notMember()
    const list = await listing(person, member)
    if (!list) return failure('unknown_person', `No member ${person} in the network.`)
    return answerSearch({ requester, agent, mission, scopes, refused, ids, query, reason, list })
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

// The console token speaks for every owner, or for one named in x-owner; on the network, the store's session cookie speaks for its member.
async function consoleCaller(req, url, token) {
  if (tokenMatches(req.headers.authorization, token)) {
    return { ok: true, owner: people ? (req.headers['x-owner'] || url.searchParams.get('owner') || undefined) : undefined }
  }
  if (!people) return { ok: false }
  const user = await people.signedIn(req.headers.cookie).catch(err => { log('✗ store session check failed:', err.message); return null })
  return user ? { ok: true, owner: user.id, user } : { ok: false }
}

async function consoleApi(req, res, url, token) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
  if (req.method === 'GET' && url.pathname === '/api/events') return events(req, res)
  const reply = (status, body) => json(res, status, body, CORS)
  const caller = await consoleCaller(req, url, token)
  if (!caller.ok) return reply(401, { error: 'unauthorized' })
  const { owner } = caller
  const who = caller.user?.first_name ?? (owner ? short(owner) : first)
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const view = state.view(owner)
    // On the network, alice.json's owner and items are not what this server serves.
    if (people) { delete view.owner; delete view.items }
    return reply(200, { ...view, ...(caller.user ? { me: caller.user } : {}) })
  }
  if (req.method !== 'POST') return reply(404, { error: 'not_found' })
  // A cookie also rides on cross-site form posts; a cross-origin JSON post needs a preflight, and the preflight grants no credentials.
  if (caller.user && !/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return reply(415, { error: 'json_required' })

  let body
  try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}') } catch { return reply(400, { error: 'invalid_json' }) }
  const bad = description => reply(400, { error: 'invalid_request', error_description: description })
  const [, kind, id] = url.pathname.match(/^\/api\/(asks|requesters|items)(?:\/([\w-]+))?$/) ?? []

  if (kind === 'asks') {
    const decisions = id ? [{ id, decision: body.decision, remember: body.remember }] : body.decisions
    if (!Array.isArray(decisions) || !decisions.every(d => ['approve', 'deny'].includes(d?.decision))) {
      return bad('decision must be approve or deny')
    }
    const { missing } = state.decideAsks(decisions, owner)
    if (missing.length) return reply(404, { error: 'not_found', missing })
    log(`${who} decided: ${decisions.map(d => `${d.id} ${d.decision}${d.remember ? ' (remember)' : ''}`).join(', ')}`)
    return reply(200, { ok: true, rev: state.rev() })
  }
  if (kind === 'requesters' && id) {
    if (body.status && !['active', 'revoked'].includes(body.status)) return bad('status must be active or revoked')
    if (!state.setRequester(id, body, owner)) return reply(404, { error: 'not_found' })
    log(`${who} set requester ${id}: ${body.status ?? ''} ${body.label ?? ''}`)
    return reply(200, { ok: true, rev: state.rev() })
  }
  if (kind === 'items' && people) {
    return reply(409, { error: 'items_live_in_the_store', error_description: 'On the people network, owners edit their items in the store at /me/items.' })
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
      return json(res, 200, { issuer: RESOURCE, name: people ? 'The people network' : `${first}'s context`, jwks_uri: `${RESOURCE}/jwks.json` })
    }
    if (url.pathname === '/jwks.json') return json(res, 200, jwks)
    if (url.pathname.startsWith('/api/')) return consoleApi(req, res, url, token)
    if (url.pathname !== '/mcp') return json(res, 404, { error: 'not_found' })
    // Stateless MCP: no standalone SSE stream and no session to delete.
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' })

    const raw = await readBody(req)
    let message
    try { message = JSON.parse(raw.toString('utf8')) } catch { return json(res, 400, { error: 'invalid_json' }) }
    let gate
    try {
      gate = await aauthGate(req, url, raw, message, key, sign)
    } catch (err) {
      log('✗ the people network did not answer:', err.message)
      return json(res, 502, { error: 'store_unavailable', error_description: err.message })
    }
    if (!gate.ok) return json(res, gate.status, gate.body, gate.headers)

    if (!gate.discovery) log(`3. auth token ok for ${gate.requester.label} [${gate.scopes.join(' ')}] → MCP ${message.method ?? 'response'}`)
    const server = people ? networkServer(gate) : contextServer(gate)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => { transport.close(); server.close() })
    await server.connect(transport)
    await transport.handleRequest(req, res, message)
  }, log)

  const where = people ? `people network ${people.url}` : `${first}'s links (alice.json)`
  log(`up: resource ${RESOURCE}/mcp serving ${where}, console API ${RESOURCE}/api (token: ${process.env.ALICE_CONSOLE_TOKEN ? 'ALICE_CONSOLE_TOKEN' : '.keys/alice-console-token'})`)
}

if (isMain(import.meta)) await startAlice()
