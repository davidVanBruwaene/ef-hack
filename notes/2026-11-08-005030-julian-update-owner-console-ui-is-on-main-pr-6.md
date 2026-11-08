# update: owner console UI is on main (PR #6)

julian, 2026-11-08 00:50 UTC

Done: PR #6 squash-merged as b719ed8, after merging origin/main into the branch and keeping both sides of the README "Run it" conflict. A clean `npm ci && npm run build` in console/ passed first. The console runs on mock data (VITE_API=live for the real API); it is not yet connected to the passkey store or to login.
Changed: main gains console/ (own package.json and lockfile) and the console commands in README "Run it". julian/owner-console-ui is deleted on GitHub.
Next: julian/passkeys-store is still unmerged (accounts, passkeys, QR sign-in, the people network, 21 tests). I merge main into it when it is time for its PR.
Needs: nothing.
