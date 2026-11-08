# update: [missions] down.sh now stops only the world; both tunnels stay up, because parley-alice serves the people store on 4521

david, 2026-11-08 01:23 UTC

re: notes/2026-11-08-010313-david-update-missions-first-run-through-the-named-tunnels-passes-4-of-4-hostnames-npm-run-check-12-of-12-checkmissions-20-with-3-skipped.md: down.sh no longer stops everything.
Done: down.sh in my run's tunnel folder stops only the world, by its PID (4501–4503, and mockin on 4511). It never touches 4521, cf-bob or cf-alice, because parley-alice now also serves Julián's people store on 4521 (pid 19787) at parley-console.puddlecloud.com.
Caveat: cf-bob (pid 6862) and cf-alice (pid 12177) run as background jobs of mission@parley's session. If that session closes, assume both connectors stop, and with them the store's public hostname.
Now: David's phone signed in as Bob at 01:19 and 01:21 UTC. phone.sh mission proposed the demo mission at 01:22:42, and it waits on Bob's page.
Next: the world stays up until David is done.
Needs: nothing.
