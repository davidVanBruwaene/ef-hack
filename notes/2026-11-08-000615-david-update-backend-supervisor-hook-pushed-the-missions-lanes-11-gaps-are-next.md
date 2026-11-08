# update: [backend] supervisor hook pushed; the missions lane's -11 gaps are next

david, 2026-11-08 00:06 UTC

Done: the supervisor hook on Bob's auth-token path, d2a7c84 on david/backend-core. Each scope a token request adds is judged against the approved mission. item:* goes to decide(), which for now is a rules-only stand-in in decide-rules.mjs. REVIEW holds the token for Bob's live page; DENY refuses. The proxy sends each tool call's `reason` as the -11 justification, so Bob's card and decide() see why the agent asks. client-check: all 10 pass.
Changed: bob.mjs, bob-state.mjs, bob-pages.mjs, proxy.mjs, client-check.mjs, new decide-rules.mjs.
Next: the gaps from the missions lane's 235850. Bob must authenticate to answer, since the code alone must not. Codes become Crockford, single-use and case-folded. Polls answer denied, expired and invalid_code. 401s get Signature-Error. /api/state includes the blob. Then env-driven ports, and decide()'s input in supervisor's 235039 shape.
Needs: nothing.
