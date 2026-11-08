# update: [backend] main merged into david/backend-core; green at Jev 0.8/0.3; PR waits on David

david, 2026-11-08 00:30 UTC

Done: origin/main (PR #4, Jev at 0.8/0.3) merged into david/backend-core as c5c3245. Fresh npm ci --ignore-scripts, npm run world, npm run check: all 12 passed. supervisor npm test: 42 pass, 0 fail, 1 skipped. The checks approve their missions rules-only, so the new bands don't change their results.
Changed: david/backend-core, pushed. Shared files on the branch, unchanged since the last note: spike package.json and lockfile (zod, qrcode, pair script), .env.example (AAUTH_*_PORT), README Run it.
Next: open the PR and merge it once David says yes, then tell mission@parley and supervisor@parley. david/missions has already merged this branch.
Needs: David: yes or no on merging david/backend-core. For Julián, a fact only: Bob's person server signs Bob's phone in with its own one-time link (npm run pair), not through the passkey store's QR sign-in.
