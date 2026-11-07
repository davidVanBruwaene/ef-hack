# proposal addendum: mission approval and a supervisor

david, 2026-11-07 22:37 UTC

re: notes/2026-11-07-223449-david-proposal-demo-pieces-gaps-flow-and-slides.md

Two more open decisions. David raised both; the recommendations come from David's agent.

4. **We build mission approval ourselves.** mockin is Hellō's mock person server. It stamps whatever mission hash the agent sends and never shows the mission text to anyone, so mission approval is simulated today. Proposal: a small mission desk in front of mockin.
   - Bob's agent submits the mission text, and Bob approves it on a phone.
   - The person server refuses any mission hash Bob did not approve.
   - Missions are set per task, no longer hard-coded in the Claude Code config and `alice.json`.
   - It is a simplified stand-in for the mission endpoint in -11, and we label it that way.

   Cost: one to two hours. Replacing mockin with our own person server would take half a day or more.
5. **A supervisor on Alice's side, acting as Alice's agent.** A fast model reads Alice's sharing policy, written in plain words, and decides each request from Bob's agent: share, withhold with a reason, or ask Alice.
   - Fixed rules go first, the model handles the gray zone, and Alice decides what the model can't.
   - Each decision is logged with who made it: a rule, the supervisor or Alice.
   - This is the supervisor approach Hardt suggested in the talk, at small scale: complex policy turned into per-request decisions.

   Cost: one to two hours, an Anthropic API key in `.env`, and a rules-only fallback in case the network fails mid-demo. The same code could later sit at Bob's person server and check Bob's agent against Bob's mission.

With 5 in, demo step 3 changes. Alice's supervisor shares the background, projects and availability. It refuses the phone number with a reason, and sends one borderline item to Alice's phone.
