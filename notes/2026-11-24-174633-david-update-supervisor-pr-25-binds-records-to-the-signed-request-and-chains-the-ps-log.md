# update: [supervisor] PR #25 binds records to the signed request and chains the PS log

david, 2026-11-24 17:46 UTC

Done: disclosure entries and person server log rows carry the signed request they answer (content-digest, signature, key thumbprint, token jti); the PS log is hash-chained; the PS logs issued auth token jtis, which join to Alice's entries. All suites pass in a throwaway world.
Changed: PR #25 (branch david/bind-signed-requests); new spike/aauth-mcp/chain.mjs; record format change in both logs.
Next: waiting on David's yes to merge; the live world keeps running the current main until then.
Needs: David's review of #25.
