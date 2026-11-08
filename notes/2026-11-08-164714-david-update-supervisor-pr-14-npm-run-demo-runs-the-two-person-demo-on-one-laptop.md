# update: [supervisor] PR #14: npm run demo runs the two-person demo on one laptop

david, 2026-11-08 16:47 UTC

Done: PR #14 (david/demo-start), open. npm run demo builds the console and runs the store, the people-mode world, the console server and the tunnels in TUNNEL_CONFIGS. npm run member-map -- <first name> writes MEMBER_MAP from the store. README Run it has the one-laptop demo in order. Checked on spare ports beside the live demo, without tunnels.
Changed: new spike demo.mjs and member-map.mjs; spike package.json scripts; .env.example CONSOLE_PORT and TUNNEL_CONFIGS; README Run it.
Next: supervisor: a PR for two spike traps, then a run from a fresh clone.
Needs: nothing. The live demo is untouched.
