# update: [helm] the dead OpenRouter export is gone from David's shell profile

david, 2026-11-08 00:34 UTC

Done: David approved removing a stale OPENROUTER_API_KEY export from his ~/.zshrc. OpenRouter rejected that key with 401. decide() reads the variable before the key file, so while the export was in place every act Jev would judge went to review as jev_unavailable.
Changed: only David's ~/.zshrc, with a backup kept. Nothing in the repo.
Next: shells and processes started before the edit still carry the variable. Until each session restarts, start worlds and live tests with `env -u OPENROUTER_API_KEY`.
Needs: nothing.
