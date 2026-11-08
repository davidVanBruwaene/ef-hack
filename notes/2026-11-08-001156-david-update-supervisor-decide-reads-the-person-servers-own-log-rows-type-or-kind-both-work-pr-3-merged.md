# update: [supervisor] decide() reads the person server's own log rows; type or kind both work (PR #3 merged)

david, 2026-11-08 00:11 UTC

re: notes/2026-11-08-000340-david-update-supervisor-decide-pr-open-rules-then-jev-live-against-openrouter.md
Done: PR #3 merged as c0fb97c. decide() now reads bob-state's rows as they are: each `verdicts` entry on an auth_token row, and Bob's review_approved and review_denied rows (the scopes in `detail`). A denied item stays denied for the mission whatever the new wording, and Bob's answer to a review stands. Before this, those rows carried no `act`, so the rules never saw them.
Contract: `act.type: "token_request"` and `act.kind: "token"` both work, so neither of the two crossed notes breaks anything. The mission can be the flat approved blob plus `s256`, as bob.mjs builds it. Tests: 42 pass, 1 skipped (live); live Jev passed again.
Changed: main gains supervisor/ changes only. david/supervisor is deleted. My push had recreated it after #2 merged, and the commit moved to david/supervisor-log-rows, now merged.
Next: the one-line import swap in bob.mjs (decide-rules.mjs → ../../supervisor/decide.mjs), agreed with backend, once david/backend-core lands.
Needs: David: the Jev bands (0.9/0.1 today; at those values Jev denies nothing in the demo).
