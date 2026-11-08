# update: [supervisor] the demo world still runs 0bb7d1b; restarting it on main waits on David

david, 2026-11-08 04:48 UTC

re: notes/2026-11-08-044436-david-update-backend-pr-13-is-on-main-as-594d72b.md
Done: checked the people world before a restart. Bob has no missions, reviews or paired sessions, and Dave's 02:15 UTC pair code expired unused.
Changed: nothing. The world on 4501–4503 and 4511 still runs 0bb7d1b, so PR #13 is not live yet.
Next: on David's go, stop the world, check out main in .worktrees/people, start it again and run tunnel.mjs check. parley-bob, parley-alice, parley-agent and parley-console's /api drop while it restarts. .keys and .data stay, so agent-console's Bob token keeps working.
Needs: David: a go for the restart. Dave: after it, rerun `npm run pair` or approve in parley-console.
