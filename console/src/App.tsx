import { useCallback, useEffect, useRef, useState } from 'react'
import { BellIcon, ListChecksIcon, ShieldCheckIcon, SlidersHorizontalIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { State } from '@/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { groupKey, initials, plural } from '@/lib/format'
import { Requests } from '@/views/Requests'
import { Shared } from '@/views/Shared'
import { Activity } from '@/views/Activity'

type Tab = 'requests' | 'shared' | 'activity'


export default function App() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('requests')
  const [focus, setFocus] = useState<string | null>(null)
  const seen = useRef<Set<string> | null>(null)

  const refresh = useCallback(() => {
    api.getState().then(
      (s) => {
        setState(s)
        setError(null)
        notifyNew(s)
      },
      (e: Error) => setError(e.message),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Toast once for each request group we have not shown yet. The first load only records them.
  function notifyNew(s: State) {
    const groups = new Map<string, { requester: string; labels: string[] }>()
    for (const a of s.asks.filter((x) => x.status === 'pending')) {
      const key = groupKey(a.requester, a.mission_s256)
      const g = groups.get(key) ?? { requester: a.requester, labels: [] }
      g.labels.push(s.items.find((i) => i.id === a.item_id)?.label ?? a.item_id)
      groups.set(key, g)
    }
    const known = seen.current
    seen.current = new Set(groups.keys())
    if (!known) return
    for (const [key, g] of groups) {
      if (known.has(key)) continue
      const who = s.requesters.find((r) => r.id === g.requester)?.label ?? 'Someone'
      toast(`${who}'s agent is asking for access`, {
        description: `${plural(g.labels.length, 'item')}: ${g.labels.join(', ')}`,
        icon: <BellIcon className="size-4" />,
        duration: 15000,
        action: {
          label: 'Review',
          onClick: () => {
            setFocus(key)
            setTab('requests')
          },
        },
      })
    }
  }

  useEffect(() => {
    refresh()
    return api.subscribe(refresh)
  }, [refresh])

  const pending = state ? new Set(state.asks.filter((a) => a.status === 'pending').map((a) => groupKey(a.requester, a.mission_s256))).size : 0
  const name = state ? `${state.owner.first_name} ${state.owner.last_name}` : ''

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheckIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight">Owner console</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
              Live
            </div>
          </div>
          {name ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
              <Avatar>
                <AvatarFallback>{initials(name)}</AvatarFallback>
              </Avatar>
            </div>
          ) : null}
        </div>
        <div className="mx-auto w-full max-w-2xl px-4 pb-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full">
              <TabsTrigger value="requests" className="gap-1.5">
                <BellIcon className="size-4" />
                Requests
                {pending > 0 ? <Badge className="ml-1 h-5 min-w-5 px-1.5">{pending}</Badge> : null}
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

      {!state ? (
        <p className="mx-auto max-w-2xl px-4 py-10 text-sm text-muted-foreground">Loading...</p>
      ) : tab === 'requests' ? (
        <Requests state={state} refresh={refresh} focus={focus} setFocus={setFocus} />
      ) : tab === 'shared' ? (
        <Shared state={state} refresh={refresh} />
      ) : (
        <Activity state={state} refresh={refresh} />
      )}
    </div>
  )
}
