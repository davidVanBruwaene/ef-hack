// The person server's state: the missions agents proposed, the member each mission and agent belongs to, requests held for review, the answers, and the mission log.
import { randomBytes } from 'node:crypto'
import { bearerToken, jsonFile, now, randomId, sha256 } from './store.mjs'

export { tokenMatches } from './store.mjs'

// Bearer token for the person server's /api, which the console server calls for the member signed in: BOB_CONSOLE_TOKEN, or one generated into .keys/bob-console-token.
export const consoleToken = () => bearerToken('BOB_CONSOLE_TOKEN', 'bob-console-token')

const MISSION_HOURS = 24
// A proposal or held request waits this long for its member, as long as @aauth/agent polls by default.
const PENDING_MINUTES = 15

// -11 §11.6.3.1: Crockford base32, ten symbols (50 bits), shown in two groups of five.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const newCode = () => {
  const c = Array.from(randomBytes(10), b => CROCKFORD[b & 31]).join('')
  return `${c.slice(0, 5)}-${c.slice(5)}`
}
// A code as typed, reduced to its value: no hyphens or spaces, upper case, I and L read as 1, O as 0.
export const codeValue = s => String(s ?? '').replace(/[\s-]/g, '').toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0')

const later = minutes => new Date(Date.now() + minutes * 60_000).toISOString()
const isFuture = iso => Date.parse(iso) > Date.now()

export function openBobState() {
  const file = jsonFile('bob-state.json')
  const saved = file.load()
  const s = {
    missions: saved.missions ?? [], reviews: saved.reviews ?? [], log: saved.log ?? [],
    agents: saved.agents ?? {}, subjects: saved.subjects ?? {},
  }
  let rev = 0
  const listeners = new Set()
  function changed() {
    file.save(s)
    rev++
    for (const l of listeners) l(rev)
  }
  const log = entry => s.log.push({ at: now(), ...entry })
  const all = () => [...s.missions, ...s.reviews]
  const isOpen = x => x.status === 'pending' && isFuture(x.pending_until)
  // Answering by any channel uses up the code, so it cannot be presented again (§11.6.3.1).
  const settle = x => { x.decided_at = now(); x.code_used_at ??= x.decided_at }

  return {
    rev: () => rev,
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    mission: id => s.missions.find(m => m.id === id),
    review: id => s.reviews.find(r => r.id === id),
    byCode: input => { const v = codeValue(input); return (v && all().find(x => codeValue(x.code) === v)) || undefined },
    byS256: s256 => (s256 && s.missions.find(m => m.s256 === s256)) || undefined,
    blob: m => (m?.blob_b64 ? JSON.parse(Buffer.from(m.blob_b64, 'base64url').toString('utf8')) : undefined),
    // The member an agent was bound to when its first mission was approved.
    ownerOf: agent => s.agents[agent],
    // The member each pairwise sub stands for at each resource, so a resource this server trusts can ask.
    subject: (aud, sub) => s.subjects[`${aud} ${sub}`],
    isOpen,
    expired: m => Date.parse(m.expires_at) <= Date.now(),
    // The log decide() reads: its decisions and the member's answers for this mission, oldest first.
    missionLog: s256 => s.log.filter(e => e.mission_s256 === s256 && e.act),

    useCode(x) { x.code_used_at = now(); changed() },

    // Binds an unbound agent to a member up front, as when the member connects it; an agent bound to another member stays theirs.
    bind(agent, member) {
      const owner = s.agents[agent]
      if (owner) return owner.id === member.id ? owner : null
      s.agents[agent] = { id: member.id, name: member.name, bound_at: now() }
      log({ event: 'agent_bound', agent, decided_by: member.name })
      changed()
      return s.agents[agent]
    },

    propose({ agent, description, tools, resources }) {
      const m = {
        id: randomId('m'), code: newCode(), agent, description, tools, resources,
        status: 'pending', created_at: now(), pending_until: later(PENDING_MINUTES),
      }
      s.missions.push(m)
      log({ mission: m.id, event: 'proposed', agent, detail: description })
      changed()
      return m
    },

    // The blob's exact bytes are kept, so s256 can be recomputed; supervisor: 'rules' keeps the mission away from Jev.
    decide(id, decision, editedDescription, { supervisor, member } = {}) {
      const m = s.missions.find(x => x.id === id)
      if (!m || !isOpen(m)) return m
      settle(m)
      m.person = { id: member.id, name: member.name }
      if (decision === 'approve') {
        s.agents[m.agent] ??= { ...m.person, bound_at: now() }
        if (supervisor === 'rules') m.supervisor = 'rules'
        const approvedAt = new Date()
        const blob = {
          agent: m.agent,
          person: m.person.name,
          approved_at: approvedAt.toISOString(),
          expires_at: new Date(approvedAt.getTime() + MISSION_HOURS * 3600_000).toISOString(),
          description: editedDescription?.trim() || m.description,
          ...(m.tools?.length ? { approved_tools: m.tools } : {}),
          ...(m.resources?.length ? { approved_resources: m.resources } : {}),
        }
        const bytes = Buffer.from(JSON.stringify(blob), 'utf8')
        Object.assign(m, {
          status: 'approved', blob_b64: bytes.toString('base64url'), s256: sha256(bytes),
          approved_at: blob.approved_at, expires_at: blob.expires_at, approved_description: blob.description,
        })
      } else {
        m.status = 'denied'
      }
      log({ mission: m.id, mission_s256: m.s256, event: m.status, decided_by: m.person.name, detail: m.approved_description ?? '' })
      changed()
      return m
    },

    record(entry) { log(entry); changed() },

    noteSubject(aud, sub, person) {
      const key = `${aud} ${sub}`
      if (s.subjects[key]?.id === person.id) return
      s.subjects[key] = { id: person.id, name: person.name }
      changed()
    },

    openReview({ mission, agent, resource, scopes, acts, justification, verdicts }) {
      const r = {
        id: randomId('rv'), code: newCode(), mission: mission.id, mission_s256: mission.s256, agent, resource, scopes, acts, justification, verdicts,
        status: 'pending', created_at: now(), pending_until: later(PENDING_MINUTES),
      }
      s.reviews.push(r)
      log({ mission: mission.id, mission_s256: mission.s256, event: 'review_opened', agent, detail: scopes.join(' ') })
      changed()
      return r
    },

    decideReview(id, decision, member) {
      const r = s.reviews.find(x => x.id === id)
      if (!r || !isOpen(r)) return r
      settle(r)
      r.decided_by = member.name
      r.status = decision === 'approve' ? 'approved' : 'denied'
      for (const act of r.acts ?? []) {
        log({ mission: r.mission, mission_s256: r.mission_s256, event: 'review_answered', act, decision: r.status === 'approved' ? 'ALLOW' : 'DENY', by: member.name })
      }
      changed()
      return r
    },

    // One member's missions and held requests, including proposals from agents bound to them; everything when no member is named.
    view(member) {
      const mine = m => !member || m.person?.id === member || (!m.person && s.agents[m.agent]?.id === member)
      const missions = s.missions.filter(mine)
      const ids = new Set(missions.map(m => m.id))
      return {
        missions: [...missions].reverse(),
        reviews: s.reviews.filter(r => ids.has(r.mission)).reverse(),
        log: s.log.filter(e => !member || ids.has(e.mission)).reverse(),
      }
    },
  }
}
