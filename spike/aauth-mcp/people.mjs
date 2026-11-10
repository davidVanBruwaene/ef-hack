// The people network in store/ as Alice's MCP server reads it: members, their items with each one's rule for a given member, and who is signed in to the console.
const KNOWN_MS = 10 * 60_000

// Returns null when STORE_URL is unset, so the server keeps alice.json. resolve(ps, sub) asks a person server the directory trusts which member a sub is.
export function openPeople(env = process.env, { resolve } = {}) {
  if (!env.STORE_URL) return null
  if (!env.STORE_INTERNAL_TOKEN) throw new Error('STORE_URL is set but STORE_INTERNAL_TOKEN is not')
  const base = env.STORE_URL.replace(/\/+$/, '')
  const known = new Map()

  async function call(path, headers) {
    const res = await fetch(`${base}${path}`, { headers })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      const err = new Error(`store ${path.split('?')[0]} answered ${res.status}${body?.error ? ` ${body.error}` : ''}`)
      throw Object.assign(err, { status: res.status, code: body?.error })
    }
    return body
  }
  const internal = path => call(path, { authorization: `Bearer ${env.STORE_INTERNAL_TOKEN}` })
  const q = encodeURIComponent

  return {
    url: base,
    // A member id, or null for a person server the directory does not trust or a sub it does not know.
    async memberFor(ps, sub) {
      const key = `${ps} ${sub}`
      const k = known.get(key)
      if (k && k.until > Date.now()) return k.id
      const id = resolve ? await resolve(ps, sub) : null
      if (!id) return null
      // The person server may name a member whose store account is gone.
      try { await internal(`/internal/users/${q(id)}/items`) } catch (err) { if (err.status === 404) return null; throw err }
      known.set(key, { id, until: Date.now() + KNOWN_MS })
      return id
    },
    search: (as, query = '') => internal(`/internal/search?as=${q(as)}&q=${q(query)}`),
    itemsOf: (owner, forMember) => internal(`/internal/users/${q(owner)}/items?for=${q(forMember)}`),
    // The console sends the store's session cookie along with /api; the store says whose session it is.
    async signedIn(cookieHeader) {
      const sid = /(?:^|;\s*)sid=([^;]+)/.exec(cookieHeader ?? '')?.[1]
      if (!sid) return null
      return (await call('/auth/me', { cookie: `sid=${sid}` }))?.user ?? null
    },
  }
}
