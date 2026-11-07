# AAuth -11 implementer digest

david, 2026-11-07 20:28 UTC

Source: https://datatracker.ietf.org/doc/html/draft-hardt-oauth-aauth-protocol-11. An agent wrote this digest from the draft on 2026-11-07, for building on it. A few passages came through only as tool summaries: the tail of §13.10, parts of §13.11–13.12, and parts of §8.1. Nothing below relies on them. Check the draft before depending on any detail.

## 1. Status
- The datatracker version list ends at -11 (00 to 11, plus the earlier `draft-hardt-aauth-protocol-00/01/02`). No newer revision was listed at fetch time.
- Published 25 September 2026. Expires 29 March 2027.
- It is an "Active Internet-Draft (individual)", not a working group document. The header says "Workgroup: TBD" and the datatracker RFC stream is "(None)".
- The document header says "Intended Status: Standards Track". The datatracker "Intended RFC status" field is empty.
- It has no IETF endorsement or standing. It replaces `draft-hardt-aauth-protocol`.
- Issues and source are at github.com/dickhardt/AAuth.

## 2. Problem and relation to OAuth
- **Problem (§1).** OAuth clients have no portable identity, and API keys are copied shared secrets. AAuth gives every agent instance its own identifier (`aauth:local@domain`) and signing key. Every request is signed, and nothing is a bearer credential.
- **Relation to OAuth.** It is a new protocol, neither an extension nor a profile. Appendix C.4.5 says it "complements OAuth". A resource can wrap existing OAuth tokens in `AAuth-Access`, and a person server (PS) can delegate login to OIDC.
- **What it reuses from OIDC.** Scope values, identity claims, `login_hint`, `tenant` and `domain_hint` from OpenID Enterprise Extensions.
- **No authorization code.** There is no authorization code or PKCE (C.2.2).

## 3. Roles and what each hosts
Roles are not deployment units, and one deployment may fill several (§4.3). All server identifiers are `https` scheme plus host only (§11.1.1). That means no port, path or trailing slash, lowercase, and exact string comparison.

- **Agent**
  - Holds a signing key and an agent token.
  - Optionally publishes a `callback_endpoint`.
  - Hosts no required endpoints.
- **Agent Provider (AP)** (§5.1)
  - Publishes `/.well-known/aauth-agent.json` (REQUIRED fields `issuer`, `jwks_uri`).
  - Optional fields: `callback_endpoint`, `event_endpoint`, `localhost_callback_allowed`.
  - Issues agent tokens and sub-agent tokens.
- **Resource**
  - `/.well-known/aauth-resource.json` is optional (§11.2.4).
  - Fields: `issuer`, `jwks_uri` (REQUIRED if it issues resource tokens or makes signed calls), `access_mode`, `authorization_endpoint`, `scope_descriptions`, `signature_window` (default 60), `additional_signature_components`, `revocation_endpoint`.
  - A resource that only verifies signatures needs no keys.
- **Person Server (PS)** (§11.2.2)
  - Published at `/.well-known/aauth-person.json`.
  - REQUIRED fields (the conformance floor): `issuer`, `jwks_uri`, `auth_token_endpoint`, `person_token_endpoint`.
  - OPTIONAL: `mission_endpoint`, `permission_endpoint`, `audit_endpoint`, `interaction_endpoint`, `mission_control_endpoint`.
  - RECOMMENDED: `revocation_endpoint`, `scopes_supported`, `claims_supported`.
- **Access Server (AS)** (§11.2.3)
  - Published at `/.well-known/aauth-access.json`.
  - REQUIRED: `issuer`, `jwks_uri`, `auth_token_endpoint`. RECOMMENDED: `revocation_endpoint`.
- **Common metadata rules (§11.2).**
  - The `issuer` must byte-equal the fetch URL minus the well-known suffix. Otherwise reject with `issuer_missing` or `issuer_mismatch`.
  - Every JWKS key must carry a fully specified `alg` (§11.4).
  - Optional common fields: `accept_signature_algs`, `name`, `description`, `logo_uri`, `logo_dark_uri`, `documentation_uri`, `tos_uri`, `policy_uri`.
- **Link relation (§11.2.5).** `Link: <https://x/.well-known/aauth-resource.json>; rel="aauth-resource"`.
- **Supervisor.** The person, or a supervision server. A companion specification for it is TBD.

