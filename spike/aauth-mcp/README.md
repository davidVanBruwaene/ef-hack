# AAuth-protected MCP spike

Alice shares some personal context with Bob's agent for one stated intent. Bob's agent (Claude Code) reaches Alice's MCP server through a stdio proxy. The proxy signs every request with AAuth (draft-hardt-oauth-aauth-protocol-11) and names the intent as its mission. Alice's server serves only the fields Alice granted for that mission.

Everything runs on this machine. Nothing is published, and no real accounts are used.

## Parties

| Identifier | Role | Runs as | Port |
|---|---|---|---|
| `https://ps.aauth.test` | Bob's person server | mockin, Hellō's -11 mock person server | 4401 |
| `https://alice.aauth.test` | Alice's context (the resource) | `world.mjs`, MCP at `/mcp` | 4402 |
| `https://bob-agent.aauth.test` | Bob's agent provider, which publishes the agent's key | `world.mjs` | 4403 |
| `aauth:claude@bob-agent.aauth.test` | Bob's agent | `proxy.mjs`, started by Claude Code | stdio |

AAuth server identifiers must be `https` with no port. To make that work locally, `loopback.mjs` sends `*.aauth.test` connections to `127.0.0.1` at the socket level. URLs, `Host` headers and signatures all keep the real identifiers.

## Run it

You need Node 22 or later.

```bash
cd spike/aauth-mcp
npm ci --ignore-scripts
npm run world
```

Leave `npm run world` running; it logs each AAuth step. Then, in a second terminal, run the checks:

| Command | Case | Expected result |
|---|---|---|
| `npm run check` | The granted intent | Alice's availability and meeting preferences come back |
| `npm run check:none` | No mission | 403 before any resource token |
| `npm run check:wrong` | A mission Alice never granted | 403 |
| `npm run check:consent` | Bob must approve | The agent waits on a consent link and code; the script approves it after 2 seconds |

To run it from Claude Code, first write the MCP config for this checkout (`mcp.json` is gitignored):

```bash
npm run mcp-config
```

Then call the tool:

```bash
claude -p "Call get_shared_context on the alice server and propose a meeting slot." \
  --mcp-config mcp.json --strict-mcp-config --allowedTools mcp__alice__get_shared_context
```

`alice.json` holds Alice's context and grants. Each grant is an intent plus the fields it shares. The mission hash is the base64url SHA-256 of the intent text.

## The flow

1. The proxy signs a request with an agent token. Alice's server answers `401 requirement=person-token`.
2. The proxy gets a person token, carrying `mission_s256`, from Bob's person server. Alice's server checks the mission against Alice's grants:
   - no matching grant: `403 mission_not_granted`;
   - a matching grant: it issues a resource token and answers `401 requirement=auth-token`.
3. The proxy exchanges the resource token at Bob's person server for an auth token that carries the same mission. Alice's server verifies the auth token and serves MCP.
4. `get_shared_context` returns only the granted fields.

## Limits

- **Missions.** No person server implements `mission_endpoint`. mockin accepts any mission hash, and nobody approves the mission text itself.
- **Grant scope.** A grant is bound to a mission, not to Bob. Any agent whose person server stamps that mission hash gets in.
- **Consent.** mockin approves automatically unless `check:consent` or `npm run world:consent` turns approval on. Its consent link resolves only on this machine.
- **Agent identity.** mockin's auth token names the agent's key (`cnf`), not the agent itself. To fill the gap, `world.mjs` records which agent signed with each key.
- **Protocol coverage.** `@aauth/*` supports neither four-party mode (a separate access server) nor call chaining, so neither is here.
- **Keys.** The agent's identity key is a generated test key, stored in `.keys/`, which is gitignored.
