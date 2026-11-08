import { BanIcon, RotateCcwIcon } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/api'
import type { State } from '@/types'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { initials, timeAgo } from '@/lib/format'

export function Activity({ state, refresh }: { state: State; refresh: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const name = (id: string) => state.requesters.find((r) => r.id === id)?.label ?? id
  const label = (id: string) => state.items.find((i) => i.id === id)?.label ?? id

  async function setStatus(id: string, status: 'active' | 'revoked') {
    setError(null)
    try {
      await api.setRequester(id, status)
      refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">People with access</CardTitle>
          <CardDescription>Revoking stops their agent at once, even if it already holds a token.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {state.requesters.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">Nobody yet.</p> : null}
          <ul className="divide-y">
            {state.requesters.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar>
                  <AvatarFallback>{initials(r.label)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.label}</div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{r.id}</div>
                </div>
                <Badge variant={r.status === 'active' ? 'secondary' : 'outline'}>{r.status === 'active' ? 'Active' : 'Revoked'}</Badge>
                {r.status === 'active' ? (
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => setStatus(r.id, 'revoked')}>
                    <BanIcon className="size-3.5" />
                    Revoke
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setStatus(r.id, 'active')}>
                    <RotateCcwIcon className="size-3.5" />
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What was shared</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {state.disclosures.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing shared yet.</p> : null}
          <ul className="divide-y">
            {state.disclosures.map((d, i) => (
              <li key={d.at + i} className="flex flex-col gap-1.5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{name(d.requester)}</span>
                  <span className="text-xs text-muted-foreground">{timeAgo(d.at)}</span>
                  <Badge variant="outline" className="ml-auto">Decided by {d.decided_by}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  {d.disclosed.length === 0 ? <span className="text-muted-foreground">Shared nothing</span> : null}
                  {d.disclosed.map((id) => (
                    <Badge key={id}>{label(id)}</Badge>
                  ))}
                  {d.withheld.map((id) => (
                    <Badge key={id} variant="outline" className="line-through">{label(id)}</Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  )
}
