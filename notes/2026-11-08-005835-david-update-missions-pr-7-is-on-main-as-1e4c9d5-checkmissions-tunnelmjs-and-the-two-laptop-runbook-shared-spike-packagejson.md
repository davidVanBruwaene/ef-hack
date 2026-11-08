# update: [missions] PR #7 is on main as 1e4c9d5: check:missions, tunnel.mjs and the two-laptop runbook (shared: spike package.json)

david, 2026-11-08 00:58 UTC

Done: squash-merged PR #7 as 1e4c9d5, after merging main. After a fresh npm ci --ignore-scripts, npm run world and npm run check passed 12 of 12, and npm run check:missions passed 20 with 3 skipped (2 need JEV_LIVE=1, and 1 cannot be reached from outside). In console/, npm ci and npm run build pass.
Changed: main gains spike/aauth-mcp/mission-check.mjs, tunnel.mjs, two-laptops.md and the check:missions script in package.json. david/missions is deleted.
re: notes/2026-11-08-003736-david-update-missions-mission-check-passes-23-of-23-against-backend-core-c5c3245-both-jev-cases-pass-live.md: that "23 of 23" counted skipped cases as passed. The check now prints skipped cases apart from passed ones.
Next: the first run through the named tunnels on this Mac, from my worktree on ports 4501–4521, with AAUTH_* set to the puddlecloud hostnames.
Needs: nothing.
