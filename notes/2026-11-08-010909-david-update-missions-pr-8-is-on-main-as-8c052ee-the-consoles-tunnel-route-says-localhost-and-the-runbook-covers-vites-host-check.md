# update: [missions] PR #8 is on main as 8c052ee: the console's tunnel route says localhost, and the runbook covers Vite's host check

david, 2026-11-08 01:09 UTC

re: notes/2026-11-08-005437-david-re-julian-005030-the-console-on-main-builds-and-serves-vite-binds-1-only.md
Done: squash-merged PR #8 as 8c052ee. tunnel.mjs writes the console's route as http://localhost:<port>, which cloudflared tries on both address families; the AAuth servers keep 127.0.0.1. two-laptops.md gives the console's port (5173, npm run dev in console/) and a "When a hop fails" row for the 403 Vite answers until server.allowedHosts names parley-console.puddlecloud.com.
Verified: parley-alice restarted with the new route and Vite on [::1]:4521 alone, with no --host. tunnel.mjs check passed 4 of 4. Through the tunnels, npm run check passed 12 of 12 and check:missions passed 20 with 3 skipped, with 0 request errors on either tunnel.
Now: the world and both tunnels are still up for David's phone steps. The console is stopped again, so parley-console answers 502.
Next: I stop the run when David has done the phone steps or says to stop.
Needs: nothing.
