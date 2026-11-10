import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.ts'
import { inviteUsable } from '../src/people.ts'
import type { InviteRow } from '../src/people.ts'
import { SoftPasskey } from './authenticator.ts'
import type { Config } from '../src/config.ts'
import type { Hono } from 'hono'

const ORIGIN = 'http://localhost:5173'
const TOKEN = 'internal-test-token'
const config: Config = { port: 0, dbPath: ':memory:', rpID: 'localhost', rpName: 'Test', origins: [ORIGIN], devPage: false, internalToken: TOKEN }

type Json = any // response bodies are asserted on field by field

function client(app: Hono) {
  const jar = new Map<string, string>()
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: Json }> => {
    const h: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN, ...headers }
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await app.request(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined })
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split('; ')
      const [k, v] = pair.split('=')
      if (/max-age=0/i.test(attrs.join(';')) || v === '') jar.delete(k)
      else jar.set(k, v)
    }
    return { status: res.status, json: await res.json().catch(() => null) }
  }
  return { call }
}
type Client = ReturnType<typeof client>

async function join(c: Client, first: string, last: string, query = '') {
  const key = new SoftPasskey()
  const opts = await c.call('POST', '/auth/register/options', { first_name: first, last_name: last })
  const reg = await c.call('POST', `/auth/register/verify${query}`, key.create(opts.json, ORIGIN))
  return { key, reg, id: reg.json?.user?.id as string }
}

async function signIn(c: Client, key: SoftPasskey, query = '') {
  const opts = await c.call('POST', '/auth/login/options')
  return c.call('POST', `/auth/login/verify${query}`, key.get(opts.json, ORIGIN))
}

const search = (c: Client, q = '') => c.call('GET', `/network/search?q=${encodeURIComponent(q)}`)

test('everyone in the network can find a member by name, and sees only what the rules allow', async () => {
  const app = createApp(config)
  const alice = client(app), bob = client(app)
  const a = await join(alice, 'Alice', 'Example')
  await join(bob, 'Bob', 'Builder')

  await alice.call('POST', '/me/items', { label: 'Project page', value: 'https://example.com/p', rule: 'everyone' })
  await alice.call('POST', '/me/items', { label: 'Calendar', value: 'https://example.com/cal' }) // defaults to Ask me
  await alice.call('POST', '/me/items', { label: 'Home address', value: 'https://example.com/home', rule: 'only_me' })

  const found = (await search(bob, 'alice')).json
  assert.equal(found.length, 1)
  assert.equal(found[0].id, a.id)
  assert.equal(found[0].first_name, 'Alice')
  assert.deepEqual(found[0].items.map((i: Json) => i.label), ['Project page'])
  assert.deepEqual(found[0].ask, [{ id: 'calendar', label: 'Calendar' }]) // label only, no value
  assert.ok(!JSON.stringify(found).includes('Home address'))
  assert.ok(!JSON.stringify(found).includes('example.com/cal'))

  // Searching by something shared network-wide finds her too; searching by a private item does not.
  assert.equal((await search(bob, 'project page')).json.length, 1)
  assert.equal((await search(bob, 'home address')).json.length, 0)
  // Nobody sees themselves.
  assert.equal((await search(alice, 'alice')).json.length, 0)
})

test('search needs a signed-in member', async () => {
  const app = createApp(config)
  assert.equal((await search(client(app))).status, 401)
})

test('a person rule beats the network rule, in both directions', async () => {
  const app = createApp(config)
  const alice = client(app), bob = client(app), carol = client(app)
  await join(alice, 'Alice', 'Example')
  const b = await join(bob, 'Bob', 'Builder')
  await join(carol, 'Carol', 'Chen')
  await alice.call('POST', '/me/items', { label: 'Secret plan', value: 'https://example.com/plan', rule: 'only_me' })
  await alice.call('POST', '/me/items', { label: 'Public page', value: 'https://example.com/pub', rule: 'everyone' })

  // Open one private item to Bob only, and hide a public one from Bob only.
  assert.equal((await alice.call('POST', `/me/people/${b.id}/rules`, { item_id: 'secret-plan', rule: 'everyone' })).status, 200)
  assert.equal((await alice.call('POST', `/me/people/${b.id}/rules`, { item_id: 'public-page', rule: 'only_me' })).status, 200)

  const labels = async (c: Client) => (await search(c, 'alice')).json[0].items.map((i: Json) => i.label)
  assert.deepEqual(await labels(bob), ['Secret plan'])
  assert.deepEqual(await labels(carol), ['Public page'])

  // Removing the override puts Bob back under the network rule.
  await alice.call('POST', `/me/people/${b.id}/rules`, { item_id: 'secret-plan', rule: null })
  assert.deepEqual(await labels(bob), [])
})

