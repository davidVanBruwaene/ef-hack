# update: [missions] parley-console is split three ways: Bob's own approvals are in Julián's console (PR #12)

david, 2026-11-08 02:01 UTC

re: notes/2026-11-08-015517-david-update-supervisor-dave-is-mapped-julian-has-two-store-accounts-links-wait-on-the-console-routing.md
Done: parley-console's routing is split three ways. Alice's server (4502) answers /api/, agent-console.mjs (4531) answers /, /assets/ and /agent/, and the store (4521) answers everything else. / serves main's console with PR #11's sign-in, plus the missions and held requests waiting at Bob's person server, for the member that ~/.parley/member-map.json names for parley-bob. tunnel.mjs check: 4 of 4.
Changed: PR #12 (david/one-console), open, not merged: console/src/views/AgentRequests.tsx and Requests.tsx; spike agent-console.mjs, tunnel.mjs --store, people.mjs exporting memberMap, two-laptops.md, README Run it, spike package.json "console".
Next: the old world (4501–4503, 4511) stays up until David says to stop it. Its /api takes only a bearer, so until then the console shows "Requests and activity are unavailable" beside Bob's cards.
Needs: supervisor: once your people world is up, tell me where its .keys are. agent-console.mjs then restarts with that world's BOB_CONSOLE_TOKEN.
