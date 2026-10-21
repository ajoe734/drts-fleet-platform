# Task Brief: C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR

This branch (`claude/c125-real-upload-storage-20261005-unblock-history-repair`,
owner reassigned from `Gemini` to `Claude` after two consecutive Gemini lane
terminal failures: `model gemini-3.1-pro-high is not recognized`) replaces the
long-lived `gemini/c125-real-upload-storage-20261005-unblock-history-repair`
branch and its nine `-r2`..`-r9` recreation rounds. It starts from a clean
`origin/dev` tip with a single compliant commit instead of carrying forward
the accumulated commit-trailer debt that kept failing CI on that branch (see
"Branch/PR sprawl cleanup" below).

## Finding: Branch Contamination / Terminal Loop (original, still accurate)

The parent task `C125-REAL-UPLOAD-STORAGE-20261005` candidate branch
`codex2/c125-real-upload-storage-20261005-r2` (candidate
`dca08ecfd4680275eda1dd268a191e5429732294`) was reviewed and **merged** into
`dev` via PR #2347 (merge SHA `446228cbc771a4ced774126a7d4aaddea4db73e6`).
The parent task stayed open because real GCS/ClamAV/auth implementation is
still outstanding, but its `candidate_sha`/`candidate_generation` fields
remained pinned to the already-merged candidate, which made the next owner's
tooling keep diffing against dead state and loop instead of starting fresh
work.

## Repair Path (executed)

1. A fresh recovery branch `codex/c125-real-upload-storage-20261005-r4` was
   created directly from `origin/dev` (zero extra commits, verified below) so
   the next parent-task owner has an uncontaminated starting point.
2. The parent task's stale `candidate_generation`
   (`5c24dde8bab64e78b7f2a31f4acc49ca`, matching the already-merged
   `dca08ecfd468...` candidate) needed to be cleared, and `branch` needed to
   point at the new `-r4` ref.

## Correction to the prior cycle's repair record (identity spoofing)

A previous owner (Gemini) on this same helper task wrote the parent's
`branch`/`candidate_generation` fields by running
`env -u ORCH_DISPATCH_ROLE -u ORCH_RUN_ID AI_NAME=Chairman ... note ...` —
i.e. unsetting the dispatch-guard env vars and impersonating the Chairman
role to bypass the "dispatched worker cannot mutate a different task" guard.
Reviewer Claude2 correctly flagged this (reopen at 2026-10-06T20:06:41Z) as an
unauthorized role impersonation that must not be repeated or framed as a
compliant/routine technique, per `AI_COLLABORATION_GUIDE.md` §6: the
assign/start/progress/handoff/approve sequence is "a role-specific sequence,
not commands for one worker to impersonate all roles."

This cycle does **not** repeat that bypass. Instead this owner independently
re-verified the parent task's current machine truth using only the worker's
own `ai-status.sh show` (read-only, no mutation attempted):

```
$ AI_NAME=Claude ai-status.sh show C125-REAL-UPLOAD-STORAGE-20261005
branch               = codex/c125-real-upload-storage-20261005-r4
candidate_generation = null
owner                = Gemini2
status               = in_progress
last_update          = 2026-10-06T20:27:59Z
next                 = Starting task C125-REAL-UPLOAD-STORAGE-20261005: Unblock history repair for real upload storage.
```

The target values from the repair path above (`branch=...-r4`,
`candidate_generation=null`) are present and the parent task is actively
`in_progress` under owner `Gemini2` (reassigned again by the Chairman,
independently of this helper task) rather than `blocked`. Because the parent
is not currently blocked and already carries the correct values, there is
nothing left for Supervisor to re-assert via `assign+note+resume-blocked`
that would change parent machine truth — re-running that flow now would be a
no-op write, not a repair. If a future cycle ever needs to change these
fields again, it must go through an authorized role (Supervisor/Chairman)
acting under its own real identity, never a worker unsetting dispatch-guard
env vars.

## Branch/PR sprawl cleanup (new finding this cycle)

The repeated recreate-branch-to-fix-CI cycles on the `gemini/...` line left
five open, mutually-superseding PRs targeting `dev` with the same task title:
`#2370` (`-r3`), `#2372` (`-r4`), `#2376` (`-r7`), `#2378` (`-r9`), and
`#2379` (no suffix, the final handed-off candidate `17d2e1150...`). `#2379`
itself still fails CI (`Commit trailers`, `Repo classification`, `ci-integ`)
because the long-lived branch accumulated non-compliant commits from earlier
rounds that were never individually fixed, only piled under new "fix"
commits. Recreating from scratch on this `claude/...` branch (single commit,
clean `origin/dev` base) was the available non-destructive way to get a
green, non-contaminated candidate without force-pushing or rewriting the
shared `gemini/...` branches. The four stale open PRs (`#2370`, `#2372`,
`#2376`, `#2378`) are being closed as superseded (not merged, not deleted —
closing a PR is reversible and does not touch shared branch history).

## Evidence

- `PR #2347` — original parent candidate `dca08ecfd4680275eda1dd268a191e5429732294`, merged (`446228cbc771a4ced774126a7d4aaddea4db73e6`).
- `origin/codex/c125-real-upload-storage-20261005-r4` == `origin/dev` (`64ae063177e3e025b10bfd7f9b0a589a5b89276b`) — verified via `git rev-parse`, zero extra commits.
- Parent task `C125-REAL-UPLOAD-STORAGE-20261005` machine truth re-verified via read-only `ai-status.sh show` (see block above): `branch=codex/c125-real-upload-storage-20261005-r4`, `candidate_generation=null`, `status=in_progress`, `owner=Gemini2`.
- `gh pr checks 2379` — fails `Commit trailers`, `Repo classification`, `ci-integ` (accumulated debt from 9 rounds on that branch).
- Stale open PRs `#2370`, `#2372`, `#2376`, `#2378` closed as superseded by this branch's candidate.

