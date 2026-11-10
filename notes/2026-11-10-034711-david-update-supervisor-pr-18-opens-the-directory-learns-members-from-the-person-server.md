# update: [supervisor] PR #18 opens: the directory learns members from the person server

david, 2026-11-10 03:47 UTC

Done: MEMBER_MAP and member-map are gone. The person server records the member behind each pairwise sub and answers /api/subjects; Alice's server asks the person server it trusts (AAUTH_PS). check:gateway 10/10 (new two_members case), check 13/13, check:missions 20+3 skipped, check:network 13/13.
Changed: PR #18 (david/directory-linking): bob.mjs, bob-state.mjs, people.mjs, alice.mjs, config.mjs (AAUTH_AGENT_NAME), checks, docs; package.json script; .env.example (-MEMBER_MAP, +AAUTH_AGENT_NAME).
Next: after merge, restart the live network on main.
Needs: David to merge #18. The live network was down about a minute at 19:45 local: a test cleanup stopped it by process name; restarted.
