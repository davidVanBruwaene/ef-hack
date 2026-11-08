// Bob's state at his person server: the missions his agent proposed, the requests held for his review, his answers, and the mission log.
import { randomBytes } from 'node:crypto'
import { bearerToken, jsonFile, now, randomId, sha256 } from './store.mjs'

export { tokenMatches } from './store.mjs'

// Bearer token for Bob's /api: BOB_CONSOLE_TOKEN, or one generated into .keys/bob-console-token.
export const consoleToken = () => bearerToken('BOB_CONSOLE_TOKEN', 'bob-console-token')

const MISSION_HOURS = 24
// Typeable interaction codes: ten characters without lookalikes, about 50 bits.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const newCode = () => {
  const c = Array.from(randomBytes(10), b => ALPHABET[b % ALPHABET.length]).join('')
  return `${c.slice(0, 5)}-${c.slice(5)}`
}

export function openBobState() {
  const file = jsonFile('bob-state.json')
  const saved = file.load()
  const s = { missions: saved.missions ?? [], reviews: saved.reviews ?? [], log: saved.log ?? [] }
  let rev = 0
  const listeners = new Set()
  function changed() {
    file.save(s)
    rev++
    for (const l of listeners) l(rev)
  }
  const log = entry => s.log.push({ at: now(), ...entry })

  return {
    rev: () => rev,
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    mission: id => s.missions.find(m => m.id === id),
    review: id => s.reviews.find(r => r.id === id),
    byCode: code => (code && (s.missions.find(m => m.code === code) ?? s.reviews.find(r => r.code === code))) || undefined,
    byS256: s256 => (s256 && s.missions.find(m => m.s256 === s256)) || undefined,
    expired: m => Date.parse(m.expires_at) <= Date.now(),
    missionLog: s256 => s.log.filter(e => e.mission_s256 === s256),
    pendingReviews: missionId => s.reviews.filter(r => r.mission === missionId && r.status === 'pending'),

    // Approved and not past expires_at: the only missions a person token may name.
    approved(s256) {
      const m = s256 && s.missions.find(x => x.s256 === s256 && x.status === 'approved')
      return m && Date.parse(m.expires_at) > Date.now() ? m : undefined
    },

    propose({ agent, description, tools, resources }) {
      const m = {
        id: randomId('m'), code: newCode(), agent, description, tools, resources,
        status: 'pending', created_at: now(),
      }
      s.missions.push(m)
      log({ mission: m.id, event: 'proposed', agent, detail: description })
      changed()
      return m
    },

    // The blob's exact bytes are kept, so s256 can be recomputed by anyone holding them.
    decide(id, decision, editedDescription) {
      const m = s.missions.find(x => x.id === id)
      if (!m || m.status !== 'pending') return m
      m.decided_at = now()
      if (decision === 'approve') {
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

    openReview({ mission, agent, resource, scopes, justification, verdicts }) {
      const r = {
        id: randomId('rv'), code: newCode(), mission: mission.id, mission_s256: mission.s256, agent, resource, scopes, justification, verdicts,
        status: 'pending', created_at: now(),
      }
      s.reviews.push(r)
      log({ mission: mission.id, mission_s256: mission.s256, event: 'review_opened', agent, detail: scopes.join(' ') })
      changed()
      return r
    },

    decideReview(id, decision) {
      const r = s.reviews.find(x => x.id === id)
      if (!r || r.status !== 'pending') return r
      r.status = decision === 'approve' ? 'approved' : 'denied'
      r.decided_at = now()
      log({ mission: r.mission, mission_s256: r.mission_s256, event: `review_${r.status}`, decided_by: 'Bob', detail: r.scopes.join(' ') })
      changed()
      return r
    },

    view: () => ({
      missions: [...s.missions].reverse().map(({ blob_b64, ...m }) => m),
      reviews: [...s.reviews].reverse(),
      log: [...s.log].reverse(),
    }),
  }
}
