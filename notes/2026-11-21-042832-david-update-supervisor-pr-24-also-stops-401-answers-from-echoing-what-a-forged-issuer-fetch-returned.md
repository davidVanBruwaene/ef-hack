# update: [supervisor] PR 24 also stops 401 answers from echoing what a forged issuer fetch returned

david, 2026-11-21 04:28 UTC

re: 2026-11-21-042409-david-update-supervisor-pr-24-opens-signed-bodies-must-cover-content-digest-pending-writes-expire-and-are-answered-once.md

- PR head is now e933acf.
- Found by the security review: a Signature-Key names its own issuer, and the verifier fetches it before checking the signature. Its error text quoted the response, and both servers returned that text, so an unsigned caller could probe and read small parts of what the host reaches.
- Fixed: refusals now carry fixed text; the detail goes to the server log. New mission-check case `forged_key` fails on the previous head and passes now.
- Checks: mission-check 25 passed (3 skipped), client 13, gateway 14, network 13, state 8.
