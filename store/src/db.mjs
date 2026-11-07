import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes } from 'node:crypto'

export const sha256 = (s) => createHash('sha256').update(s).digest('base64url')

export function openDb(path) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL,
      transports TEXT NOT NULL,
      device_type TEXT NOT NULL,
      backed_up INTEGER NOT NULL,
      label TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      via TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recovery_codes (
      code_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      used_at INTEGER
    );
  `)
  return db
}

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz' // Crockford base32, no i l o u

export function newRecoveryCodes(n = 8) {
  return Array.from({ length: n }, () => {
    const bytes = randomBytes(10)
    const s = Array.from(bytes, (b) => ALPHABET[b % 32]).join('')
    return `${s.slice(0, 5)}-${s.slice(5)}` // 50 bits each
  })
}

export const normalizeCode = (c) => String(c).toLowerCase().replace(/[^0-9a-z]/g, '')
