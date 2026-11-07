import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.ts'
import { SoftPasskey } from './authenticator.ts'
import type { Config } from '../src/config.ts'
import type { Hono } from 'hono'

const ORIGIN = 'http://localhost:5173'
const config: Config = { devPage: false, port: 0, dbPath: ':memory:', rpID: 'localhost', rpName: 'Test', origins: [ORIGIN] }

// A browser's cookie jar, reduced to what these tests need.
type Json = any // response bodies in these tests are asserted on field by field

function client(app: Hono) {
  const jar = new Map<string, string>()
  const call = async (method: string, path: string, body?: unknown, origin: string | null = ORIGIN): Promise<{ status: number; json: Json }> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (origin) headers.origin = origin
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await app.request(path, { method, headers, body: body ? JSON.stringify(body) : undefined })
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split('; ')
      const [k, v] = pair.split('=')
      if (/max-age=0/i.test(attrs.join(';')) || v === '') jar.delete(k)
      else jar.set(k, v)
    }
    return { status: res.status, json: await res.json().catch(() => null) }
  }
  return { call, jar }
}

type Client = ReturnType<typeof client>

async function register(c: Client, key: SoftPasskey, first = 'Alice', last = 'Example') {
  const opts = await c.call('POST', '/auth/register/options', { first_name: first, last_name: last })
  assert.equal(opts.status, 200)
  return c.call('POST', '/auth/register/verify', key.create(opts.json, ORIGIN))
}

async function login(c: Client, key: SoftPasskey) {
  const opts = await c.call('POST', '/auth/login/options')
  return c.call('POST', '/auth/login/verify', key.get(opts.json, ORIGIN))
}

test('register, sign out, sign in with the passkey alone', async () => {
  const app = createApp(config)
  const c = client(app)
  const key = new SoftPasskey()

  const reg = await register(c, key)
  assert.equal(reg.status, 200)
  assert.equal(reg.json.user.first_name, 'Alice')
  assert.equal(reg.json.recovery_codes.length, 8)
  assert.equal((await c.call('GET', '/auth/me')).json.user.last_name, 'Example')

  await c.call('POST', '/auth/logout', {})
  assert.equal((await c.call('GET', '/auth/me')).json.user, null)

  const back = await login(c, key)
  assert.equal(back.status, 200)
  assert.equal(back.json.user.display_name, 'Alice Example')
  assert.equal((await c.call('GET', '/auth/me')).json.user.id, reg.json.user.id)
})

test('two people on one server stay separate', async () => {
  const app = createApp(config)
  const a = client(app), b = client(app)
  const ka = new SoftPasskey(), kb = new SoftPasskey()
  const ra = await register(a, ka, 'Alice', 'Example')
  const rb = await register(b, kb, 'Bob', 'Builder')
  assert.notEqual(ra.json.user.id, rb.json.user.id)
  const c = client(app)
  assert.equal((await login(c, kb)).json.user.first_name, 'Bob')
})

test('names are required and a bad origin is refused', async () => {
  const app = createApp(config)
  const c = client(app)
  assert.equal((await c.call('POST', '/auth/register/options', { first_name: 'Alice' })).status, 400)
  assert.equal((await c.call('POST', '/auth/register/options', { first_name: 'A', last_name: 'B' }, 'https://evil.example')).status, 403)
  assert.equal((await c.call('POST', '/auth/register/options', { first_name: 'A', last_name: 'B' }, null)).status, 403)
})

test('an assertion cannot be replayed and a wrong key is rejected', async () => {
  const app = createApp(config)
  const c = client(app)
  const key = new SoftPasskey()
  await register(c, key)
  await c.call('POST', '/auth/logout', {})

  const opts = await c.call('POST', '/auth/login/options')
  const assertion = key.get(opts.json, ORIGIN)
  assert.equal((await c.call('POST', '/auth/login/verify', assertion)).status, 200)
  await c.call('POST', '/auth/logout', {})
  // The challenge is single use, so the same assertion fails the second time.
  assert.equal((await c.call('POST', '/auth/login/verify', assertion)).status, 400)

  // A different key claiming the same credential id fails signature verification.
  const thief = new SoftPasskey()
  thief.credId = key.credId
  const opts2 = await c.call('POST', '/auth/login/options')
  assert.equal((await c.call('POST', '/auth/login/verify', thief.get(opts2.json, ORIGIN))).status, 401)
})

test('add a second passkey, then remove one but never the last', async () => {
  const app = createApp(config)
  const c = client(app)
  const k1 = new SoftPasskey(), k2 = new SoftPasskey()
  await register(c, k1)

  const opts = await c.call('POST', '/auth/credentials/options', {})
  assert.equal(opts.status, 200)
  assert.equal(opts.json.excludeCredentials.length, 1)
  const added = await c.call('POST', '/auth/credentials/verify', { response: k2.create(opts.json, ORIGIN), label: 'Laptop' })
  assert.equal(added.status, 200)

  const list = await c.call('GET', '/auth/credentials')
  assert.equal(list.json.length, 2)

  const other = client(app)
  assert.equal((await login(other, k2)).status, 200)

  assert.equal((await c.call('DELETE', `/auth/credentials/${k1.id}`)).status, 200)
  assert.equal((await c.call('DELETE', `/auth/credentials/${k2.id}`)).status, 409)
})

test('a recovery code signs you in once, then you add a new passkey', async () => {
  const app = createApp(config)
  const c = client(app)
  const old = new SoftPasskey()
  const reg = await register(c, old)
  const [code] = reg.json.recovery_codes
  await c.call('POST', '/auth/logout', {})

  const phone = client(app)
  assert.equal((await phone.call('POST', '/auth/recover', { code: 'nope-nope1' })).status, 401)
  const rec = await phone.call('POST', '/auth/recover', { code: code.toUpperCase() })
  assert.equal(rec.status, 200)
  assert.equal(rec.json.next, 'add_passkey')
  assert.equal((await phone.call('GET', '/auth/me')).json.session, 'recovery')

  const fresh = new SoftPasskey()
  const opts = await phone.call('POST', '/auth/credentials/options', {})
  assert.equal((await phone.call('POST', '/auth/credentials/verify', { response: fresh.create(opts.json, ORIGIN) })).status, 200)
  assert.equal((await login(client(app), fresh)).json.user.first_name, 'Alice')

  // The code is spent.
  assert.equal((await client(app).call('POST', '/auth/recover', { code })).status, 401)
  assert.equal((await phone.call('GET', '/auth/me')).json.recovery_codes_left, 7)
})

test('signed-out callers cannot touch passkeys', async () => {
  const c = client(createApp(config))
  assert.equal((await c.call('GET', '/auth/credentials')).status, 401)
  assert.equal((await c.call('POST', '/auth/recovery-codes', {})).status, 401)
})
