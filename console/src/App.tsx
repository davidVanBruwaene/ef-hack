import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { State } from './types'
import { Requests } from './views/Requests'
import { Shared } from './views/Shared'
import { Activity } from './views/Activity'

type Tab = 'requests' | 'shared' | 'activity'

export default function App() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('requests')
  const [live, setLive] = useState(false)

  const refresh = useCallback(() => {
    api.getState().then(
      (s) => {
        setState(s)
        setError(null)
      },
      (e: Error) => setError(e.message),
    )
  }, [])

  useEffect(() => {
    refresh()
    setLive(true)
    const off = api.subscribe(refresh)
    return () => {
      off()
      setLive(false)
    }
  }, [refresh])

  const pending = state ? new Set(state.asks.filter((a) => a.status === 'pending').map((a) => a.requester + a.mission_s256)).size : 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className={live ? 'dot live' : 'dot'} aria-hidden="true" />
            <span>{state ? `${state.owner.first_name} ${state.owner.last_name}` : 'Owner console'}</span>
          </div>
          <nav className="tabs" aria-label="Sections">
            <TabButton id="requests" tab={tab} set={setTab}>
              Requests{pending > 0 ? <span className="badge">{pending}</span> : null}
            </TabButton>
            <TabButton id="shared" tab={tab} set={setTab}>What you share</TabButton>
            <TabButton id="activity" tab={tab} set={setTab}>Activity</TabButton>
          </nav>
        </div>
      </header>
      {error ? <div className="banner" role="alert">Could not reach the server: {error}</div> : null}
      {!state ? (
        <main className="page"><p className="muted">Loading...</p></main>
      ) : tab === 'requests' ? (
        <Requests state={state} refresh={refresh} />
      ) : tab === 'shared' ? (
        <Shared state={state} refresh={refresh} />
      ) : (
        <Activity state={state} refresh={refresh} />
      )}
    </div>
  )
}

function TabButton(props: { id: Tab; tab: Tab; set: (t: Tab) => void; children: React.ReactNode }) {
  return (
    <button className={props.tab === props.id ? 'tab on' : 'tab'} aria-current={props.tab === props.id ? 'page' : undefined} onClick={() => props.set(props.id)}>
      {props.children}
    </button>
  )
}
