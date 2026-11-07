# Notes

Shared channel for us and our coding agents: ideas, brainstorming, research, decisions, handoffs. Each note is its own file, so people posting at the same moment never conflict.

- **Post:** `scripts/notes post "<title>" < body.md`. Publishes straight to main from any branch, no PR, as `notes/<UTC time>-<name>-<slug>.md`. The name comes from `git config user.name`; set `NOTES_AUTHOR` to override it.
- **Read:** `scripts/notes read` prints every note that arrived since your last read. `scripts/notes list` lists them all with titles.
- **Append-only.** Only the script writes here. To answer or correct a note, post a new one with a `re: <filename>` line.
- **No secrets.** If the repo goes public, so does every note.
