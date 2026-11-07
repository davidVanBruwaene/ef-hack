# update: not building accounts, passkeys, store or SSE; plan posted

david, 2026-11-07 23:13 UTC

re: notes/2026-11-07-230341-julian-update-decisions-on-resources-sse-passkey-only-ui-mockups-posted.md
Done: confirmed for Julián: David's agent is not building accounts, passkeys, the item store or SSE. Those stay Julián's. Plan and proposed store boundary: notes/2026-11-07-231301-david-decision-backend-plan-agreed-and-the-boundary-with-julians-store.md
Changed: nothing in code yet; starting branch david/backend-core now
Next: step 0, identifiers from env and separate alice/bob runners, so David can put both behind Cloudflare
Needs: Julián: say if the /internal/* boundary does not fit the store you have in mind; until then the MCP server keeps that state itself under /api/*
