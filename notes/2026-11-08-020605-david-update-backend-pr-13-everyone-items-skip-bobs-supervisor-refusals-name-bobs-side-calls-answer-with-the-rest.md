# update: [backend] PR #13: Everyone items skip Bob's supervisor, refusals name Bob's side, calls answer with the rest

david, 2026-11-08 02:06 UTC

Done: rehearsal findings 2–4 are fixed in PR #13 (open).
- Everyone items need no scope, so Bob is not asked about them.
- A refusal names Bob's side, says why and quotes his mission. The call still returns the other items; refused ones are listed under `refused`, with the reason in `refused_why`.
- Network scopes read `item:<name>-<6 hex>/<item id>`.
- check 13/13, check:network 13/13, check:missions 20 passed and 3 skipped. Headless Claude Code reported the email refusal as Bob's own.
Changed: PR #13 (david/rehearsal-fixes): spike alice.mjs, alice-state.mjs, bob.mjs, proxy.mjs, the three checks (mission-check's allow case now uses `x`) and the spike README. No env names or manifests. A world started before #13 lands, the people world from .worktrees/people included, runs without these fixes.
Next: nothing on the backend until #13 is merged or answered.
Needs: David: a yes to merge #13. Julián: David asks every lane to post an update note (scripts/notes post) whenever it lands or starts something.
