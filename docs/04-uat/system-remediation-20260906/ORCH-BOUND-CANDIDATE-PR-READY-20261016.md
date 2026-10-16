# ORCH-BOUND-CANDIDATE-PR-READY-20261016

Owner: Codex. Independent reviewer: Claude2. Finite tooling Source repair;
not a new product requirement, Final dependency, runtime installation or deploy.

## Source and reproduction boundary

Baseline commit: `e323b9424f46bd9bcdfa684a61fbcad77c4eb4a4`.
Baseline `github_bus.py` SHA256:
`b6471b83a3a525b67367f82efdf4fb6e3ef81cb115698bd98a2ae55c1b017ceb`.
It matches the supplied immutable accepted wholeblob byte for byte.

Dispatch evidence directory:
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261016T061547Z-two-original-draft-PR-ready-and-bound-bus-root/`.
Read `actual-active-and-current-accepted-bound-PR-ready-shortcut-isolated-reproduction.json`,
`normal-two-original-candidate-PR-ready-actual-readback.json`, and targeted fields
of `ONE-two-original-reviewed-candidates-draft-ready-no-overlap-preflight.json`.
The former identifies four cold/warm reproductions. The readback records Root's
ordinary successful ready operations on #2724 and #2708; these do not prove this
Source repair was installed or that full CI passed. Subsequent four workflow
handles demonstrate dispatch only, never completed full-CI or runtime proof.

`BoundCandidatePRReadinessTests` embeds those two real candidate SHA/branch/PR
identities and actual bound-reference shape. It executes production
`upsert_review_pr`, `bound_task_pr`, `candidate_pr_observation` and `gh_json`.
Only GitHub `run_gh`, activity-log I/O, optional metadata and canonical command
boundaries are doubled. The GitHub double permits only the exact bound PR view
and ready argv, rejecting create/edit/search/alternate calls. No live PR is
changed by these checks. Task/status snapshots and cache assertions protect
immutable evidence; failure tests require normal exception propagation/retry.

## Finding and acceptance evidence

| Finding / acceptance                                                                               | Source and repair boundary                                                                                                                               | Old → fixed result                                                                                                                                                                     | Commands / exits / versions / evidence                                                                        | Pending limits                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Clause 1: bound shortcut; `orch-bound-pr_locked-candidate-draft-ready-and-idempotent-source-proof` | `github_bus.py:upsert_review_pr` bound path now observes before returning; regression class in existing `test_github_bus.py`                             | Old baseline: 6 methods, 72 failing subcases; four sealed cold/warm scenarios fail. Fixed: all 6 methods pass, including four sealed cases and a second read with zero redundant ready | Scoped commands, versions and logs below; old exit 1 → fixed exit 0                                           | Source proof only; installed automatic behavior remains sole Root maintainer's scope                                             |
| Clause 2: canonical identity / unsafe observation / failures / stale-cache precedence              | Same production upsert; exact full SHA/branch, OPEN and boolean draft; validation before fallback; cache updates only after successful observation/ready | Fixed: cold/warm/stale cache negative cases pass; offline observation, malformed payload and ready failure preserve metadata, propagate existing errors and retry normally             | Same 6-method scoped run below; exact view/ready argv and no other GitHub commands asserted                   | No create/adopt/CI/merge policy changes; concurrent GitHub state changes after observation remain subject to normal gh operation |
| Clause 3: meaningful production regressions                                                        | `BoundCandidatePRReadinessTests` calls real upsert and observation; prior test classes unchanged                                                         | 184 added lines, zero removed lines from original test file; full bus coverage 59/59 pass                                                                                              | Full bus command below, exit 0                                                                                | GitHub boundary doubled; not external integration proof                                                                          |
| Clause 4: workflow contract                                                                        | Read accepted `origin/dev:.github/workflows/ci-integ.yml` at `4da15372d6961dcc3fca8bbf37355a11566b2060`                                                  | Existing `types: [opened, synchronize, reopened, ready_for_review]` confirmed; no workflow edit                                                                                        | `git show origin/dev:.github/workflows/ci-integ.yml`, exit 0                                                  | Previous two manual ready actions / four new run handles are dispatch only, never this candidate's CI                            |
| Clause 5: `orch-bound-pr_exact-candidate-regressions-review-CI-merge`                              | Original bus tests plus affected status/candidate/gateway/branch tests; syntax and diff checks                                                           | 59 bus + 76 affected regressions pass; syntax/diff pass                                                                                                                                | Commands and exact source versions below                                                                      | Claude2 independent review, own same-SHA mandatory CI, protected merge and both acceptance keys remain pending                   |
| Clause 6: finite support / ownership / scope                                                       | Exact three dispatched paths; owner isolated worktree and normal source lifecycle                                                                        | Scope inspection passes; no Broker nine-file overlap, second publisher, runtime or policy action                                                                                       | `git diff --name-only e323b9424f46bd9bcdfa684a61fbcad77c4eb4a4`; anchor `d967d0c8a` already ordinarily pushed | All product/native/manual/HOLD/Final gates preserved; installed behavior stays with sole Root maintainer                         |

Local versions: Python 3.12.3; Git 2.43.0; gh 2.100.0 (2026-09-03).
For the old-before run source was exactly the baseline; only regression tests
had changed. Failures were behavioral assertions, not missing dependencies or
fixture errors. Every started local check finished and its result was read.

## Reproducible checks and exact source versions

Fixed source Git blob: `d5141402009a3ba0243a6676750e577db671ef9a`;
SHA256: `a32c16985d4892bd4695c6c1822285b1e03598a1052af43b2d99f98445028972`.
Regression file Git blob (identical in old-before and fixed-after runs):
`5e88066a10b88925f467fd1aa7676963258ff13f`;
SHA256: `fccb3a7a9cf0d9f0ca76a3bc53c0b210a8304d74d98ed609776c141488f92ab3`.
These identify tested code without a circular document/self-commit SHA. The
immutable final candidate and generation are recorded by canonical handoff.

Working directory for all checks: the dispatched isolated worktree
`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-orch-bound-candidate-pr-ready-20261016`.
Logs under its `.local/orch-bound-pr-ready/` are machine-specific evidence;
the commands, results and hashes are retained here for independent reproduction.

| Command                                                                                                                                                                                                                                          | Result                                                                                     | Local log / SHA256                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `PYTHONPATH=tools/development-orchestrator python3 -m unittest test_github_bus.BoundCandidatePRReadinessTests -v` against old baseline                                                                                                           | Exit 1, 6 methods, 72 failing subcases                                                     | `old-before.log` / `129a55444f47d3a610ded771ee52c86bc34069f48415186b2fd6cdf3da553863`          |
| Same scoped command against fixed source                                                                                                                                                                                                         | Exit 0, 6 methods pass                                                                     | `fixed-scoped.log` / `6d1591c8b32c2adf15ef6a35540da6d2832fe2c80b0abc2cd045ae752aa2721b`        |
| `PYTHONPATH=tools/development-orchestrator python3 -m unittest test_github_bus -v`                                                                                                                                                               | Exit 0, 59 tests pass (includes original create/adopt/stale-candidate/CI/merge assertions) | `fixed-full-bus.log` / `fa202bb733c766a2f1b4ac173606b6e7f788a88f2928026c5b2fa28e5e16df53`      |
| `PYTHONPATH=tools/development-orchestrator python3 -m unittest test_ai_status test_ai_status_merge_reachability test_status_root_resolution test_branch_routing test_branch_routing_integration control_plane.tests.test_task_board_commands -v` | Exit 0, 76 tests pass                                                                      | `tooling-regressions.log` / `1b7f1e8c032ca8ebf6a83f586b6e2179391719c31c52007a4035fc1ecbac41ba` |
| `python3 -m py_compile tools/development-orchestrator/github_bus.py tools/development-orchestrator/test_github_bus.py`                                                                                                                           | Exit 0, syntax pass                                                                        | No output                                                                                      |
| `git diff --check e323b9424f46bd9bcdfa684a61fbcad77c4eb4a4`                                                                                                                                                                                      | Exit 0                                                                                     | No output                                                                                      |

Python-specific lint tooling is not configured for these files; syntax and
applicable existing tests were run. Product/browser/PG/runtime tests and the
entire orchestrator test discovery were not run locally; the affected subset
above is not a claim of full hosted CI. No tests remain running in background.

## Preserved contracts

- Bound handoff PR identity wins over stale cached PR; no alternative search or
  duplicate PR, title/body rebuild, optional metadata edits or canonical writes.
- Both cold and warm paths must observe actual GitHub state; cached equality
  alone cannot establish current readiness. Only exact OPEN locked full SHA and
  candidate branch with actual boolean draft true may use normal `gh pr ready`.
- Reports, missing/invalid candidate identity, drift, closed/merged or
  untrustworthy observation cannot ready an alternate or change task evidence.
- `origin/dev` accepted `ci-integ.yml` already has `ready_for_review`; no workflow
  trigger defect is asserted and workflows are outside scope.
- Only the three dispatched scopes may change. Distinct Broker nine-file
  repair, guards, policy/queues, providers, budgets/concurrency, auto-merge,
  canonical schema, Root WIP and published history remain outside this repair.
- No supervisor/publisher duplication, worker control, VM product/dev/preview/
  browser/PG/Docker servers, cloud/deploy/Operator/IAM/account action.
  Original134/44/PAX23+later requirements and all role/native/manual/same-release/
  H3F2/cleanup/HOLD/Final gates remain intact. No whole-helper-DONE runtime gate.

## Candidate lifecycle

Anchor commits are recoverability checkpoints, not review candidates. Final
candidate uses branch `codex/orch-bound-candidate-pr-ready-20261016`, base `dev`.
Owner will verify the final local/remote/PR heads, then hand off the full SHA and
branch to Claude2; the CLI records candidate generation. This document is part
of that final candidate, with the tested source blobs pinned above. Mandatory
hosted CI triggered by handoff/ordinary ready is pending at source delivery.
Owner must not call `done`; normal independent
review/CI/merge/acceptance lifecycle remains authoritative. Runtime installation
and genuine loaded-behavior verification stay with the existing sole Root
maintainer after accepted merge, without a new collector or gate.
