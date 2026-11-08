// Checks Alice's MCP server on the people network: starts a throwaway store and world on spare ports, registers Alice, Bob and Carol with soft passkeys, and plays Bob's agent. Usage: node network-check.mjs [case ...]
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const STORE_DIR = fileURLToPath(new URL('../../store/', import.meta.url))
const PROXY = join(HERE, 'proxy.mjs')
const TMP = mkdtempSync(join(tmpdir(), 'network-check-'))
const MAP = join(TMP, 'member-map.json')
const STORE_PORT = 4690
const STORE = `http://127.0.0.1:${STORE_PORT}`
// The passkey signs for this origin, which must be one of the store's RP_ORIGINS.
const STORE_ORIGIN = `http://localhost:${STORE_PORT}`
const WORLD = {
  AAUTH_PS: 'https://ps.aauth.test', AAUTH_RESOURCE: 'https://alice.aauth.test', AAUTH_AGENT: 'https://bob-agent.aauth.test',
  AAUTH_PS_PORT: '4601', AAUTH_RESOURCE_PORT: '4602', AAUTH_AGENT_PORT: '4603', AAUTH_MOCKIN_PORT: '4611',
  AAUTH_DATA_DIR: join(TMP, 'data'), STORE_URL: STORE, STORE_INTERNAL_TOKEN: randomBytes(18).toString('base64url'), MEMBER_MAP: MAP,
}
// Before the spike's modules load: config.mjs reads hosts and ports once. Missions are rules only, so Jev is never asked.
Object.assign(process.env, WORLD)
delete process.env.OPENROUTER_API_KEY

const { LOOPBACK, PS } = await import('./config.mjs')
const { consoleToken } = await import('./alice-state.mjs')
const { consoleToken: bobConsoleToken } = await import('./bob-state.mjs')
const { requestMission } = await import('./missions.mjs')
const { SoftPasskey } = await import('../../store/test/authenticator.ts')

const ALICE_API = `http://127.0.0.1:${WORLD.AAUTH_RESOURCE_PORT}/api`
const BOB_API = `http://127.0.0.1:${WORLD.AAUTH_PS_PORT}/api`
const aliceToken = consoleToken()
const asBob = { authorization: `Bearer ${bobConsoleToken()}` }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const check = (ok, what) => { if (!ok) throw new Error(what) }
const failsWith = promise => promise.then(() => null, err => err.message)

const logs = []
const keep = (tag, data) => {
  for (const line of String(data).split('\n')) if (line.trim()) logs.push(`[${tag}] ${line}`)
  logs.splice(0, Math.max(0, logs.length - 400))
}
const children = []
const alive = child => child.exitCode === null && child.signalCode === null
function run(tag, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', d => keep(tag, d))
  child.stderr.on('data', d => keep(tag, d))
  child.on('exit', code => keep(tag, `exited with ${code}`))
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

// A member's browser: the store's session cookie, and the Origin header the store's guard wants on writes.
function browser() {
  const jar = new Map()
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  async function call(method, path, body) {
    const headers = { origin: STORE_ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}), ...(jar.size ? { cookie: cookie() } : {}) }
    const res = await fetch(`${STORE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
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
  return { ...b, id: user.id, name: `${first} ${last}` }
}

// An owner at Alice's /api: a member signed in to the store, or the console token, for one owner when given.
async function ownerApi(as, path, body) {
  const auth = as.cookie ? { cookie: as.cookie() } : { authorization: `Bearer ${aliceToken}`, ...(as.owner ? { 'x-owner': as.owner } : {}) }
  const res = await fetch(`${ALICE_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...auth, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

async function waitAsk(as, itemId) {
  for (let i = 0; i < 150; i++) {
    const ask = (await ownerApi(as, '/state')).json?.asks?.find(a => a.item_id === itemId && a.mission_s256 === mission.s256 && a.status === 'pending')
    if (ask) return ask
    await sleep(200)
  }
  throw new Error(`no ask for ${itemId} reached its owner`)
}

async function answer(as, itemId, decision) {
  const ask = await waitAsk(as, itemId)
  const res = await ownerApi(as, `/asks/${ask.id}`, { decision, remember: false })
  check(res.status === 200, `answering ${itemId} got ${res.status}`)
  return ask
}

const open = (url, init) => {
  const u = new URL(url)
  const port = LOOPBACK[u.hostname]
  return fetch(port ? `http://127.0.0.1:${port}${u.pathname}${u.search}` : u.href, init)
}
const formPost = body => ({
  method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...asBob }, body: new URLSearchParams(body).toString(),
})

// Stands in for Bob allowing every item scope his supervisor holds under this run's mission.
function bobAllows(s256) {
  let running = true
  const loop = (async () => {
    while (running) {
      const res = await fetch(`${BOB_API}/state`, { headers: asBob })
      for (const r of (await res.json()).reviews.filter(r => r.mission_s256 === s256 && r.status === 'pending')) {
        await open(`${PS}/interact`, formPost({ code: r.code, decision: 'approve' }))
      }
      await sleep(250)
    }
  })()
  return async () => { running = false; await loop.catch(() => {}) }
}

// Bob's agent: proxy.mjs under this run's mission, one per case so a refusal cannot leave state behind.
async function agent(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [PROXY], env: { ...process.env, AAUTH_MISSION_S256: mission.s256 }, stderr: 'pipe',
  })
  transport.stderr?.on('data', d => keep('proxy', d))
  const client = new Client({ name: 'network-check', version: '0.0.1' })
  await client.connect(transport)
  const tool = async (name, args) => {
    const r = await client.callTool({ name, arguments: args })
    const text = r.content?.[0]?.text ?? ''
    if (r.isError) throw new Error(text)
    return JSON.parse(text)
  }
  try {
    return await fn(tool)
  } finally {
    await client.close()
  }
}

