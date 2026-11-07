import { serve } from '@hono/node-server'
import { loadConfig } from './config.mjs'
import { createApp } from './app.mjs'

const config = loadConfig()
serve({ fetch: createApp(config).fetch, port: config.port }, (info) => {
  console.log(`store listening on http://localhost:${info.port} (rpID ${config.rpID}, origins ${config.origins.join(', ')})`)
})
