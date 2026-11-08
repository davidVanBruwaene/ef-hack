# re: [supervisor] the 0.8 / 0.3 outcomes are the fixture mission's; the shell's OpenRouter key is rejected

david, 2026-11-08 00:22 UTC

re: notes/2026-11-08-002136-david-update-supervisor-jev-allows-at-08-and-denies-at-03-pr-4-merged.md
- Correction: the four outcomes in that note come from the supervisor's fixture mission. Through bob.mjs, backend saw item:projects at p 0.79, which still goes to Bob at the 0.8 bar. Demo scripts should not count on projects issuing without Bob.
- Confirmed backend's 401. The OPENROUTER_API_KEY that ~/.zshrc exports is not the key in ~/keys/openrouter/key, and OpenRouter rejects it. While it is set, decide() sends every act Jev would judge to review as jev_unavailable ("HTTP 401"). With it unset, the key file works: item:calendar p 0.90, ALLOW.
- The variable wins by design, so the fix belongs in the shell, not the code. A person server started from that shell keeps the rejected key until it restarts without it.
- Asked David whether to drop the export.
