import { useMemo, useState } from 'react'
import { api } from '../api'
import type { Ask, State } from '../types'

interface Group {
  key: string
  requester: string
  label: string
  agent: string
  reason: string
  asks: Ask[]
}

export function Requests({ state, refresh }: { state: State; refresh: () => void }) {
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    for (const a of state.asks.filter((x) => x.status === 'pending')) {
      const key = a.requester + '|' + a.mission_s256
      const g = map.get(key) ?? {
        key,
        requester: a.requester,
        label: state.requesters.find((r) => r.id === a.requester)?.label ?? a.requester,
        agent: a.agent,
        reason: a.reason,
        asks: [],
      }
      g.asks.push(a)
      map.set(key, g)
    }
    return [...map.values()]
  }, [state])

  const [picked, setPicked] = useState<string | null>(null)
  const group = groups.find((g) => g.key === picked) ?? groups[0]

  if (!group) {
    return (
      <main className="page">
        <div className="column">
          <h1>Nothing waiting</h1>
          <p className="muted">When someone's agent asks for something you keep behind "Ask me", it shows up here at once.</p>
        </div>
      </main>
    )
  }

  const others = groups.filter((g) => g.key !== group.key)
  const auto = state.items.filter((i) => i.rule === 'everyone')
  const hidden = state.items.filter((i) => i.rule === 'only_me')

  return (
    <RequestCard
      key={group.key}
      group={group}
      state={state}
      others={others}
      onPick={setPicked}
      auto={auto.map((i) => i.label)}
      hiddenCount={hidden.length}
      refresh={refresh}
    />
  )
}

function RequestCard(props: {
  group: Group
  state: State
  others: Group[]
  onPick: (key: string) => void
  auto: string[]
  hiddenCount: number
  refresh: () => void
}) {
  const { group, state } = props
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(group.asks.map((a) => [a.id, true])))
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const count = group.asks.filter((a) => on[a.id]).length

  async function decide(approveSelected: boolean) {
    setBusy(true)
    setErr(null)
    try {
      for (const a of group.asks) {
        await api.decideAsk(a.id, approveSelected && on[a.id] ? 'approve' : 'deny', remember)
      }
      props.refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <main className="page">
        <div className="column">
          <div className="eyebrow">New request</div>
          <h1>{group.label}'s agent wants to know you</h1>
          <p className="muted">Signed by {group.agent}. Identity checked through {group.label}'s person server.</p>

          <section className="card">
            <div className="card-title">Why {group.label} is asking</div>
            <p className="quote">"{group.reason}"</p>
          </section>

          <div className="eyebrow gap">Asking for</div>
          <div className="list">
            {group.asks.map((a) => {
              const item = state.items.find((i) => i.id === a.item_id)
              return (
                <div className="row" key={a.id}>
                  <div className="grow">
                    <div className="row-title">{item?.label ?? a.item_id}</div>
                    <div className="row-sub">{item?.url}</div>
                  </div>
                  <Switch on={!!on[a.id]} label={`Share ${item?.label ?? a.item_id}`} onChange={(v) => setOn({ ...on, [a.id]: v })} />
                </div>
              )
            })}
          </div>

          <p className="muted small">
            Already shared with everyone: {props.auto.join(', ') || 'nothing'}.
            {props.hiddenCount > 0 ? ` ${props.hiddenCount} items are marked Only me and never leave.` : ''}
          </p>

          <label className="check">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember my answer for {group.label}
          </label>

          {err ? <p className="error" role="alert">{err}</p> : null}

          {props.others.length > 0 ? (
            <section aria-label="Other requests">
              <div className="eyebrow gap">Also waiting</div>
              <div className="list">
                {props.others.map((o) => (
                  <button className="row link" key={o.key} onClick={() => props.onPick(o.key)}>
                    <span className="grow row-title">{o.label}</span>
                    <span className="muted small">{o.asks.length} {o.asks.length === 1 ? 'item' : 'items'}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <footer className="actionbar">
        <div className="actionbar-inner">
          <button className="btn" disabled={busy} onClick={() => decide(false)}>Deny</button>
          <button className="btn primary grow2" disabled={busy || count === 0} onClick={() => decide(true)}>
            {count === 0 ? 'Share nothing' : `Share ${count} of ${group.asks.length}`}
          </button>
        </div>
      </footer>
    </>
  )
}

export function Switch(props: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button className="switch-hit" role="switch" aria-checked={props.on} aria-label={props.label} onClick={() => props.onChange(!props.on)}>
      <span className={props.on ? 'switch on' : 'switch'}>
        <span className="knob" />
      </span>
    </button>
  )
}
