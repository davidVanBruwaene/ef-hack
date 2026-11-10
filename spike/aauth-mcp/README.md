# AAuth-protected MCP spike

Alice keeps a list of links, each marked Everyone, Ask me or Only me. Bob's agent (Claude Code) proposes a mission to the person server, and Bob approves it in the console, signed in with his store passkey; the first mission he approves makes the agent his. The agent then reaches Alice's MCP server through a stdio proxy, which signs every request with AAuth (draft-hardt-oauth-aauth-protocol-11) under that mission. Alice's server returns Everyone items at once. For Ask-me items it asks Alice while the call waits. Only-me items never appear. Each Ask-me item the agent asks for also needs its own scope, so the request goes back through Bob's person server first, where Bob's side can refuse it.

With `STORE_URL` set, the same server serves every member of the people network in `store/` instead of Alice's list ([The people network](#the-people-network)).

It runs on one laptop, or on two laptops behind a Cloudflare Tunnel. No real accounts are used.

## Parties

| Identifier | Role | Runs as | Port |
|---|---|---|---|
| `https://ps.aauth.test` | The person server, one for every member | `bob.mjs`: missions, the supervisor, and its own -11 person and auth tokens (`ps-tokens.mjs`) | 4401 |
| `https://alice.aauth.test` | Alice's context (the resource) | `alice.mjs`, MCP at `/mcp` | 4402 |
| `https://bob-agent.aauth.test` | Bob's agent provider, which publishes the agent's key | `bob.mjs` | 4403 |
| `aauth:claude@bob-agent.aauth.test` | Bob's agent | `proxy.mjs`, started by Claude Code | stdio |

AAuth server identifiers must be `https` with no port. The local ports can be moved with `AAUTH_PS_PORT`, `AAUTH_RESOURCE_PORT`, and `AAUTH_AGENT_PORT`, to run a second world beside the first. Locally, `loopback.mjs` sends `*.aauth.test` connections to `127.0.0.1` at the socket level. URLs, `Host` headers and signatures all keep the real identifiers. Set `AAUTH_PS`, `AAUTH_RESOURCE` and `AAUTH_AGENT` in `.env` at the repo root to use public hostnames instead.

The person server serves:
- `/.well-known/aauth-person.json` and its signing key at `/aauth/jwks.json`;
- `/mission`, the -11 `mission_endpoint`;
- `/aauth/token/person` and `/aauth/token/auth`;
- `/interact`, the interaction URL, which sends the member on to the console at `https://<RP_ID>/?code=<code>`;
- `/api`, which the console server calls for the member signed in.

It issues person tokens only under a mission a member approved, for the agent that proposed it. Each token's `sub` is pairwise: an HMAC of the member id and the resource, keyed with `PS_SUBJECT_SECRET` (or `.keys/ps-subject-secret`). It judges each auth token request with the supervisor (below) before minting the token.

A mission belongs to the member who answers it. The first mission an agent proposes can be answered by any signed-in member who holds its code, and approving it binds the agent to that member. After that only that member can answer the agent's missions and held requests. The code in an interaction link only says which request it is (§11.6.3.1). The agent receives the code too, so the code alone answers nothing: a member answers in the console, which vouches for their store sign-in, and a script answers with the console token. Codes are Crockford base32. They are read case-insensitively, without hyphens, and with I, L and O folded to 1 and 0. Each code works once, and a used one answers `410 invalid_code`. A proposal or held request waits 15 minutes; after that its poll answers `408 expired`. A poll for a request the member denied answers `403 denied`.

## Run it

You need Node 22 or later.

```bash
cd spike/aauth-mcp
npm ci --ignore-scripts
npm run world
```

`npm run world` runs both sides in one process. On two laptops, run `npm run bob` on Bob's and `npm run alice` on Alice's, each behind a tunnel (see below). Leave it running; it logs each AAuth step.

In a second terminal, propose a mission as the agent. `npm run mission` prints a QR code and a link to the proposal, then waits. Bob opens it on a phone signed in to the console, and can narrow the text before approving. Without `RP_ID` there is no console, and only `/api` answers. The approved mission is saved in `.keys/mission.json`, and the proxy runs under it.

```bash
npm run mission                 # the default mission
npm run mission -- "<text>"      # another one
```

On the people network, with `RP_ID` or `STORE_URL` set, the text is required, because the default mission is about alice.json's Alice.

The checks need no mission of their own. Each run proposes one and approves it as Bob through `/api`, as the console server would:

