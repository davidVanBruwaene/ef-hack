import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ALLOW_AT, decide, DENY_AT, jevState, QUESTION } from '../decide.mjs'
import { JEV_TIMEOUT_MS } from '../jev.mjs'
import { acts, AGENT, blob, entry, fakeFetch, mission, MODEL, noul, NOW, record, TEST_ENV, TEST_KEY } from './fixtures.mjs'

const run = (args, fetch, extra = {}) => decide(args, { fetch, env: TEST_ENV, now: NOW, ...extra })

test('Jev decides what the rules leave open: 0.8 or above allows', async () => {
  const fetch = fakeFetch(noul(0.97))
  assert.deepEqual(await run({ mission, act: acts.calendar, log: [] }, fetch), {
    decision: 'ALLOW', by: 'jev', rule: null, p: 0.97, model: MODEL, reason: 'Jev: consistent with the mission (p 0.97).',
  })
  assert.equal(QUESTION, 'Is this act consistent with the mission?')
  assert.equal(fetch.calls[0].body.questions.consistent.instructions, QUESTION)
})

test('0.3 or below denies, and anything between goes to review', async () => {
  const cases = [[1, 'ALLOW'], [0.8, 'ALLOW'], [0.7999, 'REVIEW'], [0.5, 'REVIEW'], [0.3001, 'REVIEW'], [0.3, 'DENY'], [0.03, 'DENY'], [0, 'DENY']]
  for (const [p, decision] of cases) {
    const d = await run({ mission, act: acts.address }, fakeFetch(noul(p)))
    assert.deepEqual([d.decision, d.by, d.rule, d.p, d.model], [decision, 'jev', null, p, MODEL], String(p))
  }
  assert.deepEqual([ALLOW_AT, DENY_AT], [0.8, 0.3])
  assert.equal((await run({ mission, act: acts.address }, fakeFetch(noul(0.03)))).reason, 'Jev: not consistent with the mission (p 0.03).')
  assert.equal((await run({ mission, act: acts.phone }, fakeFetch(noul(0.5)))).reason, 'Jev is unsure the act fits the mission (p 0.50).')
})

test('when Jev gives no answer, the act goes to review by rule', async () => {
  const failures = [
    [fakeFetch(noul(0.97), { status: 500 }), 'HTTP 500'],
    [fakeFetch(new TypeError('fetch failed')), 'request failed (TypeError)'],
    [fakeFetch({ answers: { consistent: { type: 'noul', noul: 0.97 } } }), 'reply names no model'],
  ]
  for (const [fetch, why] of failures) {
    assert.deepEqual(await run({ mission, act: acts.calendar }, fetch), {
      decision: 'REVIEW', by: 'rule', rule: 'jev_unavailable', p: null, model: null,
      reason: `No rule settles this act, and Jev gave no answer: ${why}.`,
    })
  }
})

test('a reply with a bad noul goes to review and records the model that replied', async () => {
  const d = await run({ mission, act: acts.calendar }, fakeFetch(noul(1.2)))
  assert.deepEqual([d.decision, d.by, d.rule, d.p, d.model], ['REVIEW', 'rule', 'jev_unavailable', null, MODEL])
})

test('a hung Jev costs at most the timeout, 4 s by default, then review', async () => {
  assert.equal(JEV_TIMEOUT_MS, 4000)
  const started = Date.now()
  const d = await run({ mission, act: acts.calendar }, fakeFetch('hang'), { timeoutMs: 50 })
  assert.deepEqual([d.decision, d.rule, d.reason], ['REVIEW', 'jev_unavailable', 'No rule settles this act, and Jev gave no answer: no reply within 50 ms.'])
  assert.ok(Date.now() - started < 1000)
})

test('with no key, the act goes to review without a request', async () => {
  const fetch = fakeFetch(noul(0.99))
  const d = await run({ mission, act: acts.calendar }, fetch, { env: { OPENROUTER_KEY_FILE: '/nonexistent/parley/key' } })
  assert.deepEqual([d.decision, d.rule, d.reason], ['REVIEW', 'jev_unavailable', 'No rule settles this act, and Jev gave no answer: no OpenRouter key.'])
  assert.equal(fetch.calls.length, 0)
})

