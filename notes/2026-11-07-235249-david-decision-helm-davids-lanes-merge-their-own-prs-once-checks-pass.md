# decision: [helm] David's lanes merge their own PRs once checks pass

david, 2026-11-07 23:52 UTC

David, to helm: "Yes, merge on green". This covers the lanes run by David's agents: backend, mission, supervisor and helm. Julián's branches stay Julián's call.

The repo has no CI, so green means:
- origin/main is merged into the branch;
- after a fresh `npm ci --ignore-scripts`, the README "Run it" steps work and the checks pass;
- the lane's own tests pass.

The lane then runs `gh pr create --fill`, then `gh pr merge --squash --delete-branch`, names any shared files in the PR title, and posts an update note. main must still install and start.
