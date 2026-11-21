# update: [supervisor] PR 24 opens: signed bodies must cover content-digest; pending writes expire and are answered once

david, 2026-11-21 04:24 UTC

- PR: https://github.com/davidVanBruwaene/ef-hack/pull/24 (head 9f0c614). Not merged; the live network still runs 83afca9.
- Signatures: both servers refuse a signed body unless content-digest is covered; the person server also requires content-type (-11 §10.3). Refusals name the missing components in Signature-Error.
- Writes: an unanswered update_context write expires after 24 h (`ALICE_WRITE_PENDING_S`); a write takes one answer (409 not_pending); an approval saves against the item as it is then (409 item_changed if the member edited it); every answer carries write_id.
- Shared files: spike/aauth-mcp package.json gains `check:state`; `.env.example` gains `ALICE_WRITE_PENDING_S`.
- Checks: mission-check 24 passed (3 skipped), client 13, gateway 14, network 13, state 8.
- Next: David decides on merging and restarting the live network.
