// Bob's supervisor (AAuth -11 §4.3, §4.4): judges one act against its mission, with rules first and then one question to Jev.
import { askJev } from './jev.mjs'
import { applyRules, list, missionBlob, ruled } from './rules.mjs'

export { actKey } from './rules.mjs'
export const QUESTION = 'Is this act consistent with the mission?'
export const ALLOW_AT = 0.9
export const DENY_AT = 0.1

export async function decide({ mission, act, log = [] } = {}, opts = {}) {
  try {
    const settled = applyRules({ mission, act, log }, { now: opts.now ?? Date.now() })
    if (settled) return settled
    if (opts.jev === false) return ruled('REVIEW', 'rules_only', 'No rule settles this act, and Jev is off.')
    const answer = await askJev(jevState(missionBlob(mission), mission, act), QUESTION, opts)
    if (answer.error) {
      return { ...ruled('REVIEW', 'jev_unavailable', `No rule settles this act, and Jev gave no answer: ${answer.error}.`), model: answer.model ?? null }
    }
    return fromJev(answer)
  } catch (err) {
    return ruled('REVIEW', 'supervisor_error', `The supervisor failed (${err?.name ?? 'Error'}).`)
  }
}

function fromJev({ p, model }) {
  const at = `p ${p.toFixed(2)}`
  const jev = (decision, reason) => ({ decision, by: 'jev', rule: null, p, model, reason })
  if (p >= ALLOW_AT) return jev('ALLOW', `Jev: consistent with the mission (${at}).`)
  if (p <= DENY_AT) return jev('DENY', `Jev: not consistent with the mission (${at}).`)
  return jev('REVIEW', `Jev is unsure the act fits the mission (${at}).`)
}

const agentText = (label, text) => (typeof text === 'string' && text.trim() ? [`${label}, written by the agent and not verified:\n${text.trim()}`] : [])

function describeAct(act) {
  if (act.type === 'permission_request') {
    const names = act.parameters && typeof act.parameters === 'object' ? Object.keys(act.parameters) : []
    const asked = `Act: the agent asks permission to run ${act.action}.${names.length ? `\nParameter names: ${names.join(', ')}` : ''}`
    return [asked, ...agentText('Description', act.description)]
  }
  return [`Act: the agent asks for access to ${act.resource} with scope ${act.scope || '(none)'}.`, ...agentText('Justification', act.justification)]
}

// Only the fields named here reach Jev; parameter values and anything else on the act stay at the person server.
export function jevState(blob, mission, act) {
  const sections = [`Mission approved by the person:\n${blob.description.trim()}`]
  const updates = list(mission?.updates).map(u => (typeof u === 'string' ? u : u?.description)).filter(u => typeof u === 'string' && u.trim())
  if (updates.length) sections.push(`Accepted updates to the mission:\n${updates.map(u => `- ${u.trim()}`).join('\n')}`)
  const tools = list(blob.approved_tools).map(t => t?.name).filter(Boolean)
  const resources = list(blob.approved_resources).filter(r => typeof r === 'string')
  const approved = [tools.length && `Approved tools: ${tools.join(', ')}`, resources.length && `Approved resources: ${resources.join(', ')}`].filter(Boolean)
  if (approved.length) sections.push(approved.join('\n'))
  sections.push(...describeAct(act))
  return sections.join('\n\n')
}