test('an event code lets many people in, and gives them network permissions only', async () => {
  const app = createApp(config)
  const organizer = client(app)
  const o = await join(organizer, 'Olga', 'Organizer')
  await organizer.call('POST', '/me/items', { label: 'Project page', value: 'https://example.com/o', rule: 'everyone' })
  const made = await organizer.call('POST', '/me/invites', { kind: 'event', name: 'Hack night', hours: 6 })
  assert.equal(made.status, 200)
  assert.match(made.json.url, /\/join\?i=/)
  assert.match(made.json.qr, /^data:image\/png;base64,/)
  const token = new URL(made.json.url).searchParams.get('i')!

  const info = await client(app).call('GET', `/invite/${token}`)
  assert.deepEqual({ valid: info.json.valid, kind: info.json.kind, name: info.json.name }, { valid: true, kind: 'event', name: 'Hack night' })

  const guests = [client(app), client(app), client(app)]
  for (const [i, g] of guests.entries()) assert.equal((await join(g, `Guest${i}`, 'Smith', `?invite=${token}`)).reg.status, 200)

  assert.equal((await organizer.call('GET', '/me/invites')).json[0].uses, 3)
  // Event guests are not "connected" to the organizer and get no person rules.
  assert.equal((await organizer.call('GET', '/me/people')).json.length, 0)
  // Guests are in the network: they can find each other and the organizer.
  assert.equal((await search(guests[0]!, 'smith')).json.length, 2)
  assert.equal((await search(guests[0]!, 'olga')).json[0].id, o.id)

  // Turning the code off stops new joiners.
  await organizer.call('POST', `/me/invites/${made.json.id}/revoke`, {})
  assert.equal((await client(app).call('GET', `/invite/${token}`)).json.valid, false)
  assert.equal((await join(client(app), 'Late', 'Comer', `?invite=${token}`)).reg.status, 410)
})

test('a personal code joins one person, connects them, and applies the owner’s choices for them', async () => {
  const app = createApp(config)
  const alice = client(app)
  await join(alice, 'Alice', 'Example')
  await alice.call('POST', '/me/items', { label: 'Calendar', value: 'https://example.com/cal', rule: 'only_me' })
  const made = await alice.call('POST', '/me/invites', { kind: 'personal', grants: { calendar: 'everyone' } })
  const token = new URL(made.json.url).searchParams.get('i')!

  const bob = client(app)
  const b = await join(bob, 'Bob', 'Builder', `?invite=${token}`)
  assert.equal(b.reg.status, 200)
  const people = (await alice.call('GET', '/me/people')).json
  assert.equal(people.length, 1)
  assert.equal(people[0].id, b.id)
  assert.deepEqual(people[0].rules, { calendar: 'everyone' })

  // Bob's agent now sees the calendar; Carol, who joined without the code, does not.
  const carol = client(app)
  await join(carol, 'Carol', 'Chen')
  assert.deepEqual((await search(bob, 'alice')).json[0].items.map((i: Json) => i.label), ['Calendar'])
  assert.deepEqual((await search(carol, 'alice')).json[0].items, [])

  // The code was for one person.
  assert.equal((await join(client(app), 'Dave', 'Dunn', `?invite=${token}`)).reg.status, 410)
})

test('a member who already has an account connects by signing in with the personal code', async () => {
  const app = createApp(config)
  const alice = client(app), bobFirst = client(app)
  await join(alice, 'Alice', 'Example')
  const b = await join(bobFirst, 'Bob', 'Builder')
  await alice.call('POST', '/me/items', { label: 'Calendar', value: 'https://example.com/cal', rule: 'only_me' })
  const made = await alice.call('POST', '/me/invites', { kind: 'personal', grants: { calendar: 'ask' } })
  const token = new URL(made.json.url).searchParams.get('i')!

  const bobPhone = client(app)
  assert.equal((await signIn(bobPhone, b.key, `?invite=${token}`)).status, 200)
  assert.equal((await alice.call('GET', '/me/people')).json[0].id, b.id)
  assert.deepEqual((await search(bobPhone, 'alice')).json[0].ask, [{ id: 'calendar', label: 'Calendar' }])
})

test('invites validate what they grant and who can use them', async () => {
  const app = createApp(config)
  const alice = client(app)
  await join(alice, 'Alice', 'Example')
  assert.equal((await alice.call('POST', '/me/invites', { kind: 'event' })).status, 400) // an event needs a name
  assert.equal((await alice.call('POST', '/me/invites', { kind: 'personal', grants: { nope: 'everyone' } })).status, 400)
  assert.equal((await alice.call('POST', '/me/invites', { kind: 'personal', grants: { first: 'maybe' } })).status, 400)
  assert.equal((await alice.call('POST', '/me/invites', { kind: 'club' })).status, 400)
  assert.equal((await client(app).call('POST', '/me/invites', { kind: 'event', name: 'x' })).status, 401)

  const base = { id: 'i', token: 't', kind: 'event', creator_id: 'u', name: '', grants: '{}', max_uses: null, uses: 0, expires_at: 1000, revoked: 0, created_at: 0 } as InviteRow
  assert.equal(inviteUsable(base, 999), true)
  assert.equal(inviteUsable(base, 1001), false)
  assert.equal(inviteUsable({ ...base, kind: 'personal', max_uses: 1, uses: 1 }, 10), false)
})