const SITE = 'https://alice.example.org'
const CASES = {
  async find_people() {
    return agent(async tool => {
      const { people } = await tool('find_people', { query: 'Alice' })
      const a = people.find(p => p.person === alice.id)
      const access = Object.fromEntries((a?.items ?? []).map(i => [i.id, i.access]))
      check(people.length === 1 && a?.name === alice.name, `"Alice" found [${people.map(p => p.name).join(', ')}]`)
      check(access['personal-site'] === 'shared' && access.calendar === 'ask' && access.email === 'ask', `Alice's items read ${JSON.stringify(access)}`)
      check(!('home-address' in access), 'the Only-me item is listed')
      check(!/https?:|mailto:/.test(JSON.stringify(people)), 'find_people gave out values')
      check(!(await tool('find_people', { query: 'Okafor' })).people.length, 'Bob found himself')
      return `found ${a.name} with ${JSON.stringify(access)}, no values, and Bob not listed to himself`
    })
  },

  async shared() {
    return agent(async tool => {
      const r = await tool('search_context', { person: alice.id, ids: ['personal-site'] })
      check(r.shared['personal-site']?.url === SITE, `shared ${JSON.stringify(r.shared)}`)
      check(r.person === alice.id && r.owner === alice.name, `answered as ${r.owner} (${r.person})`)
      return `personal-site came back at once from ${r.owner}`
    })
  },

  async ask_approve() {
    return agent(async tool => {
      const reason = 'To find 30 minutes to meet.'
      const [r, ask] = await Promise.all([
        tool('search_context', { person: alice.id, ids: ['calendar'], reason }),
        answer(alice, `${alice.id}/calendar`, 'approve'),
      ])
      const view = (await ownerApi(alice, '/state')).json
      check(r.shared.calendar?.url === 'https://cal.example.org/alice', `shared ${JSON.stringify(r.shared)}`)
      check(view.me?.id === alice.id, `the store session named ${view.me?.id}`)
      check(ask.reason === reason && ask.item_label === 'Calendar' && ask.owner === alice.id, `the ask read ${JSON.stringify(ask)}`)
      return 'Alice approved her calendar from her store session while the call waited'
    })
  },

  async ask_deny() {
    return agent(async tool => {
      const [r] = await Promise.all([
        tool('search_context', { person: alice.id, ids: ['email'], reason: 'To send the invite.' }),
        answer({ owner: alice.id }, `${alice.id}/email`, 'deny'),
      ])
      check(r.declined.includes('email') && !r.shared.email, `declined [${r.declined}] shared ${JSON.stringify(r.shared)}`)
      return 'Alice declined email through the console token with x-owner'
    })
  },

  async only_me() {
    return agent(async tool => {
      const r = await tool('search_context', { person: alice.id, query: 'home address' })
      check(r.not_found.includes('home-address') && !Object.keys(r.shared).length, `not_found [${r.not_found}] shared ${JSON.stringify(r.shared)}`)
      return 'the Only-me item came back as not found'
    })
  },

  async person_rule() {
    const rule = (item_id, value) => alice.call('POST', `/me/people/${bob.id}/rules`, { item_id, rule: value })
    await rule('projects', 'everyone')
    await rule('personal-site', 'only_me')
    try {
      return await agent(async tool => {
        const r = await tool('search_context', { person: alice.id, ids: ['projects', 'personal-site'] })
        const listed = (await tool('find_people', { query: 'Alice' })).people[0]?.items.map(i => i.id) ?? []
        const asked = (await ownerApi(alice, '/state')).json.asks.some(a => a.item_id === `${alice.id}/projects`)
        check(r.shared.projects && !asked, `projects shared ${!!r.shared.projects}, asked ${asked}`)
        check(r.not_found.includes('personal-site') && !listed.includes('personal-site'), `personal-site not_found [${r.not_found}], listed [${listed}]`)
        return "Alice's rules for Bob alone: projects shared with no ask, personal-site gone"
      })
    } finally {
      await rule('projects', null)
      await rule('personal-site', null)
    }
  },

  async isolation() {
    return agent(async tool => {
      const [r, seen] = await Promise.all([
        tool('search_context', { person: carol.id, ids: ['calendar'], reason: 'To compare free times.' }),
        (async () => {
          const ask = await waitAsk(carol, `${carol.id}/calendar`)
          const byAlice = await ownerApi(alice, `/asks/${ask.id}`, { decision: 'approve' })
          const aliceSees = (await ownerApi(alice, '/state')).json.asks.some(a => a.id === ask.id)
          const byCarol = await ownerApi(carol, `/asks/${ask.id}`, { decision: 'deny' })
          return { byAlice: byAlice.status, aliceSees, byCarol: byCarol.status }
        })(),
      ])
      const carolView = (await ownerApi(carol, '/state')).json
      check(seen.byAlice === 404 && !seen.aliceSees && seen.byCarol === 200, `Alice answering Carol's ask got ${seen.byAlice}, saw it ${seen.aliceSees}; Carol got ${seen.byCarol}`)
      check(carolView.asks.every(a => a.owner === carol.id) && carolView.disclosures.every(d => d.owner === carol.id), "Carol's view holds another owner's entries")
      check(r.declined.includes('calendar') && r.owner === carol.name, `declined [${r.declined}] from ${r.owner}`)
      return "Alice can neither see nor answer Carol's ask; Carol's answer stands"
    })
  },

  async console_auth() {
    const none = await fetch(`${ALICE_API}/state`)
    const bogus = await ownerApi({ cookie: () => 'sid=not-a-session' }, '/state')
    const items = await ownerApi({}, '/items', { label: 'Site', url: SITE })
    const form = await fetch(`${ALICE_API}/asks/any`, {
      method: 'POST', headers: { cookie: alice.cookie(), 'content-type': 'text/plain' }, body: '{"decision":"approve"}',
    })
    check(none.status === 401 && bogus.status === 401, `no credentials got ${none.status}, a bad session ${bogus.status}`)
    check(items.status === 409, `adding an item at /api got ${items.status}`)
    check(form.status === 415, `a cookie post without a JSON body got ${form.status}`)
    return 'no or bad session 401, /api/items 409, cookie form post 415'
  },

  async revoked() {
    const before = await agent(async tool => {
      await tool('search_context', { person: alice.id, ids: ['personal-site'] })
      return tool('search_context', { person: carol.id })
    })
    const rid = (await ownerApi(alice, '/state')).json.requesters.find(r => r.member === bob.id)?.id
    check(rid && before.shared.site, `Bob as Alice's requester ${rid}; Carol's site ${!!before.shared.site}`)
    check((await ownerApi(alice, `/requesters/${rid}`, { status: 'revoked' })).status === 200, 'revoking failed')
    try {
      const carolSays = (await ownerApi(carol, '/state')).json.requesters.find(r => r.id === rid)?.status
      check(carolSays === 'active', `Carol sees Bob as ${carolSays}`)
      await agent(async tool => {
        const listed = (await tool('find_people', {})).people.map(p => p.person)
        const fromCarol = await tool('search_context', { person: carol.id })
        const refused = await failsWith(tool('search_context', { person: alice.id, ids: ['personal-site'] }))
        check(!listed.includes(alice.id) && listed.includes(carol.id), `find_people listed [${listed}]`)
        check(fromCarol.shared.site, "Carol's site was withheld")
        check(/requester_revoked/.test(refused ?? ''), `Alice's site: ${refused ?? 'answered'}`)
      })
    } finally {
      await ownerApi(alice, `/requesters/${rid}`, { status: 'active' })
    }
    const after = await agent(tool => tool('search_context', { person: alice.id, ids: ['personal-site'] }))
    check(after.shared['personal-site'], 'restoring Bob did not restore access')
    return "Alice's revocation refuses Bob at Alice only, hides her from find_people, and lifts cleanly"
  },

  async not_a_member() {
    writeFileSync(MAP, '{}')
    try {
      return await agent(async tool => {
        const find = await failsWith(tool('find_people', {}))
        const search = await failsWith(tool('search_context', { person: alice.id }))
        check(/not_a_member/.test(find ?? '') && /not_a_member/.test(search ?? ''), `find_people: ${find}; search_context: ${search}`)
        return 'an unmapped person server gets not_a_member from both tools'
      })
    } finally {
      writeFileSync(MAP, JSON.stringify({ [PS]: bob.id }))
    }
  },

  async unknown_person() {
    return agent(async tool => {
      const err = await failsWith(tool('search_context', { person: 'no-such-member', ids: ['calendar'] }))
      check(/unknown_person/.test(err ?? ''), `got ${err ?? 'an answer'}`)
      return 'a person id nobody has gets unknown_person'
    })
  },

  async store_down() {
    store.kill()
    if (alive(store)) await new Promise(r => store.once('exit', r))
    return agent(async tool => {
      const err = await failsWith(tool('search_context', { person: alice.id, ids: ['personal-site'] }))
      check(/store_unavailable|502/.test(err ?? ''), `got ${err ?? 'an answer'}`)
      return `with the store down the call fails: ${err.slice(0, 120)}`
    })
  },
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES)
const unknown = names.filter(n => !CASES[n])
if (unknown.length) { console.log(`unknown case ${unknown.join(', ')}; cases: ${Object.keys(CASES).join(', ')}`); process.exit(1) }

