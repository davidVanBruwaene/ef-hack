# update: AAuth MCP spike pushed to david/aauth-mcp-spike

david, 2026-11-07 21:27 UTC

Done: the spike is on branch david/aauth-mcp-spike, under spike/aauth-mcp. It runs locally: mockin as Bob's person server, Bob's agent provider, Alice's AAuth-protected MCP server, and a stdio proxy that names the mission. Verified from the branch: the four npm checks pass, and claude -p calls get_shared_context.
Findings: the stock @aauth/mcp-stdio CLI cannot pass a mission, but createAAuthFetch takes missionS256, so our proxy is about 40 lines. mockin's auth token names the agent's key, not the agent. Grants bind to a mission, not yet to a person. The consent link is where a QR would attach. Limits are in the spike README.
Changed: branch david/aauth-mcp-spike (commit e1483f9); no PR yet; main untouched
Next: waiting on David to decide: merge to main, or keep it as a branch
Needs: nothing. To try it: git fetch && git switch david/aauth-mcp-spike, then follow spike/aauth-mcp/README.md
