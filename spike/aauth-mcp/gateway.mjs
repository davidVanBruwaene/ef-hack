// The hosted MCP endpoint: any MCP agent connects with OAuth, its member signs in with their passkey, and each connection reaches the network as its own AAuth agent.
import { randomBytes } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { agentFetch } from './aauth-fetch.mjs'
import { agentSession } from './agent.mjs'
import { AGENT, RESOURCE } from './config.mjs'
import { readBody } from './http.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'
import { requestMission } from './missions.mjs'
import { jsonFile, now, sha256 } from './store.mjs'

const ACCESS_TTL = 3600
const REFRESH_TTL = 30 * 86400
const CODE_TTL = 300
const CONNECT_TTL = 600
// How long start_mission waits for the member before answering pending; hosted clients time a tool call out at about a minute.
const MISSION_WAIT_MS = 45_000
// Asks and held requests wait on people, so a forwarded call may take as long as the person server lets a request wait.
const CALL_TIMEOUT_MS = 15 * 60_000

const secret = () => randomBytes(32).toString('base64url')
const hexId = () => randomBytes(8).toString('hex')
const epoch = () => Math.floor(Date.now() / 1000)
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version', 'access-control-allow-methods': 'GET, POST, OPTIONS' }

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS, ...headers })
  res.end(JSON.stringify(body))
}
const oauthError = (res, status, error, description) => send(res, status, { error, ...(description ? { error_description: description } : {}) })

// RFC 8252 §7.3: loopback redirects may use http; everything else must be https.
function badRedirect(uri) {
  let u
  try { u = new URL(uri) } catch { return `redirect_uri ${uri} is not a URL` }
  if (u.hash) return 'redirect_uri must not carry a fragment'
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return `redirect_uri ${uri} must use https`
  return null
}

async function formOrJson(req) {
  const raw = (await readBody(req)).toString('utf8')
  if (/^application\/json\b/i.test(req.headers['content-type'] ?? '')) { try { return JSON.parse(raw || '{}') } catch { return null } }
  return Object.fromEntries(new URLSearchParams(raw))
}

const START_MISSION = {
  name: 'start_mission',
  title: 'Start a mission',
  description: 'Say what you mean to do on the people network for the person you act for. They approve it in their Parley console, and may narrow it; the other tools work only under an approved mission, and the person server checks each request against it. Waits up to 45 s for their answer; calling it again with the same description reports on that one, waiting or approved.',
  inputSchema: {
    type: 'object',
    properties: { description: { type: 'string', description: 'What you will do, in one or two plain sentences, as the person will read it' } },
    required: ['description'],
  },
}
const reply = body => ({ content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] })
const failed = body => ({ ...reply(body), isError: true })

