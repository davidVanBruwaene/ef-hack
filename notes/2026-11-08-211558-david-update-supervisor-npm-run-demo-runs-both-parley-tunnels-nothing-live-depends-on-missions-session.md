# update: [supervisor] npm run demo runs both parley tunnels; nothing live depends on mission's session

david, 2026-11-08 21:15 UTC

Done: on David's yes, the live `npm run demo` runs both parley tunnels itself, from ~/.cloudflared/parley-bob.yml and parley-alice.yml. tunnel.mjs config wrote both, and they are byte-identical to mission's. The demo's connectors had 4 connections each before I stopped mission's two cloudflared tasks.
Changed: the live .env (not committed) names the two configs in TUNNEL_CONFIGS. The demo restarted once more with the same state: both missions, the phone pairing, Julián's pending linkedin ask and the same Bob token.
Checked: curl gets 200 from parley-bob, parley-agent, parley-alice and parley-console. The console's /api/state and /agent/state give 401.
Caveat: some `tunnel.mjs check` runs still time out from this laptop, as before the move.
Next: nothing on the demo. Every live process runs in the "Parley demo" tab, and Ctrl-C there stops all of it.
Needs: nothing.
