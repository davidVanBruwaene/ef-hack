import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BotIcon, CheckIcon, LinkIcon, QuoteIcon, ShieldAlertIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

// What your own agent needs from you at your person server, served by spike/aauth-mcp/agent-console.mjs at /agent.
export interface AgentMission {
  kind: 'mission'
  id: string
  code: string
  agent: string
  description: string
  resources: string[]
  pending_until: string
}

export interface AgentHold {
  kind: 'hold'
  id: string
  code: string
  agent: string
  resource: string
  mission: string
  justification: string
  items: { name: string; held: boolean; reason: string }[]
  pending_until: string
}

export type AgentRequest = AgentMission | AgentHold

async function call(path: string, body?: unknown): Promise<any> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error_description ?? data.error ?? `${path}: ${res.status}`)
  return data
}

const isOpen = (x: AgentRequest) => Date.parse(x.pending_until) > Date.now()

// Oldest first, missions before held requests; the mock console has no /agent, so it stays empty there.
export function useAgentRequests(): { pending: AgentRequest[]; refresh: () => void } {
  const [pending, setPending] = useState<AgentRequest[]>([])
  const refresh = useCallback(() => {
    if (import.meta.env.VITE_API !== 'live') return
    call('/agent/state').then(
      (s: { missions?: AgentMission[]; holds?: AgentHold[] }) => setPending([...(s.missions ?? []), ...(s.holds ?? [])].filter(isOpen)),
      () => {},
    )
  }, [])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [refresh])
  return { pending, refresh }
}

function useDecision(path: string, refresh: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function decide(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      await call(path, body)
      refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return { busy, error, decide }
}

export function AgentRequestCard({ request, refresh }: { request: AgentRequest; refresh: () => void }) {
  return request.kind === 'mission' ? <MissionCard m={request} refresh={refresh} /> : <HoldCard h={request} refresh={refresh} />
}

function Header({ icon, title, agent }: { icon: ReactNode; title: string; agent: string }) {
  return (
    <CardHeader>
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarFallback>{icon}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription className="truncate font-mono text-xs">{agent}</CardDescription>
        </div>
      </div>
    </CardHeader>
  )
}

function Code({ code }: { code: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
      <div className="text-xs text-muted-foreground">Check it matches the code your agent showed you.</div>
      <div className="shrink-0 font-mono text-base font-semibold tracking-widest">{code}</div>
    </div>
  )
}

function Bar({ busy, yes, disabled, onDeny, onYes }: { busy: boolean; yes: string; disabled?: boolean; onDeny: () => void; onYes: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl gap-3 px-4 py-3">
        <Button variant="outline" size="lg" className="flex-1" disabled={busy} onClick={onDeny}>Deny</Button>
        <Button size="lg" className="flex-[2]" disabled={busy || disabled} onClick={onYes}>
          <CheckIcon className="size-4" />
          {yes}
        </Button>
      </div>
    </div>
  )
}

function MissionCard({ m, refresh }: { m: AgentMission; refresh: () => void }) {
  const [text, setText] = useState(m.description)
  const [rulesOnly, setRulesOnly] = useState(false)
  const { busy, error, decide } = useDecision(`/agent/missions/${m.id}`, refresh)

  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 pb-28">
        <Card>
          <Header icon={<BotIcon className="size-5" />} title="Your agent wants to start a mission" agent={m.agent} />
          <CardContent>
            <Code code={m.code} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mission</CardTitle>
            <CardDescription>Edit it before approving if you want it narrower.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <textarea
              aria-label="Mission"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
            {m.resources.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                <span>Will reach</span>
                {m.resources.map((r) => (
                  <Badge key={r} variant="secondary" className="font-mono">{new URL(r).host}</Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Switch id="rules-only" checked={rulesOnly} onCheckedChange={(v) => setRulesOnly(v)} />
            <Label htmlFor="rules-only" className="font-normal text-foreground">Rules only: never send this mission to the model (Jev)</Label>
          </div>
          <div>Lasts 24 hours from approval. Each request your agent makes under it is checked against this text.</div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </main>

      <Bar
        busy={busy}
        yes="Approve"
        disabled={!text.trim()}
        onDeny={() => decide({ decision: 'deny' })}
        onYes={() => decide({ decision: 'approve', description: text.trim(), rules_only: rulesOnly })}
      />
    </>
  )
}

function HoldCard({ h, refresh }: { h: AgentHold; refresh: () => void }) {
  const { busy, error, decide } = useDecision(`/agent/holds/${h.id}`, refresh)

  return (
    <>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 pb-28">
        <Card>
          <Header icon={<ShieldAlertIcon className="size-5" />} title="Your supervisor wants your call" agent={h.agent} />
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-3 rounded-lg bg-muted p-3">
              <QuoteIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-xs font-medium text-muted-foreground">Under your mission</div>
                <p className="mt-1 text-sm leading-relaxed">{h.mission}</p>
              </div>
            </div>
            <Code code={h.code} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your agent asks for</CardTitle>
            <CardDescription className="truncate font-mono text-xs">{h.resource}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {h.items.map((i) => (
                <li key={i.name} className="flex items-center gap-3 px-4 py-3">
                  <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{i.reason}</div>
                  </div>
                  {i.held ? <Badge>Needs you</Badge> : <Badge variant="secondary">Allowed</Badge>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {h.justification ? (
          <div className="flex gap-3 rounded-lg bg-muted p-3">
            <QuoteIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">Your agent says</div>
              <p className="mt-1 text-sm leading-relaxed">{h.justification}</p>
            </div>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </main>

      <Bar busy={busy} yes="Allow" onDeny={() => decide({ decision: 'deny' })} onYes={() => decide({ decision: 'approve' })} />
    </>
  )
}