| Command | Case | Expected result |
|---|---|---|
| `npm run check` | All thirteen cases below, in order, under one fresh mission | `all 13 passed` |
| `node client-check.mjs everyone` | Two Everyone items | Both come back |
| `node client-check.mjs ask` | An Ask-me item | The call waits; the script answers as Alice (approve) through `/api`; the item comes back |
| `node client-check.mjs deny` | An Ask-me item | Same, but Alice denies; the item is `declined` |
| `node client-check.mjs only_me` | A query matching an Only-me item | `not_found`; Alice's log shows it withheld |
| `node client-check.mjs revoked` | Alice revokes Bob, then Bob's agent calls | `403 requester_revoked`; the script restores Bob afterwards |
| `node client-check.mjs no_mission` | The proxy names no mission | Bob's person server refuses the person token: `403 mission_required` |
| `node client-check.mjs unapproved` | The proxy names a mission Bob never approved | `400 invalid_request`, the same answer as for another agent's mission (§8.7) |
| `node client-check.mjs mission_denied` | Bob denies a proposed mission | The proposal ends in `403 denied` |
| `node client-check.mjs self_approval` | The agent looks its own code up at `/api` without the console token | `401`; the proposal stays pending until Bob denies it |
| `node client-check.mjs review_allow` | An Ask-me item the mission text does not mention | The supervisor holds it with the agent's reason; Bob allows, then Alice; the item comes back |
| `node client-check.mjs review_deny` | Same, and Bob denies | The item is `refused` and Alice is never asked; `refused_why` says Bob declined it |
| `node client-check.mjs remembered_deny` | Bob denies an item, then the agent asks again | The supervisor refuses the second call from the log, without asking Bob; `refused_why` cites the earlier denial |
| `node client-check.mjs ask remembered_deny partial` | One call for an item allowed earlier in the mission and one refused earlier | The first comes back and the second is `refused`, in one answer |
| `npm run check:gateway` | The hosted MCP endpoint with its own store, world and console server (see [The hosted MCP endpoint](#the-hosted-mcp-endpoint)) | `all 9 passed` |
| `npm run check:network` | The people network, with its own store and world (see [The people network](#the-people-network)) | `all 13 passed` |

To run it from Claude Code, approve a mission (`npm run mission`), then write the MCP config for this checkout (`mcp.json` is gitignored):

```bash
npm run mcp-config
```

Then ask Claude Code to use it. An Ask-me item waits until Alice answers in her console, or for 55 seconds (`ALICE_ASK_WAIT_S`).

```bash
claude -p "Use the alice server to see what Alice shares, then decide whether Bob and Alice should talk." \
  --mcp-config mcp.json --strict-mcp-config \
  --allowedTools mcp__alice__get_context_schema,mcp__alice__search_context
```

On the people network the tools are `find_people` and `search_context`, so allow `mcp__alice__find_people,mcp__alice__search_context` instead.

`alice.json` seeds Alice's name and items. Her state is kept in `.data/alice-state.json`: rules, requesters, asks and the disclosure log. Delete `.data/` to start over.

## The person server's API

The console server calls it after checking the member's store sign-in. Every call needs `Authorization: Bearer <token>`, where the token is `BOB_CONSOLE_TOKEN` or else the one generated into `.keys/bob-console-token`. `member` is `{id, name}`: the store member id and the first name the auth token carries.

| Call | Body | Effect |
|---|---|---|
| `GET /api/state?member=<id>` | | `{missions, reviews, log, interact_url}` for that member's missions and their agents' proposals, newest first; every member's without `member` |
| `GET /api/codes/{code}` | | The open request the code names, with the agent's owner if it has one; `410 invalid_code` once used |
| `POST /api/missions/{id}` | `{decision: "approve" \| "deny", member, code?, description?, supervisor?: "rules"}` | Answers a proposal; `code` is required for an unbound agent, and `description` narrows the text |
| `POST /api/reviews/{id}` | `{decision: "approve" \| "deny", member}` | Answers a request the supervisor held, if the mission is this member's |

## Bob's supervisor

On each auth token request, the front judges every scope the agent does not already hold:
- `context`, access to Alice's server itself, is allowed when the approved blob lists the resource, and held for Bob otherwise.
- Each `item:<id>` goes to `decide({mission, act, log})`. Only Ask-me items have scopes, so Everyone items never reach it.
  - `mission` is `{s256, status, blob_b64}`.
  - `act` is `{type: "token_request", agent, resource, scope, justification?}`. The justification is the `reason` of the tool call, which the proxy sends, as -11 allows, in the token request.
  - `log` is this mission's earlier decisions and Bob's answers, oldest first.

Any DENY refuses the request with `403 denied`. Any REVIEW holds the request and answers `202`. It appears in Bob's console with the agent's reason, and the auth token is minted only once Bob allows it. Otherwise the token goes straight to the agent.

A refusal's detail names the refused scopes in brackets, says why, and quotes the mission Bob approved. When Bob denies a held request, every scope held with it is refused. The proxy then asks Alice's server again, up to three times, with the refused scopes in `x-refused-scopes`. Alice's server stops requiring them and reports their items as `refused`, so the call answers with the rest. The proxy adds the refusal's detail to the tool result as `refused_why`. That text calls Jev "Bob's supervisor model". Alice's server never sees it and learns only the scope names.

`decide()` is `supervisor/decide.mjs` (see [supervisor/README.md](../../supervisor/README.md)). Its fixed rules go first. One of them repeats an earlier answer for the same scope, so Bob is not asked twice. Whatever the rules leave open goes to Jev through OpenRouter, and anything Jev is unsure of, or cannot answer, is held for Bob. When Bob approves a mission he can tick "Rules only". Nothing under that mission then goes to Jev, and whatever the rules leave open is held for him. The checks approve their missions that way, so their results never depend on the model.

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

## The people network

With `STORE_URL` set, `alice.mjs` serves every member of the passkey store (`store/`) instead of `alice.json`. It reads members, items and rules through the store's `/internal` routes, with `STORE_INTERNAL_TOKEN` as the bearer. Asks, remembered answers, revocations and the disclosure log stay on the MCP server.

| Tool | Arguments | Returns |
|---|---|---|
| `find_people` | `{query?}` | `{people: [{person, name, items: [{id, label, access}]}]}`, for members whose name or Everyone items match. `access` is `shared` or `ask`. No values, and never the caller |
| `search_context` | `{person, ids?, query?, reason?}` | As with `alice.json`, for the member `person`, whose id the answer repeats |

- Rules are the store's: each item's rule for everyone, or the rule its owner set for this caller. Only-me items never appear.
- Item ids are the store's. Scopes name the owner readably, `item:<name>-<hex>/<item id>`: `<name>` is the owner's name in lowercase with hyphens, and `<hex>` is the first six hex digits of the member id. The console shows whose item each scope is, and his supervisor judges each owner's items apart.
- `MEMBER_MAP` says which member each person server speaks for, set once at setup: `{"<person server>": "<member id>"}`, or `{"<person server> <sub>": "<member id>"}` to tell apart several people on one person server. It is inline JSON or a file path. A file is read on every call, so it can change while the server runs. To find a member's id, sign in to the store as them and open `/auth/me`.
- An unmapped person server gets `not_a_member` from both tools, and a person id the store does not know gets `unknown_person`. If the store does not answer, the call fails with `502 store_unavailable`.

In this mode Alice's `/api` acts for one owner at a time:
- A member signed in to the store sends the store's `sid` cookie, and the MCP server asks the store's `/auth/me` whose session it is. The cookie is host-only, so the console must reach `/api` through the store's origin. A post with a cookie must have a JSON body, or it gets `415`.
- The console token with `x-owner: <member id>`, or `?owner=`, acts for that member. With neither, it acts for every owner.
- `GET /api/state` returns that owner's `{requesters, asks, disclosures}`, plus `me` for a cookie, and every owner's for the token alone. Asks and disclosures carry `owner`, and an ask's `item_id` is `<member id>/<item id>`. There is no `owner` or `items`: items come from the store's `/me/items`.
- Revoking a requester refuses it for this owner's items only, and leaves this owner out of its `find_people`.
- `/api/items` answers `409`: items live in the store.

To serve a running store:

```bash
STORE_URL=http://127.0.0.1:8790 STORE_INTERNAL_TOKEN=<the store's token> MEMBER_MAP=.keys/member-map.json npm run world
```

`npm run check:network` needs no world or store running. It starts a store with a temporary database on port 4690 and a world on 4601 to 4603. It registers Alice, Bob and Carol with the store's software passkey, maps Bob's person server to Bob, and runs thirteen cases as Bob's agent, with Alice and Carol answering at `/api`. Run `npm ci` in `store/` first.

## The hosted MCP endpoint

Any agent that can add a remote MCP server connects at `https://<RP_ID>/mcp`, served by the console server (`gateway.mjs`). This covers Claude, ChatGPT and other hosted agents, which cannot launch a local proxy. The agent signs in with OAuth (MCP authorization): it finds `/.well-known/oauth-protected-resource`, then the authorization server metadata, and registers with dynamic client registration or a client ID metadata document. The authorize step sends the member to the console at `/?connect=<id>`. There they sign in with their passkey and press Connect. PKCE (S256) is required. Access tokens last an hour, and refresh tokens last 30 days and rotate on use.

Each connection is its own AAuth agent, `aauth:<connection id>@<agent host>`, and the person server binds it to the member when they connect. Behind `/mcp`, the gateway does what `proxy.mjs` does, with the same `@aauth/agent` fetch (`aauth-fetch.mjs`) under that connection's identity. Alice's server lists its tools to an agent before any mission, so the agent sees them at once. The gateway adds one tool of its own, `start_mission`. The other tools answer `mission_required` until the member approves a mission in the console. The mission reaches that member's console without a code, because the agent is already theirs. A member lists and disconnects their agents under What you share; disconnecting drops the connection's tokens.

To connect, add `https://<RP_ID>/mcp` as a custom connector in the agent. In Claude Code:

```bash
claude mcp add --transport http parley https://<RP_ID>/mcp
```

`npm run check:gateway` needs no world or store running. It starts a store on 4790, a world on 4701 to 4703 and a console server on 4731, all on temporary data. It then plays an MCP client through registration, connect, the token endpoint, a mission and two tool calls, then refresh and disconnect. Run `npm ci` in `store/` and build the console first.

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

Every laptop involved needs the same three lines in `.env` at the repo root. On one laptop, run both tunnels there and `npm run world`. The team's hostnames are on puddlecloud.com. The `parley-bob` tunnel runs on Bob's laptop and serves parley-bob and parley-agent. The `parley-alice` tunnel runs on Alice's and serves parley-alice and parley-console.

```bash
AAUTH_PS=https://parley-bob.puddlecloud.com
AAUTH_AGENT=https://parley-agent.puddlecloud.com
AAUTH_RESOURCE=https://parley-alice.puddlecloud.com
```

To try it without a zone, `cloudflared tunnel --url http://127.0.0.1:<port>` prints a random `trycloudflare.com` hostname for one port. Run one per port, then start the servers with those hostnames in `.env`. They change on every run. If `~/.cloudflared/config.yml` exists, also pass `--config` naming an empty file.

The tunnel passes the public hostname through as the `Host` header, and the HTTP signatures cover it. Don't set `httpHostHeader` in the tunnel config.

## The flow

1. Bob's agent proposes the mission with a signed POST to `mission_endpoint`. The person server answers `202` with an interaction link and code, and Bob approves on that page. The agent polls, receives the mission blob and its `s256` (the SHA-256 of the blob's exact bytes), and checks one against the other.
2. The proxy signs a request with an agent token. Alice's server answers `401 requirement=person-token`.
3. The proxy asks Bob's person server for a person token naming `mission_s256`. The person server issues one only under a mission Bob approved for this agent, and only before it expires. Alice's server refuses a revoked requester with `403`. Otherwise it issues a resource token for scope `context` and answers `401 requirement=auth-token`.
4. The proxy exchanges the resource token at Bob's person server for an auth token that carries the same mission. Alice's server verifies it and serves MCP: `get_context_schema` lists the items Bob may request.
5. `search_context` names items. If the auth token lacks `item:<id>` for any Ask-me item among them, Alice's server issues a new resource token with the wider scope and answers `401 requirement=auth-token`. The proxy steps up at Bob's person server, presenting its current auth token, and retries. If Bob's side refuses some of those scopes, the proxy asks again without them.
6. Everyone items come back. Ask-me items raise an ask in Alice's console and the call waits for her answer. Only-me items are reported as `not_found`. The answer sorts the items it names into `shared`, `pending` (Alice has not answered yet), `declined` (Alice said no), `refused` (Bob's side refused the scope, so Alice was never asked) and `not_found`, and `note` says the same in words. Each call is appended to the disclosure log.

## Limits

- **Missions.** The person server implements mission creation and approval (§8.1, §8.2) and keeps a log. It returns no `person_tokens` in the approval response, since minting them needs a request the agent signed, and it offers no clarification chat. Missions last 24 hours.
- **Members' sign-in.** A member answers in the console with their store passkey, or a script answers with the console token. An agent running on the machine that runs the person server can read `.keys/bob-console-token`, and so answer for its member. A person server on its own host closes that.
- **The local proxy's identity.** `proxy.mjs` signs as one agent, `aauth:claude@<agent host>`, so the first member to approve its mission owns it. Each hosted connection is an agent of its own, and AAuth agents from other providers bring their own identity.
- **Hosted clients.** Each hosted agent product decides whether it accepts a custom remote MCP server; `check:gateway` plays a generic MCP client, not any particular product.
- **Who is asking.** Alice's server knows a requester only as a person server plus a pairwise `sub`, labelled with the name that server puts in the auth token. Nothing proves that name.
- **Reasons.** The `reason` Alice sees is the agent's own claim. Alice's server never sees Bob's mission text.
- **Agent identity.** The auth token names the agent's key (`cnf`), not the agent itself. To fill the gap, `alice.mjs` records which agent signed with each key.
- **Protocol coverage.** `@aauth/*` supports neither four-party mode (a separate access server) nor call chaining, so neither is here.
- **Keys.** The agent's identity key and Alice's resource key are generated test keys. They are kept in `.keys/`, which is gitignored, so they survive restarts.
