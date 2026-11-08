import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actKey, applyRules, DENIALS_BEFORE_REVIEW, MAX_AGENT_TEXT, missionBlob } from '../rules.mjs'
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
  assert.equal(rule({ mission, act: { kind: 'token', agent: AGENT, resource: RESOURCE } }), 'unknown_act')
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
  assert.equal(actKey(tokenRequest('item:a item:b')), actKey(tokenRequest('item:b  item:a')))
  assert.equal(actKey({ ...acts.calendar, resource: `${RESOURCE}/` }), actKey(acts.calendar))
  assert.notEqual(actKey(acts.calendar), actKey(acts.address))
  const d = decide({ mission, act: { ...acts.calendar, resource: `${RESOURCE}/` }, log: [entry(acts.calendar, 'ALLOW')] })
  assert.equal(d.rule, 'decided_before')
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
