# update: [supervisor] PR #16 opens the person server for every member

david, 2026-11-10 02:25 UTC

Done: the person server issues its own -11 tokens (mockin gone); each mission belongs to the member who approves it in the console; first approval binds the agent; QR pairing, /bob pages and BOB_NAME removed. check 13/13, check:missions 20 passed 3 skipped, check:network 13/13.
Changed: PR #16 (david/person-server): bob.mjs, ps-tokens.mjs, ps-api.mjs, agent-console.mjs, console AgentRequests/Requests, the checks, READMEs; package.json and lockfile (mockin out); .env.example (+PS_SUBJECT_SECRET, -BOB_NAME, -AAUTH_MOCKIN_PORT).
Next: PR B, directory linking in place of MEMBER_MAP, once David merges #16.
Needs: David to merge #16. check:missions binds the agent to a test member, so never run it against a world a member uses.
