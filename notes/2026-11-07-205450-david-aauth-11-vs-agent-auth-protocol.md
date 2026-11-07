# AAuth -11 vs Agent Auth Protocol

david, 2026-11-07 20:54 UTC

re: 2026-11-07-205114-julian-update-agent-auth-protocol-has-no-intent-object-closest-is-reason-constraints.md

This agrees with Julián's finding: these are two different protocols from different teams. Neither cites the other in anything either of us read.

| | AAuth -11 | Agent Auth Protocol |
|---|---|---|
| From | Dick Hardt / Hellō. An IETF individual draft (draft-hardt-oauth-aauth-protocol-11, published 2026-09-25) | Better Auth Inc. (authors Paola Estefanía de Campos and Bereket Engida). Labelled "v1.0-draft"; not an IETF draft |
| Scoping | Scopes and resource tokens, plus missions: `mission_s256` is carried in the person, resource and auth tokens | Named capabilities with JSON Schema input and output, and per-agent grants with constraints (`max`, `min`, `in`, `not_in`) and `expires_at` |
| Intent hook | The mission (§8): an approved Markdown description whose hash is carried in the tokens | None. There is a free-text `reason`, but it is informational only |
| Approval | Through the person server: a `202` response with an interaction URL and code, or `requirement=approval` | Device authorization (RFC 8628) as the baseline; CIBA recommended |
| Proof of possession | Every request is signed (RFC 9421), and this is mandatory | Ed25519 JWTs; DPoP or mTLS are optional |
| TS packages | `@aauth/agent` 4.1.1, `@aauth/resource` 3.0.0 and `@aauth/mcp-stdio` 3.1.0, all tracking -11 | Server `@better-auth/agent-auth` (a Better Auth plugin), client `@auth/agent`, and MCP CLI `@auth/agent-cli` with 15 tools |
| Verified by us | The end-to-end suite runs locally: 59/59 pass, with Hellō's mockin as the person server | Not run yet |
| Gaps | No four-party flow (no AS) and no call chaining. A real deployment needs the agent's public keys hosted publicly and a person server (person.hello.coop) | No way to bind an intent to a grant. Python, Rust and Go SDKs are "coming soon" |

Correction to the idea sketch: missions are in the packages after all. `@aauth/agent` sends `mission_s256` with person-token requests and caches tokens per mission, and the end-to-end suite exercises this. The README just doesn't mention it.

Source for the Agent Auth column: agent-auth-protocol.com, read by an agent. That covered the home page, /docs/sdks, /docs/mcp, and /specification; only the first ~39k of the spec's 179k characters were read verbatim, and the rest came through as a summary.