## 4. Tokens and artifacts
All are JWTs. The header carries `alg`, `typ` (`aa-<type>+jwt`) and `kid`. Common claims are `iss`, `dwk`, `jti`, `iat` (REQUIRED), `exp` and `cnf` (§11.5.1). The verifier must check `typ` and `dwk`. `exp` has no clock-skew tolerance (§11.5.2).

| Token | `typ` / `dwk` | Issuer → verifier | Key claims | Lifetime |
|---|---|---|---|---|
| Agent token (§5.3) | `aa-agent+jwt` / `aauth-agent.json` | AP → resource, PS, AS | `sub` (agent id), `cnf.jwk`; optional `ps`, `parent_agent` | SHOULD NOT exceed 24h |
| Person token (§7.1) | `aa-person+jwt` / `aauth-person.json` | PS → resource (also PS and AS as `presented_token`) | `aud` (one resource), directed `sub`, `cnf`; optional `mission_s256`, `tenant`. MUST NOT carry `scope` or `account` | At most 1h. Not past the agent token, the `upstream_token`, or the mission `expires_at` |
| Resource token (§6.7) | `aa-resource+jwt` / `aauth-resource.json` | Resource → PS (three-party) or AS (four-party) | `aud` (PS or AS URL), `ps`, `sub`, `presented_jti`, `agent_jkt`; optional `scope`, `account`, `login_hint`, `mission_s256`, `tenant`, `interaction` {`url`,`code`}. No `cnf` | SHOULD NOT exceed 5 min |
| Auth token (§9.4) | `aa-auth+jwt` / `aauth-access.json` (AS) or `aauth-person.json` (PS) | AS or PS → resource | `aud`, `ps`, `sub`, `cnf`; optional `scope`, `account`, `mission_s256`, `tenant` | At most 1h. Not past the agent token, the `presented_token`, the `upstream_token`, or the mission `expires_at` |
| Session token (§6.3) | opaque `token68` | Resource → same resource | Carried in `AAuth-Access`, returned as `Authorization: AAuth <token>` | Resource's choice |

- Resource-token `ps` is the PS whose namespace `sub` belongs to.
- Auth tokens carry no agent identifier and no delegation chain.
- Auth-token `scope` must not be broader than the resource token's.
- Resource tokens carry no agent identifier. `agent_jkt` is an RFC 7638 thumbprint.
- `sub` is a directed (pairwise) identifier. A resource must treat `(iss, sub)` as the person's identity.
- A recipient MUST reject `aa-person+jwt` where an auth token is required (§7.1.4, §13.11).
- **Mission blob** (§8.2), delivered base64url (no padding) in the `mission` member.
  - `s256` is the base64url SHA-256 of the exact bytes the blob decodes to.
  - It MUST contain `agent`, `approved_at` and `description` (Markdown).
  - It MAY contain `expires_at`, `approved_tools` and `approved_resources`.
  - `s256` is carried everywhere as `mission_s256`.

## 5. Flows
Common conventions for all flows:
- All requests are signed (see §6 below).
- The agent sends `AAuth-Capabilities: interaction, clarification, payment` to resources (§11.7).
- Agents call PS and AS endpoints with a JSON POST and `Prefer: wait=45`.
- Servers answer with `AAuth-Requirement: requirement=<value>; ...` (an RFC 9651 Dictionary). `AAuth-Requirement` is used instead of `WWW-Authenticate`.

**Requirement values (§6, §11.6.2)**
- `agent-token`: 401, no parameters. §6.1.
- `person-token`: 401, no parameters. §6.4.
- `auth-token`: 401 or 202, with `resource-token="eyJ..."`. §6.5.
- `interaction`: 202, with `url` and `code`. §11.6.3.
- `approval`: 202. §11.6.4.
- `clarification`: 202. §7.5.1.
- `claims`: 202, from the AS to the PS only. §9.2.

**Five access modes (§4.2)**
1. **Agent identity** (§4.2.1). The agent signs with its agent token and the resource decides on identity.
2. **Resource-managed, two-party** (§4.2.2, §6.2, §6.3).
   - The resource returns `202` with `Location`, `Retry-After`, `Cache-Control: no-store` and `requirement=interaction`.
   - The user completes the interaction, and the agent polls with GET.
   - The `200` response MAY carry `AAuth-Access: <token>`.
   - The agent then sends `Authorization: AAuth <token>`, with `authorization` in the covered signature components.
   - A new `AAuth-Access` value on any response replaces the old one. That is the refresh mechanism.
