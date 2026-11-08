import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { CookieOptions } from 'hono/utils/cookie'
import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import QRCode from 'qrcode'
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  VerifiedRegistrationResponse,
} from '@simplewebauthn/server'
import { sha256, newRecoveryCodes, normalizeCode } from './db.ts'
import type { CredentialRow, RecoveryCodeRow, SessionRow, UserRow } from './db.ts'
import type { Config } from './config.ts'

const SESSION_MS = 7 * 24 * 3600 * 1000
const CHALLENGE_MS = 5 * 60 * 1000

type ChallengeKind = 'register' | 'login' | 'add'

interface Challenge {
  kind: ChallengeKind
  challenge: string
  userId?: string
  pending?: { userId: string; first: string; last: string }
  exp: number
}

interface Session {
  user: UserRow
  via: SessionRow['via']
  token: string
}

const PAIR_MS = 5 * 60 * 1000
const PAIR_ATTEMPTS = 3

// QR sign-in: the computer shows a QR code and a code; the phone opens the link, types the code,
// then registers or signs in with its own passkey. The computer then claims a session.
interface Pairing {
  pollHash: string
  joinHash?: string
  code: string
  status: 'pending' | 'joined' | 'approved'
  userId?: string
  attempts: number
  exp: number
}

type Env = { Variables: { session: Session } }
type Ctx = Context<Env>

const one = <T>(s: StatementSync) => (...p: SQLInputValue[]) => s.get(...p) as T | undefined
const all = <T>(s: StatementSync) => (...p: SQLInputValue[]) => s.all(...p) as unknown as T[]

