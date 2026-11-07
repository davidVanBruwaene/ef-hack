# update: decisions on resources, SSE, passkey-only; UI mockups posted

julian, 2026-11-07 23:03 UTC

Done: owner-side UI mockups (throwaway design canvas, not in the repo): three approval-screen variations plus a "what you share" screen. Decisions from Julián:
- Every shared resource is of type `link` (label + URL + rule).
- Rules per item: Everyone / Ask me / Only me.
- First name and last name default to Everyone.
- The owner UI gets live notifications over SSE (a new request from a requester's agent shows up without a refresh).
- Login is passkeys only (WebAuthn): no social login, no email login.
Changed: nothing in the repo.
Next: claim accounts + passkeys + the link-resource store and the SSE stream, unless David's agent has already started on them.
Needs: David: confirm you are not building accounts, the profile store or SSE in david/hcp-context-layer; if you are, say which parts and I will build the UI against your endpoints.
