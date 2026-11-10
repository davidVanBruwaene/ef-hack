import { useCallback, useEffect, useState } from 'react'
import { ListChecksIcon, BellIcon, SlidersHorizontalIcon } from 'lucide-react'
import { api, SignedOut } from '@/api'
import type { State } from '@/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Notifications } from '@/components/Notifications'
import { initials } from '@/lib/format'
import { pendingGroups } from '@/lib/groups'
import { Requests } from '@/views/Requests'
import { Shared } from '@/views/Shared'
import { Activity } from '@/views/Activity'
import { SignIn } from '@/views/SignIn'
import { ConnectRequest, connectId } from '@/views/Connect'

type Tab = 'requests' | 'shared' | 'activity'

export default function App() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('requests')
  const [focus, setFocus] = useState<string | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [signedOut, setSignedOut] = useState(false)

  const refresh = useCallback(() => {
    api.getState().then(
      (s) => {
        setState(s)
        setError(null)
        setSignedOut(false)
      },
      (e: Error) => (e instanceof SignedOut ? setSignedOut(true) : setError(e.message)),
    )
  }, [])

  useEffect(() => {
    refresh()
    return api.subscribe(refresh)
  }, [refresh])

  if (signedOut) return <SignIn onSignedIn={refresh} />
  const connecting = connectId()
  if (connecting && state) return <ConnectRequest id={connecting} />

  const groups = state ? pendingGroups(state) : []
  const waiting = groups.length + (state?.writes?.filter((w) => w.status === 'pending').length ?? 0)
  const name = state ? `${state.owner.first_name} ${state.owner.last_name}` : ''

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <Avatar>
            <AvatarFallback>{name ? initials(name) : ''}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</div>
          <Notifications
            groups={groups}
            open={drawer}
            onOpenChange={setDrawer}
            onSelect={(key) => {
              setFocus(key)
              setTab('requests')
              setDrawer(false)
            }}
          />
        </div>
        <div className="mx-auto w-full max-w-2xl px-4 pb-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full">
              <TabsTrigger value="requests" className="gap-1.5">
                <BellIcon className="size-4" />
                Requests
                {waiting > 0 ? <Badge className="ml-1 h-5 min-w-5 px-1.5">{waiting}</Badge> : null}
              </TabsTrigger>
              <TabsTrigger value="shared" className="gap-1.5">
                <SlidersHorizontalIcon className="size-4" />
                What you share
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5">
                <ListChecksIcon className="size-4" />
                Activity
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {error ? (
        <div className="mx-auto w-full max-w-2xl px-4 pt-4">
          <Alert variant="destructive">
            <AlertDescription>Could not reach the server: {error}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {state?.notice ? (
        <div className="mx-auto w-full max-w-2xl px-4 pt-4">
          <Alert>
            <AlertDescription>{state.notice}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {!state ? (
        <p className="mx-auto max-w-2xl px-4 py-10 text-sm text-muted-foreground">Loading...</p>
      ) : tab === 'requests' ? (
        <Requests state={state} groups={groups} refresh={refresh} focus={focus} />
      ) : tab === 'shared' ? (
        <Shared state={state} refresh={refresh} />
      ) : (
        <Activity state={state} refresh={refresh} />
      )}
    </div>
  )
}
