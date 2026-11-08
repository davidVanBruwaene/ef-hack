// Bob's state at his person server: the missions his agent proposed, the requests held for his review, his answers, the mission log, and his paired phones.
import { randomBytes } from 'node:crypto'
import { bearerToken, jsonFile, now, randomId, sha256 } from './store.mjs'

export { tokenMatches } from './store.mjs'

// Bearer token for Bob's /api: BOB_CONSOLE_TOKEN, or one generated into .keys/bob-console-token.
export const consoleToken = () => bearerToken('BOB_CONSOLE_TOKEN', 'bob-console-token')

const MISSION_HOURS = 24
// A proposal or held request waits this long for Bob, as long as @aauth/agent polls by default.
const PENDING_MINUTES = 15
const PAIR_MINUTES = 10
const SESSION_DAYS = 7

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
    pairings: saved.pairings ?? [], sessions: saved.sessions ?? [],
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
    isOpen,
    expired: m => Date.parse(m.expires_at) <= Date.now(),
    // The log decide() reads: its decisions and Bob's answers for this mission, oldest first.
    missionLog: s256 => s.log.filter(e => e.mission_s256 === s256 && e.act),
    open: () => all().filter(isOpen).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    active: () => s.missions.filter(m => m.status === 'approved' && isFuture(m.expires_at)).reverse(),

    useCode(x) { x.code_used_at = now(); changed() },

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
    decide(id, decision, editedDescription, { supervisor } = {}) {
      const m = s.missions.find(x => x.id === id)
      if (!m || !isOpen(m)) return m
      settle(m)
      if (decision === 'approve') {
        if (supervisor === 'rules') m.supervisor = 'rules'
        const approvedAt = new Date()
        const blob = {
          agent: m.agent,
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
      log({ mission: m.id, mission_s256: m.s256, event: m.status, decided_by: 'Bob', detail: m.approved_description ?? '' })
      changed()
      return m
    },

    record(entry) { log(entry); changed() },

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

    decideReview(id, decision) {
      const r = s.reviews.find(x => x.id === id)
      if (!r || !isOpen(r)) return r
      settle(r)
      r.status = decision === 'approve' ? 'approved' : 'denied'
      for (const act of r.acts ?? []) {
        log({ mission: r.mission, mission_s256: r.mission_s256, event: 'review_answered', act, decision: r.status === 'approved' ? 'ALLOW' : 'DENY', by: 'Bob' })
      }
      changed()
      return r
    },

    // A one-time link that signs a browser in as Bob; only its hash is kept.
    newPairing() {
      const code = newCode()
      const p = { hash: sha256(codeValue(code)), expires_at: later(PAIR_MINUTES) }
      s.pairings = [...s.pairings.filter(x => !x.used_at && isFuture(x.expires_at)), p]
      changed()
      return { code, expires_at: p.expires_at }
    },

    pair(input, label) {
      const p = s.pairings.find(x => x.hash === sha256(codeValue(input)) && !x.used_at && isFuture(x.expires_at))
      if (!p) return undefined
      p.used_at = now()
      const id = randomBytes(32).toString('base64url')
      s.sessions = [...s.sessions.filter(x => isFuture(x.expires_at)), { hash: sha256(id), label, created_at: now(), expires_at: later(SESSION_DAYS * 1440) }]
      log({ event: 'paired', detail: label })
      changed()
      return id
    },

    session: id => (id && s.sessions.find(x => x.hash === sha256(id) && isFuture(x.expires_at))) || undefined,

    view: () => ({
      missions: [...s.missions].reverse(),
      reviews: [...s.reviews].reverse(),
      log: [...s.log].reverse(),
    }),
  }
}
