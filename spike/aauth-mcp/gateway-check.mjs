// Checks the hosted MCP endpoint end to end: a throwaway store, world and console server, an MCP client that registers and connects with OAuth, a member who signs in with a soft passkey and approves in the console. Usage: node gateway-check.mjs
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const STORE_DIR = fileURLToPath(new URL('../../store/', import.meta.url))
const TMP = mkdtempSync(join(tmpdir(), 'gateway-check-'))
const MAP = join(TMP, 'member-map.json')
const STORE_PORT = 4790
const STORE = `http://127.0.0.1:${STORE_PORT}`
const STORE_ORIGIN = `http://localhost:${STORE_PORT}`
const CONSOLE_PORT = 4731
const ORIGIN = `http://127.0.0.1:${CONSOLE_PORT}`
const REDIRECT = 'http://127.0.0.1:9/callback'
const WORLD = {
  AAUTH_PS: 'https://ps.aauth.test', AAUTH_RESOURCE: 'https://alice.aauth.test', AAUTH_AGENT: 'https://bob-agent.aauth.test',
  AAUTH_PS_PORT: '4701', AAUTH_RESOURCE_PORT: '4702', AAUTH_AGENT_PORT: '4703',
  AAUTH_DATA_DIR: join(TMP, 'data'), STORE_URL: STORE, STORE_INTERNAL_TOKEN: randomBytes(18).toString('base64url'), MEMBER_MAP: MAP,
  RP_ID: '', PUBLIC_URL: ORIGIN, BOB_CONSOLE_TOKEN: randomBytes(18).toString('base64url'),
}
Object.assign(process.env, WORLD)
delete process.env.OPENROUTER_API_KEY

const { PS } = await import('./config.mjs')
const { SoftPasskey } = await import('../../store/test/authenticator.ts')
const { sha256 } = await import('./store.mjs')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const check = (ok, what) => { if (!ok) throw new Error(what) }

const logs = []
const children = []
const alive = child => child.exitCode === null && child.signalCode === null
function run(tag, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const s of [child.stdout, child.stderr]) s.on('data', d => { for (const l of String(d).split('\n')) if (l.trim()) logs.push(`[${tag}] ${l}`) })
  children.push(child)
  return child
}
process.on('exit', () => {
  for (const c of children) c.kill()
  rmSync(TMP, { recursive: true, force: true })
})
process.on('SIGINT', () => process.exit(130))
async function until(what, child, ready, ms = 20_000) {
  for (const end = Date.now() + ms; Date.now() < end && alive(child); await sleep(200)) {
    if (await ready().catch(() => false)) return
  }
  throw new Error(`${what} did not come up:\n${logs.slice(-30).join('\n')}`)
}

// A member's browser at the store: its session cookie, and the Origin the store's guard wants on writes.
function browser() {
  const jar = new Map()
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  async function call(method, path, body) {
    const res = await fetch(`${STORE}${path}`, {
      method, headers: { origin: STORE_ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}), ...(jar.size ? { cookie: cookie() } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split('; ')
      const [k, v] = pair.split('=')
      if (/max-age=0/i.test(attrs.join(';')) || !v) jar.delete(k)
      else jar.set(k, v)
    }
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`store ${method} ${path}: ${res.status} ${JSON.stringify(json)}`)
    return json
  }
  return { call, cookie }
}
async function signUp(first, last, items) {
  const b = browser()
  const options = await b.call('POST', '/auth/register/options', { first_name: first, last_name: last })
  const { user } = await b.call('POST', '/auth/register/verify', new SoftPasskey().create(options, STORE_ORIGIN))
  for (const [label, value, rule] of items) await b.call('POST', '/me/items', { label, value, rule })
  return { ...b, id: user.id, first }
}

