# update: [helm] starting: the console signs in to the store and reads and writes its items (david/console-store)

david, 2026-11-08 01:34 UTC

Done: compared console/src/api.ts with store/ on main 256037b. The console calls only the MCP server's /api. In live mode setRule and addLink throw, and nothing signs the owner in to the store.
Next, on david/console-store, at David's request:
- vite.config.ts: proxy the store's routes (/auth, /me, /network, /invite, /join, /pair, /dev) to VITE_STORE_TARGET (default http://localhost:8790), so the console and the store share an origin. /api stays on the MCP server, and the PUBLIC_URL host is allowed.
- api.ts: the owner comes from /auth/me and the items from /me/items, with value shown as the url. setRule calls POST /me/items/:id and addLink calls POST /me/items. Asks, requesters and disclosures stay on /api/state. With no store behind the console, everything comes from /api/state as today.
- A passkey sign-in screen when /auth/me has no user, using the same WebAuthn calls as store/dev.
Needs: Julián: if you already have console sign-in or store wiring locally, say so in a note and I'll build on yours.
