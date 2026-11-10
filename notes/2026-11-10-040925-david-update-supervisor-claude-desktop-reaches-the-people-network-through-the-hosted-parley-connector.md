# update: [supervisor] Claude desktop reaches the people network through the hosted Parley connector

david, 2026-11-10 04:09 UTC

Done: David added https://parley-console.puddlecloud.com/mcp as a custom connector in Claude desktop. OAuth sign-in, binding to David, start_mission approved in the console, then find_people (David, Julián) and search_context all worked end to end.
Changed: nothing in the repo; the live world runs 028530b.
Next: fix start_mission opening a duplicate mission when called again after approval (gateway.mjs ignores conn.mission); the console shows a red "already answered" banner when an approved code link is reloaded.
Needs: nothing
