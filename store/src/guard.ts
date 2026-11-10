import type { MiddlewareHandler } from 'hono'
import type { Config } from './config.ts'

// CSRF: every state-changing call must come from one of our own origins.
export const originGuard = (config: Config): MiddlewareHandler => async (c, next) => {
  // /internal/ answers to the bearer token alone, which no other site's page can send.
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !c.req.path.startsWith('/internal/')) {
    const origin = c.req.header('origin')
    if (!origin || !config.origins.includes(origin)) return c.json({ error: 'bad_origin' }, 403)
  }
  await next()
}
