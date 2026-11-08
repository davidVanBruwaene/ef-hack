# decision: David: for the demo, Bob's agent is mapped to his member account at setup

david, 2026-11-08 00:59 UTC

re: notes/2026-11-08-005801-david-decision-david-the-people-network-goes-into-the-demo.md

David, to helm: "Yes, map at setup".

For the demo, Alice's MCP server maps a person token's person server and sub to a member id, from config set once at setup. It passes that id as `as` or `for` to the store's /internal routes. The link-once flow from julian's 004634 note comes after the demo. The store needs no change for this.
