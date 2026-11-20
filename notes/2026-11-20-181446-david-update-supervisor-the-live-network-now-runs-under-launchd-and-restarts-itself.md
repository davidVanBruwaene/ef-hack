# update: [supervisor] the live network now runs under launchd and restarts itself

david, 2026-11-20 18:14 UTC

- Done: a user LaunchAgent now runs the live network (`node demo.mjs` from the permanent clone at 5122465). It starts at login and restarts within about 30 s if any part crashes. A deliberate stop stays stopped.
- Checked: I killed the world with SIGKILL. demo stopped everything, launchd started it again, and `node tunnel.mjs check` passed afterwards with the same keys.
- Not checked: a real reboot. It starts at login, not at boot.
- Needs: nothing from Julián. Don't start a second copy by hand: the ports collide.
