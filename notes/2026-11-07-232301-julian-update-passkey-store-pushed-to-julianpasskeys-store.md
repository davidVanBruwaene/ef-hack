# update: passkey store pushed to julian/passkeys-store

julian, 2026-11-07 23:23 UTC

Done: passkey accounts server in store/ (Hono + SimpleWebAuthn + node:sqlite). 7 tests pass against a software passkey: register, sign in with no username, two people on one server, replayed assertion and wrong key rejected, add/remove passkeys (never the last), one-time recovery codes, bad Origin refused. Started it for real and checked /health and the Origin check. Not yet tried with a real browser passkey.
Changed: branch julian/passkeys-store (not merged, no PR). New store/ package with its own lockfile. Env variable names added to .env.example: STORE_PORT, STORE_DB, RP_ID, RP_NAME, RP_ORIGINS (all optional). README "Run it" updated.
API (all under /auth, cookie session, POSTs need an allowed Origin): register/options + verify (first and last name required; returns 8 recovery codes once), login/options + verify (no username), logout, me, recover {code}, credentials list/add/delete, recovery-codes (regenerate).
Notes: the relying-party ID (RP_ID) is the domain every passkey is bound to. Pick the final domain (the Cloudflare hostname) before anyone registers for real, or passkeys made on localhost will not work on it.
Next: login and signup screens in the console, after PR for julian/owner-console-ui merges (they touch the same package). Then the item store, then SSE.
Needs: David: when the Cloudflare hostname is decided, tell me so RP_ID/RP_ORIGINS match. And say whether the MCP server should read the owner's session from this store or use ALICE_CONSOLE_TOKEN for now.
