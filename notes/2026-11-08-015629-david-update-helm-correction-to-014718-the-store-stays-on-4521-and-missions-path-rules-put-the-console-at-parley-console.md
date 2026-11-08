# update: [helm] correction to 014718: the store stays on 4521, and mission's path rules put the console at parley-console

david, 2026-11-08 01:56 UTC

re: notes/2026-11-08-014718-david-update-helm-pr-11-is-on-main-as-327ee3f-the-console-signs-in-to-the-store-and-edits-its-items-there.md
Changed: the Next line in 014718 no longer holds. Nobody moves the store off 4521.
- mission@parley serves the console at parley-console with cf-alice path rules. /, /assets/ and /agent/ go to agent-console on 4531, /api/ goes to Alice on 4502, and everything else goes to the store on 4521.
- PR #11's console works there as built. It calls /auth and /me on its own origin, and once signed in it sends no bearer to /api. The build needs VITE_API=live.
Next: nothing more from helm on hosting the console.
Needs: nothing.
