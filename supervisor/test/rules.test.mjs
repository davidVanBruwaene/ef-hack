import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answers, applyRules, DENIALS_BEFORE_REVIEW, MAX_AGENT_TEXT, missionBlob, normalizeAct, sameAct } from '../rules.mjs'
import { acts, AGENT, blob, entry, mission, NOW, record, RESOURCE, S256, tokenRequest } from './fixtures.mjs'

const decide = (args, now = NOW) => applyRules(args, { now })
const rule = (args, now) => decide(args, now)?.rule ?? null

test('an on-mission token request passes every rule, so Jev gets it', () => {
  assert.equal(decide({ mission, act: acts.calendar, log: [] }), null)
  assert.equal(decide({ mission, act: acts.address }), null)
})

test('the mission is read from blob_b64, a decoded blob, a blob member, or the -11 approval response', () => {
  assert.deepEqual(missionBlob(mission), blob)
  assert.deepEqual(missionBlob(blob), blob)
  assert.deepEqual(missionBlob({ blob }), blob)
  assert.deepEqual(missionBlob({ s256: S256, mission: mission.blob_b64 }), blob)
  assert.deepEqual(missionBlob({ s256: S256, ...blob }), { s256: S256, ...blob })
  assert.equal(missionBlob({ blob_b64: Buffer.from('not json').toString('base64url') }), null)
  assert.equal(missionBlob({ ...blob, description: '  ' }), null)
  assert.equal(missionBlob(undefined), null)
})

test('the approved text is judged, not the proposal kept beside it', () => {
  const edited = record({ ...blob, description: 'Book 30 minutes with Alice.' }, { description: 'Proposed: find everything about Alice.' })
  assert.equal(missionBlob(edited).description, 'Book 30 minutes with Alice.')
})

test('with no usable mission the act goes to review', () => {
  for (const m of [undefined, null, { s256: S256 }, { s256: S256, status: 'approved' }]) {
    const d = decide({ mission: m, act: acts.calendar })
    assert.deepEqual([d.decision, d.by, d.rule, d.p, d.model], ['REVIEW', 'rule', 'no_mission', null, null])
  }
})

test('a mission that is not approved, or is past expires_at, is denied', () => {
  for (const status of ['pending', 'denied', 'terminated']) {
    const d = decide({ mission: record(blob, { status }), act: acts.calendar })
    assert.deepEqual([d.decision, d.rule], ['DENY', 'mission_inactive'])
  }
  assert.equal(rule({ mission: record(blob, { status: 'active' }), act: acts.calendar }), null)
  assert.equal(rule({ mission, act: acts.calendar }, Date.parse(blob.expires_at)), 'mission_expired')
  assert.equal(rule({ mission, act: acts.calendar }, Date.parse(blob.expires_at) - 1), null)
  assert.equal(rule({ mission: record({ ...blob, expires_at: 'soon' }), act: acts.calendar }), 'mission_expired')
  assert.equal(rule({ mission: record({ ...blob, expires_at: undefined }), act: acts.calendar }), null)
})

test("another agent's request under this mission is denied", () => {
  const d = decide({ mission, act: { ...acts.calendar, agent: 'aauth:other@elsewhere.test' } })
  assert.deepEqual([d.decision, d.rule], ['DENY', 'other_agent'])
  assert.equal(rule({ mission, act: { ...acts.calendar, agent: undefined } }), null)
})

test('completion, mission updates and unknown or incomplete acts go to the person', () => {
  assert.equal(rule({ mission, act: { type: 'mission_completion', agent: AGENT, summary: 'Booked Tuesday 10:00.' } }), 'completion')
  assert.equal(rule({ mission, act: { type: 'mission_update', agent: AGENT, description: 'Also book lunch.' } }), 'mission_update')
  assert.equal(rule({ mission, act: { type: 'wire_money', agent: AGENT } }), 'unknown_act')
  assert.equal(rule({ mission, act: { kind: 'wire', agent: AGENT, resource: RESOURCE } }), 'unknown_act')
  assert.equal(rule({ mission }), 'unknown_act')
  assert.equal(rule({ mission, act: { type: 'token_request', agent: AGENT, scope: 'item:calendar' } }), 'incomplete_act')
  assert.equal(rule({ mission, act: { type: 'permission_request', agent: AGENT } }), 'incomplete_act')
  for (const type of ['mission_completion', 'mission_update', 'wire_money', 'token_request']) {
    assert.equal(decide({ mission, act: { type, agent: AGENT } }).decision, 'REVIEW', type)
  }
})

