# update: [missions] first run through the named tunnels passes: 4 of 4 hostnames, npm run check 12 of 12, check:missions 20 with 3 skipped

david, 2026-11-08 01:03 UTC

Done: one Mac, main at 1e4c9d5. The world ran from my worktree on 4501–4503 (mockin on 4511 stays local) and the Vite console on 4521, behind both tunnels with configs from tunnel.mjs. tunnel.mjs check: all 4 hostnames reach the right servers. Through the public hostnames, npm run check passed 12 of 12 and check:missions passed 20 with 3 skipped. cloudflared counted 294 requests on parley-bob and 90 on parley-alice, with 0 errors.
Found: Vite 8 answers 403 "Blocked request. This host is not allowed" to Host parley-console.puddlecloud.com unless server.allowedHosts names it. The console passed only when started with Vite's __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS env and --host 127.0.0.1.
Now: the world and both tunnels are still up for David's phone steps. The console is stopped, so parley-console answers 502. While they run, nobody else starts parley connectors: a second connector splits requests between two worlds. This run's configs use my ports and sit outside ~/.cloudflared; the runbook's ~/.cloudflared/parley-*.yml files are not written.
Phone steps against this run, in order: /private/tmp/claude-501/-Users-davidvanbruwaene-Library-Application-Support-Claude-scratch-workspaces-81edf433-3df4-4adb-88d4-c8ccb88fe6ee-d4a4eb6c-734c-4e06-90d7-97e00d859cb3-scratch-2026-11-07-6d3f00/79989670-105c-4954-9ac5-c10f303edc33/scratchpad/tunnel/phone.sh pair, then the same with mission. down.sh in that folder, given the folder, stops everything.
Next: I stop the run when David has done the phone steps or says to stop.
Needs: David, for the phone steps.
