# Unblock PAX-BUREAU-JOURNEY-COVERAGE-20261018

- **Task ID**: `PAX-BUREAU-JOURNEY-COVERAGE-20261018-UNBLOCK-MANUAL-UNBLOCK`
- **Parent Task ID**: `PAX-BUREAU-JOURNEY-COVERAGE-20261018`
- **Owner**: `Claude`
- **Reviewer**: `Gemini2`
- **Base (`origin/dev`)**: `ec8472eeba5812f04176f522d819d88e5b9064a7`
- **Parent Approved Candidate**: `5e0daca266e5e5abefc6ef2473d73163568982e3` (gen `e5ac9fb23d534ab091588263155b508b`, approved by `Gemini2` 2026-10-25T12:03:11Z)
- **Parent Merge (PR #3001)**: `2a7ccb3108b343e2eb6d0a0914a7f5fcfdb47901`
- **Latest Successful Dev Deploy**: `deploy-dev.yml` run `40176220695` @ `a852615e5737b8bb47f90a95c0e1a1ae872c8cec` (`release/v2026.10.25.0`, created 2026-10-25T08:20:25Z)

## 1. Diagnosis: Why the Dependency-Ready Parent Remains Blocked

`PAX-BUREAU-JOURNEY-COVERAGE-20261018` is `blocked` with `waiting_for: "Gemini2"`, but nothing is waiting on `Gemini2` and no source work remains:

- **Source work is complete and merged.** Candidate `5e0daca266e5e5abefc6ef2473d73163568982e3` was approved by `Gemini2` and merged via PR #3001 as `2a7ccb3108b343e2eb6d0a0914a7f5fcfdb47901` on `dev`. `ci-integ` on that `dev` push (run `40193273087`) concluded `success`. The first acceptance key `pax-bureau-coverage_each-finding-real-evidence-and-applicability` keeps its full Source credit.
- **The open acceptance key needs a deployed release.** `pax-bureau-coverage_same-release-hosted-journeys` means: "Root 統一部署後在同版本走適用的共享操作，保留新戶／原單／實際UI／原圖與 pass／fail／未執行，逐項回填原16案例". It can only be met after a release containing `2a7ccb310` is deployed to shared dev and the applicable shared journeys are walked on that same release.
- **Owner `Claude` closed it too early.** At 2026-10-25T12:51:25Z the owner marked this key done, citing only two hosted CI successes on the same candidate SHA and the PR merge. Neither is a post-deploy, same-release shared operation. `Gemini2` correctly reopened it at 13:06:53Z, so the reviewer's part of the job is done.
- **Shared dev does not run `2a7ccb310` yet.** The latest successful `deploy-dev.yml` run is `40176220695` at `a852615e5`, the target of `release/v2026.10.25.0` and `publish/v2026.10.25.0`. That commit was cut before PR #3001 merged. No `release/*` tag or `publish/*` branch contains `2a7ccb310`.
- **Deploying to dev needs an immutable ref.** `deploy-dev.yml` runs on `workflow_dispatch`, where `inputs.source_ref` must be `publish/v<date>`, `release/v<date>`, or a full commit SHA, never `dev`. It also runs on `push` to `publish/v*`. Merging into `dev` never deploys by itself. The only automated path is `nightly-publish.yml` (cron `0 3 * * *`). That workflow cuts `publish/v<date>.<N>` and `release/v<date>.<N>` from the `dev` HEAD, then dispatches `deploy-dev.yml` against the new branch. It does this only when `ci-integ` on that HEAD is green and the HEAD differs from the latest `publish/v*`. Its most recent run (`40175024885`, 2026-10-25T08:01:52Z) produced `v2026.10.25.0` at `a852615e5`. It has not run since `2a7ccb310` merged.

Re-verification commands (run in this cloud session, 2026-10-25):

| Command | Exit | Result |
| --- | --- | --- |
| `git fetch origin dev 'refs/tags/release/v2026.10.25.0:refs/tags/release/v2026.10.25.0'` | 0 | `origin/dev` and `release/v2026.10.25.0` fetched |
| `git log --oneline -1 origin/dev` | 0 | `ec8472e [ReviewBus] BUREAU-R13-AGENCY-READONLY-PORTAL-20261024 … (#3005)`. `dev` has moved past `61231322b` and still contains `2a7ccb310` |
| `grep -n "^on:" -A 15 .github/workflows/deploy-dev.yml` | 0 | `workflow_dispatch` with required `source_ref` ("publish/v<date>, release/v<date>, or full commit SHA. Never mutable branches like dev/main/design."). Lines 39–41 add `push: branches: ["publish/v*"]` |
| `git log --oneline -1 release/v2026.10.25.0` | 0 | `a852615 BUREAU-R14-EXPIRY-REMINDERS-SCHEDULER-20261024-UNBLOCK-MANUAL-UNBLOCK: … (#3000)` |
| `git merge-base --is-ancestor 2a7ccb310 release/v2026.10.25.0` | 1 | `2a7ccb310` is **not** in the latest release tag |
| `git log --oneline 2a7ccb310..release/v2026.10.25.0` | 0 | Empty. The tag is strictly behind `2a7ccb310` (`git log release/v2026.10.25.0..2a7ccb310` lists 2 commits: `ebfc8f4`, `2a7ccb3`) |
| `git ls-remote --heads origin 'refs/heads/publish/v*'` | 0 | Latest is `publish/v2026.10.25.0` @ `a852615e5`. No newer publish branch exists |
| `gh run list --workflow deploy-dev.yml --limit 5 --json databaseId,headSha,status,conclusion,createdAt` | 0 | Newest is `40176220695` / `a852615e5…` / `success` / 2026-10-25T08:20:25Z. The other four (2026-10-23 and 2026-10-24) are `failure`. Nothing newer exists |
| `gh run list --workflow nightly-publish.yml --limit 3 --json databaseId,headSha,conclusion,createdAt,event` | 0 | Newest is `40175024885` (`schedule`, 2026-10-25T08:01:52Z, `success`), before PR #3001 merged |
| `gh run list --workflow ci-integ.yml --branch dev --event push --limit 4 --json databaseId,headSha,status,conclusion,createdAt` | 0 | `2a7ccb310…` is `success` (`40193273087`). Later `dev` heads `61231322b` and `ec8472e` were still `queued` and `pending` |

## 2. Why No Task-Scoped Code Change Applies

This is not a `write_scopes` conflict or a code defect, so no product source, test, or config change can clear it:

- The parent's code is approved and merged. Nothing in the repository needs to change for `pax-bureau-coverage_same-release-hosted-journeys` to be satisfiable.
- What is missing is a release and deploy operation, plus a hosted walk on that release. Cutting `publish/*` / `release/*`, dispatching `deploy-dev.yml` or `nightly-publish.yml`, and deploying to GCP Cloud Run (`DEV_GCP_*`) all belong to the user-designated deploy operator or the scheduled `nightly-publish.yml` automation. Per `AGENTS.md` and `docs/ops/branch-strategy.md`, they are outside every worker identity (owner, reviewer, unblock helper).
- `AGENTS.md` also forbids running the development environment on the orchestrator VM, and forbids replacing the authorized cloud deploy workflow with a VM deployment. A worker cannot produce same-release hosted evidence locally.

The only correct action for this helper is to record the diagnosis and correct the parent's `waiting_for` target. This branch adds this document only and changes no product code.

## 3. §0.7 Verification & Rework Table

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| `Diagnose why the dependency-ready parent remains blocked` | Parent `PAX-BUREAU-JOURNEY-COVERAGE-20261018`. Approved candidate `5e0daca266e5e5abefc6ef2473d73163568982e3`, merged via PR #3001 as `2a7ccb3108b343e2eb6d0a0914a7f5fcfdb47901`. Reopen by `Gemini2` at 2026-10-25T13:06:53Z. `.github/workflows/deploy-dev.yml`, `.github/workflows/nightly-publish.yml` | Parent is blocked only on `pax-bureau-coverage_same-release-hosted-journeys`. Latest successful deploy `40176220695` @ `a852615e5` (`release/v2026.10.25.0`) does not contain `2a7ccb310`. No later publish or release ref exists, so no same-release hosted journey can run yet | Commands and results in §1. All exit 0 except `git merge-base --is-ancestor 2a7ccb310 release/v2026.10.25.0` → exit 1 (expected: not an ancestor). Base `ec8472eeba5812f04176f522d819d88e5b9064a7` | `ci-integ` on later `dev` heads (`61231322b`, `ec8472e`) was still queued or pending when checked |
| `Make only the task-scoped change needed to unblock or document the remaining blocker` | `support/unblock/PAX-BUREAU-JOURNEY-COVERAGE-20261018/PAX-BUREAU-JOURNEY-COVERAGE-20261018-UNBLOCK-MANUAL-UNBLOCK.md` (this file only) | No code change applies (§2). The blocker is an external release, deploy, and hosted-walk step, now documented here | `git diff --name-only origin/dev...HEAD` → exit 0, this one file. `git diff --check origin/dev...HEAD` → exit 0 | No product code, tests, `ai-status.json`, `.orchestrator/`, or `ai-task-archive/` touched. No workflow triggered, no gcloud called |
| `Produce task-scoped commit/push/PR evidence for any canonical change` | Branch `claude/pax-bureau-journey-coverage-20261018-unblock-manual-unblock`, based on `origin/dev` `ec8472eeba5812f04176f522d819d88e5b9064a7` | One docs-only commit with the required trailers, pushed normally (no force) | `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` → exit 0. `git diff --check origin/dev...HEAD` → exit 0. `git push -u origin claude/pax-bureau-journey-coverage-20261018-unblock-manual-unblock` | The PR is opened by the local orchestrator / owner, not from this cloud session. Hosted CI and `Gemini2` review are pending |
| `Update the parent task with the concrete unblocked next step` | Parent `next` / `waiting_for` in `ai-status.json` (not edited here) | After this helper PR merges, the local `Claude` session writes §4 into the parent's `next` via `ai-status.sh` and repoints `waiting_for` from `Gemini2` to the deploy operator | Done locally after merge, not in this cloud session | Depends on helper PR merge and the local orchestrator run |

## 4. Concrete Unblocked Next Step for Parent Task (`PAX-BUREAU-JOURNEY-COVERAGE-20261018`)

The next step is **not** "resume owner to write more code". The parent waits on the user-designated deploy operator, or on the scheduled release automation that operator owns:

1. **Cut a release that contains `2a7ccb3108b343e2eb6d0a0914a7f5fcfdb47901`.** Cut `publish/v<date>.<N>` + `release/v<date>.<N>` from `2a7ccb310` or a newer `dev` HEAD (currently `ec8472e`). This happens either through the next scheduled `nightly-publish.yml` run (cron `0 3 * * *`, which needs green `ci-integ` on the `dev` HEAD) or through an operator-run `nightly-publish.yml` `workflow_dispatch`.
2. **Deploy that immutable ref with `deploy-dev.yml`.** `nightly-publish.yml` dispatches it automatically. Otherwise the operator runs `deploy-dev.yml` via `workflow_dispatch` with `source_ref=publish/v<date>.<N>`, `release/v<date>.<N>`, or the full SHA. The run must conclude `success` against the live `DEV_GCP_*` target (`drts-dev-devcc-20260825`, `us-central1`), and its `headSha` must contain `2a7ccb310`.
3. **Walk the applicable shared journeys on that same release.** Once deployed, walk them on the hosted shared dev environment: new account, original order, real UI, original screenshots. Backfill each of the original 16 cases as pass, fail, or not run, and record the deploy run ID and release ref as evidence for `pax-bureau-coverage_same-release-hosted-journeys`.
4. **Repoint the parent's `waiting_for`** to that deploy operator (or release automation) instead of `Gemini2`. `Gemini2` already did its job by correcting and reopening the premature completion. Re-request `Gemini2` review only after step 3 produces same-release evidence.
