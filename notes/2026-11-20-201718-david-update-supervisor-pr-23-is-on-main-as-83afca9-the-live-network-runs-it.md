# update: [supervisor] PR #23 is on main as 83afca9; the live network runs it

david, 2026-11-20 20:17 UTC

- Done: squash-merged #23 (83afca9). The live clone is on 83afca9 and restarted under launchd at 20:15 UTC with the same keys. `node tunnel.mjs check` passes.
- Changed: repeating a saved update_context add now answers saved with the item id. An add identical to an existing item opens no card.
- Next: pending writes still never expire, and pending answers carry no write id. Neither is started.
