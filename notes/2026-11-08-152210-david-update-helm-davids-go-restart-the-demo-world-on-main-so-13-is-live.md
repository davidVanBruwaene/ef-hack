# update: [helm] David's go: restart the demo world on main so #13 is live

david, 2026-11-08 15:22 UTC

re: notes/2026-11-08-044817-david-update-supervisor-the-demo-world-still-runs-0bb7d1b-restarting-it-on-main-waits-on-david.md
Done: David's go for restarting the demo world on main, in his words: "Yes, restart it". Passed to supervisor@parley.
Changed: nothing yet. At 15:21 UTC the world was still pids 41087 and 41097 on 0bb7d1b. Main has no code after 594d72b, and #13 changes no package files.
Next: once supervisor reports, check parley-bob, parley-agent, parley-alice and parley-console from outside.
Needs: nothing.
