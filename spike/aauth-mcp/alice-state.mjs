// The MCP server's state: Alice's items from alice.json, the requesters, the asks waiting on Alice or on network members, and the disclosure log.
import { readFileSync } from 'node:fs'
import { bearerToken, jsonFile, now, randomId, sha256 } from './store.mjs'

export { tokenMatches } from './store.mjs'
export const RULES = ['everyone', 'ask', 'only_me']

// A short, URL-safe id for a person as their person server names them to Alice (the sub is pairwise).
export const requesterId = (ps, sub) => `r_${sha256(`${ps} ${sub}`).slice(0, 16)}`

// Bearer token for Alice's /api: ALICE_CONSOLE_TOKEN, or one generated into .keys/alice-console-token.
export const consoleToken = () => bearerToken('ALICE_CONSOLE_TOKEN', 'alice-console-token')

export const slug = label => label.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'link'

export function openState(seedUrl) {
  const seed = JSON.parse(readFileSync(seedUrl, 'utf8'))
  const file = jsonFile('alice-state.json')
  const saved = file.load()
  const s = {
    owner: seed.owner,
    items: saved.items ?? seed.items,
    requesters: saved.requesters ?? [],
    asks: saved.asks ?? [],
    disclosures: saved.disclosures ?? [],
    writes: saved.writes ?? [],
  }
  let rev = 0
  const listeners = new Set()

  function changed() {
    const { items, requesters, asks, disclosures, writes } = s
    file.save({ items, requesters, asks, disclosures, writes })
    rev++
    for (const l of listeners) l(rev)
  }

  const requester = id => s.requesters.find(r => r.id === id)
  const remembered = (rid, itemId) => requester(rid)?.remembered?.[itemId]
  // Only-me items, and items Alice said no to for good, do not exist for that requester.
  const hidden = (rid, item) => item.rule === 'only_me' || remembered(rid, item.id) === 'deny'
  const shared = (rid, item) => item.rule === 'everyone' || remembered(rid, item.id) === 'approve'
  const revokedBy = (rid, owner) => !!requester(rid)?.revoked_by?.includes(owner)
  // A network item's id is "<owner>/<item>" so asks and remembered answers stay per owner; the agent names it by item_id.
  const key = item => item.item_id ?? item.id

  function resolve(rid, { ids, query } = {}, all = s.items) {
    const items = new Map(), hiddenIds = new Set(), unknown = []
    const add = item => (hidden(rid, item) ? hiddenIds.add(key(item)) : items.set(item.id, item))
    for (const id of Array.isArray(ids) ? ids.filter(i => typeof i === 'string') : []) {
      const item = all.find(i => key(i) === id)
      item ? add(item) : unknown.push(id)
    }
    const words = (typeof query === 'string' ? query : '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1)
    for (const item of all) {
      const text = `${key(item)} ${item.label}`.toLowerCase()
      if (words.some(w => text.includes(w))) add(item)
    }
    if (!(Array.isArray(ids) && ids.length) && !words.length) for (const item of all) if (shared(rid, item)) items.set(item.id, item)
    return { items: [...items.values()], hidden: [...hiddenIds], unknown }
  }

  // Where one requested item stands for this requester and mission; raises an ask if Alice has not been asked yet.
  function decision(rid, mission, item, { agent, reason }) {
    if (item.rule === 'everyone') return { state: 'approved', by: 'rule' }
    if (remembered(rid, item.id) === 'approve') return { state: 'approved', by: 'remembered' }
    let ask = s.asks.find(a => a.requester === rid && a.mission_s256 === mission && a.item_id === item.id)
    if (!ask) {
      ask = {
        id: randomId('ask'),
        requester: rid, agent, mission_s256: mission, item_id: item.id, item_label: item.label, reason: reason ?? '',
        ...(item.owner ? { owner: item.owner } : {}),
        status: 'pending', created_at: now(),
      }
      s.asks.push(ask)
      changed()
    }
    if (ask.status === 'pending') return { state: 'pending', ask }
    return { state: ask.status, by: ask.decided_by ?? 'owner', ask }
  }

  function waitDecided(askIds, ms) {
    const settled = () => askIds.every(id => s.asks.find(a => a.id === id)?.status !== 'pending')
    if (settled()) return Promise.resolve()
    return new Promise(resolve => {
      const done = () => { listeners.delete(check); clearTimeout(timer); resolve() }
      const check = () => settled() && done()
      const timer = setTimeout(done, ms)
      listeners.add(check)
    })
  }

  function applyDecision(ask, decision, remember, by = 'owner') {
    ask.status = decision === 'approve' ? 'approved' : 'denied'
    ask.decided_at = now()
    ask.decided_by = by
    if (!remember) return
    const r = requester(ask.requester)
    r.remembered = { ...r.remembered, [ask.item_id]: decision }
    for (const other of s.asks) {
      if (other.status === 'pending' && other.requester === ask.requester && other.item_id === ask.item_id) {
        applyDecision(other, decision, false, 'remembered')
      }
    }
  }

  // Resolves once pred() holds or ms pass, whichever is first.
  function waitFor(pred, ms) {
    if (pred()) return Promise.resolve()
    return new Promise(resolve => {
      const done = () => { listeners.delete(check); clearTimeout(timer); resolve() }
      const check = () => pred() && done()
      const timer = setTimeout(done, ms)
      listeners.add(check)
    })
  }

  // The same change asked for again under the same mission is the same write, whatever state it reached.
  const sameWrite = (w, x) => w.owner === x.owner && w.requester === x.requester && w.mission_s256 === x.mission_s256 &&
    w.item_id === x.item_id && JSON.stringify(w.after) === JSON.stringify(x.after)

  // Each entry hashes the previous one, so an edited or dropped entry breaks the chain.
  function disclose(entry) {
    const prev = s.disclosures.at(-1)?.hash ?? ''
    const body = { at: now(), ...entry, prev }
    s.disclosures.push({ ...body, hash: sha256(prev + JSON.stringify(body)) })
    changed()
  }

  return {
    owner: s.owner,
    rev: () => rev,
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    requester,
    visible: (rid, all = s.items) => all.filter(i => !hidden(rid, i)),
    shared,
    hidden,
    revokedBy,
    resolve,
    decision,
    waitDecided,
    disclose,

    // An agent's change to its own member's item, held until the member answers in the console.
    proposeWrite(x) {
      // A saved write answers a repeat only briefly, so the same change made again later is made again.
      const live = w => w.status === 'pending' || w.status === 'approved' || (w.status === 'saved' && Date.parse(w.saved_at) > Date.now() - 15 * 60_000)
      const found = s.writes.findLast(w => sameWrite(w, x) && live(w))
      if (found) return found
      const w = { id: randomId('w'), ...x, status: 'pending', created_at: now() }
      s.writes.push(w)
      changed()
      return w
    },
    write: id => s.writes.find(w => w.id === id),
    // With an owner, only that owner's writes can be answered.
    decideWrite(id, decision, owner) {
      const w = s.writes.find(x => x.id === id && (owner === undefined || x.owner === owner))
      if (!w || w.status !== 'pending') return w ?? null
      Object.assign(w, { status: decision === 'approve' ? 'approved' : 'denied', decided_at: now() })
      changed()
      return w
    },
    settleWrite(id, result) {
      const w = s.writes.find(x => x.id === id)
      Object.assign(w, result.error ? { status: 'failed', error: result.error } : { status: 'saved', item_id: result.id, saved_at: now() })
      changed()
      return w
    },
    waitWrite: (id, ms) => waitFor(() => !['pending', 'approved'].includes(s.writes.find(w => w.id === id)?.status), ms),

    seen({ id, ps, sub, label, agent, member }) {
      let r = requester(id)
      if (!r) {
        r = { id, label: label ?? 'Unknown', status: 'active', ps, sub, agent, ...(member ? { member } : {}), first_seen: now(), remembered: {} }
        s.requesters.push(r)
        changed()
      } else if ((agent && r.agent !== agent) || (label && r.label === 'Unknown') || (member && r.member !== member)) {
        if (agent) r.agent = agent
        if (label && r.label === 'Unknown') r.label = label
        if (member) r.member = member
        changed()
      }
      return r
    },

    // With an owner, only that owner's asks can be answered; any other id counts as missing.
    decideAsks(decisions, owner) {
      const asks = decisions.map(d => ({ d, ask: s.asks.find(a => a.id === d.id && (owner === undefined || a.owner === owner)) }))
      const missing = asks.filter(a => !a.ask).map(a => a.d.id)
      if (missing.length) return { missing }
      for (const { d, ask } of asks) applyDecision(ask, d.decision, !!d.remember)
      changed()
      return { missing }
    },

    // With an owner, revocation is that owner's alone: it lands in revoked_by and denies only their pending asks.
    setRequester(id, { status, label }, owner) {
      const r = requester(id)
      if (!r) return false
      if (status && owner !== undefined) {
        const others = (r.revoked_by ?? []).filter(o => o !== owner)
        r.revoked_by = status === 'revoked' ? [...others, owner] : others
      } else if (status) r.status = status
      if (label) r.label = label
      if (status === 'revoked') {
        for (const a of s.asks) {
          if (a.requester === id && a.status === 'pending' && (owner === undefined || a.owner === owner)) applyDecision(a, 'deny', false, 'revoked')
        }
      }
      changed()
      return true
    },

    setRule(id, rule) {
      const item = s.items.find(i => i.id === id)
      if (!item) return false
      item.rule = rule
      changed()
      return true
    },

    addLink(label, url, rule = 'ask') {
      let id = slug(label)
      for (let n = 2; s.items.some(i => i.id === id); n++) id = `${slug(label)}-${n}`
      const item = { id, label, url, rule }
      s.items.push(item)
      changed()
      return item
    },

    // With an owner: that owner's asks and disclosures, and the requesters they involve, with their status for this owner only.
    view(owner) {
      if (owner === undefined) {
        return { owner: s.owner, items: s.items, requesters: s.requesters, asks: [...s.asks].reverse(), disclosures: [...s.disclosures].reverse(), writes: [...s.writes].reverse() }
      }
      const asks = s.asks.filter(a => a.owner === owner)
      const disclosures = s.disclosures.filter(d => d.owner === owner)
      const involved = new Set([...asks.map(a => a.requester), ...disclosures.map(d => d.requester)])
      const requesters = s.requesters
        .filter(r => involved.has(r.id) || r.revoked_by?.includes(owner))
        .map(({ revoked_by, remembered, ...r }) => ({
          ...r,
          status: revoked_by?.includes(owner) ? 'revoked' : 'active',
          remembered: Object.fromEntries(Object.entries(remembered ?? {}).filter(([k]) => k.startsWith(`${owner}/`))),
        }))
      const writes = s.writes.filter(w => w.owner === owner)
      return { requesters, asks: [...asks].reverse(), disclosures: [...disclosures].reverse(), writes: [...writes].reverse() }
    },
  }
}
