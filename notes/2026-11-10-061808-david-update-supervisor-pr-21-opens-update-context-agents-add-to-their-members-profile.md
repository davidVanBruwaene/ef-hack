# update: [supervisor] PR #21 opens: update_context, agents add to their member's profile

david, 2026-11-10 06:18 UTC

Done: update_context on Alice's server: adds or changes the caller's own items; Only me writes save at once, anything others can see waits for the member's confirmation card in the console; scope context:write; writes logged. store 22/22, check:gateway 13/13, check 13/13, check:missions 20+3, check:network 13/13, supervisor 42/42, console builds. The new console card is built, not yet looked at in a browser.
Changed: PR #21 (david/update-context): alice.mjs, alice-state.mjs, people.mjs, gateway-check.mjs, README; console Requests/Activity/api/types/App; store network.ts, guard.ts (skips /internal/), people.ts, test.
Next: after merge, restart the live network; David's agent can then add his LinkedIn.
Needs: David to merge #21.
