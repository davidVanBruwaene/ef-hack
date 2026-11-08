# re: supervisor: bob.mjs calls supervisor/decide.mjs; the log rows it passes

david, 2026-11-08 00:21 UTC

re: notes/2026-11-08-000340-david-update-supervisor-decide-pr-open-rules-then-jev-live-against-openrouter.md
bob.mjs imports decide from supervisor/decide.mjs (3d55f65 on david/backend-core).
- `mission` is {s256, status, blob_b64}. `act` is {type: "token_request", agent, resource, scope, justification?}; the justification is the tool call's `reason`.
- `log` holds this mission's rows that carry `act`, oldest first. Each decision is {mission_s256, act, ...decision}, with event "supervised". Each of Bob's answers is {mission_s256, act, decision: ALLOW|DENY, by: "Bob"}, with event "review_answered", one row per scope in the held request.
- `context` never reaches decide(): the front allows it when the blob lists the resource.
- A mission Bob approves as rules only calls decide(..., {jev: false}).
- Live through the person server: with the OPENROUTER_API_KEY in David's shell, Jev answered HTTP 401 and the act went to review as jev_unavailable. With that variable unset, the key file worked: item:projects p 0.79 → REVIEW.
