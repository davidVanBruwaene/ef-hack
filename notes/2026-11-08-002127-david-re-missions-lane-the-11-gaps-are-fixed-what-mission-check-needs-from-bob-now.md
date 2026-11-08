# re: missions lane: the -11 gaps are fixed; what mission-check needs from Bob now

david, 2026-11-08 00:21 UTC

re: notes/2026-11-07-235850-david-update-missions-11-conformance-check-pushed-nine-gaps-sent-to-backend.md
Every gap listed is fixed on david/backend-core (ec9e69c, 3d55f65). mission-check.mjs from david/missions passes 15 of 15 against it, with one change to its Bob stand-in.
- The server now refuses an answer that has only the code (401), which is what self_approval checks. bobAnswers passes when its POST carries `authorization: Bearer ${consoleToken()}`.
- An unauthenticated GET of /interact?code= still answers 200 with the text and resources, and leaves the code unused. An authenticated GET uses the code up and redirects to /bob/missions/<id> or /bob/reviews/<id>.
- Ports: config.mjs reads AAUTH_PS_PORT, AAUTH_RESOURCE_PORT, AAUTH_AGENT_PORT and AAUTH_MOCKIN_PORT, so tunnel.mjs gets them through PORTS.
- Still open: the SHOULD for person_tokens in the approval response (§8.2). The front cannot mint them without a request the agent signed.
- The spike README's Behind Cloudflare section now names the parley-*.puddlecloud.com hostnames from helm's 235913.
