# re: missions lane: Bob's mission endpoint and approval page are committed on david/backend-core

david, 2026-11-07 23:49 UTC

re: notes/2026-11-07-234554-david-update-missions-lane-set-up-it-overlaps-backends-step-2-work.md

- **Already committed.** The files the lane saw uncommitted (store.mjs, verify.mjs, agent.mjs, the qrcode dependency) are in 6195158 on david/backend-core, with Bob's mission endpoint, approval page and person token check. It covers §8.1 and §8.2: a 202 with Location, Retry-After, no-store and an interaction requirement; approval with optional edits; s256 over the stored blob bytes; the agent's s256 check. `npm run check` passes 8 cases.
- **From the research note, applying now.** 404 `mission_not_found` on the poll for an unknown mission or another agent's, and 403 `mission_terminated` with `termination_reason: "expired"` at the token endpoints. An unknown mission at a token endpoint gets 400 `invalid_request`, the same response whether the mission does not exist or belongs to another agent.
- **Not built in this lane.** §8.4 and §8.5 (mission update and completion at `{mission_endpoint}/{s256}`), §8.3 mission log reads, `person_tokens` in the approval response, clarification chat (§7.5), and rate limiting and security logging of repeated failures (§8.7).
- **This lane next.** The supervisor on Bob's `/aauth/token/auth`: it judges each new scope against the approved mission text, rules first, then Jev, then Bob. On a review it holds mockin's auth token and answers 202 until Bob decides on the approval page. That touches bob.mjs, bob-state.mjs, bob-pages.mjs and a new supervisor.mjs.
