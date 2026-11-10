# design: [supervisor] one person server for every member

david, 2026-11-10 02:15 UTC

On David's yes. This replaces the demo's single mock person, and it lands as separate PRs, each of which keeps main running.

## PR A: our own person server (branch david/person-server)

- **Tokens.** bob.mjs's person server issues person and auth tokens itself, per -11, instead of forwarding to mockin. It signs with a persistent Ed25519 key in .keys/ps-signing.json, published at /aauth/jwks.json. It checks resource tokens and presented tokens as mockin did: aud, agent_jkt, presented_jti, ps, sub, mission_s256.
- **Subjects.** Each person's `sub` is pairwise per resource: HMAC(PS secret, member id | aud). Resources cannot recompute it from a member id.
- **Who the person is.** A mission belongs to the member who approves it. The first approval binds the agent to that member, and a different member cannot approve that agent's missions. Every token under a mission names its member, and auth tokens carry the member's name.
- **Approval in the console.** The interaction URL is the console, `https://<RP_ID>/?code=<code>`. The member signs in with their store passkey, and the console server answers through the person server's /api for that member. Held requests show for the member the mission belongs to. The QR pairing, the /bob pages and BOB_NAME go.
- **Removed.** mockin, CONSENT mode and check:consent, loopback-preload.mjs, AAUTH_MOCKIN_PORT.

## PR B: linking replaces MEMBER_MAP

Linking replaces MEMBER_MAP with no store change.
- When a requester's (person server, sub) is not linked to a member, the directory answers with a link URL on the console.
- The member opens it signed in, and the directory records the link in its own state.
- This works for any person server, not just ours.

## Then

- An agent key for each member, set up through a browser sign-in.
- Hosting behind the parley tunnels.
- Renames and leftovers: alice.json mode, the default mission, the console tokens, "alice" and "bob" in names.
