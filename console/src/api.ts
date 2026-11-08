import type { Rule, State } from './types'
import { mockApi } from './mock'

export interface Api {
  getState(): Promise<State>
  decideAsk(id: string, decision: 'approve' | 'deny', remember: boolean): Promise<void>
  setRequester(id: string, status: 'active' | 'revoked', label?: string): Promise<void>
  // Items live in the store (store/), not in the MCP server's /api.
  setRule(itemId: string, rule: Rule): Promise<void>
  addLink(label: string, url: string): Promise<void>
  // Calls cb when the server has news (SSE once /api/events exists, polling until then).
  subscribe(cb: () => void): () => void
}

// getState throws this when the store has no session for this browser.
export class SignedOut extends Error {}

const token = () => localStorage.getItem('console_token') ?? ''

// Signed in to the store, the sid cookie picks the owner at /api, and a bearer would override it.
let viaStore = false

async function call(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token() && !viaStore ? { Authorization: `Bearer ${token()}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path}: ${res.status}${json.error ? ` ${json.error}` : ''}`)
  return json
}

interface StoreUser {
  first_name: string
  last_name: string
}

interface StoreItem {
  id: string
  label: string
  value: string
  rule: Rule
}

// undefined: no store answers behind this console; null: the store has no session for this browser.
async function storeUser(): Promise<StoreUser | null | undefined> {
  const res = await fetch('/auth/me').catch(() => null)
  const body = res?.ok ? await res.json().catch(() => undefined) : undefined
  return body && typeof body === 'object' && 'user' in body ? body.user : undefined
}

// On the people network /api names items <member id>/<item id>; the store names them <item id>.
const local = (id: string) => id.slice(id.indexOf('/') + 1)

const liveApi: Api = {
  getState: async () => {
    const user = await storeUser()
    viaStore = !!user
    if (user === undefined) return call('/api/state') as Promise<State>
    if (user === null) throw new SignedOut()
    const [items, mcp] = await Promise.all([
      call('/me/items') as Promise<StoreItem[]>,
      (call('/api/state') as Promise<State>).catch((e: Error) => e),
    ])
    return {
      owner: { first_name: user.first_name, last_name: user.last_name },
      items: items.map(({ value, ...it }) => ({ ...it, url: value })),
      ...(mcp instanceof Error
        ? { requesters: [], asks: [], disclosures: [], notice: `Requests and activity are unavailable: ${mcp.message}` }
        : {
            requesters: mcp.requesters,
            asks: mcp.asks.map((a) => ({ ...a, item_id: local(a.item_id) })),
            disclosures: mcp.disclosures.map((d) => ({ ...d, disclosed: (d.disclosed ?? []).map(local), withheld: (d.withheld ?? []).map(local) })),
          }),
    }
  },
  decideAsk: async (id, decision, remember) => {
    await call(`/api/asks/${id}`, { decision, remember })
  },
  setRequester: async (id, status, label) => {
    await call(`/api/requesters/${id}`, { status, label })
  },
  setRule: async (itemId, rule) => {
    if (!viaStore) throw new Error('Changing a rule needs the store')
    await call(`/me/items/${encodeURIComponent(itemId)}`, { rule })
  },
  addLink: async (label, url) => {
    if (!viaStore) throw new Error('Adding a link needs the store')
    await call('/me/items', { label, value: url })
  },
  subscribe: (cb) => {
    const t = setInterval(cb, 5000)
    return () => clearInterval(t)
  },
}

export const api: Api = import.meta.env.VITE_API === 'live' ? liveApi : mockApi