test('an act the rules settle never reaches Jev', async () => {
  const fetch = fakeFetch(noul(0.99))
  const expired = await run({ mission, act: acts.calendar }, fetch, { now: Date.parse(blob.expires_at) })
  assert.deepEqual([expired.decision, expired.rule], ['DENY', 'mission_expired'])
  const before = await run({ mission, act: acts.address, log: [entry(acts.address, 'DENY')] }, fetch)
  assert.deepEqual([before.decision, before.rule], ['DENY', 'decided_before'])
  assert.equal(fetch.calls.length, 0)
})

test('with Jev off, what the rules leave open goes to review', async () => {
  const fetch = fakeFetch(noul(0.99))
  const d = await run({ mission, act: acts.calendar }, fetch, { jev: false })
  assert.deepEqual([d.decision, d.by, d.rule], ['REVIEW', 'rule', 'rules_only'])
  assert.equal(fetch.calls.length, 0)
})

test('Jev sees the approved mission and the act, and nothing else from the act or the record', async () => {
  const fetch = fakeFetch(noul(0.97))
  const m = record(blob, { description: 'PROPOSED TEXT', code: 'ABCDE-FGHJK' })
  const act = { ...acts.calendar, content: 'ALICE-PRIVATE-CALENDAR', disclosed: ['Tuesday 10:00'], presented_token: 'eyJ.TOKEN' }
  await run({ mission: m, act }, fetch)
  assert.equal(fetch.calls[0].body.state, [
    'Mission approved by the person:',
    blob.description,
    '',
    'Approved resources: https://alice.aauth.test',
    '',
    'Act: the agent asks for access to https://alice.aauth.test with scope item:calendar.',
    '',
    'Justification, written by the agent and not verified:',
    'Find a free 30-minute slot next week for the meeting.',
  ].join('\n'))
  const sent = JSON.stringify(fetch.calls[0].body)
  for (const kept of ['PROPOSED TEXT', 'ABCDE-FGHJK', 'ALICE-PRIVATE-CALENDAR', 'Tuesday 10:00', 'eyJ.TOKEN', TEST_KEY]) {
    assert.ok(!sent.includes(kept), kept)
  }
})

test('accepted updates and approved tools are part of the mission Jev sees', () => {
  const b = { ...blob, approved_tools: [{ name: 'CalendarInvite', description: 'Send an invite' }] }
  const state = jevState(b, { updates: ['Alice prefers mornings.', { description: 'Meet at the venue.' }, ''] }, acts.phone)
  assert.equal(state, [
    'Mission approved by the person:', blob.description, '',
    'Accepted updates to the mission:', '- Alice prefers mornings.', '- Meet at the venue.', '',
    'Approved tools: CalendarInvite', 'Approved resources: https://alice.aauth.test', '',
    'Act: the agent asks for access to https://alice.aauth.test with scope item:phone.',
  ].join('\n'))
})

test('a permission request shows Jev the action and parameter names, not their values', () => {
  const act = {
    type: 'permission_request', agent: AGENT, action: 'SendEmail', description: 'Send Alice the invite.',
    parameters: { to: 'alice@example.com', subject: 'Coffee?' },
  }
  const state = jevState(blob, mission, act)
  assert.ok(state.endsWith([
    'Act: the agent asks permission to run SendEmail.', 'Parameter names: to, subject', '',
    'Description, written by the agent and not verified:', 'Send Alice the invite.',
  ].join('\n')))
  assert.ok(!state.includes('alice@example.com'))
  assert.ok(!state.includes('Coffee?'))
})

test('decide() never throws: a failure inside goes to review', async () => {
  const act = { get type() { throw new Error('boom') } }
  assert.deepEqual(await run({ mission, act }, fakeFetch(noul(0.99))), {
    decision: 'REVIEW', by: 'rule', rule: 'supervisor_error', p: null, model: null, reason: 'The supervisor failed (Error).',
  })
  assert.equal((await decide()).rule, 'no_mission')
})
