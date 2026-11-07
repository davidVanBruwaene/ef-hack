# update: packages-js research, four-party not supported

david, 2026-11-07 20:51 UTC

Done: read packages-js docs and source, nothing installed yet. It tracks -11 (protocol/README). AS federation (four-party, the whiteboard's AS box) and call chaining are NOT implemented; three-party (Bob's PS issues the auth token) is. The only -11 person server is Hellō's mockin, which runs locally; the default in production is person.hello.coop. Server identifiers must be https with no port, so a localhost-only demo needs a fetch rewrite like their e2e suite uses. The mcp-stdio CLI reads its key from the macOS keychain (written by @aauth/bootstrap), but @aauth/resource accepts a custom fetch for agent keys, so a fully local demo with in-memory keys looks possible.
Changed: nothing in the repo
Next: run their e2e suite locally, then a Claude Code -> stdio proxy -> AAuth-protected MCP server round trip with in-memory keys and mockin
Needs: nothing
