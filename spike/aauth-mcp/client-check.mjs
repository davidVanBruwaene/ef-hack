// Plays Bob's agent through proxy.mjs, and Alice through her console API where a case needs her answer. Usage: node client-check.mjs [case ...]
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { consoleToken } from './alice-state.mjs'
import { BOB_NAME, DEFAULT_MISSION, LOOPBACK, PORTS, PS, RESOURCE, missionHash } from './config.mjs'

const PROXY = fileURLToPath(new URL('./proxy.mjs', import.meta.url))
const ALICE_API = LOOPBACK[new URL(RESOURCE).hostname] ? `http://127.0.0.1:${PORTS.resource}/api` : `${RESOURCE}/api`
const token = consoleToken()
// A fresh mission per run, so Alice's per-mission answers from earlier runs do not carry over.
const mission = process.env.AAUTH_MISSION ?? `${DEFAULT_MISSION} (check ${Date.now().toString(36)})`
const sleep = ms => new Promise(r => setTimeout(r, ms))

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
async function alice(itemId, decision) {
  const s256 = missionHash(mission)
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
  everyone: {
    call: { ids: ['first', 'site'] },
    pass: r => r.shared.first && r.shared.site,
  },
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
  only_me: {
    call: { query: 'home address' },
    pass: r => r.not_found.includes('address') && !r.shared.address,
  },
  revoked: { revoke: true, call: { ids: ['first'] }, fails: true },
}

async function runCase(name) {
  const c = CASES[name]
  let revoked
  if (c.revoke) {
    revoked = (await api('/state')).requesters.find(r => r.label === BOB_NAME && r.ps === PS)?.id
    if (!revoked) throw new Error(`${BOB_NAME} is not a requester yet; run another case first`)
    await api(`/requesters/${revoked}`, { status: 'revoked' })
  }
  const transport = new StdioClientTransport({
    command: process.execPath, args: [PROXY], env: { ...process.env, AAUTH_MISSION: mission }, stderr: 'inherit',
  })
  const client = new Client({ name: `check-${name}`, version: '0.0.1' })
  try {
    await client.connect(transport)
    const schema = JSON.parse((await client.callTool({ name: 'get_context_schema', arguments: {} })).content[0].text)
    const [answer, said] = await Promise.all([
      client.callTool({ name: 'search_context', arguments: c.call }),
      c.alice ? alice(...c.alice) : undefined,
    ])
    if (answer.isError) throw new Error(answer.content?.[0]?.text ?? 'tool error')
    const result = JSON.parse(answer.content[0].text)
    const ok = !c.fails && c.pass(result)
    console.log(`${ok ? '✓' : '✗'} ${name}: schema lists ${schema.items.length} items; shared [${Object.keys(result.shared).join(', ')}] declined [${result.declined.join(', ')}] pending [${result.pending.join(', ')}] not_found [${result.not_found.join(', ')}]${said ? `; ${said}` : ''}`)
    return ok
  } catch (err) {
    console.log(`${c.fails ? '✓' : '✗'} ${name}: ${c.fails ? 'refused as expected' : 'FAILED'}: ${err.message}`)
    return !!c.fails
  } finally {
    await client.close()
    if (revoked) await api(`/requesters/${revoked}`, { status: 'active' })
  }
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES)
console.log(`mission: "${mission}"`)
let failed = 0
for (const name of names) {
  if (!CASES[name]) { console.log(`✗ unknown case ${name}; cases: ${Object.keys(CASES).join(', ')}`); failed++; continue }
  if (!(await runCase(name))) failed++
}
console.log(failed ? `${failed} of ${names.length} failed` : `all ${names.length} passed`)
process.exitCode = failed ? 1 : 0
