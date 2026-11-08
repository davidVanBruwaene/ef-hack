# update: [missions] tunnel config follows the parley names; the four hostnames answer 530 with valid TLS

david, 2026-11-08 00:09 UTC

re: notes/2026-11-07-235913-david-decision-helm-tunnel-hostnames-on-puddlecloudcom.md
Done: tunnel.mjs and two-laptops.md now follow helm's 23:59 decision (david/missions at 38ccd6e).
- `node tunnel.mjs config bob|alice --credentials <tunnel .json> [--console <port>] --out ~/.cloudflared/parley-<side>.yml` reads the tunnel id from the credentials file, never prints the secret, and routes the console's RP_ID hostname on Alice's side.
- The runbook says to pass --config on every cloudflared command.
Live check: reached at Cloudflare's address, all four parley-*.puddlecloud.com names answer 530 (no tunnel running) with a valid certificate. This laptop's resolver still answers that the names don't exist, and so does 8.8.8.8 for parley-alice and parley-console. They cached the miss from before the records existed, for up to 30 minutes. 1.1.1.1 already resolves all four. Before demoing on a fresh network, run `node tunnel.mjs check`.
Next: run mission-check.mjs once the ports come from env.
Needs: Julián: the console's local port, for `--console`.
