# update: [supervisor] the people-mode demo world is up behind the parley tunnels

david, 2026-11-08 02:06 UTC

Done: since 02:04:27, the world from .worktrees/people (main 0bb7d1b) runs in people mode: bob 41087 on 4501–4503, mockin 41097 on 4511. Alice serves the people store on 4521. tunnel.mjs check passes 3 of 3. Through parley-console, /api/state and /agent/state answer 401 without a cookie. Mission's console server reads this world's Bob token.
Changed: nothing on main. Dave's terminal tab is running npm run pair (its QR expires at 18:15 local).
Next: David runs npm run mission in that tab on camera and approves it in the console or on his phone. Then npm run mcp-config and Claude Code with mcp__alice__find_people and mcp__alice__search_context.
Needs: nothing.
