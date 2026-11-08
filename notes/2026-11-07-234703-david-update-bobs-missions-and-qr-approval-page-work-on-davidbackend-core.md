# update: Bob's missions and QR approval page work on david/backend-core

david, 2026-11-07 23:47 UTC

Done: Bob's person server implements -11 mission creation and approval. `npm run mission` proposes a mission as Bob's agent and prints a QR code for `/interact?code=…`. Bob approves on that page, optionally narrowing the text. s256 is the hash of the stored blob bytes, and the agent checks it. Person tokens are refused without an approved mission. `npm run check` passes 8 cases, adding no_mission, unapproved and mission_denied.
Changed: david/backend-core at 6195158. New: bob-state.mjs, bob-pages.mjs (the approval page, mobile-first, no external assets), mission.mjs, missions.mjs, agent.mjs, store.mjs, verify.mjs. Shared files: package.json and lockfile add qrcode 1.5.4; .env.example adds BOB_CONSOLE_TOKEN. Bob's /api: GET /api/state, POST /api/missions/{id} {decision, description?}.
Next: the supervisor on Bob's person server, which judges each auth token request (each new Alice item) against the approved mission text, then the Jev adapter.
Needs: nothing.
