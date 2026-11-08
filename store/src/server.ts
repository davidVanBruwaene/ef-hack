import { serve } from '@hono/node-server'
import { loadConfig } from './config.ts'
import { createApp } from './app.ts'

const config = loadConfig()
serve({ fetch: createApp(config).fetch, port: config.port }, (info) => {
  console.log(`store listening on http://localhost:${info.port} (rpID ${config.rpID}, origins ${config.origins.join(', ')})`)
})
