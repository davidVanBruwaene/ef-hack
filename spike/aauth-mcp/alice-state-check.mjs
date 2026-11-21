// Checks how alice-state.mjs ages out writes its member never answered, on a throwaway data dir. Usage: node alice-state-check.mjs
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
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
    check(Date.parse(w.pending_until) - Date.parse(w.created_at) === WRITE_PENDING_MS, `pending_until is not created_at + ${WRITE_PENDING_MS / 1000}s: ${JSON.stringify(w)}`)
    w.pending_until = aged(1000)
    check(s.write(w.id).status === 'expired', `an unanswered write past its pending_until reads ${JSON.stringify(s.write(w.id))}`)
  },
  fresh_stays: s => {
    const w = s.proposeWrite(change(2))
    w.pending_until = aged(-60_000)
    check(s.write(w.id).status === 'pending', `a write a minute short of expiry reads ${s.write(w.id).status}`)
  },
  older_write: s => {
    const w = s.proposeWrite(change(6))
    delete w.pending_until
    w.created_at = aged(WRITE_PENDING_MS + 1000)
    check(s.write(w.id).status === 'expired', `a write from before pending_until, past the window, reads ${s.write(w.id).status}`)
  },
  no_late_answer: s => {
    const w = s.proposeWrite(change(3))
    w.pending_until = aged(1000)
    const d = s.decideWrite(w.id, 'approve', 'dana')
    check(d.status === 'expired' && !d.decided_at, `approving an expired write left it ${JSON.stringify(d)}`)
  },
  asks_again: s => {
    const w = s.proposeWrite(change(4))
    w.pending_until = aged(1000)
    const again = s.proposeWrite(change(4))
    check(again.id !== w.id && again.status === 'pending', `the same change after expiry answered ${JSON.stringify(again)}`)
    check(s.write(w.id).status === 'expired', `the old write reads ${s.write(w.id).status}`)
  },
  view_sweeps: s => {
    const w = s.proposeWrite(change(5))
    w.pending_until = aged(1000)
    const shown = s.view('dana').writes.find(x => x.id === w.id)
    check(shown?.status === 'expired', `the console view shows ${JSON.stringify(shown)}`)
  },
  restart_mid_save: s => {
    const w = s.proposeWrite(change(7))
    s.decideWrite(w.id, 'approve', 'dana')
    const reopened = openState(new URL('./alice.json', import.meta.url))
    const after = reopened.write(w.id)
    check(after.status === 'failed' && after.error === 'interrupted', `an approved write after a restart reads ${JSON.stringify(after)}`)
    const again = reopened.proposeWrite(change(7))
    check(again.id !== w.id && again.status === 'pending', `asking again after the restart answered ${JSON.stringify(again)}`)
  },
  bad_window: () => {
    const r = spawnSync(process.execPath, ['-e', "import('./alice-state.mjs')"], { cwd: HERE, env: { ...process.env, ALICE_WRITE_PENDING_S: '24h' }, encoding: 'utf8' })
    check(r.status !== 0 && /ALICE_WRITE_PENDING_S must be a positive number/.test(r.stderr), `ALICE_WRITE_PENDING_S=24h loaded: exit ${r.status} ${r.stderr.slice(0, 200)}`)
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
