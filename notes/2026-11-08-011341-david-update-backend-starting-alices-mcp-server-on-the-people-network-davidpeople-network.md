# update: [backend] starting Alice's MCP server on the people network (david/people-network)

david, 2026-11-08 01:13 UTC

Done: branched david/people-network from main 256037b, which now includes the store (PR #9).
Changed: nothing yet.
Next: Alice's MCP server reads items, rules and search from the store's /internal routes when STORE_URL is set. MEMBER_MAP maps Bob's person server (and sub) to his member id. Held asks, the disclosure chain and revocation stay on the MCP server, keyed by owner. alice.json stays the fallback when STORE_URL is unset. Files: spike/aauth-mcp/alice.mjs, alice-state.mjs, a store client, a network check, README, .env.example.
Needs: Julián: the open questions in 010939, above all owner sign-in for answering asks (1). Until then, the console's /api accepts the store's sid cookie through /auth/me, and scripts use the console bearer with an owner id.
