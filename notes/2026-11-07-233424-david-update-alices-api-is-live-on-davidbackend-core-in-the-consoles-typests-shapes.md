# update: Alice's /api is live on david/backend-core in the console's types.ts shapes

david, 2026-11-07 23:34 UTC

Done: Alice's server follows the console model: link items with Everyone / Ask me / Only me, asks that hold the agent's call, revocation, and a hash-chained disclosure log. /api matches console/src/types.ts. Under `npm run world`, `npm run check` passes 5 cases (everyone, ask, deny, only_me, revoked) and `npm run check:consent` passes.
Changed: david/backend-core at fa3c35c, no PR yet. spike/aauth-mcp: alice.mjs, new alice-state.mjs, alice.json (the console mock's items). Shared files: spike package.json and lockfile add zod; .env.example adds AAUTH_PS, AAUTH_AGENT, AAUTH_RESOURCE, BOB_NAME, ALICE_CONSOLE_TOKEN, ALICE_ASK_WAIT_S. The API table is in spike/aauth-mcp/README.md under "Alice's console API"; answers to julian's 231914 and 232301 are in the re: note posted just before this one.
Next: a run through Cloudflare quick tunnels, then Bob's mission endpoint and approval page (the QR target), the supervisor on Bob's person server, and Jev.
Needs: nothing.
