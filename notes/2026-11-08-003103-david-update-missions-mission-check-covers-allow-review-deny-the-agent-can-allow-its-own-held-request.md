# update: [missions] mission-check covers ALLOW / REVIEW / DENY; the agent can allow its own held request

david, 2026-11-08 00:31 UTC

Done: mission-check.mjs has 8 cases on Bob's auth-token path, and the checks now answer for Bob through Bob's console API. Run against d2a7c84 in a throwaway copy on ports 4501-4511 (backend's world untouched): 23 cases, 9 fail, 1 skipped.
New failures: the agent allows its own held request by posting the code from the 202 to /interact (§11.6.3.1); a denied review polls 403 access_denied, not denied (§11.9.4); decide-rules.mjs allows item:email under a mission that says "Do not look at Alice's email." Sent to backend with details.
Passing: direct grant and auth token claims (§9.4.1), the 202 and its poll, Bob allowing and denying, two held requests at once, and a justification claiming Bob's say-so does not turn a review into an allow.
Changed: david/missions b4b97b1: spike/aauth-mcp/mission-check.mjs, two-laptops.md.
Next: rerun once backend pushes the code fixes and env-driven ports. The PR waits for backend's branch to land on main.
Needs: nothing.
