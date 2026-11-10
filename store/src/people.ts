// The people database: items with a network rule, per-person overrides, and invites.
import { randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export type Rule = 'everyone' | 'ask' | 'only_me'
export const RULES: Rule[] = ['everyone', 'ask', 'only_me']
export const isRule = (v: unknown): v is Rule => typeof v === 'string' && (RULES as string[]).includes(v)

export interface ItemRow {
  user_id: string
  id: string
  label: string
  value: string
  rule: Rule
  created_at: number
}

export interface InviteRow {
  id: string
  token: string
  kind: 'personal' | 'event'
  creator_id: string
  name: string
  grants: string
  max_uses: number | null
  uses: number
  expires_at: number
  revoked: number
  created_at: number
}

const get = <T>(db: DatabaseSync, sql: string, ...p: (string | number)[]) => db.prepare(sql).get(...p) as T | undefined
const all = <T>(db: DatabaseSync, sql: string, ...p: (string | number)[]) => db.prepare(sql).all(...p) as unknown as T[]

export const slug = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item'

/** First and last name start as Everyone, so people can find each other. */
export function seedItems(db: DatabaseSync, userId: string, first: string, last: string): void {
  const ins = db.prepare('INSERT INTO items (user_id, id, label, value, rule, created_at) VALUES (?,?,?,?,?,?)')
  const now = Date.now()
  ins.run(userId, 'first', 'First name', first, 'everyone', now)
  ins.run(userId, 'last', 'Last name', last, 'everyone', now)
}

const SAFE_VALUE = /^(https?:\/\/|mailto:|tel:)/i
export const isLink = (v: string) => SAFE_VALUE.test(v)

export function addItem(db: DatabaseSync, userId: string, label: string, value: string, rule: Rule = 'ask'): ItemRow | string {
  label = label.trim()
  value = value.trim()
  if (!label || label.length > 80) return 'label_required'
  if (!SAFE_VALUE.test(value) || value.length > 500) return 'value_must_be_a_link'
  if (all<ItemRow>(db, 'SELECT id FROM items WHERE user_id = ?', userId).length >= 60) return 'too_many_items'
  const base = slug(label)
  let id = base
  for (let n = 2; get(db, 'SELECT 1 FROM items WHERE user_id = ? AND id = ?', userId, id); n++) id = `${base}-${n}`
  db.prepare('INSERT INTO items (user_id, id, label, value, rule, created_at) VALUES (?,?,?,?,?,?)').run(userId, id, label, value, rule, Date.now())
  return get<ItemRow>(db, 'SELECT * FROM items WHERE user_id = ? AND id = ?', userId, id)!
}

/** Person rule if there is one, else the network rule. The most specific rule wins. */
export function effectiveRule(db: DatabaseSync, ownerId: string, personId: string, item: ItemRow): Rule {
  const o = get<{ rule: Rule }>(db, 'SELECT rule FROM person_rules WHERE owner_id = ? AND person_id = ? AND item_id = ?', ownerId, personId, item.id)
  return o?.rule ?? item.rule
}

export interface Member {
  id: string
  first_name: string
  last_name: string
  /** Visible to this person: value included. */
  items: { id: string; label: string; value: string }[]
  /** Needs the owner's approval first: label only. */
  ask: { id: string; label: string }[]
}

/**
 * What `personId` (through their agent) may see of everyone else. Items marked Only me for
 * this person are absent entirely, not even their labels. People whose name is hidden from
 * this person are left out.
 */
export function searchMembers(db: DatabaseSync, personId: string, q: string, limit = 50): Member[] {
  const needle = q.trim().toLowerCase()
  const users = all<{ id: string; first_name: string; last_name: string }>(db, 'SELECT id, first_name, last_name FROM users WHERE id != ? ORDER BY created_at', personId)
  const out: Member[] = []
  for (const u of users) {
    const items = all<ItemRow>(db, 'SELECT * FROM items WHERE user_id = ? ORDER BY created_at', u.id)
    const m: Member = { id: u.id, first_name: '', last_name: '', items: [], ask: [] }
    for (const it of items) {
      const rule = effectiveRule(db, u.id, personId, it)
      if (it.id === 'first' && rule === 'everyone') m.first_name = it.value
      else if (it.id === 'last' && rule === 'everyone') m.last_name = it.value
      else if (it.id !== 'first' && it.id !== 'last') {
        if (rule === 'everyone') m.items.push({ id: it.id, label: it.label, value: it.value })
        else if (rule === 'ask') m.ask.push({ id: it.id, label: it.label })
      }
    }
    if (!m.first_name && !m.last_name) continue
    const hay = [m.first_name, m.last_name, `${m.first_name} ${m.last_name}`, ...m.items.flatMap((i) => [i.label, i.value])].join('\n').toLowerCase()
    if (needle && !hay.includes(needle)) continue
    out.push(m)
    if (out.length >= limit) break
  }
  return out
}

// ---- Invites ----

export function createInvite(
  db: DatabaseSync,
  creatorId: string,
  opts: { kind: 'personal' | 'event'; name?: string; hours?: number; grants?: Record<string, Rule> },
): InviteRow | string {
  const hours = Math.min(Math.max(opts.hours ?? (opts.kind === 'event' ? 24 : 72), 1), 24 * 14)
  const grants: Record<string, Rule> = {}
  for (const [itemId, rule] of Object.entries(opts.grants ?? {})) {
    if (!isRule(rule)) return 'bad_grant'
    if (!get(db, 'SELECT 1 FROM items WHERE user_id = ? AND id = ?', creatorId, itemId)) return 'unknown_item'
    grants[itemId] = rule
  }
  const name = (opts.name ?? '').trim().slice(0, 80)
  if (opts.kind === 'event' && !name) return 'event_name_required'
  const id = randomUUID()
  db.prepare('INSERT INTO invites (id, token, kind, creator_id, name, grants, max_uses, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(
    id, randomBytes(16).toString('base64url'), opts.kind, creatorId, name, JSON.stringify(grants), opts.kind === 'personal' ? 1 : null, Date.now() + hours * 3600_000, Date.now(),
  )
  return get<InviteRow>(db, 'SELECT * FROM invites WHERE id = ?', id)!
}

export const inviteByToken = (db: DatabaseSync, token: unknown): InviteRow | undefined =>
  typeof token === 'string' ? get<InviteRow>(db, 'SELECT * FROM invites WHERE token = ?', token) : undefined

export function inviteUsable(inv: InviteRow | undefined, now = Date.now()): inv is InviteRow {
  return !!inv && !inv.revoked && inv.expires_at > now && (inv.max_uses === null || inv.uses < inv.max_uses)
}

/**
 * A person scanned an invite. Event codes only bring them in. Personal codes also connect them to
 * the creator and apply the grants the creator chose as person rules for the scanner.
 */
export function applyInvite(db: DatabaseSync, inv: InviteRow, userId: string): { applied: boolean; kind: InviteRow['kind'] } {
  if (inv.creator_id === userId) return { applied: false, kind: inv.kind }
  if (get(db, 'SELECT 1 FROM invite_uses WHERE invite_id = ? AND user_id = ?', inv.id, userId)) return { applied: false, kind: inv.kind }
  db.prepare('INSERT INTO invite_uses (invite_id, user_id, at) VALUES (?,?,?)').run(inv.id, userId, Date.now())
  db.prepare('UPDATE invites SET uses = uses + 1 WHERE id = ?').run(inv.id)
  if (inv.kind === 'personal') {
    db.prepare('INSERT OR IGNORE INTO connections (owner_id, person_id, via_invite, created_at) VALUES (?,?,?,?)').run(inv.creator_id, userId, inv.id, Date.now())
    const set = db.prepare('INSERT OR REPLACE INTO person_rules (owner_id, person_id, item_id, rule) VALUES (?,?,?,?)')
    for (const [itemId, rule] of Object.entries(JSON.parse(inv.grants) as Record<string, Rule>)) set.run(inv.creator_id, userId, itemId, rule)
  }
  return { applied: true, kind: inv.kind }
}