export function createAuth(db: DatabaseSync, config: Config): Hono<Env> {
  const app = new Hono<Env>()
  const secure = config.origins.every((o) => o.startsWith('https://'))
  const challenges = new Map<string, Challenge>()
  const hits = new Map<string, number[]>() // ip -> timestamps, for the recovery endpoint
  const pairings = new Map<string, Pairing>()

  const q = {
    userById: one<UserRow>(db.prepare('SELECT * FROM users WHERE id = ?')),
    credById: one<CredentialRow>(db.prepare('SELECT * FROM credentials WHERE id = ?')),
    credsOf: all<CredentialRow>(db.prepare('SELECT * FROM credentials WHERE user_id = ? ORDER BY created_at')),
    insUser: db.prepare('INSERT INTO users (id, display_name, first_name, last_name, created_at) VALUES (?,?,?,?,?)'),
    insCred: db.prepare(
      'INSERT INTO credentials (id, user_id, public_key, counter, transports, device_type, backed_up, label, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ),
    bump: db.prepare('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?'),
    delCred: db.prepare('DELETE FROM credentials WHERE id = ? AND user_id = ?'),
    insSession: db.prepare('INSERT INTO sessions (token_hash, user_id, via, expires_at) VALUES (?,?,?,?)'),
    sessionByHash: one<SessionRow>(db.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?')),
    delSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    insCode: db.prepare('INSERT INTO recovery_codes (code_hash, user_id) VALUES (?, ?)'),
    codeByHash: one<RecoveryCodeRow>(db.prepare('SELECT * FROM recovery_codes WHERE code_hash = ? AND used_at IS NULL')),
    useCode: db.prepare('UPDATE recovery_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL'),
    delCodes: db.prepare('DELETE FROM recovery_codes WHERE user_id = ?'),
    countCodes: one<{ n: number }>(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL')),
  }

  const cookieOpts: CookieOptions = { httpOnly: true, sameSite: 'Lax', secure, path: '/' }

  function putChallenge(c: Ctx, entry: Omit<Challenge, 'exp'>): void {
    const id = randomBytes(18).toString('base64url')
    challenges.set(id, { ...entry, exp: Date.now() + CHALLENGE_MS })
    setCookie(c, 'ch', id, { ...cookieOpts, maxAge: CHALLENGE_MS / 1000 })
  }

  // A challenge is single use: reading it removes it.
  function takeChallenge(c: Ctx, kind: ChallengeKind): Challenge | null {
    const id = getCookie(c, 'ch')
    deleteCookie(c, 'ch', { path: '/' })
    const e = id ? challenges.get(id) : undefined
    if (id) challenges.delete(id)
    if (!e || e.exp < Date.now() || e.kind !== kind) return null
    return e
  }

  function startSession(c: Ctx, userId: string, via: SessionRow['via']): void {
    const token = randomBytes(32).toString('base64url')
    q.insSession.run(sha256(token), userId, via, Date.now() + SESSION_MS)
    setCookie(c, 'sid', token, { ...cookieOpts, maxAge: SESSION_MS / 1000 })
  }

  function currentSession(c: Ctx): Session | null {
    const token = getCookie(c, 'sid')
    if (!token) return null
    const s = q.sessionByHash(sha256(token), Date.now())
    if (!s) return null
    const user = q.userById(s.user_id)
    return user ? { user, via: s.via, token } : null
  }

  function issueRecoveryCodes(userId: string): string[] {
    q.delCodes.run(userId)
    const codes = newRecoveryCodes()
    for (const code of codes) q.insCode.run(sha256(normalizeCode(code)), userId)
    return codes
  }

  type RegistrationInfo = NonNullable<VerifiedRegistrationResponse['registrationInfo']>

  function storeCredential(userId: string, info: RegistrationInfo, label: string): void {
    const cred = info.credential
    q.insCred.run(
      cred.id,
      userId,
      cred.publicKey,
      cred.counter,
      JSON.stringify(cred.transports ?? []),
      info.credentialDeviceType,
      info.credentialBackedUp ? 1 : 0,
      label,
      Date.now(),
    )
  }

  function livePairing(id: unknown): Pairing | null {
    const p = typeof id === 'string' ? pairings.get(id) : undefined
    if (!p) return null
    if (p.exp < Date.now()) {
      pairings.delete(id as string)
      return null
    }
    return p
  }

  const sameSecret = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

  // A phone finishing a QR sign-in must have entered the right code first.
  function pairingForVerify(c: Ctx): { id: string; p: Pairing } | null | 'bad' {
    const id = c.req.query('pair')
    if (!id) return null
    const p = livePairing(id)
    // Only the phone that typed the code holds the join token, so nobody else can finish the pairing.
    return p && p.status === 'joined' && p.joinHash && sameSecret(sha256(c.req.query('jt') ?? ''), p.joinHash) ? { id, p } : 'bad'
  }

  const publicUser = (u: UserRow) => ({
    id: u.id,
    display_name: u.display_name,
    first_name: u.first_name,
    last_name: u.last_name,
  })

  // CSRF: every state-changing call must come from one of our own origins.
  app.use('*', async (c, next) => {
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin')
      if (!origin || !config.origins.includes(origin)) return c.json({ error: 'bad_origin' }, 403)
    }
    await next()
  })

  app.get('/auth/me', (c) => {
    const s = currentSession(c)
    if (!s) return c.json({ user: null })
    return c.json({
      user: publicUser(s.user),
      session: s.via,
      recovery_codes_left: q.countCodes(s.user.id)?.n ?? 0,
      passkeys: q.credsOf(s.user.id).length,
    })
  })

  // ---- Create an account: the passkey is the account. ----
  app.post('/auth/register/options', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const first = String(body.first_name ?? '').trim()
    const last = String(body.last_name ?? '').trim()
    if (!first || !last || first.length > 80 || last.length > 80) return c.json({ error: 'name_required' }, 400)
    const userId = randomUUID()
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userName: `${first} ${last}`,
      userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    })
    putChallenge(c, { kind: 'register', challenge: options.challenge, pending: { userId, first, last } })
    return c.json(options)
  })

  app.post('/auth/register/verify', async (c) => {
    const pair = pairingForVerify(c)
    if (pair === 'bad') return c.json({ error: 'pair_not_ready' }, 403)
    const e = takeChallenge(c, 'register')
    if (!e?.pending) return c.json({ error: 'challenge_expired' }, 400)
    const body = (await c.req.json().catch(() => null)) as RegistrationResponseJSON | null
    if (!body) return c.json({ error: 'verification_failed' }, 400)
    let result: VerifiedRegistrationResponse
    try {
      result = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: e.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        requireUserVerification: false,
      })
    } catch {
      return c.json({ error: 'verification_failed' }, 400)
    }
    if (!result.verified) return c.json({ error: 'verification_failed' }, 400)
    const { userId, first, last } = e.pending
    q.insUser.run(userId, `${first} ${last}`, first, last, Date.now())
    storeCredential(userId, result.registrationInfo, 'First passkey')
    const codes = issueRecoveryCodes(userId)
    startSession(c, userId, 'passkey')
    if (pair) Object.assign(pair.p, { status: 'approved', userId })
    // The plain codes are shown exactly once; only hashes are stored.
    return c.json({ user: publicUser(q.userById(userId)!), recovery_codes: codes })
  })

  // ---- Sign in: discoverable credential, so no username is typed. ----
  app.post('/auth/login/options', async (c) => {
    const options = await generateAuthenticationOptions({ rpID: config.rpID, userVerification: 'preferred' })
    putChallenge(c, { kind: 'login', challenge: options.challenge })
    return c.json(options)
  })

  app.post('/auth/login/verify', async (c) => {
    const pair = pairingForVerify(c)
    if (pair === 'bad') return c.json({ error: 'pair_not_ready' }, 403)
    const e = takeChallenge(c, 'login')
    if (!e) return c.json({ error: 'challenge_expired' }, 400)
    const body = (await c.req.json().catch(() => null)) as AuthenticationResponseJSON | null
    const row = body && typeof body.id === 'string' ? q.credById(body.id) : undefined
    if (!body || !row) return c.json({ error: 'unknown_credential' }, 401)
    let verified: boolean
    let newCounter = 0
    try {
      const result = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: e.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        requireUserVerification: false,
        credential: {
          id: row.id,
          publicKey: new Uint8Array(row.public_key),
          counter: row.counter,
          transports: JSON.parse(row.transports),
        },
      })
      verified = result.verified
      newCounter = result.authenticationInfo.newCounter
    } catch {
      return c.json({ error: 'verification_failed' }, 401)
    }
    if (!verified) return c.json({ error: 'verification_failed' }, 401)
    q.bump.run(newCounter, Date.now(), row.id)
    startSession(c, row.user_id, 'passkey')
    if (pair) Object.assign(pair.p, { status: 'approved', userId: row.user_id })
    return c.json({ user: publicUser(q.userById(row.user_id)!) })
  })

  // ---- QR sign-in ----
  app.post('/auth/pair/start', async (c) => {
    const id = randomBytes(16).toString('base64url')
    const pollToken = randomBytes(24).toString('base64url')
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    pairings.set(id, { pollHash: sha256(pollToken), code, status: 'pending', attempts: 0, exp: Date.now() + PAIR_MS })
    const base = config.publicUrl ?? c.req.header('origin')!
    const url = `${base}/pair?c=${id}`
    return c.json({
      pair_id: id,
      poll_token: pollToken,
      code,
      url,
      qr: await QRCode.toDataURL(url, { margin: 1, width: 280 }),
      expires_in: PAIR_MS / 1000,
    })
  })

  // The phone proves it can see the computer's screen by typing the code.
  app.post('/auth/pair/join', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const p = livePairing(body.pair_id)
    if (!p || p.status !== 'pending') return c.json({ error: 'pair_expired' }, 404)
    if (sameSecret(String(body.code ?? ''), p.code)) {
      const joinToken = randomBytes(24).toString('base64url')
      p.status = 'joined'
      p.joinHash = sha256(joinToken)
      return c.json({ ok: true, join_token: joinToken })
    }
    p.attempts += 1
    if (p.attempts >= PAIR_ATTEMPTS) pairings.delete(body.pair_id)
    return c.json({ error: 'wrong_code', attempts_left: Math.max(0, PAIR_ATTEMPTS - p.attempts) }, 403)
  })

  // The computer polls; only the holder of the poll token can take the session, and only once.
  app.post('/auth/pair/claim', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const p = livePairing(body.pair_id)
    if (!p || !sameSecret(sha256(String(body.poll_token ?? '')), p.pollHash)) return c.json({ error: 'pair_expired' }, 404)
    if (p.status !== 'approved' || !p.userId) return c.json({ status: p.status })
    pairings.delete(body.pair_id)
    startSession(c, p.userId, 'passkey')
    return c.json({ status: 'signed_in', user: publicUser(q.userById(p.userId)!) })
  })

  app.post('/auth/logout', (c) => {
    const s = currentSession(c)
    if (s) q.delSession.run(sha256(s.token))
    deleteCookie(c, 'sid', { path: '/' })
    return c.json({ ok: true })
  })

  // ---- Recovery: a one-time code gets you a session, then you add a new passkey. ----
  app.post('/auth/recover', async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? 'local'
    const now = Date.now()
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000)
    if (recent.length >= 10) return c.json({ error: 'rate_limited' }, 429)
    hits.set(ip, [...recent, now])
    const body = await c.req.json().catch(() => ({}))
    const hash = sha256(normalizeCode(body.code ?? ''))
    const row = q.codeByHash(hash)
    if (!row || q.useCode.run(now, hash).changes !== 1) return c.json({ error: 'invalid_code' }, 401)
    startSession(c, row.user_id, 'recovery')
    return c.json({ user: publicUser(q.userById(row.user_id)!), next: 'add_passkey' })
  })

  // ---- Signed in: manage passkeys and recovery codes. ----
  const needSession: MiddlewareHandler<Env> = async (c, next) => {
    const s = currentSession(c)
    if (!s) return c.json({ error: 'unauthorized' }, 401)
    c.set('session', s)
    await next()
  }

  app.get('/auth/credentials', needSession, (c) => {
    const { user } = c.get('session')
    return c.json(
      q.credsOf(user.id).map((r) => ({
        id: r.id,
        label: r.label,
        device_type: r.device_type,
        backed_up: !!r.backed_up,
        created_at: r.created_at,
        last_used_at: r.last_used_at,
      })),
    )
  })

  app.post('/auth/credentials/options', needSession, async (c) => {
    const { user } = c.get('session')
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userName: user.display_name,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: q.credsOf(user.id).map((r) => ({ id: r.id, transports: JSON.parse(r.transports) })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    })
    putChallenge(c, { kind: 'add', challenge: options.challenge, userId: user.id })
    return c.json(options)
  })

  app.post('/auth/credentials/verify', needSession, async (c) => {
    const { user } = c.get('session')
    const e = takeChallenge(c, 'add')
    if (!e || e.userId !== user.id) return c.json({ error: 'challenge_expired' }, 400)
    const body = (await c.req.json().catch(() => null)) as { response?: RegistrationResponseJSON; label?: string } | null
    if (!body?.response) return c.json({ error: 'verification_failed' }, 400)
    let result: VerifiedRegistrationResponse
    try {
      result = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: e.challenge,
        expectedOrigin: config.origins,
        expectedRPID: config.rpID,
        requireUserVerification: false,
      })
    } catch {
      return c.json({ error: 'verification_failed' }, 400)
    }
    if (!result.verified) return c.json({ error: 'verification_failed' }, 400)
    const label = String(body.label ?? '').slice(0, 60) || 'Another passkey'
    storeCredential(user.id, result.registrationInfo, label)
    return c.json({ ok: true })
  })

  app.delete('/auth/credentials/:id', needSession, (c) => {
    const { user } = c.get('session')
    if (q.credsOf(user.id).length <= 1) return c.json({ error: 'last_passkey' }, 409)
    const r = q.delCred.run(c.req.param('id'), user.id)
    return r.changes ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404)
  })

  // Replaces all unused codes with fresh ones; shown once.
  app.post('/auth/recovery-codes', needSession, (c) => {
    const { user } = c.get('session')
    return c.json({ recovery_codes: issueRecoveryCodes(user.id) })
  })

  return app
}