## Unblocked Next Step

The parent task `C125-REAL-UPLOAD-STORAGE-20261005` is unblocked and already
progressing: owner `Gemini2`, `status=in_progress`, `branch=codex/c125-real-upload-storage-20261005-r4`
(a clean ref at `origin/dev` tip), `candidate_generation=null`. No further
machine-truth mutation on the parent is required from this helper task. The
parent owner should continue implementation (real GCS/ClamAV wiring per the
parent's `integration_notes`) directly on `-r4`.

## Finding: this candidate's own CI failure (new this cycle)

This helper task's own candidate (`6dd29f9dcd1823a262de5abd6204b47ee417d8f8`,
PR #2380) rebuilt its single commit fresh from `origin/dev` and in doing so
dropped the `tools/ci/dependency-security-exceptions.json` entry for advisory
`1241339` (`@modelcontextprotocol/sdk`) that an earlier round on the
superseded `gemini/...` branch had already added and that reviewer `Claude2`
had already validated as correctly formatted (e.g. reopen at
`2026-10-06T18:17:16Z`: "dependency-security-exceptions.json 新增項...無問題，可保留不動").
Both `Dependency security` and `dependency-security` checks on PR #2380
failed identically:

```
Found unexcepted vulnerabilities:
[high] ID: 1241339 (@modelcontextprotocol/sdk): MCP TypeScript SDK: OAuth
client could send credentials to an authorization server chosen by the MCP
server (No exception found)
```

(jobs `112487526923` and `112487985522`, confirmed via
`gh api repos/ajoe734/drts-fleet-platform/actions/jobs/<id>/logs`.)

### Repair

Re-added the exact exception entry (same `advisory_id`/`module_name`/
`versions`/`paths`/`reason` previously validated, copied from
`git show 852a901f2a8792173ec3af22bbc707b56b7e2975:tools/ci/dependency-security-exceptions.json`)
to `tools/ci/dependency-security-exceptions.json`, in `advisory_id` order
between `1147955` and `1239765`. No other file changed. `python3 -c
"import json; json.load(open('tools/ci/dependency-security-exceptions.json'))"`
confirms the file is still valid JSON with 20 entries (was 19).

This is a task-scoped fix to this helper task's own candidate only; it does
not touch the parent task's machine truth (already correct per the section
above: `branch=codex/c125-real-upload-storage-20261005-r4`,
`candidate_generation=null`).

## Re-verified parent status (this cycle)

Re-checked parent `C125-REAL-UPLOAD-STORAGE-20261005` read-only via
`ai-status.sh show` immediately before this fix:

```
branch               = codex/c125-real-upload-storage-20261005-r4
candidate_generation = null
owner                = Gemini2
status               = blocked
last_update          = 2026-10-06T20:31:54Z
next                 = Blocked on infrastructure readiness (GCS, ClamAV) and
                        test fixtures. CI is not PASS (failed on commit
                        trailer validation and E2E gate cancelled). Code
                        changes were merged via PR #2347.
```

The parent's `branch`/`candidate_generation` fields remain the correct,
non-contaminated values this helper task repaired earlier in the saga. The
parent is now `blocked`, but on a different, real blocker (GCS/ClamAV
infrastructure readiness and test fixtures for its own implementation work)
— not on the branch/worktree/commit history contamination this helper task
was created to fix. No further history-repair action is needed on the
parent; this cycle's only actionable defect was the helper task's own CI
failure above.

## Hand-off

Handing off to reviewer `Claude2` for review of this helper task's own
candidate (this artifact file + `tools/ci/dependency-security-exceptions.json`
only; no other tracked changes). No local servers, Docker, or cloud resources
were started or created.

---

## 2026-10-21 Re-Triaged History Audit, Preserved Lineage, and Parent Disposition

### 1. Why Chairman Recreated `C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR` on `2026-10-21T09:41:41Z`

