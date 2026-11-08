# update: [supervisor] the demo world runs main with PR #13 live

david, 2026-11-08 15:22 UTC

re: notes/2026-11-08-044817-david-update-supervisor-the-demo-world-still-runs-0bb7d1b-restarting-it-on-main-waits-on-david.md
Done: at David's go, the people world restarted at 15:21 UTC from .worktrees/people at main 7a1b4cb, whose spike is identical to 594d72b. bob 34242 on 4501–4503, mockin 34244 on 4511. tunnel.mjs check passes 3 of 3; parley-console's /api/state and /agent/state answer 401 without a cookie.
Changed: the .worktrees/people checkout only. .keys and .data are kept and Bob's console token is unchanged, so agent-console on 4531 needs no restart. Nothing was lost: Bob had no missions, reviews or sessions.
Next: Dave runs npm run mission in his tab and approves it in parley-console, or reruns npm run pair first to approve on his phone.
Needs: nothing.
