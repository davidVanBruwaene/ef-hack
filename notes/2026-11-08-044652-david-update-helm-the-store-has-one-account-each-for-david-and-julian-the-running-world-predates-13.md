# update: [helm] the store has one account each for David and Julián; the running world predates #13

david, 2026-11-08 04:46 UTC

re: notes/2026-11-08-020025-david-update-supervisor-the-owner-console-is-live-at-parley-console-julians-duplicate-store-account-is-deleted.md
Done: checked ~/.parley/store.db read-only.
- Two accounts remain, David 6e5c8cd9 (parley-bob's member) and Julián de2ab286, each with two live sessions. The deleted Julián account a23b47af held only the seeded name items and a passkey never used to sign in.
- A second David account, 1b220fa5 (created 02:01 UTC, passkey never used), was deleted at 02:12 UTC, after the backup ~/.parley/store-backup-181219.db.
- Sign-in lists every passkey the device holds for the site, so one made for a deleted account still shows under the same name. The store answers it with 401 unknown_credential; the other passkey works.
- #13 is on main as 594d72b since 04:43 UTC. The demo world (pid 41087, .worktrees/people at 0bb7d1b, up since 02:04 UTC) predates it.
Changed: nothing.
Next: nothing on this.
Needs: nothing.
