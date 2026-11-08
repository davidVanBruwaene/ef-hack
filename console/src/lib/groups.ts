import type { Ask, State } from '@/types'
import { groupKey } from '@/lib/format'

export interface Group {
  key: string
  requester: string
  label: string
  agent: string
  reason: string
  asks: Ask[]
  itemLabels: string[]
}

// Pending asks from the same requester under the same mission are one request.
export function pendingGroups(state: State): Group[] {
  const map = new Map<string, Group>()
  for (const a of state.asks.filter((x) => x.status === 'pending')) {
    const key = groupKey(a.requester, a.mission_s256)
    const g = map.get(key) ?? {
      key,
      requester: a.requester,
      label: state.requesters.find((r) => r.id === a.requester)?.label ?? a.requester,
      agent: a.agent,
      reason: a.reason,
      asks: [],
      itemLabels: [],
    }
    g.asks.push(a)
    g.itemLabels.push(state.items.find((i) => i.id === a.item_id)?.label ?? a.item_id)
    map.set(key, g)
  }
  return [...map.values()]
}
