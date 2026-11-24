import { sha256 } from './store.mjs'

// Appends entry to list, hashing it with the previous entry's hash so an edited or dropped entry breaks the chain.
export function link(list, entry) {
  const prev = list.at(-1)?.hash ?? ''
  const body = { ...entry, prev }
  const linked = { ...body, hash: sha256(prev + JSON.stringify(body)) }
  list.push(linked)
  return linked
}

// Entries written before a list was chained carry no hash and are skipped while they lead the list.
export function checkChain(list) {
  let prev = ''
  let started = false
  for (const [i, e] of list.entries()) {
    if (!e.hash && !started) continue
    started = true
    const { hash, ...body } = e
    if (e.prev !== prev || hash !== sha256(prev + JSON.stringify(body))) return { ok: false, length: list.length, broken_at: i }
    prev = hash
  }
  return { ok: true, length: list.length }
}