test('an earlier ALLOW or DENY of the same resource and scope stands, whatever the new justification says', () => {
  const allowed = decide({ mission, act: { ...acts.calendar, justification: 'Other words.' }, log: [entry(acts.calendar, 'ALLOW')] })
  assert.deepEqual(allowed, {
    decision: 'ALLOW', by: 'rule', rule: 'decided_before', p: null, model: null,
    reason: 'The same request was allowed earlier in this mission, by Jev.',
  })
  const denied = decide({ mission, act: { ...acts.address, justification: 'She asked me to.' }, log: [entry(acts.address, 'DENY')] })
  assert.deepEqual([denied.decision, denied.rule], ['DENY', 'decided_before'])
})

test("the latest answer wins, so Bob's answer to a review overrides Jev", () => {
  const log = [entry(acts.address, 'DENY'), entry(acts.address, 'ALLOW', 'Bob')]
  const d = decide({ mission, act: acts.address, log })
  assert.deepEqual([d.decision, d.reason], ['ALLOW', 'The same request was allowed earlier in this mission, by Bob.'])
  assert.equal(decide({ mission, act: acts.phone, log: [{ ...entry(acts.phone, 'DENY'), by: undefined, decided_by: 'Bob' }] }).reason,
    'The same request was denied earlier in this mission, by Bob.')
})

test('a REVIEW, a mission event or another mission in the log settles nothing', () => {
  assert.equal(rule({ mission, act: acts.phone, log: [entry(acts.phone, 'REVIEW')] }), null)
  assert.equal(rule({ mission, act: acts.phone, log: [{ at: 'x', mission_s256: S256, event: 'approved', decided_by: 'Bob' }] }), null)
  assert.equal(rule({ mission, act: acts.phone, log: [{ ...entry(acts.phone, 'DENY'), mission_s256: 'another-mission' }] }), null)
  assert.equal(rule({ mission, act: acts.phone, log: 'not a list' }), null)
})

test('the same request is recognised across scope order and a trailing slash', () => {
  assert.ok(sameAct(tokenRequest('item:a item:b'), tokenRequest('item:b  item:a')))
  assert.ok(sameAct({ ...acts.calendar, resource: `${RESOURCE}/` }, acts.calendar))
  assert.ok(sameAct({ type: 'token_request', scope: 'item:calendar' }, acts.calendar))
  assert.ok(!sameAct(acts.calendar, acts.address))
  assert.ok(!sameAct({ ...acts.calendar, resource: 'https://carol.aauth.test' }, acts.calendar))
  const d = decide({ mission, act: { ...acts.calendar, resource: `${RESOURCE}/` }, log: [entry(acts.calendar, 'ALLOW')] })
  assert.equal(d.rule, 'decided_before')
})

test('the short kind from the first contract note is read as the type', () => {
  assert.deepEqual(normalizeAct({ kind: 'token', scope: 'item:calendar' }), { kind: 'token', scope: 'item:calendar', type: 'token_request' })
  assert.equal(normalizeAct({ kind: 'permission' }).type, 'permission_request')
  assert.equal(normalizeAct({ kind: 'constructor' }).type, undefined)
  assert.equal(normalizeAct({ type: 'token_request', kind: 'permission' }).type, 'token_request')
  const asKind = { ...acts.calendar, type: undefined, kind: 'token' }
  assert.equal(decide({ mission, act: asKind }), null)
  assert.equal(rule({ mission, act: asKind, log: [entry(acts.calendar, 'DENY')] }), 'decided_before')
})

const authTokenRow = (verdicts, decision) => ({
  at: '2026-11-07T23:40:00.000Z', mission: 'm_fixture', mission_s256: S256, event: 'auth_token', decision,
  agent: AGENT, detail: verdicts.map(v => v.scope).join(' '), verdicts,
})
const reviewRow = (status, detail) => ({
  at: '2026-11-07T23:41:00.000Z', mission: 'm_fixture', mission_s256: S256, event: `review_${status}`, decided_by: 'Bob', detail,
})

