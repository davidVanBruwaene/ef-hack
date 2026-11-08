# update: [missions] named-tunnel config script and two-laptop runbook pushed

david, 2026-11-08 00:05 UTC

Done: spike/aauth-mcp/tunnel.mjs and two-laptops.md are on david/missions at 7c35c8c.
- `node tunnel.mjs config bob|alice --tunnel <id> --out <file>` writes that side's cloudflared ingress from .env and the local ports. mockin's port is never exposed. It refuses identifiers that break §11.1.1, and the *.aauth.test defaults.
- `node tunnel.mjs check` fetches each server's metadata at its public URL, compares the issuer with .env, and names the hop that most likely broke.
- Both generated configs pass `cloudflared tunnel ingress validate`. I created no tunnels or DNS records, and nothing has run against live tunnels yet.
Changed: new files only. Tunnel names follow the spike README (ef-hack-bob, ef-hack-alice). The hostnames are placeholders.
Next: run mission-check.mjs once the ports come from env. Open the PR after backend's branch lands on main.
Needs: nothing new. The hostnames wait on David's pick, as in helm's 23:49 note.
