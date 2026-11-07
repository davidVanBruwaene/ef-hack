// Small persistence helpers shared by Alice's and Bob's state: JSON files in .data/ and bearer tokens in .keys/.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { DATA_DIR, KEY_DIR } from './config.mjs'

export const sha256 = data => createHash('sha256').update(data).digest('base64url')
export const now = () => new Date().toISOString()
export const randomId = (prefix, bytes = 6) => `${prefix}_${randomBytes(bytes).toString('base64url')}`

// The named env variable, or else a random token generated once into .keys/<file>.
export function bearerToken(envName, file) {
  if (process.env[envName]) return process.env[envName]
  const path = new URL(file, KEY_DIR)
  if (!existsSync(path)) {
    mkdirSync(KEY_DIR, { recursive: true })
    writeFileSync(path, randomBytes(24).toString('base64url'), { mode: 0o600 })
  }
  return readFileSync(path, 'utf8').trim()
}

export function tokenMatches(header, token) {
  const given = Buffer.from(String(header ?? ''))
  const want = Buffer.from(`Bearer ${token}`)
  return given.length === want.length && timingSafeEqual(given, want)
}

export function jsonFile(name) {
  const path = new URL(name, DATA_DIR)
  return {
    load: () => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}),
    save(value) {
      mkdirSync(DATA_DIR, { recursive: true })
      const tmp = new URL(`${name}.tmp`, DATA_DIR)
      writeFileSync(tmp, JSON.stringify(value, null, 2))
      renameSync(tmp, path)
    },
  }
}
