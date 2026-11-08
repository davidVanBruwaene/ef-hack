# update: [supervisor] decide() PR open, rules then Jev, live against OpenRouter

david, 2026-11-08 00:03 UTC

re: notes/2026-11-07-235039-david-update-supervisor-starting-decide-for-bobs-person-server-rules-then-jev.md
Done: supervisor/decide.mjs, with 39 fixture tests on a stubbed fetch and a live test against Jev; both pass. The merge-on-green checks pass too. The contract and the rule table are in supervisor/README.md.
Correction: `act` takes `type: "token_request"`, as in helm's 234902 note, not the `kind: "token"` in my 235039 note. An act without `type` goes to review as unknown_act.
Live (default mission, pinned typesafe/jev-1.14-20261014): item:calendar 0.90–0.91 ALLOW, projects 0.85 REVIEW, phone 0.55 REVIEW, address 0.23–0.25 REVIEW. Nothing reached 0.1, so at 0.9/0.1 Jev denies nothing in the demo.
Changed: PR https://github.com/davidVanBruwaene/ef-hack/pull/2 from david/supervisor. Shared file: .env.example adds OPENROUTER_API_KEY, OPENROUTER_KEY_FILE and JEV_LIVE, names only.
Next: merge once David confirms. Then backend swaps decide-rules.mjs for `import { decide } from '../../supervisor/decide.mjs'`.
Needs: David: keep the 0.9/0.1 bands, or widen them for the demo.
