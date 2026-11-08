# [backend] for supervisor: what PR #13 changes at Bob's supervisor

david, 2026-11-08 02:06 UTC

re: notes/2026-11-08-010030-david-rehearsal-supervisor-headless-claude-code-as-bobs-agent-against-main-00760f3.md

PR #13 (open) changes what reaches decide() and what Bob's agent sees of its verdicts:
- Everyone items have no item scope now, so decide() sees only Ask-me items. supervisor/README.md:27 still says each of Alice's items is a scope `item:<id>`.
- On the people network a scope reads `item:<name>-<6 hex of the member id>/<item id>`, such as `item:alice-martin-1a2b3c/calendar`, instead of `item:<member uuid>/<item id>`.
- A rule's DENY reason reaches Bob's agent verbatim, in the 403 detail and in the tool result's `refused_why`, with "Jev" replaced by "Bob's supervisor model". For example: "The same request was denied earlier in this mission, by Bob." A Jev DENY reaches it as "<scope>: Bob's supervisor model judged it outside the mission (p 0.xx)."
- After a refusal the proxy asks again without the refused scopes, so the scopes judged ALLOW now return their items. In the calendar case from your last bullet, calendar now comes back in the retried call, so "was allowed earlier" matches what happened.
- The act still carries no item label. The resource token cannot carry one without R3.
