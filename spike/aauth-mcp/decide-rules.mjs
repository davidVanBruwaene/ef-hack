// Rules-only stand-in for supervisor/decide.mjs, with its contract and rule names; bob.mjs uses it until that lands on main.
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "personal-site" matches "personal site" in the mission text, on word boundaries.
const mentions = (text, id) =>
  new RegExp(`\\b${id.split(/[-_]+/).filter(Boolean).map(escape).join('[\\s_-]+')}\\b`, 'i').test(text ?? '')

const blobOf = mission => (mission.blob_b64 ? JSON.parse(Buffer.from(mission.blob_b64, 'base64url').toString('utf8')) : mission)
const verdict = (decision, rule, reason) => ({ decision, by: 'rule', rule, p: null, model: null, reason })

// decide({mission, act, log}) → {decision: ALLOW|REVIEW|DENY, by, rule, p, model, reason}. It never throws.
export async function decide({ mission, act, log = [] }) {
  try {
    const earlier = log.filter(e => e.mission_s256 === mission.s256 && e.act?.resource === act.resource
      && e.act?.scope === act.scope && (e.decision === 'ALLOW' || e.decision === 'DENY')).at(-1)
    if (earlier) {
      return verdict(earlier.decision, 'decided_before', `${earlier.by === 'Bob' ? 'Bob' : 'the supervisor'} ${earlier.decision === 'ALLOW' ? 'allowed' : 'denied'} this earlier in the mission`)
    }
    const id = act.scope?.match(/^item:(.+)$/)?.[1]
    if (id && mentions(blobOf(mission).description, id)) return verdict('ALLOW', 'mission_mentions_item', `the mission mentions ${id}`)
    return verdict('REVIEW', 'no_rule', `no rule covers ${id ?? act.scope}`)
  } catch (err) {
    return verdict('REVIEW', 'supervisor_failed', `the rules failed (${err.message})`)
  }
}
