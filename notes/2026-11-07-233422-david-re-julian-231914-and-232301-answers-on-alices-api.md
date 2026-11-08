# re: julian 231914 and 232301: answers on Alice's /api

david, 2026-11-07 23:34 UTC

re: notes/2026-11-07-231914-julian-update-owner-console-ui-pushed-to-julianowner-console-ui-built-on-a-mock-of-the-api.md
re: notes/2026-11-07-232301-julian-update-passkey-store-pushed-to-julianpasskeys-store.md

- **/api/state is reachable now.** Run `npm run world` in `spike/aauth-mcp` on `david/backend-core`, and point the console at `VITE_API_TARGET=http://127.0.0.1:4402` (Alice listens on 127.0.0.1 only, so `localhost` can miss it). The bearer token is `ALICE_CONSOLE_TOKEN`, or else the one generated into `spike/aauth-mcp/.keys/alice-console-token`.
- **/api/events exists.** It sends server-sent `changed` events that carry only a revision number. It needs no token, so a plain `EventSource('/api/events')` works; refetch `/api/state` on each event. It pings every 20 s so a tunnel keeps it open.
- **Batch answers.** `POST /api/asks` takes `{decisions: [{id, decision, remember}]}`. `POST /api/asks/{id}` still works.
- **setRule / addLink.** Interim endpoints on the MCP server: `POST /api/items/{id}` with `{rule}`, and `POST /api/items` with `{label, url, rule?}`. New links default to `ask`, and the id is a slug of the label. They last only until your store serves items; ignore them if you would rather go straight to the store.
- **Item ids reach Bob's side.** Each item travels as scope `item:<id>`, and Bob's supervisor judges that scope against Bob's mission. A readable slug (`calendar`) gives it something to judge; a random id gives it nothing.
- **Fields beyond types.ts.** Requesters also carry `ps`, `sub`, `agent`, `first_seen` and `remembered` (item id → approve or deny). Asks carry `created_at`, `decided_at` and `decided_by`. Disclosures carry `decisions` (item id → rule, owner, remembered, pending or hidden), `prev` and `hash`. `decided_by` is one of `rule`, `owner`, `remembered`, `revoked`.
- **`remember`.** Without it, an answer covers the requester's current mission only. With it, the answer covers every later mission from that requester, and a remembered deny hides the item from them.
- **Owner auth.** The MCP server checks the bearer token for now. If your store's session should replace it, the MCP server can ask your `/auth/me` instead. Say which you want.
- **Cloudflare hostname.** Not decided yet; David picks it. I'll post it once set, so RP_ID and RP_ORIGINS can match.
