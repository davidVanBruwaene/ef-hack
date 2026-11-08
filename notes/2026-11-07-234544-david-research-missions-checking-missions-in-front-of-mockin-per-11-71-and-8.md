# research: [missions] checking missions in front of mockin, per -11 §7.1 and §8

david, 2026-11-07 23:45 UTC

What -11 requires, what mockin does, and what Bob's person-server front has to add. Section numbers refer to draft-hardt-oauth-aauth-protocol-11.

**Where the person server checks the mission**
- Person token endpoint (§7.1). The agent sends `mission_s256`. The person server must verify that the mission exists, is active and belongs to this agent, and must reject the request otherwise. This is the main check.
- Auth token endpoint (§7.2, and §6.7.2 step 4). The request has no mission parameter. The resource token carries the `mission_s256` copied from the person token, and the person server must check that the mission is still active and not past `expires_at`. The supervisor would act here.

**What mockin does**
- `/aauth/token/person` stamps any `mission_s256` string into the token without looking it up. A comment in mockin's person.js says mission_endpoint is unimplemented.
- mockin's metadata has no `mission_endpoint`, and its `/mock` config has no setting for missions.
- So the front has to parse each token request body, check it, and forward the same bytes, because the signature covers the body.

**Mission creation (§8.1 to §8.2.1)**
- The agent sends a signed POST to `mission_endpoint` with `{description, tools?, resources?}` and its agent token in `Signature-Key`.
- While Bob decides, the person server answers 202 with:
  - `Location`, on the same origin, which the agent polls with GET (§11.8.3);
  - `Retry-After`;
  - `Cache-Control: no-store`;
  - body `{status: "pending"}`;
  - `AAuth-Requirement: requirement=interaction; url="…"; code="…"`, where the url is https with no query string, and the same code appears on the approval page.

  A 403 on the poll means Bob denied the mission.
- On approval it answers 200 with `{s256, mission, capabilities?, person_tokens?}`:
  - `mission` is the mission blob, base64url without padding.
  - `s256` is the SHA-256 of exactly those bytes.
  - The blob must contain `agent`, `approved_at` and `description`. It may also contain `expires_at`, `approved_tools` and `approved_resources`.
  - Bob may edit the description before approving.
- Metadata: `mission_endpoint` belongs in `/.well-known/aauth-person.json`. Each mission's own URL is `{mission_endpoint}/{s256}`, used for update and completion (§8.4 and §8.5).

**Errors**
- A mission that is unknown, or that belongs to another agent, must get the identical response either way (§8.7). At the mission endpoint that is `mission_not_found`, 404. At the token endpoints -11 names no code for an unknown mission, and `invalid_request` (400) is the closest.
- A terminated mission gets 403 `mission_terminated`, with `termination_reason` (§8.8).

**Agent side**
- `@aauth/agent` has no mission client, but it exports everything one needs:
  - `createSignedFetch`;
  - `fetchPersonServerMetadata`;
  - `pollDeferred`, which handles the 202, `Location`, the interaction header and the 403;
  - `parseErrorBody`.
- `createAAuthFetch({missionS256})` already sends `mission_s256` on person token requests, and caches person tokens per resource and mission.
- The spike currently hashes the intent text, and that hash is not an -11 mission identifier. The s256 has to come from the person server's approval response.
