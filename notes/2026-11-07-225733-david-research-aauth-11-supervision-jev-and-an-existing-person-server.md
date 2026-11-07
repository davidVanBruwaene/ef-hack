# research: AAuth -11 supervision, Jev, and an existing person server

david, 2026-11-07 22:57 UTC

These findings bear on the supervisor idea. I checked them against the sources listed at the end.

## AAuth -11 (draft-hardt-oauth-aauth-protocol-11, dated 25 September 2026)

- The Supervisor is a role: the person by default, or a supervision server the person server (PS) delegates to (§4.3).
- Supervision means evaluating one act, such as a token request, a permission request or a mission update. The act is judged against the mission's intent, the log so far and the person's policy (§3).
- The interface between the PS and a supervision server is left to a future companion spec. An implementation may supervise inside the PS, and the agent, resource and access server see no difference either way (§4.3). So a supervisor inside our PS adds no wire extension.
- Appendix C: resources and access servers don't need the mission content. They enforce their own deterministic policies.
- A mission is a JSON blob holding a Markdown description and the approved tools. The PS and the person approve it, and the approved text may differ from what the agent proposed. `mission_s256` is the SHA-256 of the exact blob bytes the PS stores (§8.1–8.2.1). The spike hashes the intent text instead, so its mission hashes are not -11 mission identifiers.
- Agents create missions at the PS's `mission_endpoint` (§8.1). mockin doesn't implement it, and `@aauth/agent` has no client for it.

## Jev (TypeSafe AI)

- Jev is a "System One" model. You send a text state plus typed questions (yes/no, choice, score). It returns typed answers with probabilities and a confidence value, and generates no text.
- API: `POST https://api.typesafe.ai/v1/systemone` with a bearer key and model `jev-latest`. There is no streaming.
- It has been in early access since mid-September 2026, at about $0.04 per million input tokens.
- LangChain offers it as a judge in LangSmith evals. LangChain's consistency results are observational.
- TypeSafe offers no zero data retention.

## christian-posta/aauth-person-server

- Python, Apache-2.0, described as an exploratory implementation of AAuth missions. It has mission, permission, audit, token and consent endpoints, plus a portal UI.
- It is built against draft-hardt-aauth-protocol-01, and its code last changed on 20 May 2026. The spike's `@aauth/*` libraries implement -11.

## Sources

- https://www.ietf.org/archive/id/draft-hardt-oauth-aauth-protocol-11.txt
- https://docs.typesafe.ai/llms.txt and https://docs.typesafe.ai/api.md
- https://www.langchain.com/blog/jev-is-now-available-in-langsmith-evals
- https://www.llmreference.com/provider/typesafe-ai/jev
- https://github.com/christian-posta/aauth-person-server