test('items: links only, names stay, rules can change', async () => {
  const app = createApp(config)
  const alice = client(app)
  await join(alice, 'Alice', 'Example')
  assert.equal((await alice.call('POST', '/me/items', { label: 'Bad', value: 'javascript:alert(1)' })).status, 400)
  assert.equal((await alice.call('POST', '/me/items', { label: 'Mail', value: 'mailto:alice@example.com' })).json.rule, 'ask')
  assert.equal((await alice.call('POST', '/me/items', { label: 'Mail', value: 'mailto:other@example.com' })).json.id, 'mail-2')
  assert.equal((await alice.call('POST', '/me/items/mail', { rule: 'everyone' })).status, 200)
  assert.equal((await alice.call('POST', '/me/items/mail', { rule: 'maybe' })).status, 400)
  assert.equal((await alice.call('DELETE', '/me/items/first')).status, 409)
  assert.equal((await alice.call('DELETE', '/me/items/mail-2')).status, 200)
  const items = (await alice.call('GET', '/me/items')).json
  assert.deepEqual(items.map((i: Json) => [i.id, i.rule]), [['first', 'everyone'], ['last', 'everyone'], ['mail', 'everyone']])
})

test('the MCP server can search and read an owner’s items on behalf of a member, with a token', async () => {
  const app = createApp(config)
  const alice = client(app), bob = client(app)
  const a = await join(alice, 'Alice', 'Example')
  const b = await join(bob, 'Bob', 'Builder')
  await alice.call('POST', '/me/items', { label: 'Calendar', value: 'https://example.com/cal', rule: 'ask' })
  await alice.call('POST', `/me/people/${b.id}/rules`, { item_id: 'calendar', rule: 'everyone' })
  const auth = { authorization: `Bearer ${TOKEN}` }

  const nobody = client(app)
  assert.equal((await nobody.call('GET', `/internal/search?as=${b.id}&q=alice`)).status, 401)
  assert.equal((await nobody.call('GET', `/internal/search?as=${b.id}&q=alice`, undefined, { authorization: 'Bearer wrong' })).status, 401)
  const found = await nobody.call('GET', `/internal/search?as=${b.id}&q=alice`, undefined, auth)
  assert.equal(found.json[0].items[0].label, 'Calendar')
  assert.equal((await nobody.call('GET', `/internal/search?as=missing&q=x`, undefined, auth)).status, 404)

  const forBob = (await nobody.call('GET', `/internal/users/${a.id}/items?for=${b.id}`, undefined, auth)).json
  assert.deepEqual(forBob.find((i: Json) => i.id === 'calendar'), { id: 'calendar', label: 'Calendar', value: 'https://example.com/cal', network_rule: 'ask', rule: 'everyone' })

  // Alice's server writes for an owner with the token and no Origin; values stay links and names stay fixed.
  const bare = { ...auth, origin: '' }
  assert.equal((await nobody.call('POST', `/internal/users/${a.id}/items`, { label: 'LinkedIn', value: 'https://linkedin.com/in/a' }, { origin: '' })).status, 401)
  const added = await nobody.call('POST', `/internal/users/${a.id}/items`, { label: 'LinkedIn', value: 'https://linkedin.com/in/a' }, bare)
  assert.deepEqual(added.json, { id: 'linkedin', label: 'LinkedIn', value: 'https://linkedin.com/in/a', rule: 'only_me' })
  assert.equal((await nobody.call('POST', `/internal/users/${a.id}/items`, { label: 'Bad', value: 'javascript:alert(1)' }, bare)).status, 400)
  const changed = await nobody.call('POST', `/internal/users/${a.id}/items/linkedin`, { value: 'https://linkedin.com/in/alice', rule: 'everyone' }, bare)
  assert.deepEqual(changed.json, { id: 'linkedin', label: 'LinkedIn', value: 'https://linkedin.com/in/alice', rule: 'everyone' })
  assert.equal((await nobody.call('POST', `/internal/users/${a.id}/items/first`, { value: 'https://x.example' }, bare)).status, 409)
  assert.equal((await nobody.call('POST', `/internal/users/${a.id}/items/nope`, { rule: 'ask' }, bare)).status, 404)
  assert.equal((await nobody.call('POST', `/internal/users/missing/items`, { label: 'X', value: 'https://x.example' }, bare)).json.error, 'unknown_member')
  assert.equal((await alice.call('POST', '/me/items', { label: 'No origin', value: 'https://x.example' }, { origin: '' })).status, 403)

  // With no internal token configured the routes do not exist.
  const closed = createApp({ ...config, internalToken: undefined })
  assert.equal((await client(closed).call('GET', '/internal/search?as=x', undefined, auth)).status, 404)
})
