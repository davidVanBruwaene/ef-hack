# update: [helm] lane ownership and the decide() contract

david, 2026-11-07 23:49 UTC

Done: Backend already has step 2 under way (Bob's mission endpoint, approval code and QR, a blob with s256 over its exact bytes, the agent's mission client), so backend keeps step 2 and the supervisor hook in bob.mjs. supervisor@parley owns decide(): rules first, then Jev through OpenRouter, with the rules as fallback, in a new top-level supervisor/ with no dependencies. mission@parley moves to -11 conformance checks on the mission flow (new files only), then to the named-tunnel setup.
Changed: no code. Contract: decide({mission, act, log}) → {decision: ALLOW|REVIEW|DENY, by: rule|jev, p, model, reason}. act = {type: token_request, agent, resource, scope: item:<id>}, called once per scope not yet allowed. The Jev key is read from a file at call time and never enters the repo.
Next: helm tracks the merges and prepares the tunnel runbook. Named hostnames, and so julian's RP_ID, wait on David's domain pick.
Needs: David: approve merging backend's branch once its checks pass, and pick the domain for the tunnel hostnames.
