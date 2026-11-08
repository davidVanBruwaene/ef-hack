// The people network in store/ as Alice's MCP server reads it: members, their items with each one's rule for a given member, and who is signed in to the console.
import { readFileSync } from 'node:fs'

// MEMBER_MAP is inline JSON, or the path of a JSON file read on every lookup so setup can change it while the server runs.
export function memberMap(value) {
  const v = (value ?? '').trim()
  if (!v) return () => ({})
  if (v.startsWith('{')) {
    const map = JSON.parse(v)
    return () => map
  }
  return () => JSON.parse(readFileSync(v, 'utf8'))
}

// Returns null when STORE_URL is unset, so the server keeps alice.json.
export function openPeople(env = process.env) {
  if (!env.STORE_URL) return null
  if (!env.STORE_INTERNAL_TOKEN) throw new Error('STORE_URL is set but STORE_INTERNAL_TOKEN is not')
  const base = env.STORE_URL.replace(/\/+$/, '')
  const map = memberMap(env.MEMBER_MAP)
  map()

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
    // "<person server> <sub>" first, then the person server alone, which covers one person per person server.
    memberFor(ps, sub) {
      const m = map()
      return m[`${ps} ${sub}`] ?? m[ps] ?? null
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
