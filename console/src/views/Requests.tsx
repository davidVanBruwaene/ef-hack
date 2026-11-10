import { useState } from 'react'
import { CheckIcon, InboxIcon, LinkIcon, QuoteIcon } from 'lucide-react'
import { api } from '@/api'
import type { Rule, State, Write } from '@/types'
import type { Group } from '@/lib/groups'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { initials, plural } from '@/lib/format'
import { AgentRequestCard, useAgentRequests } from '@/views/AgentRequests'

interface Props {
  state: State
  groups: Group[]
  refresh: () => void
  focus: string | null
}

export function Requests({ state, groups, refresh, focus }: Props) {
  const agent = useAgentRequests()
  const group = groups.find((g) => g.key === focus) ?? groups[0]
  const own = agent.pending[0]

  // Your own agent's requests come first, unless you picked someone else's from the bell.
  if (own && !groups.some((g) => g.key === focus)) return <AgentRequestCard key={own.id} request={own} refresh={agent.refresh} />
  const write = state.writes?.filter((w) => w.status === 'pending').at(-1)
  if (write && !groups.some((g) => g.key === focus)) return <WriteCard key={write.id} write={write} refresh={refresh} />

  if (!group) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8">
        {agent.codeNotice ? (
          <Alert variant={agent.codeNotice.error ? 'destructive' : 'default'}>
            {agent.codeNotice.error ? null : <CheckIcon />}
            <AlertDescription>{agent.codeNotice.text}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <InboxIcon className="size-5 text-muted-foreground" />
            </div>
            <div className="text-base font-semibold">Nothing waiting</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              When someone's agent asks for something you keep behind "Ask me", it appears here and in the bell at the top right.
            </p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return <RequestCard key={group.key} group={group} state={state} refresh={refresh} />
}

function RequestCard({ group, state, refresh }: { group: Group; state: State; refresh: () => void }) {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(group.asks.map((a) => [a.id, true])))
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const count = group.asks.filter((a) => on[a.id]).length
  const everyone = state.items.filter((i) => i.rule === 'everyone')
  const onlyMe = state.items.filter((i) => i.rule === 'only_me')

  async function decide(share: boolean) {
    setBusy(true)
    setError(null)
    try {
      for (const a of group.asks) await api.decideAsk(a.id, share && on[a.id] ? 'approve' : 'deny', remember)
      refresh()
    } catch (e) {
      setError((e as Error).message)
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

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
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

const RULE_TEXT: Record<Rule, string> = { everyone: 'Everyone', ask: 'Ask me', only_me: 'Only me' }

// Your own agent's change to what you share: exactly what it would save, before and after.
function WriteCard({ write, refresh }: { write: Write; refresh: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { before, after } = write

  async function decide(decision: 'approve' | 'deny') {
    setBusy(true)
    setError(null)
    try {
      await api.decideWrite(write.id, decision)
      refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const row = (name: string, was: string | undefined, now: string) => (
    <li className="flex flex-col gap-0.5 px-4 py-3">
      <div className="text-xs font-medium text-muted-foreground">{name}</div>
      {was !== undefined && was !== now ? <div className="break-all text-sm text-muted-foreground line-through">{was}</div> : null}
      <div className="break-all text-sm">{now}</div>
    </li>
  )

  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 pb-28">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{before ? `Your agent wants to change ${after.label}` : `Your agent wants to add ${after.label}`}</CardTitle>
            <CardDescription className="truncate font-mono text-xs">{write.agent}</CardDescription>
          </CardHeader>
          {write.reason ? (
            <CardContent>
              <div className="flex gap-3 rounded-lg bg-muted p-3">
                <QuoteIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 text-sm leading-relaxed">{write.reason}</p>
              </div>
            </CardContent>
          ) : null}
        </Card>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {row('Label', undefined, after.label)}
              {row('Link', before?.value, after.value)}
              {row('Who sees it', before ? RULE_TEXT[before.rule] : undefined, RULE_TEXT[after.rule])}
            </ul>
          </CardContent>
        </Card>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl gap-3 px-4 py-3">
          <Button variant="outline" size="lg" className="flex-1" disabled={busy} onClick={() => decide('deny')}>Decline</Button>
          <Button size="lg" className="flex-[2]" disabled={busy} onClick={() => decide('approve')}>
            <CheckIcon className="size-4" />
            Save it
          </Button>
        </div>
      </div>
    </>
  )
}
