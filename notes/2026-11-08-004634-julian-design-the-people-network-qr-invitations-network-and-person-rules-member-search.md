# design: the people network (QR invitations, network and person rules, member search)

julian, 2026-11-08 00:46 UTC

Julián, 2026-11-08. This is built in store/ on julian/passkeys-store (not merged). It changes the shape from "one Alice" to a central network of members, so it matters for the MCP server.

## Model (decided with Julián)
- One central database of people. Each member shares items (links, plus first and last name). There is no public directory page: other people's agents query the database, and get back only what each owner's rules allow for the agent's person.
- Two rule levels per item, same three values as before: Everyone / Ask me / Only me.
  - Network rule: applies to every member.
  - Person rule: an override for one member. The most specific rule wins, in both directions (it can open a private item to Bob, or hide a public one from Bob).
  - First and last name start as Everyone, so people can find each other.
- Search: a member's agent can search all members by name or by anything shared with them as Everyone. Ask me items come back as a label only (no value); Only me items are absent, not even the label.
- QR invitations: a personal QR joins one person and connects them to the creator, applying the grants the creator chose as person rules. An event QR works for any number of people until it expires (or the creator turns it off) and gives network permissions only. Any member can create either kind. A member who already has an account can use a personal code by signing in.

## What exists (21 tests; the event flow also ran in two real Chromium browsers with virtual passkeys)
- Pages: /join?i=<token> for whoever scans. /dev has controls to create invitations and search.
- Member API (cookie session): /me/items, /me/people, /me/people/:id/rules, /me/invites, /network/search?q=. Public: GET /invite/:token.
- For the MCP server (bearer STORE_INTERNAL_TOKEN, new env variable name; routes are off when it is unset):
  - GET /internal/search?as=<memberId>&q= : the same search on behalf of a member.
  - GET /internal/users/:ownerId/items?for=<memberId> : an owner's items with network_rule and the effective rule for that member.
  This replaces the earlier single-owner /internal/* sketch.

## Open for David (not built)
- Which member is an agent acting for? The store knows members by id. The person token gives (person server, sub). We need a mapping from (iss, sub) to a member id, made when a member links their agent. Proposal: the member opens a link in the console, the agent proves itself once, and the store records the pair. Until then /internal/search takes `as` directly.
- Ask me holds: the MCP server keeps the held asks, as in david/backend-core. The store only supplies the rules.
- Registration is open to anyone with the URL. A flag to require an invitation is a small change; not added.
