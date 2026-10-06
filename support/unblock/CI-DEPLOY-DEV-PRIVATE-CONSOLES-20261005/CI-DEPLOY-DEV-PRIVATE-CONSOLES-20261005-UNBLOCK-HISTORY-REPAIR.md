# CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005 branch/commit history repair (2026-10-06)

Task: `CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005-UNBLOCK-HISTORY-REPAIR`;
owner: Claude2; reviewer: Pi. Scope: identify the exact branch/worktree/
commit contamination that keeps the parent
`CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005` blocked, and repair it
non-destructively. No parent lifecycle command (`reopen`, `handoff`,
`approve`, `note`) is executed by this helper — a dispatched worker is
structurally barred from mutating a different task (confirmed empirically
below), so the parent update is handed to Supervisor as a documented next
step, per `AI_COLLABORATION_GUIDE.md` and prior precedent
(`SEC-INTERNAL-KEY-WIF-MIGRATION-20260930-UNBLOCK-HISTORY-REPAIR`).

## Finding: no branch/worktree/commit contamination exists

Exhaustively checked every surface the chairman's generic blocked-task
triage flags as a possible `history_repair` case, and found the parent's
git/PR/worktree history **clean**:

| Check | Command | Result |
| --- | --- | --- |
| PR history for the task branch | `gh pr list --head claude2/ci-deploy-dev-private-consoles-20261005 --state all` | Exactly two PRs, both cleanly `MERGED`, in order: **#2318** (`headRefOid 6911eca72…` → `mergeCommit a7b406dca…`) then **#2331** (`headRefOid 13656eb148…` → `mergeCommit f8725220d0ee67e90b185cf0dd339b250bcb3d2b`). This is the expected two-candidate-generation pattern — #2318's deployed candidate hit a live defect (channel-statement-download losing its identity-token header), the owner fixed it in commits `3678e93b3`/`13656eb14818` on the *same* branch, and #2331 carried that fix to a second clean merge. No orphan commits, no duplicate open PRs, no unreviewed pushes after either merge. |
| Branch head vs merge history | `git log --oneline origin/claude2/ci-deploy-dev-private-consoles-20261005 -5` | `13656eb14 … 3678e93b3 … 6911eca72 … ff28a94e6 … 91096f891` — a single linear sequence, matches the PR #2331 head exactly. |
| Ancestor confirmation | `git log origin/dev --oneline \| grep f8725220d` | `f8725220d [ReviewBus] CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005 … (#2331)` — present directly in `origin/dev` history (currently 10+ commits ahead, HEAD `afdb1ca1f`). |
| Live worktree state | `git worktree list` | No live worktree remains for `claude2-ci-deploy-dev-private-consoles-20261005` (the owner's original task branch) — only this helper's own isolated worktree exists. Supervisor already reaped it after handoff/merge, as expected. |
| Candidate-lifecycle fields | `ai-status.sh show CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005` | `candidate_sha` = `reviewed_sha` = `ci_sha` = `13656eb14818edc0c9ed85358d360e2fa588c764`; `merge_sha` = `f8725220d0ee67e90b185cf0dd339b250bcb3d2b`; `ci_status: success`. All four fields agree with each other and with the PR #2331 record above — no stale or mismatched pointer. |

**Conclusion: this parent was never actually blocked by git/branch/worktree/
commit contamination.** The chairman's triage appears to have classified it
as `history_repair` purely from the symptom (many consecutive identical
`acceptance_ready_dispatch` re-wakes with `status: blocked`), which is also
the symptom of genuine contamination cases — but the parent's own
`worker_outcomes` log (22+ `progress` notes between 2026-10-05T16:03Z and
19:02Z, then one `blocker` at 19:05:15Z) already correctly diagnosed the
real cause each time: `required_acceptance` item `真實deploy-dev綠燈` (a real
green `deploy-dev` run against the merged SHA) is an **operational gate**,
not a candidate defect, and dispatching it is reserved for Supervisor
(the task's own acceptance text item 4 bars the owner from triggering
deploys, touching GitHub variables/IAM, or starting local services).

## What has actually happened to that gate since (new information this helper adds)

The parent's last recorded note (19:05:15Z, 2026-10-05) still described zero
`deploy-dev` runs against `f8725220d0ee` or any later commit. That is no
longer true. Re-checked fresh via `gh run list --workflow=deploy-dev.yml
--json databaseId,headSha,event,createdAt,status,conclusion` at
2026-10-06T14:3xZ: three runs have since executed against commits that
contain `f8725220d0ee` (confirmed ancestor), all `conclusion: failure`, but
**none of the three failures is this task's own defect**:

| Run | Created | headSha | Failed job | Root cause |
| --- | --- | --- | --- | --- |
| `37388832670` | 2026-10-05T23:30:05Z | `b20895a17` | `Build & push images` (enterprise-dispatch-web) | `Module not found: Can't resolve '../../../../../tenant-console-web/lib/auth/route-handlers'` — the pre-existing cross-app-import defect tracked and fixed separately by `CI-BUILD-CROSS-APP-IMPORT-20261005` (not present in this task's own diff). |
| `37444766932` | 2026-10-06T09:42:04Z | `446228cbc` | `Build & push images` (enterprise-dispatch-web) | Identical failure signature to the run above — same unfixed cross-app-import defect (this commit predates the fix). |
| `37475493998` | 2026-10-06T14:01:25Z | `afdb1ca1f` (current `origin/dev` HEAD, **includes** the cross-app-import fix, PR #2355) | `Deploy services` → `Deploy — api` | `Build & push images` and `DB migration` both **succeeded** this time (confirming the cross-app-import fix holds). The `api` Cloud Run deploy itself failed: *"The user-provided container failed to start and listen on the port defined provided by the PORT=3001 environment variable within the allocated timeout."* This is a live Cloud Run runtime/health-check timeout on the `api` service, unrelated to any of the four private-console identity-token wiring this task added (that wiring only touches `deploy-dev.yml`'s console health-check/acceptance steps and the four console apps' own auth handling, not the `api` service's own startup path). |

None of these three failures originates in this task's merged diff. The
first two are a separate, already-identified-and-fixed defect
(`CI-BUILD-CROSS-APP-IMPORT-20261005`, merged as `afdb1ca1f` after both
failing runs). The third is a fresh, apparently transient Cloud Run
container-startup timeout on the unrelated `api` service, surfacing only
*after* the build-blocking defect was cleared — i.e., this is the first
`deploy-dev` attempt against this task's merged code to get far enough to
even reach the `api` deploy step. No repair action against this task's own
code is indicated; a retry `workflow_dispatch` against current `origin/dev`
HEAD (or later) is the natural next attempt, and if the `api` startup
timeout recurs it is a new, separate operational issue for its own task, not
a `CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005` regression.

## Non-destructive repair performed

None was needed or possible for git history — there is nothing to repair.
No force-push, rebase, reset, cherry-pick, or branch/worktree surgery was
performed or required. This document is the sole helper deliverable.

## Checks performed in this helper (all read-only against the parent's history)

- `gh pr view 2331 --json state,mergeCommit,mergedAt,headRefOid` — exit 0.
- `gh pr list --head claude2/ci-deploy-dev-private-consoles-20261005 --state all --json number,state,headRefOid,mergeCommit` — exit 0, both #2318 and #2331 enumerated above.
- `git fetch origin`, `git log origin/dev --oneline`, `git log --oneline origin/claude2/ci-deploy-dev-private-consoles-20261005 -5` — exit 0.
- `git worktree list` — exit 0, confirmed no stray worktree.
- `gh run list --workflow=deploy-dev.yml --limit 15 --json databaseId,headSha,event,createdAt,status,conclusion` — exit 0.
- `gh run view <id> --json jobs` and `gh run view <id> --log-failed` for all three post-merge `deploy-dev` runs — exit 0, failure root causes extracted and quoted above.
- No product code, workflow file, or test was modified. No `product`/local
  services/Docker/Playwright were started, per VM guardrails.

## Delivery and parent next step

This file is the only change in this helper's candidate; its task-scoped
commit and a normal (non-force) push go to
`claude2/ci-deploy-dev-private-consoles-20261005-unblock-history-repair`,
handed off to reviewer Pi as `CANDIDATE_SHA`/`CANDIDATE_BRANCH` per the
candidate lifecycle — no `done` is claimed directly.

Confirmed empirically (as the precedent helper above also found) that a
dispatched worker cannot write to the parent task directly:

```
$ AI_NAME=Claude2 bash .../ai-status.sh note CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005 "..."
Dispatched worker cannot mutate a different task   # exit 1
```

**Action needed (Supervisor-privileged, outside this dispatch):**

```
TASK_METADATA_JSON='{"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Codex","resolved_parent_next":"<next step below>"}' \
  AI_NAME=Supervisor ORCH_STATUS_ROOT=$PWD python3 tools/development-orchestrator/bin/ai_status.py assign \
  CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005-UNBLOCK-HISTORY-REPAIR Claude2 Pi
AI_NAME=Supervisor ORCH_STATUS_ROOT=$PWD python3 tools/development-orchestrator/bin/ai_status.py note \
  CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005 '<next step below>'
AI_NAME=Supervisor ORCH_STATUS_ROOT=$PWD python3 tools/development-orchestrator/bin/ai_status.py resume-blocked \
  CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005-UNBLOCK-HISTORY-REPAIR in_progress \
  'History-repair helper found no contamination; parent updated directly via note.'
```

The concrete next step, to go in both the `assign` metadata and the `note`
call above:

1. No git/branch/worktree/commit contamination exists on
   `CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005` — PR #2318 and PR #2331 both
   merged cleanly in sequence; `f8725220d0ee` is a confirmed ancestor of
   `origin/dev`; no orphan commits or stray worktrees. The repeated
   `acceptance_ready_dispatch` re-wakes were caused solely by `deploy-dev`
   not having run yet against the merged SHA, not by any history defect.
2. Three `deploy-dev` runs have since executed against commits containing
   `f8725220d0ee` (`37388832670`, `37444766932`, `37475493998`), all
   `conclusion: failure`, but none for a defect in this task's own diff: the
   first two hit the separate, now-fixed `CI-BUILD-CROSS-APP-IMPORT-20261005`
   build defect; the third (`37475493998`, against current `origin/dev` HEAD
   `afdb1ca1f`, which includes that fix) got past build and DB migration and
   failed only on the unrelated `api` Cloud Run service's own container
   health-check/listen timeout.
3. Supervisor should `workflow_dispatch` `deploy-dev.yml` again with
   `source_ref` = current `origin/dev` HEAD (or any later commit) and record
   the result as `acceptance_evidence` for `真實deploy-dev綠燈`. If the `api`
   startup timeout recurs, that is a new operational defect unrelated to
   `CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005`'s own identity-token wiring and
   should be tracked as its own task rather than reopening this one.
4. `required_acceptance` items `四個私有網站的健康檢查與營運驗收改用身分token`
   and `同候選SHA CI通過且獨立reviewer審查` remain fully evidenced and
   unchanged (identity-token wiring in `deploy-dev.yml`; CI runs
   `37334127381`/`37334127377` SUCCESS; independent Codex approval on
   `13656eb14818`). Only `真實deploy-dev綠燈` is outstanding, and it requires
   the Supervisor-dispatched retry in step 3 above, not further owner/reviewer
   code changes.