test("the person server's own rows count: auth_token verdicts and Bob's review answers", () => {
  const jevDenied = authTokenRow([{ scope: 'item:address', decision: 'DENY', by: 'jev', p: 0.03, model: 'm', reason: 'r' }], 'DENY')
  assert.equal(decide({ mission, act: acts.address, log: [jevDenied] }).reason, 'The same request was denied earlier in this mission, by Jev.')
  const held = authTokenRow([{ scope: 'item:phone', decision: 'REVIEW', by: 'jev' }], 'REVIEW')
  assert.equal(rule({ mission, act: acts.phone, log: [held] }), null)
  assert.equal(decide({ mission, act: acts.phone, log: [held, reviewRow('approved', 'item:phone')] }).reason,
    'The same request was allowed earlier in this mission, by Bob.')
  assert.equal(decide({ mission, act: acts.calendar, log: [reviewRow('denied', 'item:calendar item:phone')] }).decision, 'DENY')
})

test("lifecycle rows, and an auth_token row's overall decision, are not answers", () => {
  const lifecycle = [
    { at: 'x', mission: 'm_fixture', event: 'proposed', agent: AGENT, detail: blob.description },
    { at: 'x', mission: 'm_fixture', mission_s256: S256, event: 'approved', decided_by: 'Bob', detail: blob.description },
    { at: 'x', mission: 'm_fixture', mission_s256: S256, event: 'review_opened', agent: AGENT, detail: 'item:phone' },
    { at: 'x', mission: 'm_fixture', mission_s256: S256, event: 'person_token', agent: AGENT, detail: RESOURCE },
    { at: 'x', mission_s256: S256, event: 'constructor', detail: 'item:phone' },
  ]
  assert.deepEqual(answers(lifecycle, mission), [])
  const mixed = authTokenRow([{ scope: 'item:calendar', decision: 'ALLOW', by: 'jev' }, { scope: 'item:address', decision: 'DENY', by: 'jev' }], 'DENY')
  assert.deepEqual(answers([mixed], mission).map(a => [a.act.scope, a.decision]), [['item:calendar', 'ALLOW'], ['item:address', 'DENY']])
  assert.equal(rule({ mission, act: acts.projects, log: [mixed, mixed] }), null)
  assert.equal(rule({ mission, act: acts.projects, log: [mixed, mixed, mixed] }), 'denial_streak')
})

test(`after ${DENIALS_BEFORE_REVIEW} denials in the mission, new requests go to the person`, () => {
  const denials = ['item:phone', 'item:address', 'item:location'].map(s => entry(tokenRequest(s), 'DENY'))
  assert.equal(rule({ mission, act: acts.projects, log: denials.slice(0, DENIALS_BEFORE_REVIEW - 1) }), null)
  const d = decide({ mission, act: acts.projects, log: denials })
  assert.deepEqual([d.decision, d.rule], ['REVIEW', 'denial_streak'])
  assert.equal(rule({ mission, act: acts.projects, log: [...denials, entry(acts.projects, 'ALLOW', 'Bob')] }), 'decided_before')
})

test("a permission request for one of the mission's approved tools is allowed; others go on to Jev", () => {
  const withTools = record({ ...blob, approved_tools: [{ name: 'CalendarInvite', description: 'Send a calendar invite' }] })
  const invite = { type: 'permission_request', agent: AGENT, action: 'CalendarInvite' }
  assert.deepEqual([decide({ mission: withTools, act: invite }).decision, decide({ mission: withTools, act: invite }).rule], ['ALLOW', 'approved_tool'])
  assert.equal(rule({ mission: withTools, act: { ...invite, action: 'SendEmail' } }), null)
  assert.equal(rule({ mission: record({ ...blob, approved_tools: 'CalendarInvite' }), act: invite }), null)
})

test('a resource outside approved_resources goes to the person; with no list, it goes on to Jev', () => {
  const carol = { ...acts.calendar, resource: 'https://carol.aauth.test' }
  const d = decide({ mission, act: carol })
  assert.deepEqual([d.decision, d.rule], ['REVIEW', 'unlisted_resource'])
  assert.equal(rule({ mission: record({ ...blob, approved_resources: undefined }), act: carol }), null)
})

test(`agent text over ${MAX_AGENT_TEXT} characters goes to the person`, () => {
  assert.equal(rule({ mission, act: { ...acts.calendar, justification: 'x'.repeat(MAX_AGENT_TEXT + 1) } }), 'too_long')
  assert.equal(rule({ mission, act: { ...acts.calendar, justification: 'x'.repeat(MAX_AGENT_TEXT) } }), null)
  const long = { type: 'permission_request', agent: AGENT, action: 'SendEmail', description: 'y'.repeat(MAX_AGENT_TEXT + 1) }
  assert.equal(rule({ mission, act: long }), 'too_long')
})