// memberOf(req) is the store's member for the request's cookie; ps(path, body) calls the person server's /api.
export function openGateway({ origin, memberOf, memberGone = async () => false, ps, fromConsole, log }) {
  routeTestHostsToLoopback()
  const file = jsonFile('gateway-state.json')
  const saved = file.load()
  const s = { clients: saved.clients ?? {}, connections: saved.connections ?? {}, tokens: saved.tokens ?? {} }
  const save = () => {
    const t = epoch()
    for (const [k, v] of Object.entries(s.tokens)) if (v.exp <= t) delete s.tokens[k]
    file.save(s)
  }
  // Short-lived and single-use, so memory only: a restart only means signing in again.
  const pending = new Map()
  const codes = new Map()
  const documents = new Map()
  const sessions = new Map()
  const upstreams = new Map()
  const proposals = new Map()

  const RESOURCE_URL = `${origin}/mcp`
  const resourceMetadata = `${origin}/.well-known/oauth-protected-resource`

  // A client_id that is an https URL names its own metadata document (client ID metadata documents); others come from registration.
  async function clientOf(id) {
    if (typeof id !== 'string' || !id) return null
    if (s.clients[id]) return s.clients[id]
    if (!id.startsWith('https://')) return null
    const cached = documents.get(id)
    if (cached && cached.until > Date.now()) return cached.client
    const res = await fetch(id, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000) }).catch(() => null)
    const text = res?.ok ? await res.text().catch(() => '') : ''
    let doc
    try { doc = text.length < 65_536 ? JSON.parse(text) : null } catch { doc = null }
    if (doc?.client_id !== id || !Array.isArray(doc.redirect_uris) || doc.redirect_uris.some(badRedirect)) return null
    const client = { client_id: id, client_name: String(doc.client_name ?? new URL(id).hostname), redirect_uris: doc.redirect_uris, token_endpoint_auth_method: 'none' }
    documents.set(id, { client, until: Date.now() + 3600_000 })
    return client
  }

  function asMetadata() {
    return {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: ['parley'],
      client_id_metadata_document_supported: true,
    }
  }

  // RFC 7591; public clients register with token_endpoint_auth_method none and get no secret.
  async function register(req, res) {
    const body = await formOrJson(req)
    if (!body || !Array.isArray(body.redirect_uris) || !body.redirect_uris.length) return oauthError(res, 400, 'invalid_redirect_uri', 'redirect_uris is required')
    const bad = body.redirect_uris.map(badRedirect).find(Boolean)
    if (bad) return oauthError(res, 400, 'invalid_redirect_uri', bad)
    const method = body.token_endpoint_auth_method ?? 'none'
    if (!asMetadata().token_endpoint_auth_methods_supported.includes(method)) return oauthError(res, 400, 'invalid_client_metadata', `token_endpoint_auth_method ${method} is not supported`)
    const client_id = `c_${hexId()}`
    const client_secret = method === 'none' ? undefined : secret()
    const client = {
      client_id, client_name: String(body.client_name ?? 'An MCP client').slice(0, 100), redirect_uris: body.redirect_uris,
      token_endpoint_auth_method: method, ...(client_secret ? { secret_hash: sha256(client_secret) } : {}), created_at: now(),
    }
    s.clients[client_id] = client
    save()
    log(`registered client ${client_id} "${client.client_name}"`)
    const { secret_hash, created_at, ...pub } = client
    send(res, 201, {
      ...pub, client_id_issued_at: epoch(), grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
      ...(client_secret ? { client_secret, client_secret_expires_at: 0 } : {}),
    })
  }

  async function authorize(res, url) {
    const q = Object.fromEntries(url.searchParams)
    const client = await clientOf(q.client_id)
    const plain = (status, text) => { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(`${text}\n`) }
    if (!client) return plain(400, 'Unknown client_id.')
    const redirect = q.redirect_uri ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : undefined)
    if (!redirect || !client.redirect_uris.includes(redirect)) return plain(400, 'redirect_uri is not one this client registered.')
    const back = (error, description) => {
      const u = new URL(redirect)
      u.searchParams.set('error', error)
      if (description) u.searchParams.set('error_description', description)
      if (q.state) u.searchParams.set('state', q.state)
      u.searchParams.set('iss', origin)
      res.writeHead(303, { location: u.href, 'cache-control': 'no-store' })
      res.end()
    }
    if (q.response_type !== 'code') return back('unsupported_response_type')
    if (!q.code_challenge || q.code_challenge_method !== 'S256') return back('invalid_request', 'PKCE with S256 is required')
    if (q.resource && ![RESOURCE_URL, origin].includes(q.resource.replace(/\/+$/, ''))) return back('invalid_target', `resource must be ${RESOURCE_URL}`)
    const id = secret()
    pending.set(id, { client_id: client.client_id, client_name: client.client_name, redirect, state: q.state, challenge: q.code_challenge, until: Date.now() + CONNECT_TTL * 1000 })
    res.writeHead(303, { location: `${origin}/?connect=${encodeURIComponent(id)}`, 'cache-control': 'no-store' })
    res.end()
  }

  const open = id => { const p = pending.get(id); return p && p.until > Date.now() ? p : null }

  // The console's connect screen, for the member signed in: what is asking, and their answer.
  async function connect(req, res, url, id) {
    const member = await memberOf(req)
    if (!member) return send(res, 401, { error: 'not_signed_in' })
    const p = open(id)
    if (!p) return send(res, 404, { error: 'not_found', error_description: 'this sign-in request expired; start connecting again from your agent' })
    if (req.method === 'GET') return send(res, 200, { client_name: p.client_name, redirect_host: new URL(p.redirect).host, member: member.name })
    if (!fromConsole(req)) return send(res, 403, { error: 'bad_origin' })
    const body = await formOrJson(req)
    pending.delete(id)
    const u = new URL(p.redirect)
    if (p.state) u.searchParams.set('state', p.state)
    u.searchParams.set('iss', origin)
    if (body?.decision !== 'approve') {
      u.searchParams.set('error', 'access_denied')
      log(`${member.name} refused to connect ${p.client_name}`)
      return send(res, 200, { redirect: u.href })
    }
    let conn = Object.values(s.connections).find(c => c.member.id === member.id && c.client_id === p.client_id && !c.revoked_at)
    if (!conn) {
      const cid = hexId()
      conn = { id: cid, member, client_id: p.client_id, client_name: p.client_name, agent: `aauth:${cid}@${new URL(AGENT).hostname}`, created_at: now() }
      const bound = await ps('/agents', { agent: conn.agent, member })
      if (bound.status !== 200) return send(res, 502, { error: 'person_server', error_description: `the person server answered ${bound.status}` })
      s.connections[cid] = conn
      save()
      log(`${member.name} connected ${p.client_name} as ${conn.agent}`)
    }
    const code = secret()
    codes.set(code, { connection: conn.id, client_id: p.client_id, redirect: p.redirect, challenge: p.challenge, until: Date.now() + CODE_TTL * 1000 })
    u.searchParams.set('code', code)
    send(res, 200, { redirect: u.href })
  }

  function issue(res, conn, client_id) {
    const access = secret(), refresh = secret(), t = epoch()
    s.tokens[sha256(access)] = { kind: 'access', connection: conn.id, client_id, exp: t + ACCESS_TTL }
    s.tokens[sha256(refresh)] = { kind: 'refresh', connection: conn.id, client_id, exp: t + REFRESH_TTL }
    save()
    send(res, 200, { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: 'parley' })
  }

  // Client authentication when the client registered with a secret; Basic per RFC 6749 §2.3.1.
  function clientAuthenticated(req, client, body) {
    if (client.token_endpoint_auth_method === 'none') return true
    let given = body.client_secret
    const basic = /^Basic (.+)$/i.exec(req.headers.authorization ?? '')?.[1]
    if (basic) {
      const [id, sec] = Buffer.from(basic, 'base64').toString('utf8').split(':').map(decodeURIComponent)
      if (id !== client.client_id) return false
      given = sec
    }
    return typeof given === 'string' && sha256(given) === client.secret_hash
  }

  async function token(req, res) {
    const body = await formOrJson(req)
    if (!body) return oauthError(res, 400, 'invalid_request')
    const basicId = /^Basic (.+)$/i.exec(req.headers.authorization ?? '')?.[1]
    const clientId = body.client_id ?? (basicId ? decodeURIComponent(Buffer.from(basicId, 'base64').toString('utf8').split(':')[0]) : undefined)
    const client = await clientOf(clientId)
    if (!client || !clientAuthenticated(req, client, body)) return oauthError(res, 401, 'invalid_client')
    if (body.grant_type === 'authorization_code') {
      const c = codes.get(body.code)
      codes.delete(body.code)
      if (!c || c.until < Date.now() || c.client_id !== client.client_id) return oauthError(res, 400, 'invalid_grant', 'the code is unknown, used or expired')
      if (body.redirect_uri && body.redirect_uri !== c.redirect) return oauthError(res, 400, 'invalid_grant', 'redirect_uri does not match')
      if (typeof body.code_verifier !== 'string' || sha256(body.code_verifier) !== c.challenge) return oauthError(res, 400, 'invalid_grant', 'code_verifier does not match the code_challenge')
      const conn = s.connections[c.connection]
      if (!(await live(conn))) return oauthError(res, 400, 'invalid_grant', 'the connection was revoked')
      return issue(res, conn, client.client_id)
    }
    if (body.grant_type === 'refresh_token') {
      const key = sha256(String(body.refresh_token ?? ''))
      const r = s.tokens[key]
      if (!r || r.kind !== 'refresh' || r.exp <= epoch() || r.client_id !== client.client_id) return oauthError(res, 400, 'invalid_grant', 'the refresh token is unknown or expired')
      delete s.tokens[key]
      const conn = s.connections[r.connection]
      if (!(await live(conn))) { save(); return oauthError(res, 400, 'invalid_grant', 'the connection was revoked') }
      return issue(res, conn, client.client_id)
    }
    oauthError(res, 400, 'unsupported_grant_type')
  }

  // A connection whose member left the store is revoked on its next use.
  async function live(conn) {
    if (!conn || conn.revoked_at) return false
    if (!(await memberGone(conn.member.id))) return true
    for (const c of Object.values(s.connections)) {
      if (c.member.id === conn.member.id && !c.revoked_at) Object.assign(c, { revoked_at: now(), revoked_because: 'member_deleted' })
    }
    for (const [k, v] of Object.entries(s.tokens)) if (s.connections[v.connection]?.revoked_at) delete s.tokens[k]
    save()
    log(`${conn.member.name}'s account is gone from the store; revoked their connections`)
    return false
  }

  async function bearer(req) {
    const t = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '')?.[1]
    const entry = t && s.tokens[sha256(t)]
    if (!entry || entry.kind !== 'access' || entry.exp <= epoch()) return null
    const conn = s.connections[entry.connection]
    return (await live(conn)) ? conn : null
  }

  async function sessionOf(conn) {
    if (!sessions.has(conn.id)) sessions.set(conn.id, agentSession(conn.agent))
    return sessions.get(conn.id)
  }

  const missionOf = conn => (conn.mission && Date.parse(conn.mission.expires_at) > Date.now() ? conn.mission : null)

  // One upstream MCP client per connection and mission; Alice's server lists its tools to the agent before any mission.
  function upstream(conn) {
    const key = missionOf(conn)?.s256 ?? ''
    const u = upstreams.get(conn.id)
    if (u?.key === key) return u.client
    if (u) u.client.then(c => c.close()).catch(() => {})
    const client = (async () => {
      const { getKeyMaterial } = await sessionOf(conn)
      const fetch = agentFetch({
        getKeyMaterial, missionS256: key || undefined, say: m => log(`${conn.member.name}'s ${conn.client_name}: ${m}`),
        onInteraction: () => log(`${conn.member.name}'s ${conn.client_name} waits on ${conn.member.name} in the console`),
      })
      const c = new Client({ name: 'parley-gateway', version: '0.1.0' })
      await c.connect(new StreamableHTTPClientTransport(new URL(`${RESOURCE}/mcp`), { fetch }))
      return c
    })()
    client.catch(() => upstreams.delete(conn.id))
    upstreams.set(conn.id, { key, client })
    return client
  }

  async function startMission(conn, description) {
    if (typeof description !== 'string' || !description.trim()) return failed({ error: 'invalid_request', error_description: 'description is required' })
    const asked = description.trim()
    let p = proposals.get(conn.id)
    const held = missionOf(conn)
    // Asking again for the mission already approved, as worded or as the member narrowed it, reports it instead of proposing it twice.
    if (!p && held && (held.requested === asked || held.description === asked)) {
      return reply({ status: 'approved', mission: held.description, expires_at: held.expires_at })
    }
    if (!p) {
      p = { link: null }
      p.done = (async () => requestMission(asked, {
        session: await sessionOf(conn),
        onInteraction: (url, code) => { p.link = `${url}?code=${encodeURIComponent(code)}` },
      }))().then(
        m => {
          conn.mission = { s256: m.s256, description: m.blob.description, requested: asked, expires_at: m.blob.expires_at, approved_at: m.blob.approved_at }
          save()
          log(`${conn.member.name} approved a mission for ${conn.client_name}: "${m.blob.description}"`)
          return { status: 'approved' }
        },
        err => ({ status: /denied/.test(err.message) ? 'denied' : 'failed', detail: err.message }),
      ).finally(() => proposals.delete(conn.id))
      proposals.set(conn.id, p)
    }
    const r = await Promise.race([p.done, new Promise(resolve => setTimeout(() => resolve(null), MISSION_WAIT_MS))])
    if (!r) return reply({ status: 'pending', note: `${conn.member.name} has not answered yet. Ask them to open their Parley console${p.link ? ` (${p.link})` : ''}, then call start_mission again.` })
    if (r.status === 'approved') return reply({ status: 'approved', mission: conn.mission.description, expires_at: conn.mission.expires_at })
    return failed({ status: r.status, note: r.status === 'denied' ? `${conn.member.name} denied the mission.` : r.detail })
  }

  function mcpServer(conn) {
    const server = new Server({ name: 'parley', version: '0.1.0' }, {
      capabilities: { tools: {} },
      instructions: `Parley reaches the people network for ${conn.member.name}. Call start_mission first with what you mean to do; ${conn.member.name} approves it in their Parley console.`,
    })
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const listed = await upstream(conn).then(c => c.listTools()).catch(err => { log(`listing the network's tools failed: ${err.message}`); return { tools: [] } })
      return { tools: [START_MISSION, ...listed.tools] }
    })
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      if (params.name === START_MISSION.name) return startMission(conn, params.arguments?.description)
      if (!missionOf(conn)) {
        return failed({ error: 'mission_required', note: `Call start_mission first with what you mean to do; ${conn.member.name} approves it before this tool works.` })
      }
      try {
        return await (await upstream(conn)).callTool(params, undefined, { timeout: CALL_TIMEOUT_MS })
      } catch (err) {
        return failed({ error: err.code === 'mission_terminated' ? 'mission_expired' : 'call_failed', detail: err.message })
      }
    })
    return server
  }

  async function mcp(req, res) {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
    const conn = await bearer(req)
    if (!conn) {
      return send(res, 401, { error: 'invalid_token' }, { 'www-authenticate': `Bearer resource_metadata="${resourceMetadata}"` })
    }
    // Stateless: each POST gets its own server, so there is no SSE stream to open and no session to delete.
    if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' })
    const raw = (await readBody(req)).toString('utf8')
    let message
    try { message = JSON.parse(raw) } catch { return send(res, 400, { error: 'invalid_json' }) }
    const server = mcpServer(conn)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => { transport.close(); server.close() })
    await server.connect(transport)
    await transport.handleRequest(req, res, message)
  }

  // A member's own connections, and revoking one, from the console.
  async function connections(req, res, id) {
    const member = await memberOf(req)
    if (!member) return send(res, 401, { error: 'not_signed_in' })
    const mine = Object.values(s.connections).filter(c => c.member.id === member.id && !c.revoked_at)
    if (!id && req.method === 'GET') {
      return send(res, 200, { connections: mine.map(c => ({ id: c.id, client_name: c.client_name, created_at: c.created_at, mission: missionOf(c)?.description ?? null })) })
    }
    const c = mine.find(x => x.id === id)
    if (!c || req.method !== 'POST') return send(res, 404, { error: 'not_found' })
    if (!fromConsole(req)) return send(res, 403, { error: 'bad_origin' })
    c.revoked_at = now()
    for (const [k, v] of Object.entries(s.tokens)) if (v.connection === c.id) delete s.tokens[k]
    upstreams.get(c.id)?.client.then(x => x.close()).catch(() => {})
    upstreams.delete(c.id)
    save()
    log(`${member.name} disconnected ${c.client_name}`)
    send(res, 200, { ok: true })
  }

  return async function handle(req, res, url) {
    const path = url.pathname
    if (req.method === 'OPTIONS' && (path.startsWith('/.well-known/oauth-') || path.startsWith('/oauth/'))) { res.writeHead(204, CORS); res.end(); return true }
    if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp') {
      send(res, 200, { resource: RESOURCE_URL, authorization_servers: [origin], bearer_methods_supported: ['header'], scopes_supported: ['parley'], resource_name: 'Parley' }, { 'cache-control': 'public, max-age=300' })
      return true
    }
    if (path === '/.well-known/oauth-authorization-server' || path === '/.well-known/oauth-authorization-server/mcp') {
      send(res, 200, asMetadata(), { 'cache-control': 'public, max-age=300' })
      return true
    }
    if (path === '/oauth/register' && req.method === 'POST') { await register(req, res); return true }
    if (path === '/oauth/authorize' && req.method === 'GET') { await authorize(res, url); return true }
    if (path === '/oauth/token' && req.method === 'POST') { await token(req, res); return true }
    const connectId = path.match(/^\/oauth\/connect\/([\w-]+)$/)?.[1]
    if (connectId) { await connect(req, res, url, connectId); return true }
    const conns = path.match(/^\/oauth\/connections(?:\/([\w-]+)\/revoke)?$/)
    if (conns) { await connections(req, res, conns[1]); return true }
    if (path === '/mcp') { await mcp(req, res); return true }
    return false
  }
}
