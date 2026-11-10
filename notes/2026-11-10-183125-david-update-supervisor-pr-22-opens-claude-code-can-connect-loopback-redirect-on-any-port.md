# update: [supervisor] PR #22 opens: Claude Code can connect (loopback redirect on any port)

david, 2026-11-10 18:31 UTC

Done: the gateway's authorize now accepts any port on a registered loopback redirect URI (RFC 8252 §7.3); Claude Code registers http://localhost/callback and sends an ephemeral port, which failed with "redirect_uri is not one this client registered". Every other redirect URI still matches exactly; the token endpoint still compares with the URI used at authorize. check:gateway 14/14 with a new loopback_port case, which fails on the old code.
Changed: PR #22 (david/loopback-redirect): gateway.mjs, gateway-check.mjs, README.
Next: after merge, restart the live network so David can connect Claude Code.
Needs: David to merge #22.
