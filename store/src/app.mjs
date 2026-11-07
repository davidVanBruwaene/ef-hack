import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { openDb } from './db.mjs'
import { createAuth } from './auth.mjs'

export function createApp(config) {
  const db = openDb(config.dbPath)
  const app = new Hono()
  app.route('/', createAuth(db, config))
  app.get('/health', (c) => c.json({ ok: true }))
  // Local testing page for real browser passkeys. Not for production: set STORE_DEV_PAGE=0 to hide it.
  if (config.devPage) {
    const page = readFileSync(new URL('../dev/index.html', import.meta.url), 'utf8')
    app.get('/dev', (c) => c.html(page))
  }
  return app
}