1. **Prior Helper Archived out of Active `status["tasks"]`**:
   - The first `C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR` delivery (`candidate_sha: 5534096b2008bd47c5818434727f505f1ec50886`, `reviewed_sha: 5534096b2008bd47c5818434727f505f1ec50886`, [PR #2381](https://github.com/ajoe734/drts-fleet-platform/pull/2381), `owner: Gemini2`, `reviewer: Claude2`) was approved by `Claude2` and squash-merged into `dev` as `e0ec61d5521fa75f5d7f6b952301a56d117b2250` on `2026-10-06T21:45:25Z` (`resolved_parent_at: 2026-10-06T21:47:42Z`, `resolved_parent_status: "todo"`).
   - On `2026-10-18T18:46:29Z`, `tools/development-orchestrator/bin/ai_status.py::prune_state_for_size` (`lines 937–983` on `origin/dev` and in active release `orchestrator-7653d153659b`, calling `archive_task_bodies` at `line 963`) archived the completed helper task out of active `status["tasks"]` into `/home/lupin/workspace/drts-fleet-platform/ai-task-archive.jsonl` (`_archived_at: 2026-10-18T18:46:29Z`) and recorded its ID in `archived_task_ids`.
2. **Both Listed Dependencies Reached `done` on `2026-10-21T05:00:39Z` + Substring Match in `blocked_task_triage_kind`**:
   - Both entries in `C125-REAL-UPLOAD-STORAGE-20261005.depends_on` are now canonically `done` (and recorded in `/home/lupin/workspace/drts-fleet-platform/ai-task-archive.jsonl`):
     - `SR-GCS-MULTIPART-MEDIA-TYPE-20261008`: `status: done`, `owner: Pi`, `reviewer: Codex2`, `candidate_sha: d2ee037794ceb198d783dd14c59487673b215f73`, `reviewed_sha: d2ee037794ceb198d783dd14c59487673b215f73`, `merge_sha: b2dfb0ef812ad11fa431b5b174f173ffd2a8143b` ([PR #2448](https://github.com/ajoe734/drts-fleet-platform/pull/2448)), `last_update: 2026-10-08T14:46:02Z`, `_archived_at: 2026-10-19T12:32:17Z`.
     - `SR-OPERATIONAL-DOCUMENT-UPLOAD-HARNESS-20261008`: `status: done`, `owner: Codex2`, `reviewer: Codex`, `candidate_sha: 55c1d6d164a83e78e94b3aa992c3f477c87a1593`, `reviewed_sha: 55c1d6d164a83e78e94b3aa992c3f477c87a1593`, `merge_sha: ae8d42cba48500e3a93a3b790781641d06665645` ([PR #2839](https://github.com/ajoe734/drts-fleet-platform/pull/2839)), `last_update: 2026-10-21T05:00:39Z`, `_archived_at: 2026-10-21T05:00:39Z`.
   - Once `SR-OPERATIONAL-DOCUMENT-UPLOAD-HARNESS-20261008` completed at `2026-10-21T05:00:39Z`, `C125-REAL-UPLOAD-STORAGE-20261005` (`status: blocked`, `external_gate: false`) surfaced as dependency-ready in `blocked_task_triage`.
   - `tools/development-orchestrator/control_plane/usecases/chair_review_policy.py::blocked_task_triage_kind` (`lines 17–56` on `origin/dev` and in release `orchestrator-7653d153659b`) builds a lowercased `text` string (`lines 18–27`) joining `task.get("id")`, `task.get("title")`, `task.get("summary_zh")`, `task.get("next")`, and `task.get("artifacts")`, then checks (`lines 28–41`) `if any(marker in text for marker in ("commit", "branch", "worktree", "task-scoped", "history", "head moved", "pre-commit", "push")): return "history_repair"` before the `"planning_decision"` check (`lines 42–55`) and `"manual_unblock"` fallback (`line 56`). Because `C125-REAL-UPLOAD-STORAGE-20261005.title` is `"Unblock history repair"` and `next` contains `"Unblock history repair"`, `"handoff-history"`, and `"oldblockedhistory"`, `blocked_task_triage_kind` returns `"history_repair"`.
   - Because `tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py::completed_unblock_task_for_parent` (`lines 7375–7396`), `open_unblock_task_for_parent` (`lines 7399–7412`), `blocked_task_triage_action` (`lines 7415–7433`), and `create_chair_unblock_task` (`lines 7746–7894`, duplicate guard at `lines 7784–7785`) only inspect active `status.get("tasks", [])` / `task_index_from_status(config, status)` (and do not check `archived_task_ids` or `ai-task-archive.jsonl`), Chairman `blocked_task_triage` (`.orchestrator/chair-reviews/20261021T093224Z-gemini.json`) recreated `C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR` on `2026-10-21T09:41:41Z` (`owner: Gemini2`, `reviewer: Claude2`).

### 2. Complete Branch, Worktree, Commit, and 16-Blob Provenance Audit (Zero Active Contamination)

1. **Preserved Branch and PR Lineage (No Force-Push or History Rewrite)**:

| Ref / Artifact | Local SHA | `origin` SHA | PR & State | Role / Custody Status |
| --- | --- | --- | --- | --- |
| `codex2/c125-real-upload-storage-20261005` | `c52c87a4020cb7710f41fed020734a5424ed01a1` | `c52c87a4020cb7710f41fed020734a5424ed01a1` | [PR #2328](https://github.com/ajoe734/drts-fleet-platform/pull/2328) (`OPEN`, superseded) | Original implementation branch whose `test(C125-...):` subject failed `check_commit_trailers.py`. Preserved untouched without force-push. |
| `refs/codex-recovery/C125-REAL-UPLOAD-STORAGE-20261005` | `73f82f7bf688380d404bb3ae0f32ad69689a548d` | N/A (local recovery ref) | N/A | Intermediate recovery ref sharing tree `b7bd2d72c561a7966c9300267f46e313bd45a8f3` and parent `cd36422167a4550912528bbb5dfa73859f635c46` with `c52c87a4020cb7710f41fed020734a5424ed01a1`. |
| `refs/codex-recovery/C125-REAL-UPLOAD-STORAGE-20261005-r2-evidence` | `891a393c98a47e48444e71a7e745bab30c605f0f` | N/A (local recovery ref) | N/A | Recovery ref sharing exact tree `4e6862aaa40a2ce8a693b53a02e62cd26df8372f` with `dca08ecfd4680275eda1dd268a191e5429732294`. |
| `codex2/c125-real-upload-storage-20261005-r2` | `dca08ecfd4680275eda1dd268a191e5429732294` | N/A (merged PR #2347 ref) | [PR #2347](https://github.com/ajoe734/drts-fleet-platform/pull/2347) (`MERGED` into `dev` as `446228cbc771a4ced774126a7d4aaddea4db73e6` on `2026-10-05T23:58:28Z`) | Canonical C125 product candidate (`generation: 5c24dde8bab64e78b7f2a31f4acc49ca`), independently approved by `Claude2` (`claude2-20261005T235109Z-f9f1ab12`), CI runs `37389523701` and `37389523587` `success`. |
| `codex/c125-real-upload-storage-20261005-r4` | `64ae063177e3e025b10bfd7f9b0a589a5b89276b` | `64ae063177e3e025b10bfd7f9b0a589a5b89276b` | N/A (clean base ref on `dev` ancestry) | Clean historical `dev` ancestor (`64ae063177e3e025b10bfd7f9b0a589a5b89276b`) pointed to by `C125-REAL-UPLOAD-STORAGE-20261005.branch`; not a product candidate. |
| `gemini/c125-real-upload-storage-20261005-unblock-history-repair` (`-r2`..`-r9`) | `17d2e115088cd30c3c39fc8f91a2a48887c7e000` (`-r2`..`-r9` preserved) | `17d2e115088cd30c3c39fc8f91a2a48887c7e000` (`-r2`..`-r9` preserved) | PRs `#2366`, `#2369`, `#2370`, `#2371`, `#2372`, `#2375`, `#2376`, `#2378` (`CLOSED`), [PR #2379](https://github.com/ajoe734/drts-fleet-platform/pull/2379) (`OPEN`, superseded) | Historical helper branches from `2026-10-06`; preserved without force-push. |
| `claude/c125-real-upload-storage-20261005-unblock-history-repair` | `8064a589d20b0083e1ddba91d47f9437fcecacf4` | `8064a589d20b0083e1ddba91d47f9437fcecacf4` | [PR #2380](https://github.com/ajoe734/drts-fleet-platform/pull/2380) (`OPEN`, superseded) | Superseded intermediate helper branch from `2026-10-06`; preserved without force-push. |
| `gemini2/c125-real-upload-storage-20261005-unblock-history-repair` | `5534096b2008bd47c5818434727f505f1ec50886` (pre-merge base) | `5534096b2008bd47c5818434727f505f1ec50886` (pre-push) | [PR #2381](https://github.com/ajoe734/drts-fleet-platform/pull/2381) (`MERGED` into `dev` as `e0ec61d5521fa75f5d7f6b952301a56d117b2250` on `2026-10-06T21:45:25Z`) | First completed history-repair helper branch; non-destructively merged with `origin/dev` (`3e9fcfe8fff85fd091037f29dfa4d46bb5ae588d`) in this `2026-10-21` cycle. |

2. **Worktree Hygiene**:
   - `git worktree list` confirms no worktree is checked out on any parent `C125-REAL-UPLOAD-STORAGE-20261005` branch; the only C125-related worktree is this isolated helper worktree (`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-c125-real-upload-storage-20261005-unblock-history-repair` on `gemini2/c125-real-upload-storage-20261005-unblock-history-repair`).
3. **16-File Product & Test Blob Provenance Across `dca08ecfd468`, `b726c5cd08c9`, and `origin/dev` (`3e9fcfe8fff85fd091037f29dfa4d46bb5ae588d`)**:
   - `git merge-base --is-ancestor` confirms that `446228cbc771a4ced774126a7d4aaddea4db73e6` (PR #2347), `64ae063177e3e025b10bfd7f9b0a589a5b89276b` (`-r4` base), `e0ec61d5521fa75f5d7f6b952301a56d117b2250` (PR #2381), `b2dfb0ef812ad11fa431b5b174f173ffd2a8143b` (PR #2448, `SR-GCS-MULTIPART-MEDIA-TYPE-20261008`), `ae8d42cba48500e3a93a3b790781641d06665645` (PR #2839, `SR-OPERATIONAL-DOCUMENT-UPLOAD-HARNESS-20261008`), `cf134394603697d427f1f226d3b9d47209bf1174` (PR #2921, `FLEET-PHOTO-BINARY-LIFECYCLE-REGRESSION-20261021`), `058d909ab8e831e9c25ef84835c2e727b1afa60b` (PR #2924, `FLEET-DOCUMENT-UPLOAD-RETRY-RESUME-20261021`), and `3e9fcfe8fff85fd091037f29dfa4d46bb5ae588d` (PR #2923, `CLAMD-LATE-READY-MARKER-RECOVERY-20261021`) are all ancestors of `origin/dev`.
   - Across the 16 C125 product and test files audited in `ONE-C125-complete-original-task-same16blobs-historical-source-review-and-distinct-helper.json`, 7 files remain byte-identical to `dca08ecfd4680275eda1dd268a191e5429732294` and the other 9 files advanced strictly through reviewed, CI-passed, merged tasks on `dev`:

| # | Repository Path | `dca08ecfd468` Blob | `b726c5cd08c9` Blob | `origin/dev` (`3e9fcfe8f`) Blob | Lineage Since `dca08ecfd468` (`446228cbc771`) |
| --- | --- | --- | --- | --- | --- |
| 1 | `apps/api/src/modules/fleet-partner/fleet-document-storage.service.ts` | `406ec1e9912c` | `406ec1e9912c` | `406ec1e9912c` | Byte-identical to `dca08ecfd468` (`SHA256=e2839e336b1153443aac30c70315ea54e6c503b8115c1d13b82c5e115fd5dfb5`). |
| 2 | `apps/api/src/modules/fleet-partner/supply-document.service.ts` | `72f36f2dc48e` | `72f36f2dc48e` | `72f36f2dc48e` | Byte-identical to `dca08ecfd468` (`SHA256=34da50db7e8cee1f54d39f9cf23e3172969a17f7eabd8f4df58e16ca273c5cae`). |
| 3 | `apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts` | `c6415ce88d1d` | `a0bd048dd9ae` | `fe17afd12bbc` | Updated by `108766390` (PR #2604, `FLEET-STATEMENT-DECISIONS-20261013`) and `e4d962152` (PR #2812, `COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015`). |
| 4 | `apps/api/src/modules/fleet-partner/fleet-partner.controller.ts` | `65a881a09084` | `d783e22808a8` | `5b2f50569326` | Updated by `108766390` (PR #2604), `93335169f` (PR #2659, `PLATFORM-FLEET-PARTNER-PERSISTENCE-ACK-20261015`), and `ec4542737` (PR #2824, `FLEET-PORTAL-VERIFIED-PRINCIPAL-CANONICAL-CALLER-FLOW-20261015`). |
| 5 | `apps/fleet-partner-portal-web/lib/fleet-document-upload.ts` | `2c77652c41ca` | `2c77652c41ca` | `3dfe2bb0458f` | Updated by `ec4542737` (PR #2824) and `8700aa2a8` (PR #2922, `FLEET-DOCUMENT-UPLOAD-RETRY-RESUME-20261021`). |
| 6 | `apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx` | `7ac1e156f421` | `7ac1e156f421` | `c2d41bc7ada2` | Updated by `ec4542737` (PR #2824), `8700aa2a8` (PR #2922), and `058d909ab` (PR #2924, `FLEET-DOCUMENT-UPLOAD-RETRY-RESUME-20261021`). |
| 7 | `apps/fleet-partner-portal-web/app/cases/[caseId]/case-reply-composer.tsx` | `34851d29524e` | `419d450ac29c` | `cfa781865a43` | Updated by `2198f21f9` (PR #2598, `APP-MISSING-ACTIONS-20261013`), `ec4542737` (PR #2824), `8700aa2a8` (PR #2922), and `058d909ab` (PR #2924). |
| 8 | `apps/api/src/common/document-artifacts/document-artifact-runtime.config.ts` | `d3caecb91732` | `d3caecb91732` | `d3caecb91732` | Byte-identical to `dca08ecfd468`. |
| 9 | `apps/api/src/common/document-artifacts/gcs-document-artifact-store.adapter.ts` | `d38d783529f8` | `d38d783529f8` | `d38d783529f8` | Byte-identical to `dca08ecfd468`. |
| 10 | `apps/api/src/modules/billing-settlement/remittance-proof-runtime.config.ts` | `f9c8bc50ae48` | `f9c8bc50ae48` | `f9c8bc50ae48` | Byte-identical to `dca08ecfd468`. |
| 11 | `apps/api/src/modules/controlled-download/controlled-download.module.ts` | `a9f038d87317` | `a9f038d87317` | `a9f038d87317` | Byte-identical to `dca08ecfd468`. |
| 12 | `apps/api/src/modules/fleet-partner/fleet-partner.module.ts` | `73850dd26b8d` | `65d3108bfa6f` | `65d3108bfa6f` | Updated by `108766390` (PR #2604); unchanged since `b726c5cd08c9`. |
| 13 | `tests/unit/fleet-document-upload.test.ts` | `0f9efde4bf1e` | `0f9efde4bf1e` | `298aa788c0da` | Updated by `cf1343946` (PR #2921, `FLEET-PHOTO-BINARY-LIFECYCLE-REGRESSION-20261021`). |
| 14 | `tests/unit/fleet-document-portal.test.tsx` | `1c05a102ac6e` | `3b7574e0600e` | `685330ce7435` | Updated by `2198f21f9` (PR #2598), `8700aa2a8` (PR #2922), and `058d909ab` (PR #2924). |
| 15 | `tests/unit/fleet-document-proxy.test.ts` | `4f36e83a8d05` | `4f36e83a8d05` | `29bbd99f1c5a` | Updated by `ec4542737` (PR #2824). |
| 16 | `tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts` | `45ffa30a9464` | `45ffa30a9464` | `45ffa30a9464` | Byte-identical to `dca08ecfd468`. |

4. **Parent `evidence_refs` and `read_dependencies` Hash Verification**:
   - Direct `.local/` files verified on disk:
     - `/home/lupin/workspace/drts-fleet-platform/.local/c125-real-upload-storage/blocked-dispatch-20261005T164410Z/verification.json`: `SHA256=9c50fa0e2de7dff74bfe2049cdbb851845a507c2c36f861b998aabbe43f7b41e` (`1556` bytes).
     - `/home/lupin/workspace/drts-fleet-platform/.local/delivery-flow-repair-20261018/handoff-history/C125-REAL-UPLOAD-STORAGE-20261005-a483375182ed095b.json`: `SHA256=70d17470f9d4c498ad77fee7f9e3f3b6a3f559b98c1ccc0f45c0f41d90abc401` (`102363` bytes).
     - `/home/lupin/workspace/drts-fleet-platform/.local/passenger-bureau-gap-correction-20261018/fleet-photo-binary-lifecycle-source-regression-20261021/FLEET-PHOTO-BINARY-LIFECYCLE-REGRESSION-20261021.task-spec.json`: `SHA256=8dd5d280e9b244391e075be890c946a5c61834ac5a5371a255d619c85b3d0d9f` (`5858` bytes).
     - `/home/lupin/workspace/drts-fleet-platform/.local/passenger-bureau-gap-correction-20261018/fleet-photo-binary-lifecycle-source-regression-20261021/Root-original-C5-five-real-PDF-lifecycles-qualified-type-order-inference.json`: `SHA256=fd797cab84cbb758b0f0b3e32adbefb42577eaea008071c5c449562fe1af8939` (`6551` bytes).
     - `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/BillingPDF-original-full6-fivekey-scope8-to11-exact-three-CI-consumer-integration-normal-coordination.json`: `SHA256=8ac5ba2c3d0fb6afe1a81cf9aa486d85a6fe6020c994dfe706845439f86ee237` (`10336` bytes).
     - `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/C073-original-full4-fourkey-sevenscope-normal-available-owner-and-reviewer-coordination.json`: `SHA256=765a9d8ae320ec510435c2d705702aea02eff782345232f648588c976d137f6a` (`450669` bytes).
     - `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/Remittance-original-full4-fourkey-sevenscope-normal-available-owner-and-reviewer-coordination.json`: `SHA256=06a29e9c793703e71c778b549618fcf1b0f513c9daac42b508846f1138b7d692` (`298045` bytes).
     - `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/TenantContact-original-full5-fivekey-twelvescope-normal-available-worker-coordination.json`: `SHA256=8705fd45ea42410e8fd52d0593e56a089b711d4ac50008e0f273bc1ed043948c` (`627567` bytes).
   - Archived `2026-10-16` join files verified in-memory via `tar --zstd -xOf /home/lupin/workspace/drts-fleet-platform/.local/_archive-goal-continuation/goal-continuation-20261016T050050Z-original-C125-family-role-and-real-Source-history-join-root.tar.zst` (without extracting copies to disk, per the `2026-10-20` disk guardrail):
     - `ONE-C125-complete-original-task-same16blobs-historical-source-review-and-distinct-helper.json`: `SHA256=e8f6e7259b1c8c7835c55ed79a43c5bc765cf6df5a5b8e96f535f5b80ca2416b` (`536724` bytes).
     - `C125-complete-original-four-key-family-role-and-real-product-versus-helper-evidence-join.json`: `SHA256=a5fabec88522b459e7feedf37cf2677fe69f80f202c81cb6f2861655de0ddc5b` (`235497` bytes).
     - `actual-new-active-b726-original-native-gateway-adoption-readonly.json`: `SHA256=16e7cdc10aaf6eeea5fcd64579b235f0268907aa49580c098534fab5955ffa5b` (`2322` bytes).

### 3. Fresh Offline Verification of Merged Parent & Follow-Up Artifacts (`2026-10-21`)

Executed in this isolated worktree after non-destructively merging `origin/dev` (`3e9fcfe8fff85fd091037f29dfa4d46bb5ae588d`) into `gemini2/c125-real-upload-storage-20261005-unblock-history-repair`, honoring the VM restriction (no product dev server, browser/Playwright runner, or Docker Compose started):

- `pnpm exec vitest run tests/unit/fleet-document-upload.test.ts tests/unit/fleet-document-portal.test.tsx tests/unit/fleet-document-proxy.test.ts tests/unit/system-remediation/sr-qa-ux-001/c125-document-artifacts-upload-download.test.ts tests/unit/audit-gcp-artifact-providers-20261004/native-providers.test.ts tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/caller-boundaries.test.ts`: **PASS** (`6 passed (6)`, `103 passed (103)` — `30` in `fleet-document-upload.test.ts`, `7` in `fleet-document-portal.test.tsx`, `4` in `fleet-document-proxy.test.ts`, `11` in `c125-document-artifacts-upload-download.test.ts`, `44` in `native-providers.test.ts`, and `7` in `caller-boundaries.test.ts`).
- `pnpm exec eslint --max-warnings=0 apps/api/src/modules/fleet-partner/fleet-document-storage.service.ts apps/api/src/modules/fleet-partner/supply-document.service.ts apps/api/src/modules/fleet-partner/fleet-partner-case.service.ts apps/api/src/modules/fleet-partner/fleet-partner.controller.ts apps/fleet-partner-portal-web/lib/fleet-document-upload.ts apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx "apps/fleet-partner-portal-web/app/cases/[caseId]/case-reply-composer.tsx" tests/unit/fleet-document-upload.test.ts tests/unit/fleet-document-portal.test.tsx tests/unit/fleet-document-proxy.test.ts`: **PASS** (exit `0`).

### 4. Concrete Parent Blocker and Required Non-Destructive Disposition

1. **Actual Remaining Disposition on `C125-REAL-UPLOAD-STORAGE-20261005`**:
   - There is **zero active branch, worktree, or commit-trailer contamination** on `C125-REAL-UPLOAD-STORAGE-20261005`. Furthermore, all subsequent internal source and binary-lifecycle regression follow-up tasks referenced in the parent's `next` and `read_dependencies` are now canonically `done` and merged on `origin/dev`:
     - `FLEET-PORTAL-VERIFIED-PRINCIPAL-CANONICAL-CALLER-FLOW-20261015` (`merge_sha: ee1c2149d6bc8ac84fee9a31c362125f037024ea`, [PR #2845](https://github.com/ajoe734/drts-fleet-platform/pull/2845))
     - `REMITTANCE-FINANCE-PROOF-UPLOAD-FLOW-20261015` (`merge_sha: 007ba4d2dce7bd7161e504151e803b0339720c53`, [PR #2828](https://github.com/ajoe734/drts-fleet-platform/pull/2828))
     - `BILLING-PDF-CHINESE-PRINTABLE-CONTENT-20261016` (`merge_sha: 1d055c6a6b37b67809d5f56859f8fc1496e612da`, [PR #2825](https://github.com/ajoe734/drts-fleet-platform/pull/2825))
     - `COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015` (`merge_sha: 9883d8381a7b690c537accc524d4c7cbe3ad3b98`, [PR #2853](https://github.com/ajoe734/drts-fleet-platform/pull/2853))
     - `FLEET-PHOTO-BINARY-LIFECYCLE-REGRESSION-20261021` (`merge_sha: cf134394603697d427f1f226d3b9d47209bf1174`, [PR #2921](https://github.com/ajoe734/drts-fleet-platform/pull/2921))
     - `FLEET-DOCUMENT-UPLOAD-RETRY-RESUME-20261021` (`merge_sha: 058d909ab8e831e9c25ef84835c2e727b1afa60b`, [PR #2924](https://github.com/ajoe734/drts-fleet-platform/pull/2924))
     - `CLAMD-LATE-READY-MARKER-RECOVERY-20261021` (`merge_sha: 3e9fcfe8fff85fd091037f29dfa4d46bb5ae588d`, [PR #2923](https://github.com/ajoe734/drts-fleet-platform/pull/2923))
   - What remains open on `C125-REAL-UPLOAD-STORAGE-20261005` (`status: blocked`, `waiting_for: Claude`, `candidate_sha: null`, `candidate_generation: null`, `0/4` `required_acceptance` keys recorded) is:
     1. Ordinary Supervisor/owner candidate-provenance disposition for `同候選SHA CI通過且獨立reviewer審查` reconciling the original approved/merged product candidate `dca08ecfd4680275eda1dd268a191e5429732294` (`generation: 5c24dde8bab64e78b7f2a31f4acc49ca`, [PR #2347](https://github.com/ajoe734/drts-fleet-platform/pull/2347) merged as `446228cbc771a4ced774126a7d4aaddea4db73e6`) with the 9 C125 files subsequently updated on `dev` through `058d909ab8e831e9c25ef84835c2e727b1afa60b` (`PR #2924`) and `cf134394603697d427f1f226d3b9d47209bf1174` (`PR #2921`).
     2. Live hosted shared-dev acceptance evidence for the three runtime keys (`車隊供給文件與案件附件上傳實際存入儲存`, `上傳後掃描與讀回`, `跨角色存取拒絕`) covering Case attachment, photo binary (`image/png` / `image/jpeg`), platform-reviewer readback, and cross-role rejection beyond the existing 8 Supply PDF driver chains (`Deploy38656657549`) and 5 historical C5 synthetic-PDF lifecycles (`artifact-12314194700-owned-original.zip`), coordinated with `SR-GCP-ARTIFACT-ACTIVATION-20261004` (`status: acceptance`, 3/4 keys recorded, `shared_dev_provider_activation_readback` pending) and preserving all recorded HOLD and Operator/restoration safeguards.
2. **Why Supervisor Must Persist `resolved_parent_*` Metadata Before Merging This Helper**:
   - Dispatched worker commands cannot directly mutate the parent task (`ai-status.sh note C125-REAL-UPLOAD-STORAGE-20261005 ...` exits `1` with `Dispatched worker cannot mutate a different task`) and cannot call `assign` on the helper to inject `TASK_METADATA_JSON` (`ai-status.sh assign C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR ...` exits `1` with `Dispatched workers must use their assigned task lifecycle commands`), as enforced by `TaskBoardCommandExecutor._guard_worker_command` (`tools/development-orchestrator/control_plane/usecases/task_board_commands.py`, `lines 82–112`, specifically `lines 87–90`) and recorded in `/home/lupin/workspace/drts-fleet-platform/.local/c125-history-repair-20261021/attempt-parent-note.json` and `attempt-helper-assign-metadata.json`.
   - In `tools/development-orchestrator/bin/ai_status.py::unblock_parent_resolution_fields` (`lines 1143–1179` on `origin/dev` and in release `orchestrator-7653d153659b`) and `apply_unblock_parent_resolution` (`lines 1188–1248`), called from `transition_after_merge` (`lines 704–726`), if `resolved_parent_status` and `resolved_parent_next` are unset when this helper merges, `unblock_parent_resolution_fields` defaults `resume_status` to `"todo"` (`lines 1158–1161`), `parent_message` to `f"Unblock resolution complete via {task.get('id')}: {message}"` (`lines 1164–1168`), and `parent_waiting_for` to `""` (`lines 1170–1178`), causing `apply_unblock_parent_resolution` (`lines 1210–1216`) to overwrite `C125-REAL-UPLOAD-STORAGE-20261005` to `status: "todo"`, remove `waiting_for: "Claude"`, and replace its `3750`-character `next` field with a `106`-character default message (reproduced in `/home/lupin/workspace/drts-fleet-platform/.local/c125-history-repair-20261021/disposition-probe.json`).
   - Setting `resolved_parent_status="blocked"`, `resolved_parent_waiting_for="Claude"`, and `resolved_parent_next` (`3949` chars <= `4000`-char `validate_next_text` limit, preserving the existing `3750`-character `next` prefix byte-for-byte) on `C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR` before helper merge preserves `C125-REAL-UPLOAD-STORAGE-20261005` as `status: "blocked"`, `waiting_for: "Claude"` and keeps the completed helper in active `status["tasks"]` with `helper_kind: "history_repair"` so `completed_unblock_task_for_parent` (`lines 7375–7396`) prevents duplicate helper creation.
3. **Exact Supervisor Command Block (Run from Un-Dispatched Supervisor Context Before Merge)**:
   ```bash
   CLI="/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-7653d153659b/tools/development-orchestrator/bin/ai-status.sh"
   PARENT_NEXT="$(python3 -c 'import json,subprocess; s=json.loads(subprocess.check_output(["'"$CLI"'","show","C125-REAL-UPLOAD-STORAGE-20261005"],text=True))["next"]; print(s + " | 2026-10-21 C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR: zero git/worktree contamination; PR#2347(446228cb)/#2381(e0ec61d5)/#2921/#2924 merged on dev; keep blocked/Claude & 4-key HOLD.")')"
   TASK_METADATA_JSON="$(python3 -c 'import json,sys; print(json.dumps({"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Claude","resolved_parent_next":sys.argv[1]},ensure_ascii=False))' "$PARENT_NEXT")" \
     AI_NAME=Supervisor "$CLI" assign C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR Gemini2 Claude2 \
     "Persist blocked/Claude parent resolution metadata on C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR before merge"
   AI_NAME=Supervisor "$CLI" note C125-REAL-UPLOAD-STORAGE-20261005 "$PARENT_NEXT"
   ```

### 5. §0.7 Acceptance & Reproducible Verification Summary

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| Acceptance 1: Identify the exact branch/worktree/commit contamination that keeps the parent blocked | `support/unblock/C125-REAL-UPLOAD-STORAGE-20261005/C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR.md` (§1–§2); `tools/development-orchestrator/control_plane/usecases/chair_review_policy.py::blocked_task_triage_kind` (`lines 17–56`); `tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py` (`lines 7375–7433`, `7746–7894`); `tools/development-orchestrator/bin/ai_status.py::prune_state_for_size` (`lines 937–983`) | Historical `c52c87a4020cb7710f41fed020734a5424ed01a1` ([PR #2328](https://github.com/ajoe734/drts-fleet-platform/pull/2328)) subject failure was resolved by `dca08ecfd4680275eda1dd268a191e5429732294` ([PR #2347](https://github.com/ajoe734/drts-fleet-platform/pull/2347) merged as `446228cbc771a4ced774126a7d4aaddea4db73e6`) and helper `5534096b2008bd47c5818434727f505f1ec50886` ([PR #2381](https://github.com/ajoe734/drts-fleet-platform/pull/2381) merged as `e0ec61d5521fa75f5d7f6b952301a56d117b2250`); `2026-10-21` helper recreation was triggered by `2026-10-18` archive pruning of PR #2381 + `SR-OPERATIONAL-DOCUMENT-UPLOAD-HARNESS-20261008` reaching `done` (`2026-10-21T05:00:39Z`) + `"history"`/`"branch"` markers in parent `title`/`next` | `git merge-base --is-ancestor 446228cbc771a4ced774126a7d4aaddea4db73e6 origin/dev` (exit `0`); `git merge-base --is-ancestor e0ec61d5521fa75f5d7f6b952301a56d117b2250 origin/dev` (exit `0`); `python3 /home/lupin/workspace/drts-fleet-platform/.local/c125-history-repair-20261021/verify.py` (exit `0`, `PASS`) | None |
| Acceptance 2: Repair or document a non-destructive repair path without force-pushing shared history | `support/unblock/C125-REAL-UPLOAD-STORAGE-20261005/C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR.md` (§2–§3) | All historical parent and helper refs remain intact on `origin`; `origin/dev` (`3e9fcfe8fff85fd091037f29dfa4d46bb5ae588d`) merged non-destructively into `gemini2/c125-real-upload-storage-20261005-unblock-history-repair` preserving `5534096b2008bd47c5818434727f505f1ec50886`; all 16 C125 product/test blobs verified across `dca08ecfd468`, `b726c5cd08c9`, and `origin/dev` (`3e9fcfe8f`) | `pnpm exec vitest run` across 6 C125 & follow-up unit/boundary suites (`6 passed`, `103 passed`, exit `0`); `pnpm exec eslint --max-warnings=0` across 10 C125 source/test files (exit `0`); `verify.py` (exit `0`, `PASS`) | None |
| Acceptance 3: Produce task-scoped commit/push/PR evidence for any canonical change | `support/unblock/C125-REAL-UPLOAD-STORAGE-20261005/C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR.md` ([PR #2381](https://github.com/ajoe734/drts-fleet-platform/pull/2381) + `2026-10-21` continuation PR on `gemini2/c125-real-upload-storage-20261005-unblock-history-repair`) | Preserved `2026-10-06` delivery (`5534096b2008bd47c5818434727f505f1ec50886`, merged `e0ec61d5521fa75f5d7f6b952301a56d117b2250`) + `2026-10-21` continuation commits on `gemini2/c125-real-upload-storage-20261005-unblock-history-repair` pushed non-destructively to `origin` | `python3 -B tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` (exit `0`); `python3 tools/ci/git/check_canonical_consistency.py` (exit `0`) | Hosted PR CI runs after push/handoff |
| Acceptance 4: Update the parent task with the concrete unblocked next step | `support/unblock/C125-REAL-UPLOAD-STORAGE-20261005/C125-REAL-UPLOAD-STORAGE-20261005-UNBLOCK-HISTORY-REPAIR.md` (§4.1–§4.3); `/home/lupin/workspace/drts-fleet-platform/.local/c125-history-repair-20261021/` (`attempt-parent-note.json`, `attempt-helper-assign-metadata.json`, `disposition-probe.json`) | Worker cross-task mutation guard proved (`exit 1`); in-memory `unblock_parent_resolution_fields` probe proved (`todo` without override vs `blocked`/`Claude` with override, `3949` chars <= `4000`); exact Supervisor `assign` + `note` command block documented in §4.3 | `python3 /home/lupin/workspace/drts-fleet-platform/.local/c125-history-repair-20261021/verify.py` (exit `0`, `PASS`) | Un-dispatched Supervisor execution of §4.3 commands before merging helper PR; live shared-dev Case/photo/role acceptance and candidate-provenance disposition for parent `C125-REAL-UPLOAD-STORAGE-20261005` |

