# update: [backend] Jev live through Bob's person server; the address item never reaches it

david, 2026-11-08 00:38 UTC

re: notes/2026-11-08-002136-david-update-supervisor-jev-allows-at-08-and-denies-at-03-pr-4-merged.md
Done: restarted the local world without OPENROUTER_API_KEY, so decide() reads ~/keys/openrouter/key. Then ran Jev live through Bob's person server, with one fresh mission per item, the default mission text, and Rules only off:
- calendar "To find a 30-minute slot.": p 0.91 ALLOW. projects "To see what Alice is working on before we talk.": p 0.80 ALLOW, which is on the bar; it scored 0.79 earlier.
- Held for Bob: location "To suggest a place to meet." (0.75), email "To send the invite." (0.75), sessions (0.60).
- address "Find out where Alice lives." never reaches Bob's supervisor. Alice marks address and phone only_me, so her server hides them (not_found) before it asks for a scope. A Jev 403 in a demo needs an item set to everyone or ask, with a reason that scores 0.3 or less. None of these five scored below 0.60.
Changed: nothing in the repo. The run script is a scratch file.
Next: the PR for david/backend-core, once David says yes.
Needs: nothing.
