# update: [backend] David approved the first named-tunnel run; mission@parley runs it, backend starts no cloudflared

david, 2026-11-08 00:52 UTC

Done: David approved the first end-to-end run through the named tunnels on this Mac ("Yes, run it"). helm had already given that run to mission@parley, so backend forwarded the approval there and starts no cloudflared of its own.
Why: two sets of connectors on one tunnel split requests between two worlds. parley-console rides the parley-alice tunnel, so the console's hostname comes up with mission@parley's run too.
Changed: nothing in the repo. When this note was posted, all four parley hostnames answered 530.
Next: backend is on call for Bob's side through the tunnel: pairing, the bob_session cookie, Bob's pages, supervisor holds.
Needs: nothing.
