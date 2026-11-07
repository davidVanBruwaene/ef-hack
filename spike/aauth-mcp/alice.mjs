// Alice's side: the AAuth-protected MCP server holding Alice's context.
import { readFileSync } from 'node:fs'
import { SignJWT } from 'jose'
import { verify as httpSigVerify } from '@hellocoop/httpsig'
import { buildAAuthHeader, createResourceToken, verifyToken } from '@aauth/resource'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { PORTS, RESOURCE, SCOPE, missionHash } from './config.mjs'
import { isMain, json, listen, logger, readBody, short } from './http.mjs'
import { resourceKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'

const log = logger('alice')
const alice = JSON.parse(readFileSync(new URL('./alice.json', import.meta.url), 'utf8'))
const grants = new Map(alice.grants.map(g => [missionHash(g.intent), g]))

// mockin's auth token names the agent's key (cnf), not the agent, so remember who signed with each key.
const agentByKey = new Map()

const reject = (status, error, requirement, description) => ({
  ok: false,
  status,
  body: { error, ...(description ? { error_description: description } : {}) },
  headers: requirement ? { 'aauth-requirement': requirement } : {},
})

async function aauthGate(req, url, raw, key, sign) {
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
      resource: RESOURCE, audience: token.iss, presentedToken, agentJkt: sig.thumbprint, scope: SCOPE, kid: key.kid,
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

export async function startAlice() {
  routeTestHostsToLoopback()
  const key = await resourceKey()
  const jwks = { keys: [key.publicJwk] }
  const sign = (payload, header) => new SignJWT(payload).setProtectedHeader(header).sign(key.privateKey)

  await listen(PORTS.resource, async (req, res) => {
    const url = new URL(req.url ?? '/', RESOURCE)
    if (url.pathname === '/.well-known/aauth-resource.json') {
      return json(res, 200, { issuer: RESOURCE, name: "Alice's context", jwks_uri: `${RESOURCE}/jwks.json` })
    }
    if (url.pathname === '/jwks.json') return json(res, 200, jwks)
    if (url.pathname !== '/mcp') return json(res, 404, { error: 'not_found' })
    // Stateless MCP: no standalone SSE stream and no session to delete.
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { allow: 'POST' })

    const raw = await readBody(req)
    const gate = await aauthGate(req, url, raw, key, sign)
    if (!gate.ok) return json(res, gate.status, gate.body, gate.headers)

    const message = JSON.parse(raw.toString('utf8'))
    log(`3. auth token ok for ${gate.auth.sub} → MCP ${message.method ?? 'response'}`)
    const server = contextServer(gate.grant, gate.auth, gate.agent)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => { transport.close(); server.close() })
    await server.connect(transport)
    await transport.handleRequest(req, res, message)
  }, log)

  log(`up: resource ${RESOURCE}/mcp`)
  for (const [hash, g] of grants) log(`grant ${short(hash)}: "${g.intent}" → [${g.fields.join(', ')}]`)
}

if (isMain(import.meta)) await startAlice()
