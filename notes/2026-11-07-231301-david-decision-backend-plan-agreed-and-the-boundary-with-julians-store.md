# decision: backend plan agreed, and the boundary with Julián's store

david, 2026-11-07 23:13 UTC

re: notes/2026-11-07-223718-david-proposal-addendum-mission-approval-and-a-supervisor.md
re: notes/2026-11-07-230341-julian-update-decisions-on-resources-sse-passkey-only-ui-mockups-posted.md

David approved all the recommendations. This settles the open decisions in the proposal and its addendum, and it takes on Julián's 23:03 decisions as given.

## Decided

1. **The supervisor sits at Bob's person server.** It judges each token request from Bob's agent against Bob's mission. Fixed rules decide first, Jev (TypeSafe) takes the contextual call, and Bob decides whatever neither settles.
2. **Alice's side is deterministic and follows Julián's model.** Items are links with a rule: Everyone, Ask me or Only me. Alice's MCP server enforces the rules, remembers each requester's "Ask me" answers and can revoke a requester. None of this depends on Bob's mission.
3. **Bob's person server is mockin behind a thin -11 front.** The front adds the mission endpoint, Bob's approval link and the supervision hook. mockin still issues and signs the tokens.
4. **Missions follow -11.** The agent proposes a mission, and Bob approves it from a link or a QR code. `mission_s256` is the hash of the approved mission blob.
5. **Cloudflare.** David is putting the servers behind a Cloudflare Tunnel so two laptops and phones can reach each other. Workers would mean rewriting mockin, so the servers stay Node. Server identifiers become settings.
6. **Frontend.** Bob stays in Claude Code, and Bob's approvals are one small page on Bob's person server.

## Not built by David's agent

Accounts, passkeys, the item store, SSE and the owner UI: all of these are Julián's.

## Built by David's agent, on branch `david/backend-core`, in this order

0. Server identifiers come from env. `npm run alice` and `npm run bob` let each side run on its own laptop.
1. Alice's MCP server:
   - `get_context_schema` and `search_context` over the link items;
   - Everyone / Ask me / Only me enforcement, where an "Ask me" item holds the agent's call until Alice answers;
   - revocation that works even against tokens already issued;
   - a hash-chained disclosure log.
2. Bob's person-server front: the mission endpoint and approval link. Tokens are refused for missions Bob has not approved.
3. The supervisor seam on auth-token requests, rules only. Anything it sends for review goes to Bob.
4. Jev behind the seam, with a rules-only fallback.

## Proposed boundary between Alice's MCP server and Julián's store (v0, Julián's call)

The MCP server needs five things from the store:

- `GET /internal/owner` returns `{first_name, last_name}`.
- `GET /internal/items` returns `[{id, label, url, rule}]`, with `rule` one of `everyone`, `ask`, `only_me`.
- `POST /internal/asks` with `{requester, agent, mission_s256, item_id, reason}` returns `{id}`. Then `GET /internal/asks/{id}` returns `{status, remember}`, with `status` one of `pending`, `approved`, `denied`. The store tells the owner over SSE.
- `GET /internal/requesters/{id}` returns `{status, label}`, with `status` either `active` or `revoked`. A requester's id is the person server plus the pairwise `sub` from the AAuth person token.
- `POST /internal/disclosures` takes `{at, requester, agent, mission_s256, tool, query, disclosed, withheld, decided_by, reason}` for the owner's activity view.

Until the store exists, the MCP server keeps this state itself, seeded from `alice.json`. The owner UI can build against it now:

- `GET /api/state` returns items, requesters, pending asks and the disclosure log.
- `POST /api/asks/{id}` takes `{decision: "approve"|"deny", remember}`.
- `POST /api/requesters/{id}` takes `{status: "active"|"revoked", label}`.
- Every call needs `Authorization: Bearer $ALICE_CONSOLE_TOKEN`, with the value kept in `.env`.

Bob's person server exposes the same kind of surface for Bob's page:

- `GET /api/state` returns missions, reviews and the mission log, and shows who decided each act: rule, Jev or Bob.
- `POST /api/missions/{id}` and `POST /api/reviews/{id}` take approve or deny.
- `GET /interact?code=…` is the approval link the agent prints and the QR code encodes.
