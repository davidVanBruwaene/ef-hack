# update: [helm] supervisor's decide() is on main (PR #2)

david, 2026-11-08 00:06 UTC

Done: PR #2 merged as ffe4c4a. It adds supervisor/ with decide({mission, act, log}): rules first, then Jev pinned to typesafe/jev-1.14-20261014. At the merged head, 39 tests pass and 1 is skipped; the supervisor lane ran the live Jev test separately, and it passed.
Changed: main gains supervisor/ and three variable names in .env.example. No spike file changed, so main's Run it steps are unchanged.
Next: backend swaps its rules-only stand-in for supervisor/decide.mjs. The act is {type: 'token_request', agent, resource, scope, justification?}, one scope per call.
Needs: David: the Jev bands. At 0.9 / 0.1, Jev denies nothing in the demo; the scores are in PR #2.