// The console page, as the member's browser calls it: their store cookie, and the console's own Origin on writes.
async function asMember(m, path, body) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { cookie: m.cookie(), ...(body ? { 'content-type': 'application/json', origin: ORIGIN } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

// The MCP client side of OAuth: discovery, registration, the authorize redirect, and the token endpoint.
async function connect(member, name = 'Test agent') {
  const prm = await (await fetch(`${ORIGIN}/.well-known/oauth-protected-resource`)).json()
  const as = await (await fetch(`${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json()
  const reg = await fetch(as.registration_endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_name: name, redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' }) })
  check(reg.status === 201, `registration got ${reg.status}`)
  const { client_id } = await reg.json()
  const verifier = randomBytes(32).toString('base64url')
  const auth = new URL(as.authorization_endpoint)
  for (const [k, v] of Object.entries({ response_type: 'code', client_id, redirect_uri: REDIRECT, code_challenge: sha256(verifier), code_challenge_method: 'S256', state: 'st8', resource: prm.resource })) auth.searchParams.set(k, v)
  const go = await fetch(auth, { redirect: 'manual' })
  const id = new URL(go.headers.get('location')).searchParams.get('connect')
  check(go.status === 303 && id, `authorize answered ${go.status} ${go.headers.get('location')}`)
  const shown = await asMember(member, `/oauth/connect/${id}`)
  check(shown.status === 200 && shown.json.client_name === name, `the connect screen showed ${JSON.stringify(shown.json)}`)
  const yes = await asMember(member, `/oauth/connect/${id}`, { decision: 'approve' })
  const back = new URL(yes.json.redirect)
  check(back.searchParams.get('state') === 'st8' && back.searchParams.get('iss') === ORIGIN, `redirect ${yes.json.redirect}`)
  const code = back.searchParams.get('code')
  const token = form => fetch(as.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) })
  const bad = await token({ grant_type: 'authorization_code', code, client_id, redirect_uri: REDIRECT, code_verifier: 'wrong' })
  check(bad.status === 400 && (await bad.json()).error === 'invalid_grant', `a wrong verifier got ${bad.status}`)
  return { client_id, token, as, verifier, ...(await fresh()) }

  async function fresh() {
    // The wrong verifier above used the code up, so connect again: the member's connection for this client is reused.
    const again = await fetch(auth, { redirect: 'manual' })
    const id2 = new URL(again.headers.get('location')).searchParams.get('connect')
    const code2 = new URL((await asMember(member, `/oauth/connect/${id2}`, { decision: 'approve' })).json.redirect).searchParams.get('code')
    const ok = await token({ grant_type: 'authorization_code', code: code2, client_id, redirect_uri: REDIRECT, code_verifier: verifier })
    check(ok.status === 200, `the token endpoint answered ${ok.status}`)
    const tokens = await ok.json()
    const replay = await token({ grant_type: 'authorization_code', code: code2, client_id, redirect_uri: REDIRECT, code_verifier: verifier })
    check(replay.status === 400, `a used code got ${replay.status}`)
    return { tokens }
  }
}

async function mcpClient(accessToken) {
  const c = new Client({ name: 'gateway-check', version: '0.1.0' })
  await c.connect(new StreamableHTTPClientTransport(new URL(`${ORIGIN}/mcp`), { requestInit: { headers: { authorization: `Bearer ${accessToken}` } } }))
  return c
}
const parsed = r => { try { return JSON.parse(r.content[0].text) } catch { return r.content?.[0]?.text } }

const store = run('store', ['--disable-warning=ExperimentalWarning', 'src/server.ts'], STORE_DIR, {
  ...process.env, STORE_PORT: String(STORE_PORT), STORE_DB: join(TMP, 'store.db'),
  RP_ID: 'localhost', RP_ORIGINS: STORE_ORIGIN, PUBLIC_URL: STORE_ORIGIN, STORE_DEV_PAGE: '0',
})
await until('the store', store, async () => (await fetch(`${STORE}/health`)).ok)
const dana = await signUp('Dana', 'Reyes', [['Site', 'https://dana.example.org', 'everyone']])
const ana = await signUp('Ana', 'Silva', [['Personal site', 'https://ana.example.org', 'everyone'], ['Phone', 'tel:+15550123', 'only_me']])
const eli = await signUp('Eli', 'Park', [])
writeFileSync(MAP, JSON.stringify({ [PS]: dana.id }))

const world = run('world', ['world.mjs'], HERE, process.env)
await until('the world', world, async () => (await (await fetch(`http://127.0.0.1:${WORLD.AAUTH_RESOURCE_PORT}/.well-known/aauth-resource.json`)).json()).name === 'The people network')
const consoleServer = run('console', ['agent-console.mjs', '--port', String(CONSOLE_PORT)], HERE, process.env)
await until('the console server', consoleServer, async () => (await fetch(`${ORIGIN}/.well-known/oauth-protected-resource`)).ok)

const results = []
async function step(name, fn) {
  try { results.push(`✓ ${name}: ${await fn()}`) } catch (err) { results.push(`✗ ${name}: ${err.message}`); throw err }
}

try {
  await step('unauthenticated', async () => {
    const res = await fetch(`${ORIGIN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' })
    const www = res.headers.get('www-authenticate') ?? ''
    check(res.status === 401 && www.includes(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`), `got ${res.status} ${www}`)
    return '401 names the protected resource metadata'
  })

  let conn, client
  await step('connect', async () => {
    conn = await connect(dana)
    return 'registered, Dana approved in the console, PKCE checked, a used code refused'
  })

  await step('tools', async () => {
    client = await mcpClient(conn.tokens.access_token)
    const names = (await client.listTools()).tools.map(t => t.name)
    check(['start_mission', 'find_people', 'search_context'].every(n => names.includes(n)), `listed ${names.join(', ')}`)
    return `listed ${names.join(', ')} before any mission`
  })

  await step('no_mission', async () => {
    const r = await client.callTool({ name: 'find_people', arguments: {} })
    check(r.isError && parsed(r).error === 'mission_required', `got ${JSON.stringify(parsed(r))}`)
    return 'mission_required until a mission is approved'
  })

  await step('mission', async () => {
    const text = 'Find Ana from the party and see what she shares.'
    const answered = (async () => {
      for (let i = 0; i < 100; i++) {
        const st = await asMember(dana, '/agent/state')
        const m = st.json?.missions?.find(x => x.description === text)
        if (m) {
          const elis = await asMember(eli, '/agent/state')
          check(!elis.json.missions.some(x => x.id === m.id), "Eli saw Dana's agent's mission")
          const r = await asMember(dana, `/agent/missions/${m.id}`, { decision: 'approve', description: text, rules_only: true })
          check(r.status === 200, `approving got ${r.status} ${JSON.stringify(r.json)}`)
          return
        }
        await sleep(200)
      }
      throw new Error("the mission never reached Dana's console")
    })()
    const r = await client.callTool({ name: 'start_mission', arguments: { description: text } })
    await answered
    check(!r.isError && parsed(r).status === 'approved', `start_mission said ${JSON.stringify(parsed(r))}`)
    return "proposed; it reached Dana's console without a code, not Eli's; approved"
  })

  await step('find_people', async () => {
    const r = await client.callTool({ name: 'find_people', arguments: { query: 'Ana' } })
    const people = parsed(r).people ?? []
    check(people.some(p => p.person === ana.id), `found ${JSON.stringify(parsed(r))}`)
    return `found ${people.map(p => p.name).join(', ')}`
  })

  await step('search_context', async () => {
    const r = await client.callTool({ name: 'search_context', arguments: { person: ana.id, ids: ['personal-site'], reason: 'To see her work before we talk.' } })
    const out = parsed(r)
    check(JSON.stringify(out.shared ?? {}).includes('ana.example.org'), `got ${JSON.stringify(out)}`)
    return "Ana's site came back"
  })

  await step('refresh', async () => {
    const r = await conn.token({ grant_type: 'refresh_token', refresh_token: conn.tokens.refresh_token, client_id: conn.client_id })
    check(r.status === 200, `refresh got ${r.status}`)
    const next = await r.json()
    const old = await conn.token({ grant_type: 'refresh_token', refresh_token: conn.tokens.refresh_token, client_id: conn.client_id })
    check(old.status === 400, `the rotated refresh token still worked (${old.status})`)
    conn.tokens = next
    return 'rotated; the old refresh token is refused'
  })

  await step('revoke', async () => {
    const list = await asMember(dana, '/oauth/connections')
    const c = list.json.connections.find(x => x.client_name === 'Test agent')
    check(c?.mission, `the console lists ${JSON.stringify(list.json)}`)
    const byEli = await asMember(eli, `/oauth/connections/${c.id}/revoke`, {})
    check(byEli.status === 404, `Eli revoking Dana's connection got ${byEli.status}`)
    check((await asMember(dana, `/oauth/connections/${c.id}/revoke`, {})).status === 200, 'revoking failed')
    const res = await fetch(`${ORIGIN}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${conn.tokens.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' })
    check(res.status === 401, `after revoking, /mcp answered ${res.status}`)
    return "Eli cannot; Dana can, and the token stops working"
  })
} catch {
  console.log(logs.slice(-40).join('\n'))
}
console.log(results.join('\n'))
const failed = results.filter(r => r.startsWith('✗')).length
console.log(failed ? `${failed} failed` : `all ${results.length} passed`)
process.exit(failed ? 1 : 0)
