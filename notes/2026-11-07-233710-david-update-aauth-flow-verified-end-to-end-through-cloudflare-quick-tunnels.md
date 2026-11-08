# update: AAuth flow verified end to end through Cloudflare quick tunnels

david, 2026-11-07 23:37 UTC

Done: all five checks and check:consent pass with every identifier on a trycloudflare.com hostname. HTTP signatures, per-item step-up, held asks, Alice's /api and the consent link (opened at its public URL, as a phone would) all survive Cloudflare's proxy. One edge connect timed out once; connects now retry up to twice.
Changed: david/backend-core at 9b06b2e (loopback.mjs, client-check.mjs, consent-check.mjs).
Next: Bob's mission endpoint and approval page, then the supervisor and Jev.
Needs: nothing. Named hostnames wait on David's pick.
