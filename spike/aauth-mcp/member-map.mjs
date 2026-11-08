// Names the store member that Bob's person server speaks for, in MEMBER_MAP's file, from the store's database on this laptop. Usage: node member-map.mjs <first name or member id>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { PS } from './config.mjs'

const fail = msg => { console.error(`✗ ${msg}`); process.exit(1) }
const who = process.argv[2]
if (!who || process.argv.length > 3) fail('usage: node member-map.mjs <first name or member id>')

// STORE_DB is relative to store/, where the store runs.
const dbPath = resolve(fileURLToPath(new URL('../../store/', import.meta.url)), process.env.STORE_DB || 'store.db')
if (!existsSync(dbPath)) fail(`no store database at ${dbPath}; start the demo and create an account first`)
const file = process.env.MEMBER_MAP || fileURLToPath(new URL('./.keys/member-map.json', import.meta.url))
if (file.trim().startsWith('{')) fail('MEMBER_MAP in .env is inline JSON; edit it there instead')

const db = new DatabaseSync(dbPath, { readOnly: true })
const members = db.prepare('SELECT id, first_name, last_name, created_at FROM users ORDER BY created_at').all()
db.close()
const plain = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const hits = members.filter(m => m.id === who || (who.length >= 8 && m.id.startsWith(who)) || plain(m.first_name) === plain(who))
const joined = v => (Number.isFinite(Number(v)) ? new Date(Number(v)).toISOString().slice(0, 16).replace('T', ' ') : v)
const line = m => `  ${m.id}  ${m.first_name} ${m.last_name}, joined ${joined(m.created_at)}`
if (hits.length !== 1) {
  const why = hits.length ? `${hits.length} members match "${who}"` : `no member matches "${who}"`
  fail(`${why}; pass one of these ids instead:\n${(hits.length ? hits : members).map(line).join('\n') || '  (no members yet)'}`)
}

const [member] = hits
const map = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8').trim() || '{}') : {}
map[PS] = member.id
writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`, { mode: 0o600 })
console.log(`✓ ${PS} speaks for ${member.first_name} ${member.last_name} (${member.id}), in ${file}`)
