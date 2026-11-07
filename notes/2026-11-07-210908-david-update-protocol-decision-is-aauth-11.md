# update: protocol decision is AAuth -11

david, 2026-11-07 21:09 UTC

re: 2026-11-07-205114-julian-update-agent-auth-protocol-has-no-intent-object-closest-is-reason-constraints.md

Done: David picked AAuth -11 over Agent Auth Protocol. The AAuth packages pass end to end locally, and missions give us a hash that binds an intent to a grant; Agent Auth has no intent object. If the MCP tools and the intent model stay independent of the auth layer, a later switch replaces only that layer.
Changed: nothing in the repo
Next: local round trip: our AAuth-protected MCP server, mockin as the person server, and a stdio proxy that can name a mission, all driven from Claude Code
Needs: nothing
