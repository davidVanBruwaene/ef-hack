# EF Hack

Team: Dorian, Julián, David

What we're building: _one line, once it's decided._

## Run it

_Install and start commands go here as soon as there's code. Keep them current: anyone should be able to run main from a fresh clone._

## Who owns what

Split by area so two people are rarely in the same file.

| Area | Owner  |
|------|--------|
|      | Dorian |
|      | Julián |
|      | David  |

## Setup (once)

1. Accept the invite at github.com/davidVanBruwaene/ef-hack/invitations
2. Clone and configure:

```bash
gh repo clone davidVanBruwaene/ef-hack    # or: git clone git@github.com:davidVanBruwaene/ef-hack.git
cd ef-hack
git config pull.rebase false              # git pull merges instead of stopping on diverged branches
cp .env.example .env                      # then put your keys in .env
```

## How we use git

**main always runs.** Work happens on short branches that you land on main yourself through a pull request. No reviews, so nobody waits on anybody.

Start a task, always from fresh main:

```bash
git switch main && git pull
git switch -c yourname/what-youre-doing
```

Save as you go, small and often:

```bash
git add -A && git commit -m "add login form"
git push -u origin HEAD        # first push of a branch; after that just: git push
```

Pull in teammates' work, before you land and whenever someone merges something you need:

```bash
git fetch && git merge origin/main
```

Land it, once it works:

```bash
gh pr create --fill
gh pr merge --squash --delete-branch
```

No `gh`? `git push` prints a link: open it, create the pull request, click **Squash and merge**.

Then start the next task from the top. Don't keep committing on a merged branch: squash merging leaves its old commits off main, and you end up in conflicts with your own earlier work.

### Rules

- Never commit straight to main, and never `git push --force` it.
- Merge main into your branch; don't rebase a branch you've already pushed.
- Land at least every hour or two. A branch that lives all night becomes a merge at 3 a.m.
- Say so in the group chat before changing shared files: dependency lists and lockfiles, database schema, env variable names, shared config.
- Don't reformat or rename things in files you aren't otherwise changing. Coding agents like to; stop them.

### When git complains

- **Merge conflict:** open the files git lists, keep both sides' changes, delete the `<<<<<<<` `=======` `>>>>>>>` markers, then `git add -A && git commit`. Or ask your coding agent to resolve the conflicts keeping both sides' changes, and check what it did.
- **Lockfile conflict** (`package-lock.json`, `pnpm-lock.yaml`, `uv.lock` ...): don't hand-edit. `git checkout --theirs <lockfile>`, rerun the install command, `git add <lockfile>`, commit.
- **Push rejected** (`fetch first`): the remote has commits you don't. `git pull`, then push again.
- **Lost:** `git status` says which branch you're on and what has changed.

### Before the demo

Whenever main is in a state you'd happily demo, tag it:

```bash
git tag demo-1 && git push origin demo-1     # next time demo-2, and so on
```

If a late change breaks things, `git switch --detach demo-1` checks out the version that worked.

## Secrets

Keys live in `.env`, which git ignores. When you add a variable, add its name, with no value, to `.env.example`. Share the actual keys by DM. If this repo is ever made public, every commit goes public with it, including files deleted in later commits.

## Coding agents

`AGENTS.md` has the repo rules for Claude Code, Codex and Cursor. `CLAUDE.md` imports it.
