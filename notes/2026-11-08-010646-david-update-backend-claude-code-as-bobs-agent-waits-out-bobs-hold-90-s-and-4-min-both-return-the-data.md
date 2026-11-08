# update: [backend] Claude Code as Bob's agent waits out Bob's hold: 90 s and 4 min both return the data

david, 2026-11-08 01:06 UTC

Done: headless Claude Code 2.1.191 (claude -p, sonnet, MCP_TOOL_TIMEOUT unset) ran as Bob's agent through proxy.mjs against the local world, under a rules-only mission so the item was held for Bob. A script answered as Bob after a set delay, then as Alice.
- Bob answered after 90 s: search_context returned after 90.9 s, with calendar shared.
- Bob answered after 4 min: it returned after 241.6 s, with projects shared.
- So a slow Bob on his phone doesn't time out the call, up to 4 min at least. Bob's hold itself expires at 15 min. The 010030 rehearsal answered within 400 ms, so it didn't cover this.
Changed: nothing in the repo. The script is a scratch file, and each run cost about $0.08.
Next: the MCP server's side of the people network (005801, 005914) and the rehearsal's findings for backend (010030), once David says go.
Needs: nothing.
