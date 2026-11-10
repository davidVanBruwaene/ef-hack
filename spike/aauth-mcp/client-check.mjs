// Plays Bob's agent through proxy.mjs, Bob answering at his person server as the console would, and Alice through her console API. Usage: node client-check.mjs [case ...]
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { consoleToken } from './alice-state.mjs'
import { DEFAULT_MISSION, LOOPBACK, PORTS, PS, RESOURCE } from './config.mjs'
import { requestMission } from './missions.mjs'
import { psApi } from './ps-api.mjs'
import { randomId, sha256 } from './store.mjs'

const PROXY = fileURLToPath(new URL('./proxy.mjs', import.meta.url))
const ALICE_API = LOOPBACK[new URL(RESOURCE).hostname] ? `http://127.0.0.1:${PORTS.resource}/api` : `${RESOURCE}/api`
const token = consoleToken()
const ps = psApi()
// The member the checks answer as: the store sign-in the console server would vouch for.
const BOB = { id: 'check-bob', name: 'Bob' }
const sleep = ms => new Promise(r => setTimeout(r, ms))

// A link as Bob's phone would open it: through loopback for *.aauth.test, else at its public URL.
const open = (url, init) => {
  const u = new URL(url)
  const port = LOOPBACK[u.hostname]
  return fetch(port ? `http://127.0.0.1:${port}${u.pathname}${u.search}` : u.href, init)
}

// Stands in for Bob following the interaction link, signed in, and answering as himself.
async function bob(url, code, decision) {
  const link = await open(`${url}?code=${encodeURIComponent(code)}`, { redirect: 'manual' })
  if (![200, 303].includes(link.status)) throw new Error(`interaction link answered ${link.status}`)
  await ps.answerCode(code, decision, BOB, { supervisor: 'rules' })
}

// Stands in for Bob allowing whatever the supervisor holds under this run's mission, except the scopes a case answers itself.
function bobAllowsTheRest(s256) {
  const answeredByCases = new Set(Object.values(CASES).flatMap(c => (c.bob ? [c.bob[0]] : [])))
  let running = true
  const loop = (async () => {
    while (running) {
      const held = (await ps.state(BOB.id)).reviews
        .filter(r => r.mission_s256 === s256 && r.status === 'pending' && !r.scopes.some(sc => answeredByCases.has(sc)))
      for (const r of held) await ps.call(`/reviews/${r.id}`, { decision: 'approve', member: BOB })
      await sleep(250)
    }
  })()
  return async () => { running = false; await loop.catch(() => {}) }
}

// Plays the agent answering its own mission with the code it was handed, without the console's token, then Bob denying it.
async function selfApprove(url, code) {
  const res = await open(`${PS}/api/codes/${encodeURIComponent(code)}`)
  if (res.status !== 401) throw new Error(`the agent's own lookup got ${res.status}, not 401`)
  await bob(url, code, 'deny')
}

async function call(base, bearer, path, body) {
  const res = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${bearer}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
}
const api = (path, body) => call(ALICE_API, token, path, body)

// Stands in for Bob answering, in the console, a request his supervisor held for him.
async function bobReview(s256, scope, decision, reason) {
  for (let i = 0; i < 150; i++) {
    const review = (await ps.state(BOB.id)).reviews
      .find(r => r.mission_s256 === s256 && r.scopes.includes(scope) && r.status === 'pending')
    if (review) {
      if (reason && review.justification !== reason) throw new Error(`the review shows justification ${JSON.stringify(review.justification)}, not the call's reason`)
      await sleep(300)
      await ps.call(`/reviews/${review.id}`, { decision, member: BOB })
      return `the supervisor held ${scope}${reason ? ' with the agent\'s reason' : ''} and Bob answered ${decision}`
    }
    await sleep(200)
  }
  throw new Error(`no review for ${scope} reached Bob`)
}

// Stands in for Alice answering in her console once the ask reaches her.
async function alice(s256, itemId, decision) {
  for (let i = 0; i < 150; i++) {
    const ask = (await api('/state')).asks.find(a => a.item_id === itemId && a.mission_s256 === s256 && a.status === 'pending')
    if (ask) {
      await sleep(500)
      await api(`/asks/${ask.id}`, { decision, remember: false })
      return `Alice answered ${decision} on ${itemId} after the call started waiting`
    }
    await sleep(200)
  }
  throw new Error(`no ask for ${itemId} reached Alice`)
}

