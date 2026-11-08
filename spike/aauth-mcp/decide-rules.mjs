// Rules-only stand-in for the supervisor lane's decide(), with the same contract; bob.mjs uses it until supervisor/ lands.
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "personal-site" matches "personal site" in the mission text, on word boundaries.
const mentions = (text, id) =>
  new RegExp(`\\b${id.split(/[-_]+/).filter(Boolean).map(escape).join('[\\s_-]+')}\\b`, 'i').test(text ?? '')

// decide({mission, act, log}) → {decision: ALLOW|REVIEW|DENY, by: rule|jev, p, model, reason}, once per scope not yet allowed.
export async function decide({ mission, act }) {
  const id = act.scope.match(/^item:(.+)$/)?.[1]
  if (id && mentions(mission.description, id)) {
    return { decision: 'ALLOW', by: 'rule', p: null, model: null, reason: `the mission mentions ${id}` }
  }
  return { decision: 'REVIEW', by: 'rule', p: null, model: null, reason: `no rule covers ${id ?? act.scope}` }
}
