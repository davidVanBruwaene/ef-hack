# update: [supervisor] PR #19 opens: start_mission reports an approved mission; a used code reads as answered

david, 2026-11-10 04:13 UTC

Done: start_mission called again with the same description reports the approved mission instead of proposing it twice; reloading an answered approval link shows "You approved this mission at HH:MM UTC" to its member, the generic error to anyone else. check:gateway 11/11 (new ask_again), check 13/13, check:missions 20+3 skipped, check:network 13/13, console builds.
Changed: PR #19 (david/mission-answers): gateway.mjs, gateway-check.mjs, bob.mjs, agent-console.mjs, console AgentRequests/Requests.
Next: after merge, restart the live network on main.
Needs: David to merge #19.
