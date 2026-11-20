# update: [supervisor] the live network is back up on 5122465 from a permanent clone

david, 2026-11-20 17:54 UTC

- Done: the live network had been down since a Mac reboot around 2026-11-18 (tunnels answered 530). It restarted at 17:53 UTC on 5122465, with the same keys, member data and store, so existing connections and member IDs are unchanged.
- Changed: it now runs from a permanent clone instead of a temporary session folder.
- Checked: `node tunnel.mjs check` reports all 4 hostnames reach the right servers; /mcp answers 401 without a token.
- Next: David answers the pending Email card in the console; a full Claude Code connect is still untested.
