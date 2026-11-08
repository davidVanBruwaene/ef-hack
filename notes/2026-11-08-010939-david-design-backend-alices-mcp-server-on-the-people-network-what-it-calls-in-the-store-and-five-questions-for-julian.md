# design: [backend] Alice's MCP server on the people network: what it calls in the store, and five questions for Julián

david, 2026-11-08 01:09 UTC

re: notes/2026-11-08-004634-julian-design-the-people-network-qr-invitations-network-and-person-rules-member-search.md
re: notes/2026-11-08-005914-david-decision-david-for-the-demo-bobs-agent-is-mapped-to-his-member-account-at-setup.md

From backend, read against julian/passkeys-store at 302a6fd. Nothing is built yet. David's go to start the build is pending in backend's session.

## What the MCP server calls in the store
- `GET /internal/search?as=<member>&q=` when the agent looks for people. It returns what the store already returns: names, Everyone items with values, and Ask me items as labels.
- `GET /internal/users/<owner>/items?for=<member>` when the agent asks for one owner's items. The server goes by `rule`:
  - Everyone: the value.
  - Ask me: a held ask to the owner, then the value once the owner approves. This route already returns every value, so nothing more is needed to disclose after an approval.
  - Only me: not found, with no label.
- Nothing else for the demo.

## Config on the MCP server (names go in .env.example)
- `STORE_URL`: the store's base URL, e.g. http://127.0.0.1:8790.
- `STORE_INTERNAL_TOKEN`: the same value the store has.
- `MEMBER_MAP`: David's setup mapping, as JSON from `"<person server>"` or `"<person server> <sub>"` to a member id. A person server on its own matches any sub there, which fits one Bob per person server.
- Until the store is on main, the server keeps alice.json behind a switch: no STORE_URL means alice.json.

## What changes on the MCP server
- The agent finds a person first, then asks for that person's items.
- Each scope names the owner and the item. Bob's supervisor still judges every item that isn't Everyone.
- Held asks, the disclosure chain and revocation stay on the MCP server, keyed by owner.

## Questions for Julián
1. Owner sign-in for answering asks. The asks live on the MCP server, and the owner answers them in the console. If the console serves /api and /auth from one origin, the MCP server can forward the `sid` cookie to `GET /auth/me` to learn which member is answering. Does /auth/me return the member id, and is forwarding the cookie acceptable? The alternative is an internal route that resolves a session to a member.
2. "Remember" on an ask. A remembered answer is now a person rule in the store. Should the MCP server write it, which needs an internal route like `POST /internal/users/<owner>/people/<member>/rules`? Or should the console write it with `/me/people/<member>/rules` after the owner answers?
3. Values are links only (SAFE_VALUE: http(s), mailto, tel). In the 010030 rehearsal the agent could not finish from bare example.com links. For the demo, either the links open pages the agent can read, or a value can be short text. Which do you prefer?
4. Member ids: is users.id stable for a member's lifetime? The setup mapping stores Bob's.
5. When do you expect julian/passkeys-store on main? The MCP server's switch to the store follows it.
