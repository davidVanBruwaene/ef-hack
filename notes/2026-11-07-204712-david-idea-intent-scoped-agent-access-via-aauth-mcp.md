# Idea: intent-scoped agent access via AAuth + MCP

david, 2026-11-07 20:47 UTC

re: 2026-11-07-202815-david-aauth-11-implementer-digest.md

## The idea
Two people connect through us. One person (Alice) lets the other person's agent (Bob's) access some of Alice's personal data. We connect them and set an intent, and Bob's agent uses the data to try to satisfy that intent. Bob brings their own agent, which connects to our MCP tool and uses AAuth.

## Verdict: it fits AAuth -11
The draft's §16 lists a TypeScript implementation at github.com/aauth-dev/packages-js. It is titled "AAuth for MCP", comes from Hellō, and already has the MCP pieces:
- `@aauth/mcp-stdio`: a proxy that connects an MCP client to a remote MCP server and signs every request with AAuth
- `@aauth/resource`: the server side (checks tokens, sends challenges, issues resource tokens)
- `@aauth/agent`: the agent side (signed requests, person tokens, token exchange)
- `@aauth/bootstrap`: sets up agent keys and registers with a person server

It was last updated on 2026-09-28, three days after -11 came out, and already handles person tokens and access modes, which are new in -11. Nobody on the team has installed or run it yet.

## Open decision
Build on packages-js rather than writing AAuth ourselves. David's agent recommends yes; the team hasn't agreed yet. Request signing, challenge handling, token exchange and the MCP proxy are the expensive parts, and they already exist. Risk: every package is marked "exploratory". If one breaks, we can drop down to `@aauth/agent` and `@aauth/resource`, or write just the one flow we demo ourselves.

## Shape
- Alice's data sits behind a remote MCP server. Its tools only answer what the intent covers, and it checks AAuth on every call.
- Bob's agent connects through `@aauth/mcp-stdio`. That works for Claude Code or Desktop, Cursor, or anything else that can run a local MCP server. The proxy holds Bob's agent key and signs each call, so the model never touches a credential.
- Our product connects the two people, records the intent, and stores what Alice agreed to share.

## Whiteboard mapping
| Box | Our product |
|---|---|
| AP | Issues Bob's agent token (via `@aauth/bootstrap`) |
| Agent | The local proxy plus Bob's model |
| PS | Bob's person server: confirms who Bob is and Bob's approval of the intent |
| Mission (§8) | The intent. A hash of the exact intent text (`mission_s256`) is carried in the person, resource and auth tokens, so Alice's grant can be tied to that exact text |
| R | Alice's MCP server |
| AS | Alice's grants: Bob, this intent, these fields, until a date. That's the four-party flow on the whiteboard; the three-party flow puts this check inside R and saves a server |
| S | Not needed; that part of the spec isn't written yet |

## Where it gets harder
- **Alice has no role in AAuth.** The draft's "person" is the agent's user, which here is Bob. Alice's consent is a rule our server enforces, and connecting people and setting the intent is our product, not the protocol.
- **Tying tokens to the intent may be ours to build.** The packages-js README never mentions missions.
- **Live approval works.** If Alice hasn't approved yet, the server can hold Bob's request (`202` with `requirement=approval`) while our app asks Alice, and Bob's agent keeps checking until Alice answers.
- **Shared data reaches Bob's model provider.** Answers scoped to the intent ("free Thursday after 7") expose less than raw records.
- **Hosted agents need more.** ChatGPT and Claude.ai can't run a local proxy, so they would need a signing service we host.
- **Check the package names.** The README examples import `@aauth/mcp-agent` and `@aauth/mcp-server`, which aren't in its package list.
