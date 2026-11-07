// Alice's state: her items and their rules, the requesters, the asks waiting on her, and the disclosure log.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { DATA_DIR, KEY_DIR } from './config.mjs'

const FILE = new URL('alice-state.json', DATA_DIR)
const sha = text => createHash('sha256').update(text).digest('base64url')
const now = () => new Date().toISOString()

export const RULES = ['everyone', 'ask', 'only_me']

// A short, URL-safe id for a person as their person server names them to Alice (the sub is pairwise).
export const requesterId = (ps, sub) => `r_${sha(`${ps} ${sub}`).slice(0, 16)}`

// Bearer token for /api. Set ALICE_CONSOLE_TOKEN, or one is generated into .keys/alice-console-token.
export function consoleToken() {
  if (process.env.ALICE_CONSOLE_TOKEN) return process.env.ALICE_CONSOLE_TOKEN
  const file = new URL('alice-console-token', KEY_DIR)
  if (!existsSync(file)) {
    mkdirSync(KEY_DIR, { recursive: true })
    writeFileSync(file, randomBytes(24).toString('base64url'), { mode: 0o600 })
  }
  return readFileSync(file, 'utf8').trim()
}

export const tokenMatches = (header, token) => {
  const given = Buffer.from(String(header ?? ''))
  const want = Buffer.from(`Bearer ${token}`)
  return given.length === want.length && timingSafeEqual(given, want)
}

const slug = label => label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'link'

export function openState(seedUrl) {
  const seed = JSON.parse(readFileSync(seedUrl, 'utf8'))
  const saved = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}
  const s = {
    owner: seed.owner,
    items: saved.items ?? seed.items,
    requesters: saved.requesters ?? [],
    asks: saved.asks ?? [],
    disclosures: saved.disclosures ?? [],
  }
  let rev = 0
  const listeners = new Set()

  function changed() {
    mkdirSync(DATA_DIR, { recursive: true })
    const tmp = new URL('alice-state.json.tmp', DATA_DIR)
    const { items, requesters, asks, disclosures } = s
    writeFileSync(tmp, JSON.stringify({ items, requesters, asks, disclosures }, null, 2))
    renameSync(tmp, FILE)
    rev++
    for (const l of listeners) l(rev)
  }

  const requester = id => s.requesters.find(r => r.id === id)
  const remembered = (rid, itemId) => requester(rid)?.remembered?.[itemId]
  // Only-me items, and items Alice said no to for good, do not exist for that requester.
  const hidden = (rid, item) => item.rule === 'only_me' || remembered(rid, item.id) === 'deny'
  const shared = (rid, item) => item.rule === 'everyone' || remembered(rid, item.id) === 'approve'

  function resolve(rid, { ids, query } = {}) {
    const items = new Map(), hiddenIds = new Set(), unknown = []
    const add = item => (hidden(rid, item) ? hiddenIds.add(item.id) : items.set(item.id, item))
    for (const id of Array.isArray(ids) ? ids.filter(i => typeof i === 'string') : []) {
      const item = s.items.find(i => i.id === id)
      item ? add(item) : unknown.push(id)
    }
    const words = (typeof query === 'string' ? query : '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1)
    for (const item of s.items) {
      const text = `${item.id} ${item.label}`.toLowerCase()
      if (words.some(w => text.includes(w))) add(item)
    }
    if (!(Array.isArray(ids) && ids.length) && !words.length) for (const item of s.items) if (shared(rid, item)) items.set(item.id, item)
    return { items: [...items.values()], hidden: [...hiddenIds], unknown }
  }

  // Where one requested item stands for this requester and mission; raises an ask if Alice has not been asked yet.
  function decision(rid, mission, item, { agent, reason }) {
    if (item.rule === 'everyone') return { state: 'approved', by: 'rule' }
    if (remembered(rid, item.id) === 'approve') return { state: 'approved', by: 'remembered' }
    let ask = s.asks.find(a => a.requester === rid && a.mission_s256 === mission && a.item_id === item.id)
    if (!ask) {
      ask = {
        id: `ask_${randomBytes(6).toString('base64url')}`,
        requester: rid, agent, mission_s256: mission, item_id: item.id, reason: reason ?? '',
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

  // Each entry hashes the previous one, so an edited or dropped entry breaks the chain.
  function disclose(entry) {
    const prev = s.disclosures.at(-1)?.hash ?? ''
    const body = { at: now(), ...entry, prev }
    s.disclosures.push({ ...body, hash: sha(prev + JSON.stringify(body)) })
    changed()
  }

  return {
    owner: s.owner,
    rev: () => rev,
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
    requester,
    visible: rid => s.items.filter(i => !hidden(rid, i)),
    shared,
    resolve,
    decision,
    waitDecided,
    disclose,

    seen({ id, ps, sub, label, agent }) {
      let r = requester(id)
      if (!r) {
        r = { id, label: label ?? 'Unknown', status: 'active', ps, sub, agent, first_seen: now(), remembered: {} }
        s.requesters.push(r)
        changed()
      } else if ((agent && r.agent !== agent) || (label && r.label === 'Unknown')) {
        if (agent) r.agent = agent
        if (label && r.label === 'Unknown') r.label = label
        changed()
      }
      return r
    },

    decideAsks(decisions) {
      const asks = decisions.map(d => ({ d, ask: s.asks.find(a => a.id === d.id) }))
      const missing = asks.filter(a => !a.ask).map(a => a.d.id)
      if (missing.length) return { missing }
      for (const { d, ask } of asks) applyDecision(ask, d.decision, !!d.remember)
      changed()
      return { missing }
    },

    setRequester(id, { status, label }) {
      const r = requester(id)
      if (!r) return false
      if (status) r.status = status
      if (label) r.label = label
      if (status === 'revoked') {
        for (const a of s.asks) if (a.requester === id && a.status === 'pending') applyDecision(a, 'deny', false, 'revoked')
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

    view: () => ({
      owner: s.owner,
      items: s.items,
      requesters: s.requesters,
      asks: [...s.asks].reverse(),
      disclosures: [...s.disclosures].reverse(),
    }),
  }
}
