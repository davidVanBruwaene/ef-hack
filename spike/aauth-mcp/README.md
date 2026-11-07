# AAuth-protected MCP spike

Alice shares some personal context with Bob's agent for one stated intent. Bob's agent (Claude Code) reaches Alice's MCP server through a stdio proxy. The proxy signs every request with AAuth (draft-hardt-oauth-aauth-protocol-11) and names the intent as its mission. Alice's server serves only the fields Alice granted for that mission.

It runs on one laptop, or on two laptops behind a Cloudflare Tunnel. No real accounts are used.

## Parties

| Identifier | Role | Runs as | Port |
|---|---|---|---|
| `https://ps.aauth.test` | Bob's person server | `bob.mjs`: a front on 4401 with mockin, Hellō's -11 mock person server, behind it on 4411 | 4401 |
| `https://alice.aauth.test` | Alice's context (the resource) | `alice.mjs`, MCP at `/mcp` | 4402 |
| `https://bob-agent.aauth.test` | Bob's agent provider, which publishes the agent's key | `bob.mjs` | 4403 |
| `aauth:claude@bob-agent.aauth.test` | Bob's agent | `proxy.mjs`, started by Claude Code | stdio |

AAuth server identifiers must be `https` with no port. Locally, `loopback.mjs` sends `*.aauth.test` connections to `127.0.0.1` at the socket level, in our processes and in mockin's. URLs, `Host` headers and signatures all keep the real identifiers. Set `AAUTH_PS`, `AAUTH_RESOURCE` and `AAUTH_AGENT` in `.env` at the repo root to use public hostnames instead.

The front passes only `/.well-known/aauth-person.json` and `/aauth/*` through to mockin. mockin's `/mock` control API stays on its private port.

## Run it

You need Node 22 or later.

```bash
cd spike/aauth-mcp
npm ci --ignore-scripts
npm run world
```

`npm run world` runs both sides in one process. On two laptops, run `npm run bob` on Bob's and `npm run alice` on Alice's, each behind a tunnel (see below). Leave it running; it logs each AAuth step. Then, in a second terminal, run the checks:

| Command | Case | Expected result |
|---|---|---|
| `npm run check` | The granted intent | Alice's availability and meeting preferences come back |
| `npm run check:none` | No mission | 403 before any resource token |
| `npm run check:wrong` | A mission Alice never granted | 403 |
| `npm run check:consent` | Bob must approve | The agent waits on a consent link and code; the script approves it after 2 seconds |

To run it from Claude Code, first write the MCP config for this checkout (`mcp.json` is gitignored):

```bash
npm run mcp-config
```

Then call the tool:

```bash
claude -p "Call get_shared_context on the alice server and propose a meeting slot." \
  --mcp-config mcp.json --strict-mcp-config --allowedTools mcp__alice__get_shared_context
```

`alice.json` holds Alice's context and grants. Each grant is an intent plus the fields it shares. The mission hash is the base64url SHA-256 of the intent text.

## Behind Cloudflare

Each side's ports go out through a Cloudflare Tunnel, and `.env` at the repo root names the public hostnames. Give these tunnels their own config files: changing a tunnel that already serves other hostnames means restarting it.

On a machine logged in to the Cloudflare account (`cloudflared tunnel login`), with `<domain>` a zone in that account, create one tunnel per side and route its hostnames:

```bash
cloudflared tunnel create ef-hack-bob
cloudflared tunnel route dns ef-hack-bob ps.<domain>
cloudflared tunnel route dns ef-hack-bob bob-agent.<domain>
cloudflared tunnel create ef-hack-alice
cloudflared tunnel route dns ef-hack-alice alice.<domain>
```

Bob's tunnel serves two hostnames, so it runs from a config file such as `~/.cloudflared/ef-hack-bob.yml`, using the id that `tunnel create` printed:

```yaml
tunnel: <tunnel-id>
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: ps.<domain>
    service: http://127.0.0.1:4401
  - hostname: bob-agent.<domain>
    service: http://127.0.0.1:4403
  - service: http_status:404
```

```bash
cloudflared tunnel --config ~/.cloudflared/ef-hack-bob.yml run
```

Alice's tunnel serves one port:

```bash
cloudflared tunnel run --url http://127.0.0.1:4402 ef-hack-alice
```

A laptop that is not logged in to the account runs a tunnel with its token instead, which `cloudflared tunnel token ef-hack-alice` prints. The token is a secret: hand it over directly, never through git or notes.

```bash
cloudflared tunnel run --url http://127.0.0.1:4402 --token <token>
```

Every laptop involved needs the same three lines in `.env` at the repo root. On one laptop, run both tunnels there and `npm run world`.

```bash
AAUTH_PS=https://ps.<domain>
AAUTH_AGENT=https://bob-agent.<domain>
AAUTH_RESOURCE=https://alice.<domain>
```

To try it without a zone, `cloudflared tunnel --url http://127.0.0.1:<port>` prints a random `trycloudflare.com` hostname for one port. Run one per port, then start the servers with those hostnames in `.env`. They change on every run. If `~/.cloudflared/config.yml` exists, also pass `--config` naming an empty file.

The tunnel passes the public hostname through as the `Host` header, and the HTTP signatures cover it. Don't set `httpHostHeader` in the tunnel config.

## The flow

1. The proxy signs a request with an agent token. Alice's server answers `401 requirement=person-token`.
2. The proxy gets a person token, carrying `mission_s256`, from Bob's person server. Alice's server checks the mission against Alice's grants:
   - no matching grant: `403 mission_not_granted`;
   - a matching grant: it issues a resource token and answers `401 requirement=auth-token`.
3. The proxy exchanges the resource token at Bob's person server for an auth token that carries the same mission. Alice's server verifies the auth token and serves MCP.
4. `get_shared_context` returns only the granted fields.

## Limits

- **Missions.** No person server implements `mission_endpoint`. mockin accepts any mission hash, and nobody approves the mission text itself.
- **Grant scope.** A grant is bound to a mission, not to Bob. Any agent whose person server stamps that mission hash gets in.
- **Consent.** mockin approves automatically unless `check:consent` or `npm run world:consent` turns approval on. Its consent link resolves only where Bob's person server is reachable: this machine, or anywhere once tunnelled.
- **Agent identity.** mockin's auth token names the agent's key (`cnf`), not the agent itself. To fill the gap, `alice.mjs` records which agent signed with each key.
- **Protocol coverage.** `@aauth/*` supports neither four-party mode (a separate access server) nor call chaining, so neither is here.
- **Keys.** The agent's identity key and Alice's resource key are generated test keys. They are kept in `.keys/`, which is gitignored, so they survive restarts.
