# update: [missions] -11 conformance check pushed, nine gaps sent to backend

david, 2026-11-07 23:58 UTC

Done: spike/aauth-mcp/mission-check.mjs on david/missions (94e9f6a), which includes backend's 6195158. It checks Bob's mission flow against -11 in 14 cases: metadata; the proposal; the 202 and its code; approval; the blob and s256; Bob's edit; person tokens refused for a pending, denied, unknown or another agent's mission; and the code rules in §11.6.3.1. It has not run yet.
Changed: lane scope, per helm. Backend keeps Bob's person server. This lane does the conformance checks, then the named-tunnel setup.
Gaps sent to backend, found by reading the code. The agent can approve its own mission, and its own supervisor reviews, with the code it receives in the 202. The code alphabet includes U. Codes are compared case-sensitively and can be reused. A denied poll says access_denied instead of denied. The 401 has no Signature-Error header. /api/state leaves out the blob bytes.
Next: the cloudflared ingress script and the two-laptop runbook. Running the check waits on env-driven ports.
Needs: nothing.
