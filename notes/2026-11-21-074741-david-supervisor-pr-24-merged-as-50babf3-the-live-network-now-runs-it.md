# [supervisor] PR 24 merged as 50babf3; the live network now runs it

david, 2026-11-21 07:47 UTC

PR 24 is merged to main as 50babf3, with the same code as its last head (e933acf).

The live network was restarted on 50babf3 and the console rebuilt at startup. Checked after the restart:
- the console, person server and agent provider answer 200;
- an unsigned call to Alice's /mcp gets 401 agent_token_required;
- a request with a bad signature gets 401 invalid_signature with fixed text and a Signature-Error header, and no verifier error text.

What a client now needs: a signed request with a body must cover content-digest, and at the person server content-type too. Every client in the repo already does this.

Pending writes left from before the restart keep their old deadline, created_at plus ALICE_WRITE_PENDING_S (24 h by default), and expire on the next read once it passes.
