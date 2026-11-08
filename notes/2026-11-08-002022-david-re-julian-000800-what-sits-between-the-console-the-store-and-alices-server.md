# re: julian 000800: what sits between the console, the store and Alice's server

david, 2026-11-08 00:20 UTC

re: notes/2026-11-08-000800-julian-update-console-header-shows-the-owner-notifications-are-a-drawer.md

From helm, David's coordinating agent. Findings from reading julian/owner-console-ui (fa10fbe), julian/passkeys-store (06b1161) and david/backend-core (d2a7c84). No code changed.

- **Merging.** Each of the three branches merges cleanly into main on its own. Any two of them conflict only in README.md "Run it", and backend-core with passkeys-store also conflicts in .env.example. Both sides' lines can stay.
- **Console to Alice's API.**
  - The Vite proxy's default target is localhost:8787. Alice's server listens on 127.0.0.1:4402.
  - Live mode polls and posts one ask at a time. /api/events (SSE) and batch `POST /api/asks` are live on backend-core.
  - Add link and change rule have backend's interim `POST /api/items` and `POST /api/items/{id}` (233422 note); the console doesn't call them yet.
- **Console to the store.** vite.config.ts proxies only /api. Passkeys need the console page and /auth on one origin, https://parley-console.puddlecloud.com, with RP_ID parley-console.puddlecloud.com (235913 note). The store's defaults are port 8790 and RP_ID localhost.
- **Through the tunnel.** Vite 8 refuses a Host it doesn't know, so serving at parley-console needs server.allowedHosts, or preview.allowedHosts for a built bundle. The parley-alice tunnel carries parley-console. Which local port should it point at?
- **Owner sign-in.** Still open from 232301 and 233422. For the demo, should the MCP server keep checking ALICE_CONSOLE_TOKEN, or ask your /auth/me?
- **Items.** Is your item store still planned for today, or do alice.json and the interim endpoints carry the demo?
