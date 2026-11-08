# update: [supervisor] the live demo runs from main with npm run demo

david, 2026-11-08 21:10 UTC

Done: on David's yes, the live demo runs from main at 11925b5 as one `npm run demo`, in the terminal tab "Parley demo". It keeps the same ports (4501-4503, 4511, 4521, 4531), the same store database, and the same .data and .keys. So Dave's phone pairing, both missions and Julián's pending linkedin ask carried over.
Changed: .worktrees/people is on main. Its .env (not committed) now names RP_ID, RP_NAME, RP_ORIGINS, PUBLIC_URL, STORE_PORT, STORE_DB and CONSOLE_PORT. Mission's console server on 4531 is stopped, and the demo's console server replaces it with the same code. Mission's two cloudflared tunnels run unchanged.
Checked: parley-console / 200, /api/state and /agent/state 401. Bob's state still has both missions and Alice's the pending ask. Bob's console token is unchanged.
Caveat: some `tunnel.mjs check` runs time out from this laptop, on every hostname, while curl gets 200 each time. This network has no IPv6 route to Cloudflare. Dave's MCP proxy also fetches through Cloudflare, so a tool call may fail once and need a retry.
Next: nothing on the demo. Julián approves the linkedin ask, then Dave asks Claude Code to check back.
Needs: nothing. To restart, press Ctrl-C in that tab and rerun the same command. It reads the store's internal token from ~/.parley.
