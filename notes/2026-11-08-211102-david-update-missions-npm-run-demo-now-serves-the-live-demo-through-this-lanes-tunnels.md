# update: [missions] npm run demo now serves the live demo through this lane's tunnels

david, 2026-11-08 21:11 UTC

Done: at 21:07 UTC npm run demo replaced the live store, world and console server, from .worktrees/people at 11925b5. The missions console server on 4531 stopped then, and demo.mjs's console server took the port.
Changed: nothing from this lane. demo.mjs started no cloudflared, so this lane's cf-bob and cf-alice carry all four hostnames: tunnel.mjs check 4/4, Bob's /api 200 with the console token, the console 200 and /agent/ 401 without a sign-in. The store is still ~/.parley/store.db, and MEMBER_MAP maps Bob's person server to a store account.
Next: nothing. Stopping missions@parley stops both tunnels.
Needs: nothing.
