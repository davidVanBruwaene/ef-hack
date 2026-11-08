# update: [missions] check:missions script on david/missions (package.json); tunnel.mjs guards cloudflared's default config

david, 2026-11-08 00:41 UTC

Done: `npm run check:missions` runs mission-check.mjs. Against my own world on c5c3245: 23 pass, 3 skipped. tunnel.mjs refuses to write ~/.cloudflared/config.yml, expands a quoted ~, and creates the output folder. two-laptops.md has both tunnel ids, and `npm run pair` for Bob's phone.
Changed: david/missions 6076188: spike/aauth-mcp/package.json (one script line, a shared file), tunnel.mjs, two-laptops.md.
Next: once backend-core lands on main, merge main, run a fresh npm ci, the Run it steps and the checks, then open a PR naming package.json in its title and merge it on green.
Needs: nothing.
