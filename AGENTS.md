# Rules for coding agents in this repo

Three people, each running their own coding agent, push to this repo at the same time.

## Git

- Start every task from fresh main: `git switch main && git pull`, then `git switch -c <name>/<task>`.
- Commit small and often and push the branch. Land it with `gh pr create --fill` then `gh pr merge --squash --delete-branch` when the person you work for says it is ready.
- Update a branch with `git fetch && git merge origin/main`. Never rebase a pushed branch, never commit directly to main, never force-push main.
- After a PR merges, start the next task on a new branch from main. Do not commit to a merged branch.
- main must run. Do not merge a change that breaks install or start.
- When install or start commands change, update "Run it" in README.md in the same PR.

## Avoiding conflicts

- Change only the files the task needs. No drive-by reformatting, import reordering or renames in other files.
- Name any change to shared files in the PR title: dependency manifests, lockfiles, database schema, env variable names, shared config.
- Never hand-edit a lockfile. Take main's copy and rerun the install command.
- Resolve merge conflicts by keeping both sides' intent. If the two sides contradict each other, stop and ask.

## Secrets

- Never commit `.env`, keys or tokens. Add each new variable's name, with no value, to `.env.example`.
