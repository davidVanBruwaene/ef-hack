import { useMemo, useState } from 'react'
import { CheckIcon, InboxIcon, LinkIcon, QuoteIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { Ask, State } from '@/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { groupKey, initials, plural } from '@/lib/format'

interface Group {
  key: string
  label: string
  agent: string
  reason: string
  asks: Ask[]
}

interface Props {
  state: State
  refresh: () => void
  focus: string | null
  setFocus: (key: string | null) => void
}

export function Requests({ state, refresh, focus, setFocus }: Props) {
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>()
    for (const a of state.asks.filter((x) => x.status === 'pending')) {
      const key = groupKey(a.requester, a.mission_s256)
      const g = map.get(key) ?? {
        key,
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

  const group = groups.find((g) => g.key === focus) ?? groups[0]

  if (!group) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <InboxIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="text-base font-semibold">Nothing waiting</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              When someone's agent asks for something you keep behind "Ask me", it appears here and in a notification at the top right.
            </p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <RequestCard
      key={group.key}
      group={group}
      state={state}
      others={groups.filter((g) => g.key !== group.key)}
      onPick={setFocus}
      refresh={refresh}
    />
  )
}

function RequestCard(props: { group: Group; state: State; others: Group[]; onPick: (key: string) => void; refresh: () => void }) {
  const { group, state } = props
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(group.asks.map((a) => [a.id, true])))
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)

  const count = group.asks.filter((a) => on[a.id]).length
  const everyone = state.items.filter((i) => i.rule === 'everyone')
  const onlyMe = state.items.filter((i) => i.rule === 'only_me')

  async function decide(share: boolean) {
    setBusy(true)
    try {
      for (const a of group.asks) await api.decideAsk(a.id, share && on[a.id] ? 'approve' : 'deny', remember)
      if (share && count > 0) toast.success(`Shared ${plural(count, 'item')} with ${group.label}`)
      else toast(`Denied ${group.label}'s request`)
      props.refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 pb-28">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar size="lg">
                <AvatarFallback>{initials(group.label)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <CardTitle className="text-lg">{group.label}'s agent wants to know you</CardTitle>
                <CardDescription className="truncate font-mono text-xs">{group.agent}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 rounded-lg bg-muted p-3">
              <QuoteIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-muted-foreground">Why {group.label} is asking</div>
                <p className="mt-1 text-sm leading-relaxed">{group.reason}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asking for</CardTitle>
            <CardDescription>Switch off anything you do not want to share.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {group.asks.map((a) => {
                const item = state.items.find((i) => i.id === a.item_id)
                const label = item?.label ?? a.item_id
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={a.id} className="text-sm font-medium">{label}</Label>
                      <div className="truncate text-xs text-muted-foreground">{item?.url}</div>
                    </div>
                    <Switch id={a.id} checked={!!on[a.id]} onCheckedChange={(v) => setOn({ ...on, [a.id]: v })} aria-label={`Share ${label}`} />
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          {everyone.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span>Already shared with everyone:</span>
              {everyone.map((i) => (
                <Badge key={i.id} variant="secondary">{i.label}</Badge>
              ))}
            </div>
          ) : null}
          {onlyMe.length > 0 ? <div>{plural(onlyMe.length, 'item')} marked Only me never leave.</div> : null}
          <div className="flex items-center gap-2">
            <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
            <Label htmlFor="remember" className="font-normal text-foreground">Remember my answer for {group.label}</Label>
          </div>
        </div>

        {props.others.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Also waiting</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {props.others.map((o) => (
                  <li key={o.key}>
                    <button
                      onClick={() => props.onPick(o.key)}
                      className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <Avatar size="sm">
                        <AvatarFallback>{initials(o.label)}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm font-medium">{o.label}</span>
                      <Badge variant="secondary">{plural(o.asks.length, 'item')}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl gap-3 px-4 py-3">
          <Button variant="outline" size="lg" className="flex-1" disabled={busy} onClick={() => decide(false)}>Deny</Button>
          <Button size="lg" className="flex-[2]" disabled={busy || count === 0} onClick={() => decide(true)}>
            <CheckIcon className="size-4" />
            {count === 0 ? 'Share nothing' : `Share ${count} of ${group.asks.length}`}
          </Button>
        </div>
      </div>
    </>
  )
}
