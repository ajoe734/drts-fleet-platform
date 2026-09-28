# E2E022 history recovery audit

Task: SR-CI-E2E022-DATE-BOUNDARY-20260927-UNBLOCK-HISTORY-REPAIR.
Audit: 2026-09-28 UTC. Owner/reviewer: Codex / Codex2.
Parent owner/reviewer: Gemini / Codex.

The history failure is reproduced and a non-destructive successor path is
rehearsed. **Parent routing and machine-truth updates remain blocked on the
Supervisor.** This report does not approve the parent code or satisfy its
product acceptance. The helper changes only this report.

## Exact history and worktree findings

| Identity                      | Audited value                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| Parent PR                     | [#2190](https://github.com/ajoe734/drts-fleet-platform/pull/2190), OPEN, base `dev` |
| Published branch              | `gemini/sr-ci-e2e022-date-boundary-20260927`                                        |
| Published/local original head | `bfeec848027bc1caa280d39faf0a29bdb0781759`                                          |
| Original branch point         | `585087a2fd8114eaac0eb8a470dfca58e13dfbe4`                                          |
| Invalid ancestor (R5)         | `8d3d8fdd7cc1789914a1ed7f131b46a3c0320b27`                                          |
| Local rewritten branch        | `gemini/sr-ci-e2e022-date-boundary-20260927-local-fix`                              |
| Local rewritten head          | `5d06bbaba9578e65fd718a696be7fedf9641207a`                                          |
| Rewritten branch point        | `0d423092ce8e3dc8347193ec3f0b6be33e4f31c5`                                          |
| Fetched recovery base         | `28d5a1b2d072ade55c74fb0e462f00711596fa25` (`origin/dev`)                           |
| Helper branch point           | `0d423092ce8e3dc8347193ec3f0b6be33e4f31c5`                                          |

Local original head, remote-tracking head, live `git ls-remote` head and PR
head all match `bfeec848…`. No remote `local-fix` ref or PR was found. Neither
parent branch is checked out in any registered worktree at audit time;
`git worktree list --porcelain` lists only this helper for the E2E022 task.
The Supervisor-assigned helper cwd remains unchanged. No parent worktree,
branch or remote ref was modified by this audit.

The precise offending subject is:

```text
fix(e2e): independently validate month coverage and complaint eligibility
```

`tools/ci/git/check_commit_trailers.py` checks every non-merge commit in
`base..head`. Its `SUBJECT_RE` requires the task identifier in the subject;
the offending commit's three body trailers are present. The `commit-trailers`
job in `.github/workflows/ci.yml` fetches `origin/dev` and checks the entire
PR range. A compliant descendant, revert, or merge from `dev` cannot remove
the offending ancestor from that range.

Local command, run against both the original branch point and fetched dev:

```bash
python3 tools/ci/git/check_commit_trailers.py \
  --base 28d5a1b2d072ade55c74fb0e462f00711596fa25 \
  --head bfeec848027bc1caa280d39faf0a29bdb0781759
```

Result: exit **1**, exactly one violation, commit `8d3d8fdd7cc1`.
The same-head [hosted Commit trailers job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36364479716/job/108748049274)
also failed at `2026-09-28T01:05:21Z`; its actual log was read with
`gh api repos/ajoe734/drts-fleet-platform/actions/jobs/108748049274/logs --allow-escape-sequences`.
No bypass label or gate change is proposed.

### The existing local fork is preserved, not a replacement for the published ref

The `local-fix` reflog records creation from `bfeec848…` at `01:10:15Z`,
followed by `rebase (finish)` onto `0d423092…` at `01:10:34Z`.
`git range-diff` maps its six commits to the published six:

| Published commit                           | Local rewritten counterpart                |
| ------------------------------------------ | ------------------------------------------ |
| `8419de2aba93dc18a2a46b432a15cd5502b1833e` | `506a7b48c9bd0401d8431520204a2f8284009317` |
| `9501e8874f15479a5b52dfdc84b6b521419589d1` | `0f58d6d1123f32faa5b28e92a9f9ae5ae46af1ec` |
| `8d3d8fdd7cc1789914a1ed7f131b46a3c0320b27` | `b62063b562ed0b3d81e669b662d9e0bc56352956` |
| `9db3415b08c6431c47b8a16de7fbd1718b7d7fea` | `89ab1be1e27365a72991de46fb0bff42b1407f0a` |
| `adafef433fbeb7c4fd7054bb2783267f61934f04` | `105b79382e1018088358bea631dcb33fe48c3e0b` |
| `bfeec848027bc1caa280d39faf0a29bdb0781759` | `5d06bbaba9578e65fd718a696be7fedf9641207a` |

`git rev-list --left-right --count` for original versus fork is `6 7`:
six original commits versus six rewritten commits plus the newer trunk commit.
The four parent paths have identical blobs in both heads. The whole-tree
diff is the four unrelated files introduced by the fork's newer trunk base
(502 insertions, 3 deletions), not additional E2E022 work. The fork's complete
six-commit range passes the trailer checker, but that does not authorize
replacing the published branch or resolve R2/R6. Preserve both named refs
and PR #2190; do not rebase, amend, reset, force-push, or merge the bad history
into the successor.

## Rehearsed successor path

The source of recoverable work is the **four-file diff from the original
branch point to the published head**, not a whole-tree diff against newer dev:

```text
docs/04-uat/system-remediation-20260906/SR-CI-E2E022-DATE-BOUNDARY-20260927.md
tests/e2e/E2E-022-operations-reporting.sh
tests/e2e/lib/operations-reporting-dates.sh
tests/unit/system-remediation/sr-ci-e2e022-date-boundary-20260927/test-date-logic.sh
```

The new dev changes do not intersect any of those paths. A temporary-index
rehearsal (`GIT_INDEX_FILE`, `git read-tree`, `git apply --cached --check`,
`git apply --cached`, `git write-tree`) on `28d5a1b2…` completed, exit **0**:

- Recovered tree: `968d680c3b327aaa3b4104c231c998d1068a2144`.
- Exactly the four listed paths differ from recovery base; every other path
  retains recovery-base content. All four recovered blobs equal the published
  source and existing local fork.
- Patch SHA-256: `72ed85a68f8c74ba5402ceca466f2723cf98d3b512dce7c6eef125864bdb6d03`.
- An **unpublished diagnostic object**, `ecacb4f54c49090685d18611ed4c775dd1ec18b5`,
  was created with that tree, sole parent `28d5a1b2…`, and a valid helper-task
  message. No ref points to it; it is not a product or review candidate.
  The real checker on its entire replacement range returns **0**, `1 commit(s) OK`.
  `git merge-base --is-ancestor 8d3d8fdd… ecacb4f5…` returns **1**, as required.
- Source `git diff --check` remains **2** for seven existing trailing-whitespace
  lines in the unit script (44, 46, 48, 50, 74, 119, 125). The rehearsal preserves
  the source exactly; Gemini must clean those lines while repairing R2.
- Before/after parent refs, active working tree and real index are unchanged.

Machine-specific evidence is in `.local/history-repair-e2e022/` under the
assigned helper worktree: `rehearse.py`, `rehearsal.json`, `parent.patch`,
`parent-task.json`, `pr2190.json`, `worktrees.txt`, and the two hosted job logs.
The script SHA-256 is `b03f65749f519a40e16ab92d69ac20eece46271fbba54fadf9d17b1d7b5196e7`;
the result SHA-256 is `e78dbd7c8576039dd0c4317c419d635d22d3a9a683335118a5ceeeeb3a34644f`.
These local files are diagnostic evidence, not durable delivery artifacts;
the commands, immutable inputs and results needed to repeat the audit are
recorded here. Git version: 2.43.0; Python: 3.12.3.

### Supervisor routing and original-owner execution

After inspecting the repeated R2 localization below, Supervisor should set the
parent's `execution_branch` to a fresh task-scoped successor, for example
`gemini/sr-ci-e2e022-date-boundary-20260927-successor`, and assign its isolated
worktree to original owner Gemini. `_execution_branch` in
`tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py`
uses this field for owner routing. Check local refs, remote refs, PRs and
worktrees first; reuse an already established successor instead of overwriting
it. Do not switch canonical root. Do not publish the diagnostic object above.

The following recipe is for Gemini **in the clean, Supervisor-routed successor
worktree at the audited recovery base**, not for this helper to mutate product
files. Fetch and re-audit if those inputs have changed:

```bash
set -euo pipefail
RECOVERY_BASE=28d5a1b2d072ade55c74fb0e462f00711596fa25
SOURCE_BASE=585087a2fd8114eaac0eb8a470dfca58e13dfbe4
SOURCE_HEAD=bfeec848027bc1caa280d39faf0a29bdb0781759
SUCCESSOR=gemini/sr-ci-e2e022-date-boundary-20260927-successor
test "$(git branch --show-current)" = "$SUCCESSOR"
test "$(git rev-parse HEAD)" = "$RECOVERY_BASE"
test -z "$(git status --porcelain)"
mkdir -p .local/e2e022-successor
git diff --binary --full-index "$SOURCE_BASE" "$SOURCE_HEAD" \
  > .local/e2e022-successor/parent.patch
git apply --check .local/e2e022-successor/parent.patch
git apply --index .local/e2e022-successor/parent.patch
git diff --cached --name-only
# Verify exactly the four paths above. This preserves known R2/R6 defects.
git commit -m 'wip(SR-CI-E2E022-DATE-BOUNDARY-20260927): preserve source on clean successor' \
  -m "Recovery-Source: $SOURCE_HEAD" -m "Recovery-Base: $RECOVERY_BASE" \
  -m 'LLM-Agent: Gemini' -m 'Task-ID: SR-CI-E2E022-DATE-BOUNDARY-20260927' \
  -m 'Reviewer: Codex'
python3 tools/ci/git/check_commit_trailers.py --base "$RECOVERY_BASE" --head HEAD
git push -u origin "$SUCCESSOR"
```

This is an owner checkpoint, not an accepted candidate. Commit hooks may format
the UAT document; inspect and retain only intended formatting differences.
Then repair R2/R6 in the same parent task and artifact, validate the entire
successor PR range, push normally, and open a successor PR to `dev` linked to
#2190. Supervisor can mark #2190 superseded only after the successor is recorded;
this helper does not close it. Handoff requires local HEAD = remote head = PR
head, a new candidate generation, fresh Codex review and same-SHA hosted CI.

## Findings retained for the parent owner

The latest **complete** independent receipts were read through the canonical
single-task `show`: `worker_outcomes.codex-20260928T002000Z-4c574ad7` (00:27:20Z,
review of `9db3415b…`) and `worker_outcomes.codex-20260928T010326Z-f24019ca`
(01:07:06Z, review of `bfeec848…`, generation `275ae7c9852841d8b1d52f7b9a39d51b`).
Both rejected the candidate. Their detailed production probes are prior-review
evidence, not newly executed tests in this helper. Gemini must preserve those
receipts in the [original candidate UAT artifact](https://github.com/ajoe734/drts-fleet-platform/blob/bfeec848027bc1caa280d39faf0a29bdb0781759/docs/04-uat/system-remediation-20260906/SR-CI-E2E022-DATE-BOUNDARY-20260927.md).

| Finding / acceptance                                        | Source and evidence                                                                                                                                                                     | Disposition / next repair                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1/R3/R4: dates, monthly denominators, sparse category maps | Prior independent production-method probes; latest adjacent candidate changes only UAT document                                                                                         | Prior resolutions retained; recheck on successor. This helper makes no new product-pass claim.                                                                                                                                                                                                                                                                                                                                                                                         |
| R2: repeated ineffective regression                         | Published unit script lines 51–60 invent daily count; 65–97 create result JSON from expected complaints; 100–128 invent coverage. It bypasses real E2E assertions and ReportingService. | **OPEN.** Both adjacent reviews reproduced false-green mutations: `local val=3` to `0`; both expected complaint counts from 1 to 0; helper `SUMMARY_TO_DATE` to `1900-01-01`. All exit 0. Prior sensitivity controls (coverage=0; empty service dates) exit 1. Supervisor must inspect this localization before Gemini resumes.                                                                                                                                                        |
| R2 repair boundary                                          | E2E022 steps 2.0/2.1, 2.2–2.5, 3.5–3.8; actual ReportingService date resolution, monthly complaint eligibility and preview aggregation                                                  | Execute real fixture AND E2E assertion paths with independently specified outcomes or actual production results. Mock external records/HTTP only. Cover daytime, 23:29:59, 23:30:00, midnight, both orders next month, split month/year, one/both complaints crossing. Assert daily 3; demand/assigned 2, completed/cancelled 1; snapshots 3; exact bounds; row/aggregate coverage; preview/job sparse maps; wrong-total failures. Demonstrate old failure/new pass, clean whitespace. |
| R5: invalid published ancestor                              | Local checker exit 1 and hosted job 108748049274 failure; fork reflog/range-diff                                                                                                        | **Path validated; execution pending.** New four-file successor excludes bad ancestry. Never force-push either preserved branch.                                                                                                                                                                                                                                                                                                                                                        |
| R6: misleading UAT history                                  | Published artifact calls `9db3415b…` ACCEPTED and R2/R5 fixed; cites old run 36362884258 for `adafef433…` as current acceptance                                                         | **OPEN.** Restore rejected/failed history and finding/acceptance evidence table in original artifact. Old green runs cannot validate a new successor.                                                                                                                                                                                                                                                                                                                                  |
| `time_boundary_report_fixtures_consistent`                  | Repeated R2 negative controls in adjacent receipts                                                                                                                                      | **UNSATISFIED** until meaningful checked-in regression exists.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `hosted_cross_surface_e2e_pass`                             | Current PR run 36364479746, head `bfeec848…`, job 108748351687                                                                                                                          | **Historical current-head success now observed**, not a successor pass: actual log checks out synthetic merge `2ac6d62` of `bfeec848…` into `0d423092…`; E2E022 runs 01:12:01–09Z, PASS 22 / FAIL 0, job success at 01:12:14Z. Parent remains rejected for R2/R5/R6; successor needs its own run.                                                                                                                                                                                      |

The [cross-surface job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36364479746/job/108748351687)
was already running independently; this helper started no workflow. Both required
parent acceptance keys remain unchanged. No product server, PG, browser,
Playwright, Docker or deployment ran on this VM.

## Machine-truth update blocked: exact Supervisor action

`AI_NAME=Codex <current-release-ai-status.sh> note <parent-id> <recovery-next>`
was attempted and returned **exit 1**:

```text
Dispatched worker cannot mutate a different task
```

The guard is `TaskBoardCommandExecutor._guard_worker_command` in
`tools/development-orchestrator/control_plane/usecases/task_board_commands.py`.
The same guard excludes `assign` from dispatched-worker commands. No dispatch
variables were removed, no actor was impersonated and no state JSON was edited.
The failed parent write is not claimed as accepted; helper `progress` recorded
the rejection through the authorized release CLI.

Before helper handoff/merge, Supervisor must use that release CLI in its own
operator context to persist the following helper metadata (existing `assign`
with `TASK_METADATA_JSON`, preserving owner/reviewer and other fields), and
write the same `resolved_parent_next` as a `note` on the parent:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Claude",
  "resolved_parent_next": "Supervisor inspect repeated R2 localization, then route original owner Gemini to execution_branch gemini/sr-ci-e2e022-date-boundary-20260927-successor from audited dev 28d5a1b2d072ade55c74fb0e462f00711596fa25. Preserve PR2190 at bfeec848027bc1caa280d39faf0a29bdb0781759 and local-fix 5d06bbaba9578e65fd718a696be7fedf9641207a. Apply the four-file diff from 585087a2fd8114eaac0eb8a470dfca58e13dfbe4 to bfeec848 with valid new history. Gemini repairs R2 executable regression and R6 UAT accuracy, then validates full PR range and supplies fresh same-SHA hosted CI and Codex review. Retain both parent acceptance keys. See the history-repair helper artifact."
}
```

`Claude` is the recognized governance lane for the Supervisor coordination
dependency; `Supervisor` is an operator actor, not a valid `waiting_for` lane.
Do not set `resolved_parent_at` manually; the merge transaction owns it.
Do not let helper completion silently move the parent to `todo` before routing.
After the actual routing/scope condition is resolved, Supervisor can explicitly
resume the original parent with that new evidence. An operator receipt and
subsequent `show` must confirm both requested writes before this helper claims
the fourth acceptance item satisfied.

## Helper acceptance and publication

| Helper acceptance                       | Verification                                                                                   | Status                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Identify exact contamination            | Published/fork refs, reflog, range-diff, full-range gate and hosted log above                  | PASS                                                                         |
| Repair or document non-destructive path | Temporary-index exact-content replay; whole new diagnostic range passes; parent refs preserved | PASS for documented/rehearsed path; no product successor published by helper |
| Task-scoped commit/push/PR              | Assigned helper branch, ordinary push, draft PR #2206; publication receipt below               | PASS for checkpoint delivery; no candidate locked                            |
| Update parent with concrete next step   | Current-release parent `note` rejected, exit 1; exact operator fields above                    | BLOCKED pending Supervisor write/readback                                    |

Do not call `done`. Until the operator writes are confirmed, preserve this
report in a scoped commit and draft PR, record `blocker`, and do not lock a
review candidate or claim the helper complete. After confirmation, rerun scoped
document checks, verify local/remote/PR head equality, and hand off the exact
`CANDIDATE_SHA` / `CANDIDATE_BRANCH` to Codex2 through the release CLI.

### Publication and completed local checks

Anchor `ebf2295c34a9a5cfbcb5ad43b107eee7151b2f02` was pushed normally to
`codex/sr-ci-e2e022-date-boundary-20260927-unblock-history-repair` and published
as [draft PR #2206](https://github.com/ajoe734/drts-fleet-platform/pull/2206),
base `dev`. Local, remote and PR head matched at publication. This receipt is
added by a subsequent ordinary commit on the same branch; its exact final
head is recorded in the canonical helper blocker, not as a review candidate.
All report commits carry this helper's task identifier and required trailers.

| Completed check                          | Command / version                                                                        | Result                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Canonical document references and claims | `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD` | Exit 0, all four categories have zero findings                |
| Entire helper commit range               | `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD`            | Exit 0                                                        |
| Helper whitespace                        | `git diff origin/dev...HEAD --check`                                                     | Exit 0; separate from the inherited parent whitespace failure |
| Generated-file staging guard             | `python3 tools/ci/git/check_staged_generated_files.py --staged`                          | Exit 0                                                        |
| Report formatting                        | Prettier 3.8.2 `--write`, then `--check` on this report                                  | Exit 0                                                        |

The first `pnpm exec prettier` attempt failed with `MODULE_NOT_FOUND`: shared
`node_modules/prettier` points into another worktree's missing installation.
Formatting and checking then completed using Node v22.23.2 and the existing
canonical package store binary at
`node_modules/.pnpm/prettier@3.8.2/node_modules/prettier/bin/prettier.cjs`
via its absolute path. No shared dependency link or git hook configuration
was changed. The configured worktree `.husky/_` directory is absent; the
applicable staging, formatting and trailer checks above were run explicitly.

After publication, canonical `show` still reports parent `blocked`, its old
history-recovery request unchanged, no `execution_branch`, and no helper
`resolved_parent_*` fields. Thus the operator dependency is still real.
Automatic PR CI is separate from the completed local checks; no hosted helper
CI result, review approval, merge or parent completion is claimed here.
