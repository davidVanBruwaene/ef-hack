import { useCallback, useEffect, useState } from 'react'
import { BotIcon, CheckIcon, PlugIcon, UnplugIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// Connecting an outside agent through the hosted MCP endpoint (spike/aauth-mcp/gateway.mjs), and the agents already connected.
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

export const connectId = () => new URLSearchParams(location.search).get('connect')

export function ConnectRequest({ id }: { id: string }) {
  const [ask, setAsk] = useState<{ client_name: string; redirect_host: string; member: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    call(`/oauth/connect/${encodeURIComponent(id)}`).then(setAsk, (e: Error) => setError(e.message))
  }, [id])

  async function answer(decision: 'approve' | 'deny') {
    setBusy(true)
    setError(null)
    try {
      const { redirect } = await call(`/oauth/connect/${encodeURIComponent(id)}`, { decision })
      location.assign(redirect)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 pb-28">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {ask ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  <AvatarFallback><BotIcon className="size-5" /></AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <CardTitle className="text-lg">Connect {ask.client_name} to Parley</CardTitle>
                  <CardDescription className="truncate font-mono text-xs">returns to {ask.redirect_host}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>It becomes your agent on the people network, {ask.member}. It can do nothing until you approve a mission it proposes, and each mission comes to you here.</p>
              <p>You can disconnect it any time under What you share.</p>
            </CardContent>
          </Card>
          <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-2xl gap-3 px-4 py-3">
              <Button variant="outline" size="lg" className="flex-1" disabled={busy} onClick={() => answer('deny')}>Deny</Button>
              <Button size="lg" className="flex-[2]" disabled={busy} onClick={() => answer('approve')}>
                <CheckIcon className="size-4" />
                Connect
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </main>
  )
}

interface Connection { id: string; client_name: string; created_at: string; mission: string | null }

// The mock console has no gateway, so the list stays empty there.
export function ConnectedAgents() {
  const [list, setList] = useState<Connection[]>([])
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => {
    if (import.meta.env.VITE_API !== 'live') return
    call('/oauth/connections').then((r: { connections: Connection[] }) => setList(r.connections), () => {})
  }, [])
  useEffect(refresh, [refresh])

  async function revoke(id: string) {
    setError(null)
    try {
      await call(`/oauth/connections/${id}/revoke`, {})
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connected agents</CardTitle>
        <CardDescription>Agents that reach the network for you through Parley's MCP address, {location.origin}/mcp.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {list.length === 0 ? <p className="text-sm text-muted-foreground">None yet. Add {location.origin}/mcp as a connector in your agent.</p> : null}
        <ul className="divide-y">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-3">
              <PlugIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{c.client_name}</div>
                <div className="truncate text-xs text-muted-foreground">{c.mission ? `Mission: ${c.mission}` : 'No mission yet'}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => revoke(c.id)}>
                <UnplugIcon className="size-4" />
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
