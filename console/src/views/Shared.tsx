import { useState } from 'react'
import { GlobeIcon, PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import type { Rule, State } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const RULES: { id: Rule; name: string }[] = [
  { id: 'everyone', name: 'Everyone' },
  { id: 'ask', name: 'Ask me' },
  { id: 'only_me', name: 'Only me' },
]

export function Shared({ state, refresh }: { state: State; refresh: () => void }) {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  async function guard(fn: () => Promise<void>, ok?: string) {
    try {
      await fn()
      if (ok) toast.success(ok)
      refresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What you share</CardTitle>
          <CardDescription>
            Each item is a link with a rule. Everyone: any verified agent. Ask me: you approve each request. Only me: never shared.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {state.items.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <GlobeIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 basis-40">
                  <div className="text-sm font-medium">{it.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{it.url}</div>
                </div>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={[it.rule]}
                  onValueChange={(v) => {
                    const next = v[0] as Rule | undefined
                    if (next && next !== it.rule) guard(() => api.setRule(it.id, next))
                  }}
                  aria-label={`Rule for ${it.label}`}
                >
                  {RULES.map((r) => (
                    <ToggleGroupItem key={r.id} value={r.id} className="data-pressed:bg-primary data-pressed:text-primary-foreground">
                      {r.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a link</CardTitle>
          <CardDescription>New links start as Ask me.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              guard(async () => {
                await api.addLink(label.trim(), url.trim())
                setLabel('')
                setUrl('')
              }, 'Link added')
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="link-name">Name</Label>
                <Input id="link-name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Project page" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="link-url">Link</Label>
                <Input id="link-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required />
              </div>
            </div>
            <Button type="submit" className="self-start">
              <PlusIcon className="size-4" />
              Add link
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
