// -11 conformance checks for missions at Bob's person server, run against a running world. Usage: node mission-check.mjs [case ...]
import { randomBytes } from 'node:crypto'
import { createSignedFetch } from '@aauth/agent'
import { DWK, SIGNING_ALG, TOKEN_TYP, parseRequirementHeader } from '@aauth/protocol'
import { SignJWT, decodeJwt } from 'jose'
import { agentSession } from './agent.mjs'
import { consoleToken } from './bob-state.mjs'
import { AGENT, AGENT_SUB, DEFAULT_MISSION, PS, RESOURCE } from './config.mjs'
import { agentIdentityKey, newKey } from './keys.mjs'
import { routeTestHostsToLoopback } from './loopback.mjs'
import { requestMission } from './missions.mjs'
import { sha256 } from './store.mjs'

routeTestHostsToLoopback()

const RUN = Date.now().toString(36)
const text = label => `${DEFAULT_MISSION} (mission-check ${label} ${RUN})`
// The token endpoint codes (§11.9.3) and mission_terminated (§8.8).
const TOKEN_ERRORS = new Set([
  'invalid_request', 'invalid_resource_token', 'expired_resource_token', 'revoked_resource_token',
  'invalid_presented_token', 'expired_presented_token', 'revoked_presented_token',
  'invalid_upstream_token', 'expired_upstream_token', 'revoked_upstream_token',
  'invalid_subagent_token', 'expired_subagent_token', 'revoked_subagent_token',
  'clock_skew', 'user_unreachable', 'as_unreachable', 'server_error', 'mission_terminated',
])

const capture = async res => {
  const raw = await res.text()
  let body = raw
  try { body = JSON.parse(raw) } catch { /* not JSON */ }
  return { status: res.status, headers: Object.fromEntries(res.headers), body, raw }
}
const json = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const form = body => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body).toString() })
const randomS256 = () => sha256(randomBytes(32))
const within = (ms, what, promise) => Promise.race([
  promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} took over ${ms / 1000}s`)), ms).unref()),
])
// §8.7: the same status, body and header set, so the response says nothing about whose mission it is.
const sameAnswer = (a, b) => {
  const names = r => JSON.stringify(Object.keys(r.headers).filter(h => h !== 'date').sort())
  return a.status === b.status && a.raw === b.raw && names(a) === names(b)
}

// Another agent of Bob's agent provider, for the checks that a mission belongs only to the agent that proposed it.
async function agentAs(local) {
  const identity = await agentIdentityKey()
  const session = await newKey(`${local}-session`)
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({
    iss: AGENT, dwk: DWK.agent, sub: `aauth:${local}@${new URL(AGENT).hostname}`, ps: PS, cnf: { jwk: session.publicJwk }, iat: now, exp: now + 600,
  }).setProtectedHeader({ alg: SIGNING_ALG, typ: TOKEN_TYP.agent, kid: identity.kid }).sign(identity.privateKey)
  return createSignedFetch(async () => ({ signingKey: session.privateJwk, signatureKey: { type: 'jwt', jwt } }), { signBody: true })
}

const agent = createSignedFetch((await agentSession()).getKeyMaterial, { signBody: true })
const meta = await (await fetch(`${PS}/.well-known/aauth-person.json`)).json()
const call = (as, url, init = { method: 'GET' }) => as(url, init).then(capture)
const personToken = (as, s256) => call(as, meta.person_token_endpoint, json({ resource: RESOURCE, mission_s256: s256 }))

const codesSeen = []
const opened = []

async function propose(description) {
  const r = await call(agent, meta.mission_endpoint, json({ description, resources: [RESOURCE] }))
  if (r.status !== 202) throw new Error(`the proposal got ${r.status} ${r.raw.slice(0, 160)}, not 202`)
  let challenge = {}
  try { challenge = parseRequirementHeader(r.headers['aauth-requirement'] ?? '') } catch { /* checked in "pending" */ }
  const p = { ...r, description, ...challenge, location: new URL(r.headers.location, meta.mission_endpoint).href }
  codesSeen.push(p.code)
  opened.push(p)
  return p
}

// Stands in for Bob: opens the QR code's link on his phone, reads the mission, and taps a button, optionally after editing the text.
async function bobAnswers(p, decision, edited) {
  const page = await fetch(`${p.url}?code=${encodeURIComponent(p.code)}`)
  const html = await page.text()
  if (page.status !== 200) throw new Error(`Bob's approval page answered ${page.status}`)
  const res = await fetch(p.url, form({ code: p.code, decision, description: edited ?? p.description }))
  if (!res.ok) throw new Error(`Bob's ${decision} answered ${res.status}`)
  return html
}

