# EF Hack

Team: Dorian, Julián, David

What we're building: _one line, once it's decided._

## Run it

The AAuth MCP spike needs Node 22 or later. Details are in [spike/aauth-mcp/README.md](spike/aauth-mcp/README.md).

```bash
cd spike/aauth-mcp
npm ci --ignore-scripts
npm run world      # leave it running
npm run check      # in a second terminal
npm run mission    # before using it from Claude Code: a member approves the mission at /api, or in the console when RP_ID is set
npm run check:network  # the people network against a throwaway store; needs npm ci in store/ first
npm run check:gateway  # the hosted MCP endpoint, with OAuth and a soft passkey; also needs the console built
```

The passkey store (accounts and sign-in; Node 22.18 or later) lives in `store/`:

```bash
cd store
npm ci
npm run typecheck  # tsc, no emit
npm test           # 21 tests with a software passkey, no browser needed
npm start          # http://localhost:8790
```

The owner console (React + Vite, mock data until the API exists) lives in `console/`:

```bash
cd console
npm ci
npm run dev        # http://localhost:5173, mock data
```

Set `VITE_API=live` (and `VITE_API_TARGET` for the server's URL) to use the real console API instead of the mock.

In live mode the dev server also sends the store's routes (`/auth`, `/me`, `/network`, `/invite`, `/join`, `/pair`, `/dev`) to `VITE_STORE_TARGET` (default `http://localhost:8790`). The console then signs in with the store's passkeys and edits the items there, while requests and activity still come from `/api`. Behind a tunnel, set `PUBLIC_URL` to the console's public URL so Vite accepts that hostname, and start the store with the same URL in `RP_ORIGINS` and the hostname in `RP_ID`.

Behind the tunnel, Alice and Bob use the same console. Build it with `VITE_API=live npm run build` in `console/`, then run `npm run console` in `spike/aauth-mcp` (port 4531, with `STORE_URL` set as for Alice's server). It serves the build and adds, for whoever is signed in, the missions and held requests their agents wait on at the person server. [spike/aauth-mcp/two-laptops.md](spike/aauth-mcp/two-laptops.md) covers the tunnel.

On two laptops, run `npm run bob` on one and `npm run alice` on the other, behind a Cloudflare Tunnel. The spike README covers the setup.

**The network on one machine.** A member's agent, Claude Code, finds another member of the people network and asks for what they share. Every member signs in to the same console with their passkey: there they answer their own agent's missions and held requests, and the asks other agents send them. Once per laptop:

1. Run `npm ci` in `store/` and `console/`, and `npm ci --ignore-scripts` in `spike/aauth-mcp`.
2. Create both tunnels and write both configs on this laptop, as in "Once per laptop" in [spike/aauth-mcp/two-laptops.md](spike/aauth-mcp/two-laptops.md). Alice's takes `--console 4531 --store 8790`, or `CONSOLE_PORT` and `STORE_PORT` if you set them.
3. In `.env` at the repo root, set `AAUTH_PS`, `AAUTH_AGENT` and `AAUTH_RESOURCE` to the tunnel hostnames, `RP_ID` to the console's hostname, and `TUNNEL_CONFIGS` to the two config files.

Each run, in `spike/aauth-mcp`:

```bash
npm run demo       # builds the console, then runs the store, the world, the console server and both tunnels; leave it running
```

Each person opens `https://<RP_ID>/` on their phone and creates an account with a passkey, once. Then, in a second terminal in `spike/aauth-mcp`:

```bash
npm run member-map -- <your first name>             # once, after your account exists: the directory's map until linking replaces it
npm run mission -- "<what your agent should do>"    # open the link it prints, signed in; the first approval makes the agent yours
npm run mcp-config
claude --mcp-config mcp.json --strict-mcp-config --allowedTools mcp__alice__find_people,mcp__alice__search_context
```

Requests the supervisor holds wait for the agent's member in the console, and the other member answers asks there too, under Requests.

To use your own agent instead (Claude, ChatGPT or any agent that takes a remote MCP server), add `https://<RP_ID>/mcp` as a custom connector. Sign in with your passkey when it asks, and press Connect. The agent then has a `start_mission` tool, and you approve its mission in the console. The tunnel config needs the endpoint's paths, so rerun `node tunnel.mjs config alice --console 4531 --store 8790 --force` once after updating.

Keep this section current: anyone should be able to run main from a fresh clone.

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

- Never commit straight to main (notes posted with `scripts/notes post` are the exception), and never `git push --force` it.
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

## Notes channel

[`notes/`](notes/) is where we and our agents leave ideas, brainstorming, research and handoffs. `scripts/notes post "<title>" < body.md` publishes a note straight to main from any branch, no PR; `scripts/notes read` prints what's new since you last looked. Our agents post a short update after every significant action, so notes are the fastest way to see where things stand. Conventions are in [notes/README.md](notes/README.md).

## Secrets

Keys live in `.env`, which git ignores. When you add a variable, add its name, with no value, to `.env.example`. Share the actual keys by DM. If this repo is ever made public, every commit goes public with it, including files deleted in later commits.

## Coding agents

`AGENTS.md` has the repo rules for Claude Code, Codex and Cursor. `CLAUDE.md` imports it.
