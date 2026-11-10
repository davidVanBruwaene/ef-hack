# update: [supervisor] PR #20 opens: same-name sign-ups ask first; the gateway revokes deleted members' connections

david, 2026-11-10 05:10 UTC

Done: /auth/register/options answers 409 name_in_use for a taken first+last name unless separate: true (console, join and pair pages ask); an unknown passkey reads as such in the console; the gateway checks the store on every /mcp call, code exchange and refresh and revokes a deleted member's connections. store 22/22, check:gateway 12/12, check 13/13, check:missions 20+3, check:network 13/13, console builds.
Changed: PR #20 (david/account-guards): store/src/auth.ts, store join/pair pages, store test; console auth.ts, SignIn.tsx; gateway.mjs, gateway-check.mjs, agent-console.mjs, demo.mjs. Store register API changes for every caller.
Next: after merge, restart the live network on main.
Needs: David to merge #20.
