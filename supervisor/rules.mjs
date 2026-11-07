// Fixed rules the supervisor applies before Jev, in order; the first that matches decides.
export const DENIALS_BEFORE_REVIEW = 3
export const MAX_AGENT_TEXT = 2000

const ACTIVE = new Set(['approved', 'active'])
const JUDGED = new Set(['token_request', 'permission_request'])

export const ruled = (decision, rule, reason) => ({ decision, by: 'rule', rule, p: null, model: null, reason })

export const list = v => (Array.isArray(v) ? v : [])
const origin = u => {
  try {
    return new URL(u).origin
  } catch {
    return String(u ?? '')
  }
}
const scopes = s => (typeof s === 'string' ? s.split(/\s+/).filter(Boolean).sort() : [])
const who = by => (by === 'jev' ? 'Jev' : by === 'rule' ? 'a rule' : by || 'the person')

// Takes the decoded blob (-11 §8.2), a record holding it as blob or blob_b64, or the approval response's base64url mission.
export function missionBlob(mission) {
  if (!mission || typeof mission !== 'object') return null
  let blob = mission.blob
  const encoded = mission.blob_b64 ?? (typeof mission.mission === 'string' ? mission.mission : undefined)
  if (!blob && encoded) {
    try {
      blob = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    } catch {
      return null
    }
  }
  blob ??= mission
  return typeof blob?.description === 'string' && blob.description.trim() ? blob : null
}

export function actKey(act) {
  if (act?.type === 'permission_request') return `permission_request ${act.action}`
  return `${act?.type} ${origin(act?.resource)} ${scopes(act?.scope).join(' ')}`
}

const RULES = [
  ({ blob }) => !blob && ruled('REVIEW', 'no_mission', 'There is no approved mission to judge this act against.'),
  ({ mission }) =>
    mission.status !== undefined && !ACTIVE.has(mission.status) &&
    ruled('DENY', 'mission_inactive', `The mission is ${mission.status}, not active.`),
  ({ blob, now }) =>
    blob.expires_at !== undefined && !(Date.parse(blob.expires_at) > now) &&
    ruled('DENY', 'mission_expired', `The mission expired at ${blob.expires_at}.`),
  ({ blob, act }) =>
    act.agent && blob.agent && act.agent !== blob.agent &&
    ruled('DENY', 'other_agent', `The mission belongs to ${blob.agent}, not ${act.agent}.`),
  ({ act }) => act.type === 'mission_completion' && ruled('REVIEW', 'completion', 'Only the person can accept that the mission is complete.'),
  ({ act }) => act.type === 'mission_update' && ruled('REVIEW', 'mission_update', 'The person reviews every change to the mission.'),
  ({ act }) => !JUDGED.has(act.type) && ruled('REVIEW', 'unknown_act', `Unknown act type ${JSON.stringify(act.type ?? null)}.`),
  ({ act }) =>
    !(act.type === 'token_request' ? act.resource : act.action) &&
    ruled('REVIEW', 'incomplete_act', 'The act names no resource or action.'),
  ({ act, log }) => {
    const key = actKey(act)
    const e = log.findLast(x => x.act && (x.decision === 'ALLOW' || x.decision === 'DENY') && actKey(x.act) === key)
    const verb = e?.decision === 'ALLOW' ? 'allowed' : 'denied'
    return e && ruled(e.decision, 'decided_before', `The same request was ${verb} earlier in this mission, by ${who(e.by ?? e.decided_by)}.`)
  },
  ({ log }) => {
    const n = log.filter(e => e.decision === 'DENY').length
    return n >= DENIALS_BEFORE_REVIEW && ruled('REVIEW', 'denial_streak', `${n} requests were denied in this mission, so new ones go to the person.`)
  },
  ({ blob, act }) =>
    act.type === 'permission_request' && list(blob.approved_tools).some(t => t?.name === act.action) &&
    ruled('ALLOW', 'approved_tool', `${act.action} is one of the mission's approved tools.`),
  ({ blob, act }) => {
    const approved = list(blob.approved_resources)
    return act.type === 'token_request' && approved.length > 0 && !approved.some(r => origin(r) === origin(act.resource)) &&
      ruled('REVIEW', 'unlisted_resource', `${act.resource} is not among the mission's approved resources.`)
  },
  ({ act }) => {
    const text = act.type === 'token_request' ? act.justification : act.description
    return typeof text === 'string' && text.length > MAX_AGENT_TEXT &&
      ruled('REVIEW', 'too_long', `The agent's text runs over ${MAX_AGENT_TEXT} characters.`)
  },
]

const inMission = (log, mission) =>
  list(log).filter(e => e && typeof e === 'object' && (!e.mission_s256 || !mission?.s256 || e.mission_s256 === mission.s256))

// A decision when a rule settles the act, else null.
export function applyRules({ mission, act, log } = {}, { now = Date.now() } = {}) {
  const ctx = { mission, act: act && typeof act === 'object' ? act : {}, blob: missionBlob(mission), log: inMission(log, mission), now }
  for (const rule of RULES) {
    const d = rule(ctx)
    if (d) return d
  }
  return null
}
