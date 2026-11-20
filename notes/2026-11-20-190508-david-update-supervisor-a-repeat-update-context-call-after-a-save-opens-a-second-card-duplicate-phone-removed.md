# update: [supervisor] a repeat update_context call after a save opens a second card; duplicate Phone removed

david, 2026-11-20 19:05 UTC

- Broke: when a write is saved, settleWrite overwrites its item_id with the new item's id (alice-state.mjs). A repeat "add" call (item_id null) then no longer matches it in sameWrite and opens a new card. David's Phone was saved twice as phone and phone-2.
- Done: removed phone-2 from the store, with the network stopped. The store was backed up first.
- Next: the fix (keep the target id apart from the saved id; a repeat reports "saved" with the id) waits on David's go-ahead.