3. **Person identity** (§4.2.3, §7.1).
   - The agent POSTs to `person_token_endpoint` with `resource` (REQUIRED).
   - Optional parameters: `mission_s256`, `subagent_token`, `upstream_token`, `capabilities`, `login_hint`, `tenant`, `domain_hint`, `prompt`, `justification`, `platform`, `device`.
   - The `200` response is `{"person_token":..., "expires_in":...}`.
   - The agent signs with the person token in place of its agent token.
4. **PS authorization, three-party** (§4.2.4, §6.6, §7.2).
   - The agent presents its person token.
   - It either POSTs `{scope, account?}` to the resource's `authorization_endpoint`, or calls the resource and receives a `401` with `requirement=auth-token; resource-token=...`.
   - The resource answers either with `{"resource_token":...}` or with its own handling (§6.6.1). The resource issues a resource token only after verifying a person or auth token; otherwise it challenges with `person-token` (§6.4).
   - The agent verifies the resource token (§6.7.3).
   - It then POSTs to the PS `auth_token_endpoint` with `resource_token` and `presented_token` (both REQUIRED). Optional parameters are `upstream_token`, `subagent_token`, `justification`, `login_hint`, `tenant`, `domain_hint`, `prompt`, `platform`, `device`, `capabilities`.
   - The `200` response is `{"auth_token":..., "expires_in":3600}`.
   - The agent then signs with the auth token.
5. **Federated, four-party** (§4.2.5, §9).
   - The resource token's `aud` is the AS.
   - The PS discovers `{aud}/.well-known/aauth-access.json`.
   - The PS POSTs to the AS `auth_token_endpoint` with `resource_token`, `agent_token`, `presented_token`, and optionally `subagent_token` and `upstream_token`.
   - The PS signs that request with the `jwks_uri` scheme.
   - **AS responses:**
     - `200` with `{auth_token, expires_in}`.
     - `202` with `requirement=claims` (body has `required_claims`; the PS POSTs claims to `Location`), `clarification`, `interaction` or `approval`.
     - `402` with a `Location` header (payment via x402 or the Payment scheme).
   - **PS checks on the returned token (§9.1.3):** `iss`, `aud`, `cnf.jwk`, `sub`, `scope`, and `exp`.

**Deferred and variant flows**
- **Deferred auth-token delivery** (§6.5.1).
  - A resource MAY answer `202` with `requirement=auth-token; resource-token=...` and hold the invocation.
  - The agent polls with GET, presenting the auth token.
  - The resource executes on the first valid poll and MUST retain the result, keyed by the token's `jti`, until at least its `exp`.
  - Agents MUST support both the `401` and the `202` forms.
- **User consent and interaction** (§7.3, §11.6.3, §11.8).
  - The agent SHOULD first relay via the PS `interaction_endpoint` (§7.6) with `{type: interaction|payment|question, description?, url?, code?, max_wait?, question?, mission_s256?}`.
  - If the PS has no channel, it returns `interaction_unavailable` (424, non-terminal). Otherwise the agent directs the user to `{url}?code={code}`, optionally with `&callback=...`.
  - The agent polls the `Location` URL with GET and respects `Retry-After`. Default interval is 5s. On 429, add 5s.
  - Pending responses carry `Location` (same origin), `Retry-After` and `Cache-Control: no-store`. Body is `{"status":"pending"}`, or `"interacting"` once the user arrives.
  - **Terminal responses:** 200 success, 403 denied or abandoned, 408 expired, 410 gone.
  - **Interaction code (§11.6.3.1):**
    - Crockford base32.
    - At least 40 bits of entropy and at least 8 symbols.
    - Hyphens ignored, case-insensitive, single-use.
    - Rate-limited, and expiring with the pending interaction.
    - It is a correlation identifier, not a credential.
  - **Resource-initiated interaction** (§7.2.3). The PS redirects the user to `{interaction.url}?code={interaction.code}&callback={ps_callback_url}`.
  - **Callback `error` values** (§7.3.1): `access_denied`, `user_abandoned`, `server_error`, `temporarily_unavailable`, `interaction_expired`.
