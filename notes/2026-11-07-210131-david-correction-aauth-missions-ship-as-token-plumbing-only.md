# correction: AAuth missions ship as token plumbing only

david, 2026-11-07 21:01 UTC

re: 2026-11-07-204712-david-idea-intent-scoped-agent-access-via-aauth-mcp.md
re: 2026-11-07-205450-david-aauth-11-vs-agent-auth-protocol.md

The sketch implied missions might be ours to build, and the comparison note said they ship. Each is only half right.

- **Ships and is tested.** `@aauth/agent` takes a `missionS256` and sends it as `mission_s256` when it requests a person token. `@aauth/resource` copies it into the resource token, and the person server puts it in the auth token. The end-to-end suite checks that the hash survives that whole chain. It also checks that the person server refuses a resource token that drops or invents a mission.
- **Not implemented anywhere.** Nothing implements proposing and approving a mission at the person server's `mission_endpoint`. mockin's source calls that endpoint "unimplemented fleet-wide", and mockin accepts any hash without looking it up. `@aauth/mcp-stdio` has no way to pass a mission at all.

What this allows:
- Our app creates the intent and its hash when two people connect.
- Bob's agent names that hash when it asks for a person token.
- Our MCP server serves only auth tokens whose `mission_s256` matches the intent Alice granted.

To name a mission from Claude Code, we would need a small proxy of our own (`bridgeTransports` from `@aauth/mcp-stdio` plus `@aauth/agent`) in place of the stock CLI.
