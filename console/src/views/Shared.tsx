import { useState } from 'react'
import { api } from '../api'
import type { Rule, State } from '../types'

const RULES: { id: Rule; name: string }[] = [
  { id: 'everyone', name: 'Everyone' },
  { id: 'ask', name: 'Ask me' },
  { id: 'only_me', name: 'Only me' },
]

export function Shared({ state, refresh }: { state: State; refresh: () => void }) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function guard(fn: () => Promise<void>) {
    setErr(null)
    try {
      await fn()
      refresh()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <main className="page">
      <div className="column">
        <h1>What you share</h1>
        <p className="muted">Every item is a link with a rule. First and last name start as Everyone.</p>
        <div className="list">
          {state.items.map((it) => (
            <div className="row" key={it.id}>
              <div className="grow">
                <div className="row-title">{it.label}</div>
                <div className="row-sub">{it.url}</div>
              </div>
              <div className="seg" role="radiogroup" aria-label={`Rule for ${it.label}`}>
                {RULES.map((r) => (
                  <button
                    key={r.id}
                    role="radio"
                    aria-checked={it.rule === r.id}
                    className={it.rule === r.id ? `seg-btn on ${r.id}` : 'seg-btn'}
                    onClick={() => guard(() => api.setRule(it.id, r.id))}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <form
          className="card form"
          onSubmit={(e) => {
            e.preventDefault()
            guard(async () => {
              await api.addLink(label.trim(), url.trim())
              setLabel('')
              setUrl('')
            })
          }}
        >
          <div className="card-title">Add a link</div>
          <label className="field">
            <span>Name</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Project page" required />
          </label>
          <label className="field">
            <span>Link</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" type="url" required />
          </label>
          <button className="btn primary" type="submit">Add link</button>
        </form>
        {err ? <p className="error" role="alert">{err}</p> : null}
      </div>
    </main>
  )
}
