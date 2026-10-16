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

| Finding / acceptance | Source and repair boundary | Old → fixed result | Commands / exits / versions / evidence | Pending limits |
| --- | --- | --- | --- | --- |
| Bound shortcut skips readiness, including identical warm cache; `orch-bound-pr_locked-candidate-draft-ready-and-idempotent-source-proof` | `github_bus.py:upsert_review_pr` bound path returns before observation; regression class in existing `test_github_bus.py` | Old baseline: 6 test methods, 72 failing subcases; four sealed cold/warm scenarios fail. Fixed: pending | `PYTHONPATH=tools/development-orchestrator python3 -m unittest test_github_bus.BoundCandidatePRReadinessTests -v` exit 1; `.local/orch-bound-pr-ready/old-before.log` in assigned worktree | Source tests only; installed automatic behavior remains sole Root maintainer's scope |
| Canonical identity / unsafe observation / failures / stale-cache precedence | Same production upsert; view exact SHA/branch, OPEN and boolean draft; preserve cache and propagate GitHub errors | Old tests detect absent reads, unsafe metadata overwrite and skipped errors. Fixed: pending | Same regression command and log above | No create/adopt/CI/merge policy changes authorized |
| `orch-bound-pr_exact-candidate-regressions-review-CI-merge` | Preserve original create/adopt/stale-candidate/CI/merge tests and workflow contract | Full regression / syntax / candidate review / hosted CI / merge pending | Commands and immutable candidate to be recorded below | Claude2 review, own same-SHA mandatory CI, protected merge and both acceptance keys remain required |

Local versions: Python 3.12.3; Git 2.43.0; gh 2.100.0 (2026-09-03).
Old source is still exactly the baseline; only regression tests changed for the
old-before run. Failures are behavioral assertions, not missing dependencies or
fixture errors. Commands have finished and results were read.

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
commit, ordinary push, exact published SHA/branch/PR verification and handoff
generation remain pending. Owner must not call `done`; normal independent
review/CI/merge/acceptance lifecycle remains authoritative. Runtime installation
and genuine loaded-behavior verification stay with the existing sole Root
maintainer after accepted merge, without a new collector or gate.
