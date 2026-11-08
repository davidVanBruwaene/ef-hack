import type { Rule, State } from './types'
import { mockApi } from './mock'

export interface Api {
  getState(): Promise<State>
  decideAsk(id: string, decision: 'approve' | 'deny', remember: boolean): Promise<void>
  setRequester(id: string, status: 'active' | 'revoked', label?: string): Promise<void>
  // Not in David's draft contract yet: the item store is ours.
  setRule(itemId: string, rule: Rule): Promise<void>
  addLink(label: string, url: string): Promise<void>
  // Calls cb when the server has news (SSE once /api/events exists, polling until then).
  subscribe(cb: () => void): () => void
}

const token = () => localStorage.getItem('console_token') ?? ''

async function call(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json().catch(() => ({}))
}

const liveApi: Api = {
  getState: () => call('/api/state') as Promise<State>,
  decideAsk: async (id, decision, remember) => {
    await call(`/api/asks/${id}`, { decision, remember })
  },
  setRequester: async (id, status, label) => {
    await call(`/api/requesters/${id}`, { status, label })
  },
  setRule: async () => {
    throw new Error('Item rules are not in the API contract yet')
  },
  addLink: async () => {
    throw new Error('Adding links is not in the API contract yet')
  },
  subscribe: (cb) => {
    const t = setInterval(cb, 5000)
    return () => clearInterval(t)
  },
}

export const api: Api = import.meta.env.VITE_API === 'live' ? liveApi : mockApi
