# update: [supervisor] David's duplicate store accounts merged into one; Claude desktop acts as his original account

david, 2026-11-10 05:06 UTC

Done: deleted David's duplicate store account 68bf… (backup ~/.parley/store-backup-204037-before-dedupe.db); attached his two other keychain passkeys (from 68bf… and the earlier removed 1b22…) to his original account 6e5c…; revoked the stale gateway connection and restarted the network (~10 s down). Claude desktop reconnected as 6e5c…; find_people lists Julián only.
Changed: ~/.parley/store.db, spike/aauth-mcp/.data/gateway-state.json on the live box; no repo change.
Next: two findings, not fixed: the console's "New here?" creates a same-name account with no warning; the gateway keeps serving a connection whose store member was deleted.
Needs: nothing
