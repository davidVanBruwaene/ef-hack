import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { openDb } from './db.ts'
import { createAuth } from './auth.ts'
import { createNetwork } from './network.ts'
import type { Config } from './config.ts'

export function createApp(config: Config): Hono {
  const db = openDb(config.dbPath)
  const app = new Hono()
  const auth = createAuth(db, config)
  app.route('/', auth.app)
  app.route('/', createNetwork(db, config, auth.userFor))
  app.get('/health', (c) => c.json({ ok: true }))
  // The page a phone opens after scanning the QR code.
  const pairPage = readFileSync(new URL('../pair/index.html', import.meta.url), 'utf8')
  app.get('/pair', (c) => c.html(pairPage))
  // The page a person opens after scanning an invitation QR code (personal or event).
  const joinPage = readFileSync(new URL('../join/index.html', import.meta.url), 'utf8')
  app.get('/join', (c) => c.html(joinPage))
  // Local testing page for real browser passkeys. Not for production: set STORE_DEV_PAGE=0 to hide it.
  if (config.devPage) {
    const page = readFileSync(new URL('../dev/index.html', import.meta.url), 'utf8')
    app.get('/dev', (c) => c.html(page))
    app.get('/', (c) => c.redirect('/dev'))
  }
  return app
}