const store = run('store', ['src/server.ts'], STORE_DIR, {
  ...process.env, STORE_PORT: String(STORE_PORT), STORE_DB: join(TMP, 'store.db'),
  RP_ID: 'localhost', RP_ORIGINS: STORE_ORIGIN, PUBLIC_URL: STORE_ORIGIN, STORE_DEV_PAGE: '0',
})
await until('the store', store, async () => (await fetch(`${STORE}/health`)).ok)

const alice = await signUp('Alice', 'Martin', [
  ['Personal site', SITE, 'everyone'],
  ['Calendar', 'https://cal.example.org/alice', 'ask'],
  ['Projects', 'https://code.example.org/alice', 'ask'],
  ['Email', 'mailto:alice@example.org', 'ask'],
  ['Home address', 'https://maps.example.org/alice-home', 'only_me'],
])
const bob = await signUp('Bob', 'Okafor', [['Personal site', 'https://bob.example.org', 'everyone']])
const carol = await signUp('Carol', 'Nguyen', [['Site', 'https://carol.example.org', 'everyone'], ['Calendar', 'https://cal.example.org/carol', 'ask']])
writeFileSync(MAP, JSON.stringify({ [PS]: bob.id }))

const world = run('world', ['world.mjs'], HERE, process.env)
const wellKnown = `http://127.0.0.1:${WORLD.AAUTH_RESOURCE_PORT}/.well-known/aauth-resource.json`
await until('the world', world, async () => (await (await fetch(wellKnown)).json()).name === 'The people network')

const mission = await requestMission(`I met Alice at the hackathon. Find her in the people network, check whether we should talk, and if so book 30 minutes. (network-check ${Date.now().toString(36)})`, {
  onInteraction: async (url, code) => {
    const res = await open(url, formPost({ code, decision: 'approve', supervisor: 'rules' }))
    if (!res.ok) throw new Error(`mission approval ${res.status}`)
  },
})
console.log(`store ${STORE} and world on ${WORLD.AAUTH_PS_PORT}-${WORLD.AAUTH_RESOURCE_PORT}; members Alice, Bob (mapped from ${PS}), Carol; mission ${mission.s256.slice(0, 8)}… approved by Bob, rules only`)

const stopBob = bobAllows(mission.s256)
let failed = 0
for (const name of names) {
  try {
    console.log(`✓ ${name}: ${await CASES[name]()}`)
  } catch (err) {
    failed++
    console.log(`✗ ${name}: ${err.message}`)
  }
}
await stopBob()
if (failed) console.log(`last output from the store, world and proxies:\n${logs.slice(-40).join('\n')}`)
console.log(failed ? `${failed} of ${names.length} failed` : `all ${names.length} passed`)
process.exit(failed ? 1 : 0)
