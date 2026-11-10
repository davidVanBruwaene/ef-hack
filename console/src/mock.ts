import type { Api } from './api'
import type { Ask, State } from './types'

const mission = 'q3Zt0mAq1vN2xk7Jw9aB4cD5eF6gH7iJ8kL9mN0oP1Q'

let state: State = {
  owner: { first_name: 'Alice', last_name: 'Example' },
  items: [
    { id: 'first', label: 'First name', url: 'Alice', rule: 'everyone' },
    { id: 'last', label: 'Last name', url: 'Example', rule: 'everyone' },
    { id: 'site', label: 'Personal site', url: 'https://example.com/alice', rule: 'everyone' },
    { id: 'projects', label: 'Current projects', url: 'https://example.com/alice/projects', rule: 'ask' },
    { id: 'calendar', label: 'Calendar', url: 'https://example.com/alice/calendar', rule: 'ask' },
    { id: 'location', label: 'Location', url: 'https://example.com/alice/city', rule: 'ask' },
    { id: 'x', label: 'X account', url: 'https://x.com/example', rule: 'ask' },
    { id: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/example', rule: 'ask' },
    { id: 'sessions', label: 'Claude Code sessions', url: 'https://example.com/alice/sessions', rule: 'ask' },
    { id: 'email', label: 'Email', url: 'mailto:alice@example.com', rule: 'ask' },
    { id: 'phone', label: 'Phone number', url: 'tel:+10000000000', rule: 'only_me' },
    { id: 'address', label: 'Home address', url: 'https://example.com/alice/address', rule: 'only_me' },
  ],
  requesters: [{ id: 'bob-ps:sub-1', label: 'Bob', status: 'active' }],
  asks: ['projects', 'calendar', 'x', 'linkedin', 'email'].map((item_id, i) => ({
    id: `ask-${i + 1}`,
    requester: 'bob-ps:sub-1',
    agent: 'aauth:bob-claude-code@agents.example',
    mission_s256: mission,
    item_id,
    reason: 'I met Alice here. Check whether we should talk, and if so book 30 minutes.',
    status: 'pending' as const,
  })),
  disclosures: [],
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
let late = false

export const mockApi: Api = {
  getState: async () => structuredClone(state),
  decideAsk: async (id, decision) => {
    const ask = state.asks.find((a) => a.id === id)
    if (!ask) return
    ask.status = decision === 'approve' ? 'approved' : 'denied'
    const item = state.items.find((i) => i.id === ask.item_id)
    state.disclosures.unshift({
      at: new Date().toISOString(),
      requester: ask.requester,
      agent: ask.agent,
      mission_s256: ask.mission_s256,
      tool: 'search_context',
      query: item?.label ?? ask.item_id,
      disclosed: ask.status === 'approved' ? [ask.item_id] : [],
      withheld: ask.status === 'approved' ? [] : [ask.item_id],
      decided_by: 'owner',
      reason: ask.reason,
    })
    emit()
  },
  decideWrite: async () => {},
  setRequester: async (id, status, label) => {
    const r = state.requesters.find((x) => x.id === id)
    if (r) {
      r.status = status
      if (label) r.label = label
    }
    emit()
  },
  setRule: async (itemId, rule) => {
    const it = state.items.find((i) => i.id === itemId)
    if (it) it.rule = rule
    emit()
  },
  addLink: async (label, url) => {
    state.items.push({ id: `link-${Date.now()}`, label, url, rule: 'ask' })
    emit()
  },
  subscribe: (cb) => {
    listeners.add(cb)
    // Stand-in for SSE: a second requester shows up a few seconds after load.
    const t = setTimeout(() => {
      if (late) return
      late = true
      const a: Ask = {
        id: 'ask-late',
        requester: 'carol-ps:sub-9',
        agent: 'aauth:carol-agent@agents.example',
        mission_s256: 'late-mission',
        item_id: 'location',
        reason: 'Carol is coordinating a meetup and needs to know which city you are in.',
        status: 'pending',
      }
      state.requesters.push({ id: a.requester, label: 'Carol', status: 'active' })
      state.asks.push(a)
      emit()
    }, 6000)
    return () => {
      listeners.delete(cb)
      clearTimeout(t)
    }
  },
}
