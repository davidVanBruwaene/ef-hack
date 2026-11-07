import { useState } from 'react'
import { api } from '../api'
import type { State } from '../types'

export function Activity({ state, refresh }: { state: State; refresh: () => void }) {
  const [err, setErr] = useState<string | null>(null)
  const name = (id: string) => state.requesters.find((r) => r.id === id)?.label ?? id
  const label = (id: string) => state.items.find((i) => i.id === id)?.label ?? id

  async function toggle(id: string, status: 'active' | 'revoked') {
    setErr(null)
    try {
      await api.setRequester(id, status)
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <main className="page">
      <div className="column">
        <h1>Activity</h1>

        <div className="eyebrow gap">People with access</div>
        <div className="list">
          {state.requesters.length === 0 ? <div className="row muted">Nobody yet.</div> : null}
          {state.requesters.map((r) => (
            <div className="row" key={r.id}>
              <div className="grow">
                <div className="row-title">{r.label}</div>
                <div className="row-sub">{r.status === 'active' ? 'Active' : 'Revoked'}</div>
              </div>
              {r.status === 'active' ? (
                <button className="btn danger" onClick={() => toggle(r.id, 'revoked')}>Revoke</button>
              ) : (
                <button className="btn" onClick={() => toggle(r.id, 'active')}>Restore</button>
              )}
            </div>
          ))}
        </div>
        {err ? <p className="error" role="alert">{err}</p> : null}

        <div className="eyebrow gap">What was shared</div>
        <div className="list">
          {state.disclosures.length === 0 ? <div className="row muted">Nothing shared yet.</div> : null}
          {state.disclosures.map((d, i) => (
            <div className="row col" key={d.at + i}>
              <div className="row-title">
                {name(d.requester)} <span className="muted small">{new Date(d.at).toLocaleString()}</span>
              </div>
              <div className="row-sub">
                {d.disclosed.length ? `Shared: ${d.disclosed.map(label).join(', ')}` : 'Shared nothing'}
                {d.withheld.length ? `. Withheld: ${d.withheld.map(label).join(', ')}` : ''}
              </div>
              <div className="row-sub">Decided by {d.decided_by}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
