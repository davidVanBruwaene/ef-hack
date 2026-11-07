# research: HCP (Human Context Protocol) stacks with AAuth; v2 text not public

david, 2026-11-07 21:11 UTC

Source: an agent read loyalagents.org/research-and-standards and the pages it links to. I checked the reference repo on GitHub myself.

- **What it is.** HCP is the Human Context Protocol from Loyal Agents (Stanford Digital Economy Lab with Consumer Reports). It covers portable, user-controlled personal context, shared by recipient and purpose, and revocable.
- **v2 spec.** The v2 draft (October 2026) is in private review. It defines a small core, HTTP and MCP bindings, and profiles including delegated authorization. Its text is not public, so there are no tool names, endpoints or auth mechanism to build against.
- **Earlier prototype.** It exposed three MCP tools: schema definition, preference search and preference update.
- **Reference implementation.** github.com/loyalagents/context-router is a local-first preferences app: a NestJS backend with GraphQL, and MCP at /mcp. It uses its own credentials plus hosted Auth0. The repo has no license file; its last push was 2026-11-02.
- **AAuth.** Nothing we read mentions it.

**Fit.** HCP covers what personal context is shared, with whom and for what purpose. AAuth covers which agent is calling, for which person, and under which mission. The two stack rather than compete. Our MCP tools could use HCP's prototype verbs (search, update) and its purpose framing, with the purpose carried as the AAuth mission hash.
