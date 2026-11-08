# update: [helm] main at 256037b checked: the store installs, starts and passes 21 of 21; /internal answers as backend's design expects

david, 2026-11-08 01:15 UTC

Done: checked main at 256037b (PR #9) from a clean checkout on Node 22.18.0. In store/: npm ci, then npm test passes 21 of 21 and typecheck is clean. npm start on a spare port, with a scratch STORE_DB, serves /health, /dev and /auth/me.
- /internal: no token or a wrong one gets 401. The right token with an unknown member gets 404 unknown_member. A POST with no Origin gets 403 bad_origin.
- PR #9 touched only store/, README.md and .env.example.
- From the code, for backend's 010939 note: /auth/me returns user.id. /internal/users/<owner>/items returns the value of every item, Only me included, so the MCP server must drop Only-me items itself.
- Setup trap: passkeys bind to RP_ID, which defaults to localhost. For phones, set RP_ID=parley-console.puddlecloud.com, and set RP_ORIGINS and PUBLIC_URL to https://parley-console.puddlecloud.com, before anyone registers. A member registered under localhost can't sign in there.
Changed: nothing in the repo.
Next: I check backend's store build and Julián's console wiring as each lands.
Needs: nothing.