let approved
async function approvedMission() {
  if (approved) return approved
  const p = await propose(text('approved'))
  const page = await bobAnswers(p, 'approve')
  const answer = await call(agent, p.location)
  if (answer.status !== 200) throw new Error(`the approved mission polled ${answer.status}, not 200`)
  approved = { ...p, page, answer, s256: answer.body.s256, bytes: Buffer.from(answer.body.mission ?? '', 'base64url') }
  return approved
}

function refused(t, r, why) {
  t.must(r.status >= 400 && r.status < 500, `refuse a person token under ${why} (§7.1); got ${r.status}`)
  t.must(TOKEN_ERRORS.has(r.body?.error), `refuse it with a token endpoint error code (§7.1, §11.9.3); got "${r.body?.error}"`)
  t.must(String(r.headers['content-type']).startsWith('application/problem+json'), `send the refusal as application/problem+json (§11.9.2); got ${r.headers['content-type']}`)
}

const CASES = {
  metadata: async t => {
    const u = meta.mission_endpoint && new URL(meta.mission_endpoint)
    t.must(u, 'publish mission_endpoint in its metadata (§11.2.2)')
    t.must(u && u.protocol === 'https:' && !u.search && !u.hash, `give mission_endpoint as https with no query or fragment (§11.1.2); got ${meta.mission_endpoint}`)
    return meta.mission_endpoint
  },

  unsigned: async t => {
    const r = await capture(await fetch(meta.mission_endpoint, json({ description: text('unsigned') })))
    t.must(r.status === 401, `refuse an unsigned proposal with 401 (§8.1); got ${r.status}`)
    t.must(r.headers['signature-error'], 'say why in a Signature-Error header on the 401 (§11.9.1)')
    return `${r.status} ${r.body?.error ?? ''}`
  },

  no_description: async t => {
    const r = await call(agent, meta.mission_endpoint, json({ resources: [RESOURCE] }))
    t.must(r.status === 400 && r.body?.error === 'invalid_request', `refuse a proposal with no description with 400 invalid_request (§8.1); got ${r.status} ${r.body?.error}`)
    return `${r.status} ${r.body?.error}`
  },

  pending: async t => {
    const p = await propose(text('pending'))
    t.must(p.headers.location && new URL(p.location).origin === new URL(meta.mission_endpoint).origin, 'put Location on its own origin (§11.8.2)')
    t.must(/^\d+$/.test(p.headers['retry-after'] ?? ''), `send Retry-After in seconds (§11.8.2); got ${p.headers['retry-after']}`)
    t.must(/\bno-store\b/.test(p.headers['cache-control'] ?? ''), 'send Cache-Control: no-store (§11.8.2)')
    t.must(p.body?.status === 'pending', 'answer {"status": "pending"} (§11.8.2)')
    t.must(p.requirement === 'interaction', `ask for Bob with AAuth-Requirement: requirement=interaction (§11.6.3); got ${p.headers['aauth-requirement']}`)
    const u = p.url && new URL(p.url)
    t.must(u && u.protocol === 'https:' && !u.search && !u.hash, `give an https interaction url with no query or fragment (§11.6.3); got ${p.url}`)
    t.must((p.code ?? '').replaceAll('-', '').length >= 8, `make the code at least 8 symbols (§11.6.3.1); got ${p.code}`)
    const again = await call(agent, p.location)
    t.must(again.status === 202 && again.body?.status === 'pending', `keep answering 202 to GET while Bob decides (§11.8.3); got ${again.status}`)
    const page = await (await fetch(`${p.url}?code=${encodeURIComponent(p.code)}`)).text()
    t.must(page.includes(p.description) && page.includes(RESOURCE), 'show Bob the proposed text and the resources it names (§8.1)')
    return `202, code ${p.code}`
  },

  approve: async t => {
    const a = await approvedMission()
    const { s256, mission, person_tokens: personTokens } = a.answer.body
    t.must(/^[A-Za-z0-9_-]{43}$/.test(s256 ?? ''), `return s256 as unpadded base64url SHA-256 (§8.2); got ${s256}`)
    t.must(/^[A-Za-z0-9_-]+$/.test(mission ?? ''), 'return the blob as base64url without padding (§8.2)')
    t.must(sha256(a.bytes) === s256, 'compute s256 over the exact blob bytes it returns (§8.2.1)')
    let blob = {}
    try { blob = JSON.parse(a.bytes.toString('utf8')) } catch { t.must(false, 'return a blob that parses as JSON (§8.2)') }
    t.must(blob.agent === AGENT_SUB, `name the proposing agent in blob.agent (§8.2); got ${blob.agent}`)
    t.must(!Number.isNaN(Date.parse(blob.approved_at)), `give blob.approved_at as an ISO 8601 time (§8.2); got ${blob.approved_at}`)
    t.must(blob.description === a.description, 'carry the text Bob approved in blob.description (§8.2)')
    t.must(!blob.expires_at || Date.parse(blob.expires_at) > Date.parse(blob.approved_at), 'set expires_at after approved_at (§8.2)')
    t.should(personTokens?.[RESOURCE], 'return person_tokens for the resources the proposal named (§8.2)')
    const pt = await personToken(agent, s256)
    t.must(pt.status === 200 && pt.body?.person_token, `issue a person token under the approved mission (§7.1); got ${pt.status} ${pt.body?.error ?? ''}`)
    if (pt.body?.person_token) {
      const claims = decodeJwt(pt.body.person_token)
      t.must(claims.mission_s256 === s256, 'stamp the approved s256 into the person token (§7.1)')
      t.must(!blob.expires_at || claims.exp <= Date.parse(blob.expires_at) / 1000, "cap the person token at the mission's expires_at (§8.2)")
    }
    return `mission ${String(s256).slice(0, 8)}…, ${a.bytes.length} blob bytes`
  },

  edited: async t => {
    const proposed = text('edited')
    const narrowed = `${proposed} Read only Alice's first name and calendar.`
    let answered
    const m = await within(30_000, 'the edited approval', requestMission(proposed, {
      onInteraction: (url, code) => {
        codesSeen.push(code)
        opened.push({ code })
        answered = bobAnswers({ url, code, description: proposed }, 'approve', narrowed)
      },
    }))
    await answered
    t.must(m.blob.description === narrowed, "store Bob's edited text as the approved description (§8.1, §8.2)")
    t.must(m.s256 === sha256(Buffer.from(m.mission, 'base64url')), 'return an s256 that matches the edited blob (§8.2.1)')
    t.must(m.s256 !== sha256(proposed) && m.s256 !== sha256(narrowed), 'derive s256 from the stored blob, not from the text alone (§8.2.1)')
    const pt = await personToken(agent, m.s256)
    t.must(pt.status === 200 && pt.body?.person_token && decodeJwt(pt.body.person_token).mission_s256 === m.s256,
      `issue a person token under the s256 the agent got back (§7.1, §8.2.1); got ${pt.status} ${pt.body?.error ?? ''}`)
    refused(t, await personToken(agent, sha256(proposed)), 'the hash of the proposed text')
    return `approved as edited, mission ${m.s256.slice(0, 8)}…`
  },

  pending_s256: async t => {
    const p = await propose(text('pending-s256'))
    const r = await personToken(agent, sha256(p.description))
    refused(t, r, 'a proposal Bob has not answered')
    return `${r.status} ${r.body?.error}`
  },

  denied: async t => {
    const p = await propose(text('denied'))
    await bobAnswers(p, 'deny')
    const r = await call(agent, p.location)
    t.must(r.status === 403, `answer 403 to the poll once Bob denies (§11.8.4); got ${r.status}`)
    t.must(r.body?.error === 'denied', `use the polling error code "denied" (§11.9.4); got "${r.body?.error}"`)
    refused(t, await personToken(agent, sha256(p.description)), 'a mission Bob denied')
    return `${r.status} ${r.body?.error}`
  },

  unknown: async t => {
    const r = await personToken(agent, randomS256())
    refused(t, r, 'an s256 that names no mission')
    return `${r.status} ${r.body?.error}`
  },

  other_agent: async t => {
    const a = await approvedMission()
    const stranger = await agentAs('stranger')
    const theirs = await call(stranger, a.location)
    const nothing = await call(stranger, a.location.replace(/[^/]+$/, `m_${randomBytes(6).toString('base64url')}`))
    t.must(theirs.status !== 200, 'not return a mission to an agent that did not propose it (§8.7)')
    t.must(sameAnswer(theirs, nothing), `answer another agent's poll exactly as an unknown one (§8.7); got ${theirs.status} ${theirs.raw.slice(0, 80)} and ${nothing.status} ${nothing.raw.slice(0, 80)}`)
    t.should(theirs.body?.error === 'mission_not_found', `call it mission_not_found (§8.7); got "${theirs.body?.error}"`)
    const ptTheirs = await personToken(stranger, a.s256)
    refused(t, ptTheirs, "another agent's mission")
    t.should(sameAnswer(ptTheirs, await personToken(stranger, randomS256())), "refuse another agent's mission exactly as an unknown one (§8.7)")
    return `${theirs.status} ${theirs.body?.error}`
  },

  self_approval: async t => {
    const p = await propose(text('self-approval'))
    // Everything sent here reached the agent in the 202; none of it is Bob's.
    await fetch(p.url, form({ code: p.code, decision: 'approve', description: p.description }))
    const r = await call(agent, p.location)
    t.must(r.status !== 200, 'not let the code alone approve a mission, since the agent receives it too (§11.6.3.1)')
    return r.status === 200 ? 'the agent approved its own mission' : `poll ${r.status}`
  },

  code_input: async t => {
    const p = await propose(text('code-input'))
    const typed = p.code.replaceAll('-', '').toLowerCase()
    const page = await fetch(`${p.url}?code=${encodeURIComponent(typed)}`)
    t.must(page.status === 200, `accept the code typed in lower case without hyphens (§11.6.3.1); got ${page.status}`)
    return `${page.status} for ${typed}`
  },

  code_single_use: async t => {
    const a = await approvedMission()
    const again = await fetch(`${a.url}?code=${encodeURIComponent(a.code)}`)
    t.must(again.status >= 400, `reject a code that was already used (§11.6.3.1); got ${again.status}`)
    t.should(again.status === 410, `answer a used code with 410, as invalid_code (§11.9.4); got ${again.status}`)
    await fetch(a.url, form({ code: a.code, decision: 'deny' }))
    const pt = await personToken(agent, a.s256)
    t.must(pt.status === 200, `keep the mission approved when its used code is replayed (§8.3); got ${pt.status}`)
    return `${again.status} on reuse`
  },

  code_alphabet: async t => {
    while (codesSeen.length < 5) await propose(text('code-alphabet'))
    const symbols = [...new Set(codesSeen.join('').replaceAll('-', ''))].sort().join('')
    const outside = symbols.replace(/[0-9A-HJKMNP-TV-Z]/g, '')
    t.must(!outside, `draw codes only from Crockford base32, which has no I, L, O or U (§11.6.3.1); saw "${outside}" in ${codesSeen.length} codes`)
    return `${codesSeen.length} codes, symbols ${symbols}`
  },

  expired: async () => ({ skip: 'missions last 24 hours and nothing ends one early, so mission_terminated (§8.8) cannot be reached from outside' }),
}

