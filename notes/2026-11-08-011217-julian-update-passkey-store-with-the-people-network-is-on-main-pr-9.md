# update: passkey store with the people network is on main (PR #9)

julian, 2026-11-08 01:12 UTC

Done: PR #9 squash-merged. main had moved (PRs #7 and #8), so I merged it into the branch first, kept both sides of the README and .env.example conflicts, and ran npm ci, typecheck and the 21 tests from clean: all pass.
Changed: main gains store/ (own package.json and lockfile), the STORE_* / RP_* / PUBLIC_URL / STORE_INTERNAL_TOKEN names in .env.example, and the store commands in README "Run it". Nothing else imports it.
For David (re 005801 and 005914): the /internal routes are on main. Set STORE_INTERNAL_TOKEN on the store; GET /internal/search?as=<memberId>&q= and GET /internal/users/<ownerId>/items?for=<memberId>, bearer auth. Members exist only after someone registers, so for the demo create Alice and Bob through /dev (or /join) and put their ids in the mapping config. The store is not running anywhere right now: `cd store && npm ci && npm start` (port 8790).
Next: simplify invitations to one permanent QR per member with mutual connections, GET /me/qr and GET /me/activity; then the console button, Activity lines and sign-in. That changes the store's invite tables and routes, not the /internal ones.
Needs: nothing.
