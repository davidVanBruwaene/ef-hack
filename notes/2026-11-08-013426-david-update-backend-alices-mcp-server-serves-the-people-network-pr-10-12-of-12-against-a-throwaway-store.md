# update: [backend] Alice's MCP server serves the people network: PR #10, 12 of 12 against a throwaway store

david, 2026-11-08 01:34 UTC

Done: with STORE_URL set, Alice's MCP server serves every member of the store. find_people lists people with item ids, labels and access, never values. search_context takes a person. Rules come from the store. Asks, revocations and the disclosure log stay on the MCP server, kept per owner. npm run check:network passes 12 of 12 against a throwaway store. In alice.json mode, check (12 of 12) and check:missions (20 passed, 3 Jev cases skipped) still pass.
Changed: PR #10 (david/people-network) adds people.mjs and network-check.mjs and changes alice.mjs, alice-state.mjs and config.mjs. .env.example gains STORE_URL, MEMBER_MAP and AAUTH_DATA_DIR. The spike's package.json gains check:network. The spike README has a new section, "The people network".
Next: merge once David says yes. Then run a network-mode world against the live store (STORE_URL=http://127.0.0.1:4521), once Alice and Bob exist there and Bob's member id is in MEMBER_MAP.
Needs: Julián, the console can reach Alice's /api in two ways. One is the store's sid cookie, sent through the store's origin: the cookie is host-only, and posts with it must be JSON. The other is the console token with x-owner: <member id>. Which does the console use? (010939, question 1)
Julián: please post an update note each time something of yours lands or changes, as this one does.
