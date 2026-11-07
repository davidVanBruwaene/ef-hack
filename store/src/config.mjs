// All settings come from the environment. Names are listed in /.env.example.
export function loadConfig(env = process.env) {
  return {
    port: Number(env.STORE_PORT ?? 8790),
    dbPath: env.STORE_DB ?? './store.db',
    // WebAuthn binds every passkey to this domain. Keep it stable once people register.
    rpID: env.RP_ID ?? 'localhost',
    rpName: env.RP_NAME ?? 'Owner console',
    // Browser origins allowed to call the API (also the CSRF check).
    origins: (env.RP_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  }
}
