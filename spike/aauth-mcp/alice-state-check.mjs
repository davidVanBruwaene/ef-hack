// Checks how alice-state.mjs ages out writes its member never answered, on a throwaway data dir. Usage: node alice-state-check.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TMP = mkdtempSync(join(tmpdir(), 'alice-state-check-'))
process.env.AAUTH_DATA_DIR = TMP
const { WRITE_PENDING_MS, openState } = await import('./alice-state.mjs')

const check = (ok, what) => { if (!ok) throw new Error(what) }
const aged = ms => new Date(Date.now() - ms).toISOString()
const change = n => ({ owner: 'dana', requester: 'r_x', agent: 'aauth:a@x', mission_s256: 'm', item_id: null, before: null, after: { label: `L${n}`, value: `https://x.example/${n}`, rule: 'everyone' }, reason: '', asked: true })

let failed = 0
const cases = {
  expires: s => {
    const w = s.proposeWrite(change(1))
    w.created_at = aged(WRITE_PENDING_MS + 1000)
    check(s.write(w.id).status === 'expired' && s.write(w.id).expired_at, `an unanswered write past ${WRITE_PENDING_MS / 1000}s reads ${JSON.stringify(s.write(w.id))}`)
  },
  fresh_stays: s => {
    const w = s.proposeWrite(change(2))
    w.created_at = aged(WRITE_PENDING_MS - 60_000)
    check(s.write(w.id).status === 'pending', `a write a minute short of expiry reads ${s.write(w.id).status}`)
  },
  no_late_answer: s => {
    const w = s.proposeWrite(change(3))
    w.created_at = aged(WRITE_PENDING_MS + 1000)
    const d = s.decideWrite(w.id, 'approve', 'dana')
    check(d.status === 'expired' && !d.decided_at, `approving an expired write left it ${JSON.stringify(d)}`)
  },
  asks_again: s => {
    const w = s.proposeWrite(change(4))
    w.created_at = aged(WRITE_PENDING_MS + 1000)
    const again = s.proposeWrite(change(4))
    check(again.id !== w.id && again.status === 'pending', `the same change after expiry answered ${JSON.stringify(again)}`)
    check(s.write(w.id).status === 'expired', `the old write reads ${s.write(w.id).status}`)
  },
  view_sweeps: s => {
    const w = s.proposeWrite(change(5))
    w.created_at = aged(WRITE_PENDING_MS + 1000)
    const shown = s.view('dana').writes.find(x => x.id === w.id)
    check(shown?.status === 'expired', `the console view shows ${JSON.stringify(shown)}`)
  },
}

try {
  const state = openState(new URL('./alice.json', import.meta.url))
  for (const [name, run] of Object.entries(cases)) {
    try { run(state); console.log(`✓ ${name}`) } catch (err) { failed++; console.log(`✗ ${name}: ${err.message}`) }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true })
}
const total = Object.keys(cases).length
console.log(failed ? `${failed} of ${total} failed` : `all ${total} passed`)
process.exitCode = failed ? 1 : 0
