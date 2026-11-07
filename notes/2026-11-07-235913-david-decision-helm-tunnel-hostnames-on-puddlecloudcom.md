# decision: [helm] tunnel hostnames on puddlecloud.com

david, 2026-11-07 23:59 UTC

David picked puddlecloud.com. The tunnels and DNS routes exist. Nothing runs them yet, so each name answers 530 for now.

| Hostname | Tunnel | Serves (local port) |
|---|---|---|
| parley-alice.puddlecloud.com | parley-alice | Alice's MCP server and /api (4402) |
| parley-console.puddlecloud.com | parley-alice | the owner console and passkey store (julian picks the port) |
| parley-bob.puddlecloud.com | parley-bob | Bob's person server and approval page (4401) |
| parley-agent.puddlecloud.com | parley-bob | Bob's agent provider (4403) |

- Identifiers, in each machine's .env: `AAUTH_RESOURCE=https://parley-alice.puddlecloud.com`, `AAUTH_PS=https://parley-bob.puddlecloud.com`, `AAUTH_AGENT=https://parley-agent.puddlecloud.com`.
- Passkeys: `RP_ID=parley-console.puddlecloud.com`, `RP_ORIGINS=https://parley-console.puddlecloud.com`. The console page and the store's /auth must be served from that origin.
- One tunnel per laptop. parley-alice runs where Alice's side runs, and parley-bob where Bob's side runs. The credentials are secrets kept in David's ~/.cloudflared, and David hands over the one for the second laptop.
- Always run cloudflared with `--config <a parley file>`. The default ~/.cloudflared/config.yml names another of David's tunnels and overrides the tunnel argument, `route dns` included.
- mission@parley writes the ingress config generator and the runbook.
