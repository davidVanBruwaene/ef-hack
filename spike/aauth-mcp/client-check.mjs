// Plays Bob's agent through proxy.mjs, Bob on his approval page, and Alice through her console API. Usage: node client-check.mjs [case ...]
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { consoleToken } from './alice-state.mjs'
import { BOB_NAME, DEFAULT_MISSION, LOOPBACK, PORTS, PS, RESOURCE } from './config.mjs'
import { requestMission } from './missions.mjs'
import { randomId, sha256 } from './store.mjs'

const PROXY = fileURLToPath(new URL('./proxy.mjs', import.meta.url))
const ALICE_API = LOOPBACK[new URL(RESOURCE).hostname] ? `http://127.0.0.1:${PORTS.resource}/api` : `${RESOURCE}/api`
const token = consoleToken()
const sleep = ms => new Promise(r => setTimeout(r, ms))

// A link as Bob's phone would open it: through loopback for *.aauth.test, else at its public URL.
const open = (url, init) => {
  const u = new URL(url)
  const port = LOOPBACK[u.hostname]
  return fetch(port ? `http://127.0.0.1:${port}${u.pathname}${u.search}` : u.href, init)
}

// Stands in for Bob scanning the QR code and tapping a button on the approval page.
async function bob(url, code, decision) {
  const link = `${url}?code=${encodeURIComponent(code)}`
  const page = await open(link)
  if (!page.ok || !(await page.text()).includes(code)) throw new Error(`approval page ${page.status}`)
  const res = await open(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, decision }).toString(),
  })
  if (!res.ok) throw new Error(`approval POST ${res.status}`)
}

async function api(path, body) {
  const res = await fetch(`${ALICE_API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`)
  return res.json()
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
  mission_denied: { propose: 'deny', fails: /access_denied/ },
}

async function runCase(name, approved) {
  const c = CASES[name]
  if (c.propose) {
    try {
      await requestMission(`${DEFAULT_MISSION} (${name})`, { onInteraction: (url, code) => bob(url, code, c.propose) })
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
    revoked = (await api('/state')).requesters.find(r => r.label === BOB_NAME && r.ps === PS)?.id
    if (!revoked) throw new Error(`${BOB_NAME} is not a requester yet; run another case first`)
    await api(`/requesters/${revoked}`, { status: 'revoked' })
  }
  const transport = new StdioClientTransport({
    command: process.execPath, args: [PROXY], env: { ...process.env, AAUTH_MISSION_S256: s256 }, stderr: 'inherit',
  })
  const client = new Client({ name: `check-${name}`, version: '0.0.1' })
  try {
    await client.connect(transport)
    const schema = JSON.parse((await client.callTool({ name: 'get_context_schema', arguments: {} })).content[0].text)
    const [answer, said] = await Promise.all([
      client.callTool({ name: 'search_context', arguments: c.call }),
      c.alice ? alice(s256, ...c.alice) : undefined,
    ])
    if (answer.isError) throw new Error(answer.content?.[0]?.text ?? 'tool error')
    const result = JSON.parse(answer.content[0].text)
    const ok = !c.fails && c.pass(result)
    console.log(`${ok ? '✓' : '✗'} ${name}: schema lists ${schema.items.length} items; shared [${Object.keys(result.shared).join(', ')}] declined [${result.declined.join(', ')}] pending [${result.pending.join(', ')}] not_found [${result.not_found.join(', ')}]${said ? `; ${said}` : ''}`)
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

// One fresh mission per run, approved on Bob's page, so Alice's per-mission answers from earlier runs do not carry over.
const approved = await requestMission(`${DEFAULT_MISSION} (check ${Date.now().toString(36)})`, {
  onInteraction: (url, code) => bob(url, code, 'approve'),
})
console.log(`mission ${approved.s256.slice(0, 8)}… approved on Bob's page: "${approved.blob.description}"`)
let failed = 0
for (const name of names) if (!(await runCase(name, approved))) failed++
console.log(failed ? `${failed} of ${names.length} failed` : `all ${names.length} passed`)
process.exitCode = failed ? 1 : 0
