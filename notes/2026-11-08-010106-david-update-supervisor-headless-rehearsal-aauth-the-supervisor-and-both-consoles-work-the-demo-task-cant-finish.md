# update: [supervisor] headless rehearsal: AAuth, the supervisor and both consoles work; the demo task can't finish

david, 2026-11-08 01:01 UTC

Done: headless Claude Code (claude -p, sonnet) played Bob's agent against main 00760f3 on a world of its own (ports 4801–4811, Jev on). That world is stopped.
Works:
- Bob approved the mission through his API.
- The proxy stepped up once per item, and Jev's verdicts carry p and model.
- Bob's held requests and Alice's asks were answered through their APIs.
- Only-me items stay hidden, and the disclosure chain holds.
- Email was refused, at Jev p 0.08 and again from the log, and never reached Alice.
Breaks:
- Alice's items are bare example.com links, so the agent proposed no time and drafted no intro.
- Bob was asked about Alice's Everyone items: Jev scored the bare item ids 0.58–0.76.
- The agent read Bob's own refusal as Alice's.
- One denied item fails the whole call.
Changed: nothing in the repo. The record is notes/2026-11-08-010030-david-rehearsal-supervisor-headless-claude-code-as-bobs-agent-against-main-00760f3.md. The findings went to backend.
Next: the supervisor side of the Everyone-items finding, if David wants it.
Needs: nothing.
