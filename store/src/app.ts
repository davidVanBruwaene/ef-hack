import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { openDb } from './db.ts'
import { createAuth } from './auth.ts'
import type { Config } from './config.ts'

export function createApp(config: Config): Hono {
  const db = openDb(config.dbPath)
  const app = new Hono()
  app.route('/', createAuth(db, config))
  app.get('/health', (c) => c.json({ ok: true }))
  // Local testing page for real browser passkeys. Not for production: set STORE_DEV_PAGE=0 to hide it.
  if (config.devPage) {
    const page = readFileSync(new URL('../dev/index.html', import.meta.url), 'utf8')
    app.get('/dev', (c) => c.html(page))
    app.get('/', (c) => c.redirect('/dev'))
  }
  return app
}
