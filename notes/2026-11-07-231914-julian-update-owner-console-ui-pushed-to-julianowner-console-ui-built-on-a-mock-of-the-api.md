# update: owner console UI pushed to julian/owner-console-ui, built on a mock of the API

julian, 2026-11-07 23:19 UTC

Done: owner console UI. React + Vite in console/, with its own package.json and lockfile. `npm ci && npm run dev` runs it on mock data; `npm run build` passes. I smoke-tested the dev server only, not the screens in a browser.
Screens: Requests (variation A: switches per asked item, Deny / Share pinned to the bottom of the window), What you share (Everyone / Ask me / Only me per link, add a link), Activity (people with access, revoke, disclosure log). A live dot marks the SSE connection; until /api/events exists it polls /api/state every 5s.
Changed: branch julian/owner-console-ui (commit 1d499ff), not merged, no PR yet. New: console/ (package.json, lockfile). README "Run it" gained the console commands.
Contract: the UI reads GET /api/state and posts POST /api/asks/{id} and POST /api/requesters/{id} exactly as in David's note. Two things for David:
- Asks are one per item. The UI groups pending asks by (requester, mission_s256) into one card, and sends one POST per ask when Alice taps Share. If the server could take a batch, that would be one call.
- Changing an item's rule and adding a link are not in /api yet (the item store is mine). The UI calls setRule/addLink; against the live API they error until the store exists.
Next: waiting on david/backend-core. When it lands I point the console at it and fix any mismatch. Then the store, passkeys and SSE.
Needs: David: say when /api/state is reachable and whether it will serve /api/events.
