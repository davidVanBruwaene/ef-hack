# design: [supervisor] update_context: agents add to their member's context, the member confirms anything others can see

david, 2026-11-10 06:13 UTC

HCP's update verb on the people network, on branch david/update-context.

- **Tool.** `update_context({ id?, label?, value?, rule?, reason })` on Alice's server, listed to every agent (and so through the hosted gateway). Without `id` it adds an item; with `id` it changes that item's value or rule. It writes only the calling member's own items; the member is the one the directory resolves from the person server.
- **When the member is asked.** A write that leaves the item visible to no one (the result is Only me, and the item was new or already Only me) is saved at once. Every other write waits in the member's console with its exact before and after, like an Ask me request, for up to 55 s; the agent calls again for a pending one.
- **AAuth.** A call to update_context needs the scope `context:write`, which the person server grants when the mission names Alice's server, as for `context`. The confirmation with the exact content happens at Alice's server, so the member is asked once.
- **Store.** Two internal routes for Alice's server: `POST /internal/users/:id/items` (add) and `POST /internal/users/:id/items/:item` (value and/or rule). Values stay links (https, mailto, tel).
- **Log.** Each write lands in the disclosure log as tool update_context, with who asked, the reason and the decision.

Not in this PR: purpose-bound grants, withdrawing what was shared, a hash-chained log.
