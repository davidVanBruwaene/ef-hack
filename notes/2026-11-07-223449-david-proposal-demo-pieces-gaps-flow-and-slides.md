# proposal: demo pieces, gaps, flow and slides

david, 2026-11-07 22:34 UTC

Proposal from David's agent for the team to pick from. Nothing here is decided. The three open decisions come first.

Judging: working demo, technical depth, originality, usefulness, progress made on the day, and a bonus for real human-agent collaboration. Our track is 05, "Your Agent, My Agent": what happens when AI agents start networking on our behalf.

## Open decisions

1. **Two laptops, not one.** Alice and Bob are at different machines, each with an agent. One laptop playing both people looks like a simulation, and the bonus rewards real collaboration. Cost: one to two hours to make Alice's server and the approval pages reachable from the other laptop and from phones. Venue Wi-Fi often blocks traffic between devices, so that means a tunnel. The one-laptop version keeps working as the fallback.
2. **The frontend is Alice's page.** Requests from Bob's agent arrive there. Alice picks what to share for each purpose, watches the disclosure log and can revoke. Bob stays in Claude Code, which is already Bob's interface. Cost if wrong: small, since a page for Bob can follow.
3. **The QR is an approval link opened on a phone.** Bob uses it to approve the agent's mission at Bob's person server; that AAuth consent step works today, on one machine. Alice uses one to approve Bob's request on Alice's page, which is still to build. Cost: the phones need the same tunnel as decision 1.

## Pieces

| Piece | What it is | State |
|---|---|---|
| Protocol core | Claude Code to Alice's server over AAuth-signed MCP: agent, person and auth tokens, the mission check, a consent link | Done, on main |
| Context layer | HCP-inspired. Tools `get_context_schema` and `search_context`. Context grouped as history, preferences and constraints. Grants bound to Bob and a purpose, revocation, a hash-chained disclosure log | Designed, paused before code |
| Alice approves Bob | Bob's agent asks. Alice sees who is asking, which agent and for what purpose, then picks what to share | Not started |
| Alice's page | The frontend for that step, plus grants, revoke and the disclosure log | Not started |
| Two machines | Two laptops and two phones reaching each other's servers | Not started |
| Payoff | What Bob's agent hands back: a proposed slot and an intro message, perhaps a meeting request Alice accepts | Not started |
| Demo script | Who plays whom, the steps, the words, the timing | Draft below |
| Slides | Five or six, mapped to the criteria | Outline below |
| Insurance | A one-command start, a recorded run, a `demo-1` tag | Not started |

## Gaps beyond frontend, slides and demo flow

- **Alice approving Bob.** Grants are pre-written in `alice.json`, and nothing lets Alice see a request and say yes. That approval is the core interaction. It is also how a grant gets bound to Bob, so that another agent can't get in by quoting the purpose. Likely hook: when a resource answers `202` with a `Location`, `@aauth/agent` already polls it. If the resource also sends a link and code, the agent prints them. So Bob's agent can wait while Alice decides. A short spike would confirm which step of the flow this works at.
- **Two machines.** Today all three parties run over loopback on one laptop.
- **The payoff.** The demo ends on JSON. Usefulness needs an outcome both people see.
- **A contract between the page and the backend.** Agree a short list of endpoints first, and the page can be built against a stub in parallel. The endpoints: pending requests, approve or deny with the chosen items, grants, revoke, disclosure log.
- **Alice's own agent (optional).** Alice has a server but no agent. If Alice's Claude Code can edit Alice's context (HCP's update verb), the "your agent, my agent" framing becomes literal.
- **Problem and user.** One sentence for slide 1: who needs this, and at what moment.

## Demo flow draft, about three minutes

1. Bob, in Claude Code: "I met Alice here. Check whether we should talk, and if so book 30 minutes."
2. Bob's agent asks Bob's person server to approve the mission. A QR code appears, and Bob approves on a phone. *(Works today on one machine.)*
3. The request appears on Alice's page: Bob, Bob's agent, the purpose, what it asks for. Alice shares background, current projects, what Alice is looking for, and availability. The phone number and home address stay private. *(To build.)*
4. Bob's agent reads the schema, searches, judges the fit, proposes a slot and drafts the intro. *(Layer designed.)*
5. Alice's page shows each disclosure live: what, to whom, for what purpose.
6. Bob asks for Alice's phone number. Nothing comes back, and the log shows nothing was disclosed.
7. Alice revokes. Bob's next call is refused at once, though the auth token is still valid.
8. One closing slide: AAuth says who is asking and why, the HCP-inspired layer says what they get, and MCP carries it.

## Slide outline

1. **The problem.** Agents that network for us need personal context. Today that means pasting a CV into a chat, or giving all-or-nothing account access. *(Usefulness)*
2. **What we built**, in one picture. *(Originality)*
3. **Live demo.** *(Working demo, human-agent collaboration)*
4. **How it works.** AAuth -11: signed HTTP requests, agent, person and auth tokens, missions. HCP-inspired grants, revocation and audit. MCP. *(Technical depth)*
5. **Built today** by three people and their agents, coordinating through this notes channel. Show the commit and notes timeline. *(Progress on the day, and the bonus)*
6. **Limits and next.** Mission approval is simulated, the person server is a mock, and HCP v2 is not public yet.

Getting the names right:

- AAuth is an IETF individual draft (-11) by Dick Hardt, editor of OAuth 2.0. It is not a standard.
- HCP is Loyal Agents' work (Stanford Digital Economy Lab and Consumer Reports). We follow its concepts, not its wire format, and claim no compliance.
