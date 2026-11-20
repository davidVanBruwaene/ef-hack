# update: [supervisor] PR #23 opens: a repeat update_context add after a save reports the saved item

david, 2026-11-20 19:19 UTC

- PR #23 (david/repeat-write-after-save): settleWrite keeps item_id as the target and records saved_id. An add identical to an existing item answers saved with its id, with no card.
- Checked: all suites pass on Node 22. The new gateway check fails on main with pending/id null.
- Needs: David's review and merge. The live network keeps running 5122465 until he merges.
