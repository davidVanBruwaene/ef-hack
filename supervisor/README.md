# supervisor

Bob's supervisor, in the sense of AAuth -11 §4.3 and §4.4. Bob's person server calls it on each act from Bob's agent, such as an auth token request for one of Alice's items, and it judges that act against the mission Bob approved.

- Fixed rules decide first.
- Whatever the rules leave open, Jev answers as one yes/no question.
- Whatever Jev is unsure of, or cannot answer, goes to Bob.

It has no dependencies and needs Node 20 or later.

## Use

```js
import { decide } from '../../supervisor/decide.mjs'

const d = await decide({ mission, act, log })
// { decision: 'ALLOW' | 'REVIEW' | 'DENY', by: 'rule' | 'jev', rule, p, model, reason }
```

- **`mission`** is the approved mission, in any of these forms:
  - the decoded blob plus `s256`, as `bob.mjs` passes it;
  - the record `bob-state.mjs` keeps, `{s256, status, blob_b64}`;
  - the -11 §8.2 approval response, `{s256, mission}`.

  The approved blob is what gets judged, not the proposal kept beside it. Accepted updates (-11 §8.4) go in `mission.updates` as strings.
- **`act`** has a `type`:
  - `token_request`: `{type, agent, resource, scope, justification?}`. Each of Alice's items is a scope `item:<id>`.
  - `permission_request`: `{type, agent, action, description?, parameters?}`.
  - `mission_update` and `mission_completion`.

  The short `kind` (`token`, `permission`, `update`, `completion`) works in place of `type`.
- **`log`** is the mission's log, oldest first. Three kinds of row count as answers:
  - rows with `act` and `decision`;
  - `auth_token` rows, one answer per entry in `verdicts` (`{scope, decision, by}`);
  - Bob's `review_approved` and `review_denied` rows, one answer per scope in `detail`.

  Every other row, such as `proposed`, `approved` or `review_opened`, is ignored, and so is any row for another `mission_s256`. A logged answer without a resource matches on its scopes alone.
- **The result.** ALLOW means the person server issues, DENY means it refuses, and REVIEW means it holds the request for Bob. `rule` names the rule that decided and is null when Jev decided. `p` and `model` are Jev's. `reason` is one sentence for Bob's page.
- `decide()` never throws. Options for tests: `{now, fetch, env, timeoutMs, jev: false}`.

## Rules, in order

| Rule | Decision | When |
|---|---|---|
| `no_mission` | REVIEW | There is no approved mission to judge against. |
| `mission_inactive` | DENY | `status` is set and is neither `approved` nor `active`. |
| `mission_expired` | DENY | It is at or past the blob's `expires_at` (-11 §8.2). |
| `other_agent` | DENY | The act's agent is not the mission's agent. |
| `completion` | REVIEW | The agent proposes completion; only the person accepts it (-11 §8.5). |
| `mission_update` | REVIEW | The person reviews every change to the mission (-11 §8.4). |
| `unknown_act` | REVIEW | The act's type is not one listed above. |
| `incomplete_act` | REVIEW | A token request names no resource, or a permission request names no action. |
| `decided_before` | the same | The same resource and scopes, or the same action, were allowed or denied earlier in this mission. The latest answer stands, whatever the new justification says. |
| `denial_streak` | REVIEW | Three or more requests were denied in this mission. |
| `approved_tool` | ALLOW | A permission request for one of the blob's `approved_tools`. |
| `unlisted_resource` | REVIEW | The blob lists `approved_resources` and this resource is not one of them. In -11 the list is not a limit, so the person decides. |
| `too_long` | REVIEW | The agent's justification or description runs over 2000 characters. |

Then Jev. When Jev gives no answer, the act goes to review under the rule name `jev_unavailable`.

## Jev

- **The call.** One request to `https://openrouter.ai/api/v1/systemone`:
  - The model is pinned to `typesafe/jev-1.14-20261014`, so decisions are reproducible.
  - It asks one `noul` question: "Is this act consistent with the mission?"
- **What Jev sees.**
  - The mission: its description, accepted updates, approved tools and approved resources.
  - The act: its resource and scope, or its action and parameter names.
  - The agent's own text, marked as written by the agent and not verified.

  Nothing else on the act is sent, so resource content never reaches Jev. TypeSafe offers no zero data retention.
- **The thresholds.** p ≥ 0.9 allows, p ≤ 0.1 denies, and anything between goes to review. Every decision records the `model` the reply names.
- **No answer.** Any of these sends the act to review:
  - an HTTP error;
  - no reply within 4 s;
  - a reply that names no model;
  - a missing or out-of-range `noul`.
- **The key.** It is `OPENROUTER_API_KEY` if that is set, otherwise the file at `OPENROUTER_KEY_FILE` (default `~/keys/openrouter/key`). It is read on every call, so a rotated key works without a restart. It is never logged or returned, and never copied into the repo.

## Test

```bash
cd supervisor && npm test
```

The fixture tests stub the HTTP call. The live smoke test calls Jev for real, which costs a fraction of a cent:

```bash
cd supervisor && npm run test:live
```