const CASES = {
  everyone: { call: { ids: ['first', 'site'] }, pass: r => r.shared.first && r.shared.site },
  ask: {
    call: { ids: ['calendar'], reason: 'To find a 30-minute slot.' },
    alice: ['calendar', 'approve'],
    pass: r => r.shared.calendar,
  },
  deny: {
    call: { ids: ['email'], reason: 'To send the invite.' },
    alice: ['email', 'deny'],
    pass: r => r.declined.includes('email') && !r.shared.email,
  },
  only_me: { call: { query: 'home address' }, pass: r => r.not_found.includes('address') && !r.shared.address },
  revoked: { revoke: true, call: { ids: ['first'] }, fails: /requester_revoked/ },
  no_mission: { mission: '', call: { ids: ['first'] }, fails: /mission|person token/i },
  unapproved: { mission: 'made-up', call: { ids: ['first'] }, fails: /mission|person token/i },
  mission_denied: { propose: 'deny', fails: /\bdenied\b/ },
  self_approval: { propose: 'self', fails: /\bdenied\b/ },
  review_allow: {
    call: { ids: ['location'], reason: 'To suggest a place to meet.' },
    bob: ['item:location', 'approve'],
    alice: ['location', 'approve'],
    pass: r => r.shared.location,
  },
  review_deny: {
    call: { ids: ['linkedin'] },
    bob: ['item:linkedin', 'deny'],
    pass: r => r.refused.includes('linkedin') && !r.shared.linkedin && /declined the request/.test(r.refused_why ?? ''),
  },
  remembered_deny: {
    call: { ids: ['sessions'] },
    bob: ['item:sessions', 'deny'],
    repeat: true,
    pass: r => r.refused.includes('sessions') && /earlier in this mission/.test(r.refused_why ?? ''),
  },
  // Calendar was allowed earlier in this mission and sessions refused, so one call returns the first and lists the second.
  partial: { call: { ids: ['calendar', 'sessions'] }, pass: r => r.shared.calendar && r.refused.includes('sessions') },
}

async function runCase(name, approved) {
  const c = CASES[name]
  if (c.propose) {
    try {
      await requestMission(`${DEFAULT_MISSION} (${name})`, {
        onInteraction: (url, code) => (c.propose === 'self' ? selfApprove(url, code) : bob(url, code, c.propose)),
      })
      console.log(`✗ ${name}: the mission was approved`)
      return false
    } catch (err) {
      const ok = c.fails.test(err.message)
      console.log(`${ok ? '✓' : '✗'} ${name}: ${err.message}`)
      return ok
    }
  }
  const s256 = c.mission === undefined ? approved.s256 : c.mission === '' ? '' : sha256(randomId('m'))
  let revoked
  if (c.revoke) {
    revoked = (await api('/state')).requesters.find(r => r.label === BOB.name && r.ps === PS)?.id
    if (!revoked) throw new Error(`${BOB.name} is not a requester yet; run another case first`)
    await api(`/requesters/${revoked}`, { status: 'revoked' })
  }
  const transport = new StdioClientTransport({
    command: process.execPath, args: [PROXY], env: { ...process.env, AAUTH_MISSION_S256: s256 }, stderr: 'inherit',
  })
  const client = new Client({ name: `check-${name}`, version: '0.0.1' })
  try {
    await client.connect(transport)
    const schema = JSON.parse((await client.callTool({ name: 'get_context_schema', arguments: {} })).content[0].text)
    // A repeat asks once with Bob answering, then again, which the supervisor answers from the log.
    if (c.repeat) await Promise.all([client.callTool({ name: 'search_context', arguments: c.call }).catch(() => {}), bobReview(s256, ...c.bob)])
    const [answer, said, bobSaid] = await Promise.all([
      client.callTool({ name: 'search_context', arguments: c.call }),
      c.alice ? alice(s256, ...c.alice) : undefined,
      c.bob && !c.repeat ? bobReview(s256, ...c.bob, c.call.reason) : undefined,
    ])
    if (answer.isError) throw new Error(answer.content?.[0]?.text ?? 'tool error')
    const result = JSON.parse(answer.content[0].text)
    const ok = !c.fails && c.pass(result)
    console.log(`${ok ? '✓' : '✗'} ${name}: schema lists ${schema.items.length} items; shared [${Object.keys(result.shared).join(', ')}] declined [${result.declined.join(', ')}] refused [${(result.refused ?? []).join(', ')}] pending [${result.pending.join(', ')}] not_found [${result.not_found.join(', ')}]${said ? `; ${said}` : ''}${bobSaid ? `; ${bobSaid}` : ''}`)
    return ok
  } catch (err) {
    const ok = !!c.fails?.test(err.message)
    console.log(`${ok ? '✓' : '✗'} ${name}: ${c.fails ? 'refused' : 'FAILED'}: ${err.message}`)
    return ok
  } finally {
    await client.close()
    if (revoked) await api(`/requesters/${revoked}`, { status: 'active' })
  }
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES)
const unknown = names.filter(n => !CASES[n])
if (unknown.length) { console.log(`unknown case ${unknown.join(', ')}; cases: ${Object.keys(CASES).join(', ')}`); process.exit(1) }

// A fresh mission per run, so earlier answers do not carry over. Bob approves it as rules only, so no case depends on what Jev answers.
const approved = await requestMission(`${DEFAULT_MISSION} Alice's first name, personal site, calendar and email are fine to look at. (check ${Date.now().toString(36)})`, {
  onInteraction: (url, code) => bob(url, code, 'approve'),
})
console.log(`mission ${approved.s256.slice(0, 8)}… approved by Bob, rules only: "${approved.blob.description}"`)
const stopBob = bobAllowsTheRest(approved.s256)
let failed = 0
for (const name of names) if (!(await runCase(name, approved))) failed++
await stopBob()
console.log(failed ? `${failed} of ${names.length} failed` : `all ${names.length} passed`)
process.exitCode = failed ? 1 : 0
