import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import QRCode from 'qrcode'
import type { DatabaseSync } from 'node:sqlite'
import type { Config } from './config.ts'
import type { UserRow } from './db.ts'
import { originGuard } from './guard.ts'
import {
  addItem,
  applyInvite,
  createInvite,
  effectiveRule,
  inviteByToken,
  inviteUsable,
  isRule,
  searchMembers,
} from './people.ts'
import type { InviteRow, ItemRow, Rule } from './people.ts'

type Env = { Variables: { user: UserRow } }

const rows = <T>(db: DatabaseSync, sql: string, ...p: (string | number)[]) => db.prepare(sql).all(...p) as unknown as T[]
const row = <T>(db: DatabaseSync, sql: string, ...p: (string | number)[]) => db.prepare(sql).get(...p) as T | undefined

export function createNetwork(db: DatabaseSync, config: Config, userFor: (c: Context) => UserRow | null): Hono<Env> {
  const app = new Hono<Env>()
  app.use('*', originGuard(config))

  const needUser: MiddlewareHandler<Env> = async (c, next) => {
    const u = userFor(c)
    if (!u) return c.json({ error: 'unauthorized' }, 401)
    c.set('user', u)
    await next()
  }

  const baseUrl = (c: Context): string | undefined => config.publicUrl ?? c.req.header('origin')

  async function inviteView(c: Context, inv: InviteRow) {
    const url = `${baseUrl(c) ?? ''}/join?i=${inv.token}`
    return {
      id: inv.id,
      kind: inv.kind,
      name: inv.name,
      url,
      qr: await QRCode.toDataURL(url, { margin: 1, width: 320 }),
      uses: inv.uses,
      max_uses: inv.max_uses,
      expires_at: inv.expires_at,
      revoked: !!inv.revoked,
      grants: JSON.parse(inv.grants) as Record<string, Rule>,
    }
  }

  // ---- My items: what I share, with a network rule each. ----
  app.get('/me/items', needUser, (c) => {
    const rs = rows<ItemRow>(db, 'SELECT * FROM items WHERE user_id = ? ORDER BY created_at', c.get('user').id)
    return c.json(rs.map(({ id, label, value, rule }) => ({ id, label, value, rule })))
  })

  app.post('/me/items', needUser, async (c) => {
    const b = await c.req.json().catch(() => ({}))
    if (b.rule !== undefined && !isRule(b.rule)) return c.json({ error: 'bad_rule' }, 400)
    const r = addItem(db, c.get('user').id, String(b.label ?? ''), String(b.value ?? ''), b.rule ?? 'ask')
    if (typeof r === 'string') return c.json({ error: r }, 400)
    return c.json({ id: r.id, label: r.label, value: r.value, rule: r.rule })
  })

  app.post('/me/items/:id', needUser, async (c) => {
    const b = await c.req.json().catch(() => ({}))
    if (!isRule(b.rule)) return c.json({ error: 'bad_rule' }, 400)
    const r = db.prepare('UPDATE items SET rule = ? WHERE user_id = ? AND id = ?').run(b.rule, c.get('user').id, c.req.param('id'))
    return r.changes ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
  })

  app.delete('/me/items/:id', needUser, (c) => {
    const id = c.req.param('id')
    if (id === 'first' || id === 'last') return c.json({ error: 'name_cannot_be_removed' }, 409)
    const r = db.prepare('DELETE FROM items WHERE user_id = ? AND id = ?').run(c.get('user').id, id)
    db.prepare('DELETE FROM person_rules WHERE owner_id = ? AND item_id = ?').run(c.get('user').id, id)
    return r.changes ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
  })

  // ---- People I am connected to, and my rules for each of them. ----
  app.get('/me/people', needUser, (c) => {
    const me = c.get('user').id
    const people = rows<{ person_id: string; first_name: string; last_name: string; created_at: number }>(
      db,
      'SELECT c.person_id, u.first_name, u.last_name, c.created_at FROM connections c JOIN users u ON u.id = c.person_id WHERE c.owner_id = ? ORDER BY c.created_at',
      me,
    )
    return c.json(
      people.map((p) => ({
        id: p.person_id,
        first_name: p.first_name,
        last_name: p.last_name,
        connected_at: p.created_at,
        rules: Object.fromEntries(rows<{ item_id: string; rule: Rule }>(db, 'SELECT item_id, rule FROM person_rules WHERE owner_id = ? AND person_id = ?', me, p.person_id).map((r) => [r.item_id, r.rule])),
      })),
    )
  })

  // rule: a rule overrides the network rule for this person; null removes the override.
  app.post('/me/people/:personId/rules', needUser, async (c) => {
    const me = c.get('user').id
    const personId = c.req.param('personId')
    const b = await c.req.json().catch(() => ({}))
    if (!row(db, 'SELECT 1 FROM users WHERE id = ?', personId)) return c.json({ error: 'not_found' }, 404)
    if (!row(db, 'SELECT 1 FROM items WHERE user_id = ? AND id = ?', me, String(b.item_id ?? ''))) return c.json({ error: 'unknown_item' }, 404)
    if (b.rule === null) db.prepare('DELETE FROM person_rules WHERE owner_id = ? AND person_id = ? AND item_id = ?').run(me, personId, b.item_id)
    else if (isRule(b.rule)) db.prepare('INSERT OR REPLACE INTO person_rules (owner_id, person_id, item_id, rule) VALUES (?,?,?,?)').run(me, personId, b.item_id, b.rule)
    else return c.json({ error: 'bad_rule' }, 400)
    return c.json({ ok: true })
  })

  // ---- Invites: a personal code connects one person, an event code brings in many. ----
  app.post('/me/invites', needUser, async (c) => {
    const b = await c.req.json().catch(() => ({}))
    if (b.kind !== 'personal' && b.kind !== 'event') return c.json({ error: 'bad_kind' }, 400)
    const r = createInvite(db, c.get('user').id, { kind: b.kind, name: b.name, hours: b.hours, grants: b.grants })
    if (typeof r === 'string') return c.json({ error: r }, 400)
    return c.json(await inviteView(c, r))
  })

  app.get('/me/invites', needUser, async (c) => {
    const rs = rows<InviteRow>(db, 'SELECT * FROM invites WHERE creator_id = ? ORDER BY created_at DESC', c.get('user').id)
    return c.json(await Promise.all(rs.map((r) => inviteView(c, r))))
  })

  app.post('/me/invites/:id/revoke', needUser, (c) => {
    const r = db.prepare('UPDATE invites SET revoked = 1 WHERE id = ? AND creator_id = ?').run(c.req.param('id'), c.get('user').id)
    return r.changes ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
  })

  // What the person scanning sees before they join. No login needed.
  app.get('/invite/:token', (c) => {
    const inv = inviteByToken(db, c.req.param('token'))
    if (!inviteUsable(inv)) return c.json({ valid: false })
    const from = row<{ first_name: string }>(db, 'SELECT first_name FROM users WHERE id = ?', inv.creator_id)
    return c.json({ valid: true, kind: inv.kind, name: inv.name, from: from?.first_name ?? '', expires_at: inv.expires_at })
  })

  // An existing member who is already signed in scans a code.
  app.post('/invite/:token/accept', needUser, (c) => {
    const inv = inviteByToken(db, c.req.param('token'))
    if (!inviteUsable(inv)) return c.json({ error: 'invite_invalid' }, 410)
    return c.json(applyInvite(db, inv, c.get('user').id))
  })

  // ---- Search: what my own agent would see of everyone else. ----
  app.get('/network/search', needUser, (c) => c.json(searchMembers(db, c.get('user').id, c.req.query('q') ?? '')))

  // ---- For the MCP server: the same search on behalf of any member, and an owner's items for one person. ----
  const internal: MiddlewareHandler<Env> = async (c, next) => {
    if (!config.internalToken) return c.json({ error: 'not_found' }, 404)
    if (c.req.header('authorization') !== `Bearer ${config.internalToken}`) return c.json({ error: 'unauthorized' }, 401)
    await next()
  }

  app.get('/internal/search', internal, (c) => {
    const as = c.req.query('as') ?? ''
    if (!row(db, 'SELECT 1 FROM users WHERE id = ?', as)) return c.json({ error: 'unknown_member' }, 404)
    return c.json(searchMembers(db, as, c.req.query('q') ?? ''))
  })

  app.get('/internal/users/:id/items', internal, (c) => {
    const owner = c.req.param('id')
    const person = c.req.query('for') ?? ''
    if (!row(db, 'SELECT 1 FROM users WHERE id = ?', owner)) return c.json({ error: 'unknown_member' }, 404)
    const its = rows<ItemRow>(db, 'SELECT * FROM items WHERE user_id = ? ORDER BY created_at', owner)
    return c.json(its.map((it) => ({ id: it.id, label: it.label, value: it.value, network_rule: it.rule, rule: person ? effectiveRule(db, owner, person, it) : it.rule })))
  })

  return app
}
