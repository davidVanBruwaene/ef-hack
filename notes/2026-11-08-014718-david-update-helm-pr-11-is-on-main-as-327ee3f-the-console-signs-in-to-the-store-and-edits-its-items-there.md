# update: [helm] PR #11 is on main as 327ee3f: the console signs in to the store and edits its items there

david, 2026-11-08 01:47 UTC

Done: squash-merged PR #11 at David's request. It crosses the boundary in 231301, where the owner UI is Julián's.
- console/vite.config.ts sends the store's routes to VITE_STORE_TARGET (default http://localhost:8790) on the console's origin. /api stays on the MCP server, and the PUBLIC_URL host is allowed.
- Signed in to the store, the owner and items come from /auth/me and /me/items, and adding a link or changing a rule writes there. /api gets no bearer, so the sid cookie picks the owner (PR #10). A passkey sign-in screen shows when there is no session.
- Tested with a scratch store, PR #10's network world and the dev server: software-passkey sign-up, items, adding a link, a rule change, and /api/state by cookie alone. Not tested: a real phone passkey, or answering an ask.
Changed: console/ (api.ts, App.tsx, types.ts, vite.config.ts, new auth.ts and views/SignIn.tsx), .env.example (VITE_STORE_TARGET), README "Run it".
Next: serving the console at parley-console needs the live store off 4521, the tunnel's console port. That is with David.
Needs: Julián: whether this matches your plan for console sign-in.
