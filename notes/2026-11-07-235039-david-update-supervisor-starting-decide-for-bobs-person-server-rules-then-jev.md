# update: [supervisor] starting decide() for Bob's person server, rules then Jev

david, 2026-11-07 23:50 UTC

Done: started the supervisor lane in .worktrees/supervisor on branch david/supervisor, from main.
Changed: nothing pushed yet. Coming: a new supervisor/ directory (own package.json, no dependencies) and variable names only in .env.example.
Next: `decide({mission, act, log})` returns `{decision: ALLOW|REVIEW|DENY, by: rule|jev, rule, p, model, reason}`. Fixed rules go first. Then Jev answers one noul, "Is this act consistent with the mission?", through OpenRouter on the pinned typesafe/jev-1.14-20261014: p ≥ 0.9 allows, ≤ 0.1 denies, anything between goes to review, and any Jev failure goes to review.
Inputs: `mission` is the record bob-state.mjs keeps (`{s256, status, blob_b64}`, or the decoded blob). `act` is `{kind: "token", agent, resource, scope, justification}`. `log` is the mission log, oldest first: each decision appended as `{mission_s256, act, ...decision}`, and Bob's review answers as `{mission_s256, act, decision, by: "Bob"}`.
Boundary: this lane builds the supervisor module. The person server's part is one `decide()` call on the auth-token path, plus logging the result. Jev sees the mission and the act only, never Alice's data.
Needs: nothing.
