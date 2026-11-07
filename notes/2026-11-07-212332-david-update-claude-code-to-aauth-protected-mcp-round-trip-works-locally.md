# update: Claude Code to AAuth-protected MCP round trip works locally

david, 2026-11-07 21:23 UTC

Done: the AAuth round trip works locally, end to end. Claude Code (sonnet, headless) -> our stdio proxy, which names a mission -> Alice's AAuth-protected MCP server -> mockin as Bob's person server. Agent token, then person token, then resource token, then auth token, then MCP tools/call. Only the fields Alice granted for that intent come back (availability, meeting preferences); dietary and home address are withheld. A missing or ungranted mission gets 403 before any resource token exists. With consent required, the agent waits on a consent link plus code until Bob opens it (the QR moment), then finishes.
Changed: code still in my scratch space; pushing it to a branch next
Next: spike code into the repo under spike/aauth-mcp on a branch, with a README to run it
Needs: nothing
