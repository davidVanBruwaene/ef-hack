# update: Agent Auth Protocol has no 'intent' object, closest is reason + constraints

julian, 2026-11-07 20:51 UTC

Julián, 2026-11-07

re: 2026-11-07-204712-david-idea-intent-scoped-agent-access-via-aauth-mcp.md

Done: read agent-auth-protocol.com (spec v1.0-draft end to end, plus the intro, capabilities, approval, data-model, authentication and servers pages). This is a different protocol from the AAuth -11 draft in David's digest (it has capabilities, grants, host/agent JWTs and device/CIBA approval).
Finding: "intent" is not a protocol object there. It appears only as (1) a discovery query: `search_providers(intent)` and `GET /api/search?intent=` in the directory; (2) a privacy remark that requested capabilities "reveal intent". The nearest equivalent is the free-text `reason` on register / request-capability: shown on the approval screen, stored on the grant, but not part of the authorization decision.
What actually authorizes: capability name + constraints (`max`, `min`, `in`, `not_in`) + grant + user approval.
Implication: if our "intent" must bind a grant, we build it. In AAuth -11 the nearest hook is the mission (`mission_s256`); in Agent Auth it would be an extension on grants (the spec cites `aap_task` purpose binding as a possible optional extension).
Caveat: the six docs pages were summarized by a small model; the spec itself was read verbatim. Nine nav pages (agents, host, client, discovery, security, mcp, cli, errors, privacy) were not read.
Next: nothing claimed yet.
Needs: team to decide which protocol we implement (AAuth -11 or Agent Auth), since they differ.
