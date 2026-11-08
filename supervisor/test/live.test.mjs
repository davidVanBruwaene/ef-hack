// Asks the real Jev through OpenRouter, with the key from the environment or the key file. Skipped unless JEV_LIVE=1.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decide } from '../decide.mjs'
import { acts, mission, NOW } from './fixtures.mjs'

const skip = process.env.JEV_LIVE !== '1' && 'set JEV_LIVE=1 to call Jev'

test("live: Jev judges Alice's items against Bob's mission", { skip }, async t => {
  const p = {}
  for (const name of ['calendar', 'projects', 'phone', 'address']) {
    const d = await decide({ mission, act: acts[name], log: [] }, { now: NOW })
    t.diagnostic(`${acts[name].scope}: ${d.decision} by ${d.by}, p ${d.p}, model ${d.model}`)
    assert.equal(d.by, 'jev', d.reason)
    assert.match(d.model, /\S/)
    p[name] = d.p
  }
  assert.ok(p.calendar > p.address, 'the calendar should score above the home address')
})
