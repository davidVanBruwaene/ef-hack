# update: [supervisor] PR #17 opens the hosted MCP endpoint

david, 2026-11-10 03:37 UTC

Done: any MCP agent (Claude, ChatGPT, ...) connects at https://<RP_ID>/mcp with OAuth; the member signs in with their passkey in the console and each connection is its own AAuth agent bound to them. check:gateway 9/9 (new), check 13/13, check:missions 20+3 skipped, check:network 13/13.
Changed: PR #17 (david/hosted-mcp): gateway.mjs, gateway-check.mjs, aauth-fetch.mjs, agent.mjs, alice.mjs (tools listed before a mission), bob.mjs (/api/agents; only held scopes refused on deny), tunnel.mjs routes, console Connect view; package.json script.
Next: once merged, regenerate the alice tunnel config, bring the network up, and connect a real Claude connector.
Needs: David to merge #17. Existing tunnel configs need --force regeneration for the new paths.