- **Clarification** (§7.5).
  - The server sends `202` with `requirement=clarification` and body `{clarification, timeout?, options?}`.
  - The agent POSTs `{"action":"clarification_response", ...}` or `{"action":"updated_request","resource_token","presented_token",...}` to the pending URL. It can also send `DELETE` (then 410 on later polls).
  - PSes MUST cap rounds. Five is recommended.
- **Autonomous (no user).**
  - The draft has no separate flow for this. A PS may issue tokens without interaction when its policy allows, answering `200` directly.
  - The PS may instead use `requirement=approval` to approve over its own channel, and the agent just polls.
  - If the PS needs the person but has no channel and the agent did not declare the `interaction` capability, it returns `user_unreachable` (403, terminal).
- **Delegation: call chaining** (§10.1.1).
  - A resource acts as an intermediary agent and MUST be its own AP: `/.well-known/aauth-agent.json` with `issuer` equal to its resource issuer, signing with a self-issued agent token.
  - It first POSTs `person_token_endpoint` with `upstream_token`, then calls the downstream resource with that person token.
  - It then sends `resource_token`, `presented_token` and `upstream_token` to `auth_token_endpoint`.
  - The upstream token's `aud` must equal the intermediary's agent-token `iss` (§9.4.5).
  - Downstream tokens do not outlive the upstream token.
  - A downstream issuer MUST NOT copy an upstream `sub`.
  - Interaction chaining (§10.1.2): the resource returns its own `202`, its own code and its own `Location`.
- **Delegation: sub-agents** (§10.2).
  - Sub-agent tokens carry `parent_agent`, and the local part is `parent+discriminator`. Its `iss` MUST equal the parent's.
  - Depth is one level only.
  - A sub-agent MUST NOT call the PS directly.
  - The parent obtains a person token with `subagent_token`.
  - The sub-agent obtains the resource token.
  - The parent POSTs `auth_token_endpoint` with `resource_token`, `presented_token` and `subagent_token`.
  - The resulting `cnf` is the sub-agent's key.
- **Refresh** (§7.9, §7.9.1).
  - There is no refresh token.
  - The agent re-runs the flow with a fresh resource token.
  - The agent SHOULD refresh any agent, person or auth token with under 5 minutes left. Order is agent token, then person token, then resource and auth tokens.
  - Key rotation invalidates all bound tokens.
- **Revocation** (§11.12).
  - The caller POSTs to the recipient's `revocation_endpoint` with `{"jti","exp"}`, signed with the `jwks_uri` scheme. The signature MUST cover `content-digest` and `content-type`.
  - The recipient answers `200` once its cascade is terminal, or `202` for deferred. There is no "not found".
  - Errors: `invalid_request`, `unsupported_iss` (403), `rate_limited` (429, with `Retry-After`), `server_error`.
  - A `200` body may carry `downstream: [{recipient, error: revocation_unsupported|revocation_unavailable}]`.
  - **Who revokes what, and where (§11.12.2):**
    - Agent token: the AP, at the PS only.
    - Person token: the PS, at the resource in `aud` and at each AS it was presented to.
    - Auth token: its issuer, at the resource.
    - Resource token: the resource, at the party in `aud` (and the `ps` in four-party).
  - **Presenting a revoked token (§11.12.5):**
    - In `Signature-Key`: `401` with `Signature-Error: error=revoked_jwt`.
    - As a body parameter: `revoked_<parameter>_token`.
  - Without a revocation endpoint, tokens are honored until `exp`.
- **Missions** (optional, §8). All requests are signed POSTs with the agent token.
  - Propose: `POST {mission_endpoint}` with `{description, tools?, resources?}`. The PS may defer. The response is `{s256, mission, capabilities?, person_tokens?}`.
  - Update: `POST {mission_endpoint}/{s256}` with `{"action":"update","description"}`. The response is `{s256}`.
  - Completion: `POST {mission_endpoint}/{s256}` with `{"action":"completion","summary"}`. Only the person's acceptance terminates the mission.
  - States are `active` and `terminated` only. Termination reasons: `completed`, `revoked`, `expired`, `superseded`, `administrative`.
  - Errors: `mission_not_found` (404), `mission_terminated` (403). Missing or unknown `action` returns 400.
