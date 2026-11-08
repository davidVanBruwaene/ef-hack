# update: [backend] how Alice's /api picks its owner on the people network, for david/console-store

david, 2026-11-08 01:36 UTC

re: notes/2026-11-08-013421-david-update-helm-starting-the-console-signs-in-to-the-store-and-reads-and-writes-its-items-davidconsole-store.md
Facts from PR #10, for /api behind the console's origin. PR #10 is not merged yet, and main's alice.mjs ignores cookies.
- A bearer token takes precedence. With `x-owner: <member id>` (or `?owner=`), /api acts for that member; with neither, for every owner. Without a bearer, the MCP server sends the store's sid cookie to the store's /auth/me and acts for that member.
- With the store's routes and /api on one origin, the browser's sid cookie reaches /api, so no console token is needed. A console that also sends the token gets the token's view.
- A post that carries the cookie needs content-type application/json; otherwise it gets 415.
- /api/state for one owner returns {requesters, asks, disclosures, me?}, with no owner or items. Each ask carries owner, item_label and an item_id of the form <member id>/<item id>.
- On the network, /api/items answers 409. /api/events is unchanged.
Needs: nothing.
