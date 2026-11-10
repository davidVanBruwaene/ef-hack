// Shapes follow the draft /api/state contract in
// notes/2026-11-07-231301-david-decision-backend-plan-agreed-and-the-boundary-with-julians-store.md

export type Rule = 'everyone' | 'ask' | 'only_me'

export interface Item {
  id: string
  label: string
  url: string
  rule: Rule
}

export interface Requester {
  id: string
  label: string
  status: 'active' | 'revoked'
}

export interface Ask {
  id: string
  requester: string
  agent: string
  mission_s256: string
  item_id: string
  reason: string
  status: 'pending' | 'approved' | 'denied'
}

export interface Disclosure {
  at: string
  requester: string
  agent: string
  mission_s256: string
  tool: string
  query: string
  disclosed: string[]
  withheld: string[]
  decided_by: string
  reason: string
  decisions?: Record<string, string>
}

// An agent's change to its own member's item, waiting for the member in the console.
export interface Write {
  id: string
  agent: string
  item_id: string | null
  before: { value: string; rule: Rule } | null
  after: { label: string; value: string; rule: Rule }
  reason: string
  status: 'pending' | 'approved' | 'denied' | 'saved' | 'failed'
  created_at: string
}

export interface State {
  owner: { first_name: string; last_name: string }
  items: Item[]
  requesters: Requester[]
  asks: Ask[]
  disclosures: Disclosure[]
  writes?: Write[]
  // Set by the console, never by a server: which part of the state could not be loaded.
  notice?: string
}