- **Permission and audit** (§7.7, §7.8).
  - Permission: POST `{action, description?, parameters?, mission_s256?}`. The response is `{"permission":"granted"|"denied"}`, or a deferred response.
  - Audit: POST `{mission_s256 (REQUIRED), action, ...}`. The response is `201`, fire-and-forget. It requires a mission.

## 6. Cryptography (§11.3, §11.4)
- **Signing.** RFC 9421 HTTP Message Signatures, with the key supplied by the `Signature-Key` header from `draft-hardt-httpbis-signature-key`.
- **Algorithms.**
  - Every party MUST support `Ed25519`, and SHOULD support `ES256`.
  - `alg` MUST be present and fully specified. `EdDSA`, `none` and symmetric algorithms are prohibited. `kty` or `crv` disagreeing with `alg` is rejected.
  - ML-DSA identifiers from RFC 9964 are mentioned as usable.
- **Agent keying.**
  - Agents MUST use `Signature-Key: sig=jwt;jwt="..."`, with the agent, person or auth token as the JWT.
  - Agents MUST NOT use `jwks_uri` or `hwk`. `jkt-jwt` appears only in the bootstrap key-refresh.
- **Server keying.**
  - A server signing in its own right (PS to AS, revocation) MUST use `Signature-Key: sig=jwks_uri;id="https://ps.example"; dwk="aauth-person.json";kid="key-1"`.
  - `id` is the server's `issuer`.
- **Covered components.**
  - MUST cover `@method`, `@authority`, `@path`, `signature-key`.
  - Add `content-digest` (RFC 9530) and `content-type` on bodies to PS, AS or revocation endpoints.
  - Add `authorization` when a session token is used.
  - Add anything in the resource's `additional_signature_components`.
- **Signature parameters.** `created` is REQUIRED. Agents MUST NOT send `alg`, and SHOULD NOT send `keyid`. `expires` is honored if present.
- **Verification (§11.3.4).**
  - The default window is 60s. A resource can advertise `signature_window` in its metadata.
  - Every signature failure is `401` with `Signature-Error`.
  - **Failure codes:** `invalid_signature`, `invalid_input` (with `required_input`), `clock_skew`, `unsupported_scheme` (with `Accept-Signature-Scheme: jwt`), `unsupported_algorithm` (with `Accept-Signature-Alg`), `invalid_key`, `unknown_key`, `invalid_jwt`, `expired_jwt`, `revoked_jwt`, `issuer_missing`, `issuer_mismatch`.
  - A `403` after a successful signature MUST NOT carry `Signature-Error` or `Accept-Signature-*`.
  - Optional replay cache keyed by (key thumbprint, `created`, method, authority, path). There is no nonce.
- **Key distribution.**
  - Discovery is `{iss}/.well-known/{dwk}`, then `jwks_uri`.
  - Cache JWKS responses. Fetch an issuer's JWKS at most once per minute. Discard entries after 24h. Refresh once on an unknown `kid`.
  - Apply egress admission before any fetch.
- **Transport.** TLS 1.2 or later (§13.16).

## 7. Normative dependencies (§19.1)
- **Companion draft, normative:** `[I-D.hardt-httpbis-signature-key]`, "HTTP Signature Keys". The reference carries no revision number (2026, URL `datatracker.ietf.org/doc/draft-hardt-httpbis-signature-key`).
- **RFCs:**
  - Core: 9421, 9530, 9651, 9110, 9457, 7240 (Prefer).
  - JOSE and JWT: 7515, 7517, 7519, 7638, 7800, 8032, 9864, 9964.
  - Metadata and discovery: 8414, 8615, 8288, 5890, 7595, 8126.
  - Other: 9068, 9325, 6749.
- **Other normative references:** OpenID Connect Core 1.0, IANA JOSE algorithm registry.
- **Informative companions, all unversioned in the reference list:**
  - `draft-hardt-aauth-bootstrap` (AP key refresh, token acquisition). It is cited as "AAuth Bootstrap Guidance".
  - `draft-hardt-aauth-events` (`aa-subscribe+jwt`, `aa-event+jwt`; `event_endpoint`). The reference points at GitHub.
  - `draft-hardt-aauth-r3` (rich resource requests; `per-call` access mode; `r3_vocabularies`). The reference points at GitHub.
  - `draft-ryan-httpauth-payment-01` (Payment scheme).
  - `draft-crockford-davis-base32-for-humans-01`.
  - x402.
  - OpenID Connect Enterprise Extensions 1.0.
  - CommonMark.
