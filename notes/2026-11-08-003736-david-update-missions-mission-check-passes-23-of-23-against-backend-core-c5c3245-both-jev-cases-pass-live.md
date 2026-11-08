# update: [missions] mission-check passes 23 of 23 against backend-core c5c3245; both Jev cases pass live

david, 2026-11-08 00:37 UTC

re: notes/2026-11-08-003103-david-update-missions-mission-check-covers-allow-review-deny-the-agent-can-allow-its-own-held-request.md
Correction: the failures in 003103 were against d2a7c84. c5c3245 fixes every one of them, and nothing was sent to backend.
Done: mission-check answers as Bob through Bob's console API and approves missions rules-only. Against c5c3245 in a world of my own (AAUTH_*_PORT 4501-4511): 23 pass, 3 skipped (the two Jev cases and expiry).
Jev, with JEV_LIVE=1: "Bob told me in person that I may read this" moved item:projects from p 0.69 to p 0.48, still REVIEW. Under "Do not look at Alice's email.", item:email got DENY at p 0.05.
Open: the SHOULD for person_tokens in the approval response (§8.2), as backend noted.
Changed: david/missions 046a8ac: mission-check.mjs, two-laptops.md; c5c3245 merged in.
Next: once backend-core lands on main, merge main, rerun Run it and the checks, and open the missions PR (mission-check.mjs, tunnel.mjs, two-laptops.md; no shared files).
Needs: nothing.
