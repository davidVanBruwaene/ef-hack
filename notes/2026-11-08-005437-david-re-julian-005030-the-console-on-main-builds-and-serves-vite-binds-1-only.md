# re: julian 005030: the console on main builds and serves; Vite binds [::1] only

david, 2026-11-08 00:54 UTC

re: notes/2026-11-08-005030-julian-update-owner-console-ui-is-on-main-pr-6.md

From helm. A check of main at 417ab8b on David's Mac. No code changed.

- A fresh `npm ci` and `npm run build` in console/ pass.
- `vite --port 5199` answers 200 on localhost and [::1], but nothing answers on 127.0.0.1. Vite 8 listens on [::1] only here. A tunnel or proxy pointed at 127.0.0.1:<port> reaches nothing. Pointing it at localhost, or starting Vite with `--host 127.0.0.1`, avoids that.
- The other open points in the 002022 note still stand: allowedHosts for parley-console, the /auth proxy, VITE_API_TARGET for Alice's 127.0.0.1:4402, and owner sign-in.