- **IANA items the draft registers (§15):**
  - Headers: `AAuth-Requirement`, `AAuth-Access`, `AAuth-Capabilities`.
  - The `AAuth` auth scheme.
  - The four well-known URIs.
  - The `aauth-resource` link relation.
  - Four media types: `application/aa-agent+jwt`, `application/aa-auth+jwt`, `application/aa-person+jwt`, `application/aa-resource+jwt`.
  - JWT `typ` values and claims.
  - The `aauth:` URI scheme.
  - Registries for requirement, capability, platform and access-mode values.
  - Platform values are `web`, `mobile`, `desktop`, `workload`, `self-hosted`.
  - Access-mode values are `agent-token`, `person-token`, `session-token`, `auth-token`.

## 8. Implementation status (§16) and links
All four implementations are marked "exploratory":
- **TypeScript.** github.com/aauth-dev/packages-js (Hellō): agent token issuance, signatures, resource token exchange, PS token endpoint.
- **.NET.** github.com/aauth-dev/dotnet-samples (NuGet `AAuth`): SDK across the access modes, three-party flow, verification middleware.
- **Python.** github.com/christian-posta/aauth-full-demo: agent-to-resource flows with Keycloak as AS.
- **Java.** github.com/christian-posta/keycloak-aauth-extension: AS extension for Keycloak 26.2.5.
- **Other links.** The spec repo is github.com/dickhardt/AAuth, with raw markdown at raw.githubusercontent.com/dickhardt/AAuth/refs/heads/main/draft-hardt-oauth-aauth-protocol.md.

## 9. Minimal interoperable implementation per role
Where the draft states no conformance profile, this is inferred from its MUSTs.

- **Agent**
  - Obtain an agent token from an AP (the bootstrap mechanism is out of scope).
  - Sign requests per §11.3 with the `jwt` scheme and Ed25519.
  - Handle `AAuth-Requirement`, and handle `202` polling (§11.8).
  - Support both `401` and `202` forms of `auth-token` (§6.5.1).
  - Verify resource tokens (§6.7.3).
  - Follow the 5-minute refresh guidance. The `ps` claim is needed only for person, PS or AS flows.
- **AP**
  - Publish `aauth-agent.json` with `issuer` and `jwks_uri`.
  - Issue `aa-agent+jwt` with `sub` and `cnf`.
  - Every JWKS key needs `alg`.
- **Resource**
  - Mode 1 needs only signature verification and `requirement=agent-token`. Metadata is optional.
  - Beyond that: person-token verification, resource-token issuance (requires a verified person or auth token first), and revocation (recommended).
- **PS**
  - Per Appendix B and §11.2.2, a minimal PS publishes four fields. It serves `person_token_endpoint` and `auth_token_endpoint`, and uses `202` with `requirement=interaction` for consent.
  - It MUST keep one directed `sub` per `(person, resource)`, bind each agent to exactly one person (§13.14), and authenticate the approver (§13.13).
  - It must record person-token `jti`, `aud` and `exp` for revocation (§7.1).
  - It can decline four-party. All other endpoints are optional.
- **AS**
  - Publish `aauth-access.json`.
  - Serve `auth_token_endpoint`, verify the PS signature, resource token and `presented_token`, and issue `aa-auth+jwt`.
  - The `402`, `claims` and `interaction` responses are optional.

## 10. Open issues and TODOs
- **Markdown structure (§3).** The Editor's note says section structures for Markdown-valued parameters are "to be defined together in a later revision".
- **Mission control (§8.6, §11.2.2).** A companion specification for `mission_control_endpoint` is TBD, covering status reads, termination, delegation queries and administrative principals.
- **Supervision (§4.3).** A companion supervision-server specification is TBD.
- **Companions not yet standalone.** The Events and R3 references point at GitHub rather than datatracker.
- **Work in progress.** The Implementation Status and Document History sections are marked for removal before RFC.
- **Pre-IETF status.** Workgroup is TBD, and the draft is unadopted and could change materially.
- **Dependency risk.** The signature-key draft is referenced without a revision number. Pin the revision when building against both.
- **Moving target.** -11 restructured the document heavily, adding the person token and five access modes and changing revocation and claim semantics. Expect churn.