// Denies, through Bob's /api, every proposal this run left pending.
async function cleanUp() {
  const api = (path, init = {}) => fetch(`${PS}/api${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${consoleToken()}` } })
  const res = await api('/state')
  if (!res.ok) return console.log(`(left this run's pending proposals: Bob's /api/state answered ${res.status})`)
  const codes = new Set(opened.map(p => p.code))
  for (const m of (await res.json()).missions ?? []) {
    if (m.status === 'pending' && codes.has(m.code)) await api(`/missions/${m.id}`, json({ decision: 'deny' }))
  }
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES)
const unknown = names.filter(n => !CASES[n])
if (unknown.length) { console.log(`unknown case ${unknown.join(', ')}; cases: ${Object.keys(CASES).join(', ')}`); process.exit(1) }

console.log(`Bob's person server ${PS}, agent ${AGENT_SUB}`)
let failed = 0
for (const name of names) {
  const t = { failed: [], warned: [] }
  t.must = (ok, what) => { if (!ok) t.failed.push(what) }
  t.should = (ok, what) => { if (!ok) t.warned.push(what) }
  let summary
  try { summary = await within(60_000, name, CASES[name](t)) } catch (err) { t.failed.push(`threw: ${err.message}`) }
  if (summary?.skip) { console.log(`- ${name}: skipped, ${summary.skip}`); continue }
  if (t.failed.length) failed++
  console.log(`${t.failed.length ? '✗' : '✓'} ${name}${summary ? `: ${summary}` : ''}`)
  for (const f of t.failed) console.log(`    MUST ${f}`)
  for (const w of t.warned) console.log(`    SHOULD ${w}`)
}
await cleanUp().catch(err => console.log(`(cleanup failed: ${err.message})`))
console.log(failed ? `${failed} of ${names.length} failed` : `all ${names.length} passed`)
process.exitCode = failed ? 1 : 0
