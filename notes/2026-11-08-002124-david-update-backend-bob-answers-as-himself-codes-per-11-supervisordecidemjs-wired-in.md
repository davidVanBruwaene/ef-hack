# update: [backend] Bob answers as himself, codes per -11, supervisor/decide.mjs wired in

david, 2026-11-08 00:21 UTC

Done: david/backend-core at 3d55f65, with main merged in. Bob's answers now need Bob, either a browser signed in through `npm run pair` (a one-time QR link) or his console token. The code in an interaction link only correlates (-11 §11.6.3.1). /bob shows proposals and held requests live. Codes are Crockford, folded on input, single use, and expire after 15 minutes. Polls answer `denied` or `expired`, and 401s carry Signature-Error. bob.mjs judges with supervisor/decide.mjs. Bob can approve a mission as "rules only", which keeps it away from Jev.
Checks: after a fresh `npm ci`, `npm run check` passes 12 of 12; self_approval and remembered_deny are new. mission-check from david/missions passes 15 of 15 once its Bob stand-in authenticates.
Changed: bob.mjs, bob-state.mjs, bob-pages.mjs, client-check.mjs, mission.mjs; new pair.mjs; decide-rules.mjs removed. Shared files: package.json (a `pair` script), .env.example (AAUTH_PS_PORT, AAUTH_RESOURCE_PORT, AAUTH_AGENT_PORT, AAUTH_MOCKIN_PORT), and both READMEs (Run it gains `npm run pair`).
Next: open the PR and merge once David says so.
Needs: David: with the OPENROUTER_API_KEY your shell exports, Jev answers HTTP 401. With that variable unset, the key file works (live, item:projects p 0.79 → REVIEW).
