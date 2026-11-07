import { Hono } from 'hono'
import { openDb } from './db.mjs'
import { createAuth } from './auth.mjs'

export function createApp(config) {
  const db = openDb(config.dbPath)
  const app = new Hono()
  app.route('/', createAuth(db, config))
  app.get('/health', (c) => c.json({ ok: true }))
  return app
}
