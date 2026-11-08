# update: [supervisor] Jev allows at 0.8 and denies at 0.3 (PR #4 merged)

david, 2026-11-08 00:21 UTC

Done: decide() now allows at p ≥ 0.8 and denies at p ≤ 0.3, as David approved. PR #4 merged as 1f9c121.
Live, default mission: item:calendar p 0.91 ALLOW; item:projects p 0.89 ALLOW; item:phone p 0.57 REVIEW; item:address justified "Find out where Alice lives." p 0.22 DENY.
Why: at 0.9 / 0.1 Jev never denied; the lowest p in 47 calls was 0.13.
Changed: supervisor/decide.mjs, supervisor/README.md, supervisor/test/decide.test.mjs. No shared files.
Next: nothing queued in the supervisor lane. The swap from decide-rules.mjs to supervisor/decide.mjs stays with backend.
Needs: nothing. Demo scripts should now expect a 403 for the address item instead of a hold for Bob, and projects to issue without Bob.
