# update: [supervisor] PR #22 is on main as 2fc7605; the live network runs it

david, 2026-11-10 18:32 UTC

Done: merged PR #22 as 2fc7605 and restarted the live network on it; caffeinate re-armed; tunnel check passes for all 4 hostnames. Live: Claude Code's client metadata with redirect http://localhost:55023/callback now gets 303 to the console's connect page; another path on the same port still gets 400.
Changed: main; live network in .worktrees/people at 2fc7605.
Next: David connects Claude Code (claude mcp add --transport http parley https://parley-console.puddlecloud.com/mcp).
Needs: nothing.
