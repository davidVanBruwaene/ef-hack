# AAuth-protected MCP spike

Alice keeps a list of links, each marked Everyone, Ask me or Only me. Bob's agent (Claude Code) reaches Alice's MCP server through a stdio proxy. The proxy signs every request with AAuth (draft-hardt-oauth-aauth-protocol-11) and names Bob's mission. Alice's server returns Everyone items at once. For Ask-me items it asks Alice while the call waits. Only-me items never appear. Each item the agent asks for needs its own scope, so it goes back through Bob's person server first.

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
| `npm run check` | All five cases below, each under a fresh mission | `all 5 passed` |
| `node client-check.mjs everyone` | Two Everyone items | Both come back |
| `node client-check.mjs ask` | An Ask-me item | The call waits; the script answers as Alice (approve) through `/api`; the item comes back |
| `node client-check.mjs deny` | An Ask-me item | Same, but Alice denies; the item is `declined` |
| `node client-check.mjs only_me` | A query matching an Only-me item | `not_found`; Alice's log shows it withheld |
| `node client-check.mjs revoked` | Alice revokes Bob, then Bob's agent calls | `403 requester_revoked`; the script restores Bob afterwards |
| `npm run check:consent` | Bob must approve | The agent waits on a consent link and code; the script approves it after 2 seconds |

To run it from Claude Code, first write the MCP config for this checkout (`mcp.json` is gitignored):

```bash
npm run mcp-config
```

Then ask Claude Code to use it. An Ask-me item waits until Alice answers in her console, or for 55 seconds (`ALICE_ASK_WAIT_S`).

```bash
claude -p "Use the alice server to see what Alice shares, then decide whether Bob and Alice should talk." \
  --mcp-config mcp.json --strict-mcp-config \
  --allowedTools mcp__alice__get_context_schema,mcp__alice__search_context
```

`npm run mcp-config "<mission text>"` sets a different mission. The mission hash is the base64url SHA-256 of the text.

`alice.json` seeds Alice's name and items. Her state is kept in `.data/alice-state.json`: rules, requesters, asks and the disclosure log. Delete `.data/` to start over.

## Alice's console API

The owner console (`console/`) calls these on Alice's server. Every call except `/api/events` needs `Authorization: Bearer <token>`, where the token is `ALICE_CONSOLE_TOKEN` or else the one generated into `.keys/alice-console-token`.

| Call | Body | Effect |
|---|---|---|
| `GET /api/state` | | `{owner, items, requesters, asks, disclosures}`, newest asks and disclosures first |
| `POST /api/asks/{id}` | `{decision: "approve" \| "deny", remember}` | Answers one ask. `remember` applies the answer to every later mission from this requester |
| `POST /api/asks` | `{decisions: [{id, decision, remember}]}` | Answers several asks at once |
| `POST /api/requesters/{id}` | `{status: "active" \| "revoked", label}` | Revoking refuses that requester's next call and denies its pending asks |
| `POST /api/items/{id}` | `{rule}` | Changes an item's rule. Stands in until the item store exists |
| `POST /api/items` | `{label, url, rule?}` | Adds a link, `ask` by default. Stands in until the item store exists |
| `GET /api/events` | | Server-sent `changed` events carrying a revision number, and no state; refetch `/api/state` on each |

An answer without `remember` holds for that requester's current mission only. Requester ids are derived from the person server and the pairwise `sub` it issues for Alice. The label comes from the `name` claim in the auth token. Each disclosure entry carries `prev` and `hash`, chaining it to the one before.

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
2. The proxy gets a person token, carrying `mission_s256`, from Bob's person server. Alice's server refuses a revoked requester with `403`. Otherwise it issues a resource token for scope `context` and answers `401 requirement=auth-token`.
3. The proxy exchanges the resource token at Bob's person server for an auth token that carries the same mission. Alice's server verifies it and serves MCP: `get_context_schema` lists the items Bob may request.
4. `search_context` names items. If the auth token lacks `item:<id>` for any of them, Alice's server issues a new resource token with the wider scope and answers `401 requirement=auth-token`. The proxy steps up at Bob's person server, presenting its current auth token, and retries.
5. Everyone items come back. Ask-me items raise an ask in Alice's console and the call waits for her answer. Only-me items are reported as `not_found`. Each call is appended to the disclosure log.

## Limits

- **Missions.** No person server implements `mission_endpoint`. mockin accepts any mission hash, and nobody approves the mission text itself.
- **Who is asking.** Alice's server knows a requester only as a person server plus a pairwise `sub`, labelled with the name that server puts in the auth token. Nothing proves that name.
- **Reasons.** The `reason` Alice sees is the agent's own claim. Bob's mission text stays at Bob's person server.
- **Consent.** mockin approves automatically unless `check:consent` or `npm run world:consent` turns approval on. Its consent link resolves only where Bob's person server is reachable: this machine, or anywhere once tunnelled.
- **Agent identity.** mockin's auth token names the agent's key (`cnf`), not the agent itself. To fill the gap, `alice.mjs` records which agent signed with each key.
- **Protocol coverage.** `@aauth/*` supports neither four-party mode (a separate access server) nor call chaining, so neither is here.
- **Keys.** The agent's identity key and Alice's resource key are generated test keys. They are kept in `.keys/`, which is gitignored, so they survive restarts.
