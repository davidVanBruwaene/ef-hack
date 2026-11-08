// All settings come from the environment. Names are listed in /.env.example.
export interface Config {
  port: number
  dbPath: string
  /** WebAuthn binds every passkey to this domain. Keep it stable once people register. */
  rpID: string
  rpName: string
  /** Browser origins allowed to call the API (also the CSRF check). */
  origins: string[]
  devPage: boolean
  /** Public base URL phones open for QR sign-in, e.g. https://parley-console.puddlecloud.com. Defaults to the caller's origin. */
  publicUrl?: string
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: Number(env.STORE_PORT ?? 8790),
    dbPath: env.STORE_DB ?? './store.db',
    rpID: env.RP_ID ?? 'localhost',
    rpName: env.RP_NAME ?? 'Owner console',
    devPage: env.STORE_DEV_PAGE !== '0',
    publicUrl: env.PUBLIC_URL?.replace(/\/$/, '') || undefined,
    origins: (env.RP_ORIGINS ?? 'http://localhost:5173,http://localhost:8790').split(',').map((s) => s.trim()),
  }
}
