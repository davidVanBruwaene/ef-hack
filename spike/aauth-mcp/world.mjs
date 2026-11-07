// Runs Bob's person server (mockin), Bob's agent provider, and Alice's AAuth-protected MCP server on loopback.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SignJWT } from 'jose'
import { verify as httpSigVerify } from '@hellocoop/httpsig'
import { buildAAuthHeader, createResourceToken, verifyToken } from '@aauth/resource'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { AGENT, PS, RESOURCE, SCOPE, missionHash, portOf } from './config.mjs'
import { agentIdentityKey, newKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'

routeTestHostsToLoopback()

const consentMode = process.env.CONSENT === '1'
const alice = JSON.parse(readFileSync(new URL('./alice.json', import.meta.url), 'utf8'))
const grants = new Map(alice.grants.map(g => [missionHash(g.intent), g]))

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const short = s => (s ? `${s.slice(0, 8)}…` : '(none)')

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

function listen(port, handler) {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch(err => {
      log('✗ handler error:', err.stack ?? err)
      if (!res.headersSent) json(res, 500, { error: 'server_error', error_description: String(err.message ?? err) })
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

// Bob's agent provider
const identity = await agentIdentityKey()
const agentJwks = { keys: [identity.publicJwk] }
await listen(portOf(AGENT), (req, res) => {
  const path = new URL(req.url ?? '/', AGENT).pathname
  const body = path === '/.well-known/aauth-agent.json'
    ? { issuer: AGENT, name: "Bob's agent provider", jwks_uri: `${AGENT}/jwks.json` }
    : path === '/jwks.json' ? agentJwks : undefined
  json(res, body ? 200 : 404, body ?? { error: 'not_found' })
})

// Bob's person server (mockin)
const resourceKey = await newKey('alice-resource-1')
const resourceJwks = { keys: [resourceKey.publicJwk] }

const mockinPkg = createRequire(import.meta.url).resolve('@hellocoop/mockin/package.json')
const mockinEntry = join(dirname(mockinPkg), JSON.parse(readFileSync(mockinPkg, 'utf8')).bin.mockin)
const mockinOrigin = `http://127.0.0.1:${portOf(PS)}`
const mockin = spawn(process.execPath, ['--no-warnings', mockinEntry], {
  env: { ...process.env, PORT: String(portOf(PS)), IP: '127.0.0.1', ISSUER: PS },
  cwd: dirname(mockinPkg),
  stdio: ['ignore', 'ignore', 'inherit'],
})
process.on('exit', () => mockin.kill('SIGKILL'))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(0))

for (let i = 0; ; i++) {
  try { if ((await fetch(`${mockinOrigin}/.well-known/aauth-person.json`)).ok) break } catch { /* not up yet */ }
  if (i > 200) throw new Error('mockin did not start')
  await new Promise(r => setTimeout(r, 50))
}

// Preloaded discovery, so mockin never dials the agent provider or the resource.
const trusted = (id, jwks) => ({ metadata: { issuer: id, jwks_uri: `${id}/jwks.json` }, jwks })
const configured = await fetch(`${mockinOrigin}/mock/aauth`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    trusted_servers: { [AGENT]: trusted(AGENT, agentJwks), [RESOURCE]: trusted(RESOURCE, resourceJwks) },
    ...(consentMode ? { person_requirement: 'interaction', auto_approve: false } : {}),
  }),
})
if (!configured.ok) throw new Error(`mockin config failed: ${configured.status} ${await configured.text()}`)

// Alice's AAuth-protected MCP server
const sign = (payload, header) => new SignJWT(payload).setProtectedHeader(header).sign(resourceKey.privateKey)

// mockin's auth token names the agent's key (cnf), not the agent, so remember who signed with each key.
const agentByKey = new Map()

const reject = (status, error, requirement, description) => ({
  ok: false,
  status,
  body: { error, ...(description ? { error_description: description } : {}) },
  headers: requirement ? { 'aauth-requirement': requirement } : {},
})

async function aauthGate(req, url, raw) {
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

  const grant = grants.get(token.mission_s256)
  if (!grant) {
    log(`✗ ${token.type} token for ${token.sub}, mission ${short(token.mission_s256)}: Alice granted no such intent → 403`)
    return reject(403, 'mission_not_granted', undefined, 'Alice has not granted access for this mission')
  }

  if (token.type === 'person') {
    const presentedToken = {
      iss: token.iss, sub: token.sub, jti: token.jti, mission_s256: token.mission_s256,
      ...(token.tenant ? { tenant: token.tenant } : {}),
    }
    const resourceToken = await createResourceToken({
      resource: RESOURCE, audience: token.iss, presentedToken, agentJkt: sig.thumbprint, scope: SCOPE, kid: resourceKey.kid,
    }, sign)
    log(`2. person ${token.sub} under mission ${short(token.mission_s256)} matches Alice's grant → resource token, asking for an auth token`)
    return reject(401, 'auth_token_required', buildAAuthHeader('auth-token', { resourceToken }))
  }

  if (!(token.scope ?? '').split(' ').includes(SCOPE)) return reject(403, 'insufficient_scope')
  return { ok: true, grant, auth: token, agent: agentByKey.get(sig.thumbprint) ?? null }
}

function contextServer(grant, auth, agent) {
  const server = new McpServer({ name: 'alice-context', version: '0.0.1' })
  server.registerTool('get_shared_context', {
    title: "Alice's shared context",
    description: "Returns the parts of Alice's personal context that Alice shared for the intent this agent operates under.",
  }, async () => {
    const shared = Object.fromEntries(grant.fields.map(f => [f, alice.context[f]]))
    log(`4. serving [${grant.fields.join(', ')}] to ${auth.sub}; withheld [${Object.keys(alice.context).filter(f => !grant.fields.includes(f)).join(', ')}]`)
    const body = {
      owner: alice.owner,
      intent: grant.intent,
      shared,
      caller: { agent, person: auth.sub, person_server: auth.ps, mission_s256: auth.mission_s256 },
    }
    return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] }
  })
  return server
}

await listen(portOf(RESOURCE), async (req, res) => {
  const url = new URL(req.url ?? '/', RESOURCE)
  if (url.pathname === '/.well-known/aauth-resource.json') {
    return json(res, 200, { issuer: RESOURCE, name: "Alice's context", jwks_uri: `${RESOURCE}/jwks.json` })
  }
  if (url.pathname === '/jwks.json') return json(res, 200, resourceJwks)
  if (url.pathname !== '/mcp') return json(res, 404, { error: 'not_found' })
  // Stateless MCP: no standalone SSE stream and no session to delete.
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' })

  const raw = await readBody(req)
  const gate = await aauthGate(req, url, raw)
  if (!gate.ok) return json(res, gate.status, gate.body, gate.headers)

  const message = JSON.parse(raw.toString('utf8'))
  log(`3. auth token ok for ${gate.auth.sub} → MCP ${message.method ?? 'response'}`)
  const server = contextServer(gate.grant, gate.auth, gate.agent)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  res.on('close', () => { transport.close(); server.close() })
  await server.connect(transport)
  await transport.handleRequest(req, res, message)
})

log(`world up: PS ${PS} (mockin, ${consentMode ? 'consent required' : 'auto-approve'}), agent provider ${AGENT}, resource ${RESOURCE}/mcp`)
for (const [hash, g] of grants) log(`grant ${short(hash)}: "${g.intent}" → [${g.fields.join(', ')}]`)
