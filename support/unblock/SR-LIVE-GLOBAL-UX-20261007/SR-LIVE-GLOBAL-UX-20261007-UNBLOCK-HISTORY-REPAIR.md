# SR-LIVE-GLOBAL-UX-20261007 — history audit and safe routing recovery

- Task: `SR-LIVE-GLOBAL-UX-20261007-UNBLOCK-HISTORY-REPAIR`
- Owner / reviewer: Codex2 / Claude2
- Branch: `codex2/sr-live-global-ux-20261007-unblock-history-repair`
- Audited at: 2026-10-07 15:19 UTC; fetched `origin/dev` and worker base:
  `b81c9f096da71330db9714a5c6c2691d85fb680d`.
- Delivery scope: this artifact only. Product, harness, acceptance requirements,
  published parent commits and control-plane implementation are unchanged.
- Disposition: preserve the parent's **blocked** status and merged candidate.
  Supervisor completed the parent-note and both helper-metadata writes at
  15:50 UTC; the resumed audit below verifies their receipts and readback.
  The draft hold is resolved; hand off the final published full SHA to Claude2.
  Document delivery is not live acceptance.

## H1 — no branch or content contamination found

The task's contamination premise does not match the audited Git evidence:

| Object                                                                                               | Observed identity / result                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Parent candidate, local branch, retained remote-tracking ref, PR #2396 head, reviewed SHA and CI SHA | `555a7f697f1a8aad07c56ceab2b1d836f7903313`                                                                                                |
| Parent merge, [PR #2396](https://github.com/ajoe734/drts-fleet-platform/pull/2396)                   | `e7e6b85f98561e6b419d198c657018e038f2eefe`; merged 08:24:22 UTC                                                                           |
| Parent branch base / merge-base                                                                      | `2467f88a2e64ccc2204bb99f1356fdeb997bda13`                                                                                                |
| Local versus retained remote-tracking parent branch                                                  | `git rev-list --left-right --count`: `0 0`                                                                                                |
| Live remote parent branch                                                                            | `git ls-remote --heads origin codex2/sr-live-global-ux-20261007`: empty, exit 0; tracking ref is stale, not proof of a live remote branch |
| Parent scoped content                                                                                | All 12 added paths have identical Git blobs at candidate, merge and audited `origin/dev`                                                  |
| Parent merge reachability                                                                            | `git merge-base --is-ancestor <merge> origin/dev`: exit 0                                                                                 |
| Parent/planning worker directories                                                                   | Neither old directory exists or appears in `git worktree list`; both local branch refs still preserve their commits                       |
| Current helper                                                                                       | Correct assigned isolated worktree; clean on entry; starts at fetched dev; no existing helper PR before this delivery                     |

The six parent commits are, oldest first:
`897b83834a2fd48bc2c238f03035726509506c54`,
`d0b93b7d64ed9acab9e046da0b1b8263e8d81719`,
`0fa7d8d8376bf0ed25f0daa34abe09e8f951ac83`,
`c3aa059be2e18964a5e874e632023f227c9425f9`,
`405cf50140beefe07c45c30c7608a6b1207dd761`, and
`555a7f697f1a8aad07c56ceab2b1d836f7903313`.
All belong to the parent task; its reflog records ordinary commits/pushes with
no rebase/reset entries. The merge is a squash commit with one parent, so the
candidate itself need not be an ancestor of dev. Compare scoped blobs and the
PR merge record, not whole-tree two-dot diffs against newer dev.

The shared Git configuration currently names Gemini2, and the six parent
commits have that author despite correct `LLM-Agent: codex2` task trailers.
This is a pre-existing attribution discrepancy, not evidence of foreign file
changes or a blocked push. Preserve it rather than amending published history.
This helper uses command-scoped Codex2 Git identity without changing shared
configuration. Remote branch absence after merge is consistent with
[branch strategy §10](../../../docs/ops/branch-strategy.md#10-branch-hygiene).
No branch recreation, merge, cherry-pick, reset, stash or force push is needed.

## H2 — routing disposition contradicts the reviewed decision

[PR #2407](https://github.com/ajoe734/drts-fleet-platform/pull/2407) merged
planning candidate `79c15b81b06b9addf4b0a188d6885109fb74017f` as
`b81c9f096da71330db9714a5c6c2691d85fb680d` at 14:24:07 UTC.
[SD-DP-20261007-001](../../../docs/01-decisions/SD-DP-20261007-001-live-global-ux-acceptance-provisioning.md)
and the [original helper ledger](SR-LIVE-GLOBAL-UX-20261007-UNBLOCK-PLANNING-DECISION.md)
explicitly required `resolved_parent_status=blocked` before merge.

Planning-helper machine truth at the initial 15:19 audit instead said:

```json
{
  "status": "done",
  "resolved_parent_status": "todo",
  "resolved_parent_at": "2026-10-07T14:26:21Z",
  "resolved_parent_next": "Unblock resolution complete via SR-LIVE-GLOBAL-UX-20261007-UNBLOCK-PLANNING-DECISION: GitHub reconciled candidate 79c15b81b06b from PR #2407."
}
```

The parent is blocked again at `2026-10-07T14:30:50Z` awaiting Claude2.
Its same-SHA review/CI/merge and only recorded acceptance key
`reviewed_same_sha_global_ux_harness` are preserved.
`bin/ai_status.py::apply_unblock_parent_resolution` in active release
`orchestrator-d4cb3eb62a8d` defaults missing disposition metadata to `todo`.
This explains the recorded default resolution; document prose alone did not
establish the required machine disposition.

## H3 — reproduce the misleading history classification

The actual release function
`tools/development-orchestrator/control_plane/usecases/chair_review_policy.py::blocked_task_triage_kind`
scans `next` and other text for substrings before considering other classes.
The parent's `next` contains both `history` (retaining old CI evidence) and
`worktree` (an evidence path). Either is sufficient for `history_repair`.
The release file SHA256 is
`d3233764f03c0454ac684d43a547e5ce4353a0e80c13cb071f78a6a26351b6f0`.

Minimal repository-safe reproduction, calling the real function:

```bash
PYTHONPATH=/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-d4cb3eb62a8d/tools/development-orchestrator \
python3 -B -c 'from control_plane.usecases.chair_review_policy import blocked_task_triage_kind as classify
original = {"id": "UX-ACCEPTANCE", "next": "Operator provisioning is pending; old CI history retained."}
control = {**original, "next": "Operator provisioning is pending; old CI evidence retained."}
assert classify(original) == "history_repair"
assert classify(control) == "manual_unblock"
print(classify(original), classify(control))'
```

Observed exit 0: `history_repair manual_unblock`; the initial parent snapshot
also returned `history_repair`. This proves the policy false positive, not the
chairman's private reasoning: `create_unblock_task` also accepts an explicitly
requested kind. No claim is made that the exact chair action used the fallback.
No classifier fix was made. A future control-plane repair needs Supervisor's
conflict/scope coordination; cover genuine divergent branches as positives and
historical references/evidence paths on merged acceptance tasks as negatives.

## Non-destructive recovery and concrete next step

1. Supervisor corrects **both** helpers' disposition metadata to `blocked`
   and writes the parent note using the current release CLI. Preserve recorded
   `resolved_parent_at` for the completed planning helper; do not forge a new
   resolution timestamp, recreate its candidate, or reopen the merged parent.
2. Read back both helpers and the parent. The parent must remain blocked with
   the original candidate/review/CI/merge and four required acceptance keys;
   only harness readiness is recorded. This helper's metadata must already
   retain the blocked disposition when it eventually merges.
3. Codex2 verifies published local/remote/PR head equality and hands off this
   helper to Claude2. Reviewer verifies H1–H3 and the routing readback before
   approval. Until step 1 succeeds, retain a draft PR and machine blocker.
4. Claude2 coordinates Operator provisioning and approved hosted execution
   under the existing [parent UAT contract](../../../docs/04-uat/system-remediation-20260906/SR-LIVE-GLOBAL-UX-20261007.md).
   No implementation reopen is implied. CI-INTEG-01 remains old failure
   evidence; current PR #2396 integration passes, not proof that its old flaky
   assertion was repaired.

Supervisor-only command block, to run in its own operator context (not by
clearing this worker's dispatch identity):

```bash
STATUS_CLI=/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-d4cb3eb62a8d/tools/development-orchestrator/bin/ai-status.sh
HISTORY_ID=SR-LIVE-GLOBAL-UX-20261007-UNBLOCK-HISTORY-REPAIR
PLANNING_ID=SR-LIVE-GLOBAL-UX-20261007-UNBLOCK-PLANNING-DECISION
PARENT_ID=SR-LIVE-GLOBAL-UX-20261007
PARENT_NEXT='SD-DP-20261007-001 remains authoritative: preserve merged harness candidate 555a7f697f1a8aad07c56ceab2b1d836f7903313, review/CI, merge e7e6b85f98561e6b419d198c657018e038f2eefe and all four acceptance keys. No implementation reopen. Claude2 coordinates Operator provision of protected shared-dev-acceptance environment, approved 18 app-role sessions and authoritative readbacks via GLOBAL_UX_SESSIONS_JSON, workflow promotion via the existing release lifecycle, approved complete recipe bundle and named keyboard/screen-reader/contrast/design-mapping evidence; then authorized hosted execution against one immutable runtime. The three live/manual acceptance keys remain open. Existing successful integration does not resolve the earlier CI-INTEG-01 diagnosis.'
DISPOSITION=$(jq -cn --arg next "$PARENT_NEXT" '{resolved_parent_status:"blocked",resolved_parent_waiting_for:"Claude2",resolved_parent_next:$next}')
AI_NAME=Supervisor TASK_METADATA_JSON="$DISPOSITION" "$STATUS_CLI" assign "$HISTORY_ID" Codex2 Claude2
AI_NAME=Supervisor TASK_METADATA_JSON="$DISPOSITION" "$STATUS_CLI" assign "$PLANNING_ID" Claude2 Claude
AI_NAME=Supervisor "$STATUS_CLI" note "$PARENT_ID" "$PARENT_NEXT"
"$STATUS_CLI" show "$HISTORY_ID"
"$STATUS_CLI" show "$PLANNING_ID"
"$STATUS_CLI" show "$PARENT_ID"
```

The worker attempted the substantive parent `note`: exit 1,
`Dispatched worker cannot mutate a different task`. It also attempted own-task
`assign` with blocked disposition metadata: exit 1,
`Dispatched workers must use their assigned task lifecycle commands`.
These are active-release dispatch guards, not missing user authorization.
No guard was bypassed and no machine-truth file was edited directly.
Own-task `start` and `progress` succeeded and requested Supervisor action.

The initial audit's read-only GitHub queries found no `shared-dev-acceptance`
environment, no `GLOBAL_UX_SESSIONS_JSON` in the repository secret-name
inventory, zero `global-ux-input` artifacts and zero workflow-dispatch runs.
Secret values were not accessed; organization-level secret availability was
not inferred from the repository inventory. Workflow promotion, approved
recipes and named human evidence remain requirements of the existing decision;
this audit did not revalidate every external prerequisite or dispatch a run.

## §0.7 initial verification ledger (15:19–15:33 UTC)

These rows preserve the initial audit, including the then-open routing blocker.
The resumed verification below supersedes that blocker and draft hold.

Machine-local evidence directory:
`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-sr-live-global-ux-20261007-unblock-history-repair/.local/sr-live-global-ux-history-repair`.
`verification.json` SHA256:
`cce7e951ca99501b78ebf1310a3d39aab68528cd2ffa291a8e7492296b2ac718`.
It records snapshots/hashes, full commit identities, per-file blob equality
and the real-function probe. `probe.py` reads only task slices and Git/GitHub
evidence; it does not write canonical state. Old parent worktree evidence
paths no longer exist; this audit does not claim to have reread those files.
The essential observations and minimal probe are preserved in this artifact.

| Finding / acceptance                           | Source and check                                                                    | Previous → this delivery                                                                            | Result / remaining limitation                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Identify exact contamination (H1)              | PR #2396; refs/reflog; all 12 candidate/merge/dev blobs; local `probe.py`           | Assumed divergent/contaminated history → no such contamination found                                | PASS, exit 0; metadata attribution discrepancy preserved, no rewrite                       |
| Non-destructive recovery (H2/H3)               | Release classifier; `apply_unblock_parent_resolution`; decision and two task slices | Wrong `todo` disposition and text classifier false positive → exact diagnosis and operator commands | Probe PASS, exit 0; routing correction PENDING Supervisor, classifier unchanged            |
| Task-scoped commit/push/PR                     | This single artifact; exact local/remote/PR heads                                   | New canonical evidence delivery                                                                     | Publication/check results below; draft until routing readback                              |
| Update parent with concrete next step          | Current-release parent `note` and helper `assign`                                   | Attempts rejected by dispatch scope guards                                                          | BLOCKED, both exit 1; own-task progress routes required Supervisor action                  |
| Parent harness acceptance                      | Same candidate/review/CI `555a7f697f1a8aad07c56ceab2b1d836f7903313`; PR #2396       | Recorded → preserved                                                                                | Readback PASS; no new product acceptance claimed                                           |
| Parent same-release role/screen/state coverage | Parent UAT / approved sessions and recipe contract                                  | Pending → pending                                                                                   | Hosted execution not run; Operator sessions, fixtures/readbacks, approved recipes required |
| Parent accessibility evidence                  | Parent UAT manual and browser contract                                              | Pending → pending                                                                                   | No VM browser/server/DB/Compose; real named tester/AT evidence required                    |
| Parent locale/design mapping                   | Parent UAT source/runtime/plan mapping                                              | Pending → pending                                                                                   | Real same-release bilingual/manual evidence required                                       |

## Initial publication and checks (candidate not yet handed off)

- Anchor `82dfbfeec` adds only this artifact, with the task/owner/reviewer
  trailers; normal push created the helper branch. Draft
  [PR #2412](https://github.com/ajoe734/drts-fleet-platform/pull/2412) targets
  `dev`; the anchor local/PR head matched before this evidence update.
- `check_canonical_consistency.py --ci --base b81c9f096da71330db9714a5c6c2691d85fb680d --head HEAD`:
  exit 0, zero findings. `check_commit_trailers.py` on the same range: exit 0.
  `check_staged_generated_files.py --staged` and `git diff --check`: exit 0.
  All four local relative links resolve; Prettier check exits 0.
- Initial `pnpm exec prettier --write` failed with `MODULE_NOT_FOUND`: the
  inherited shared `node_modules/prettier` symlink targets a removed worker.
  The intact pinned Prettier 3.8.2 package at
  `/home/lupin/workspace/drts-fleet-platform/node_modules/.pnpm/prettier@3.8.2/node_modules/prettier/bin/prettier.cjs`
  ran successfully via `node`. Shared dependencies/config were not modified.
  This worktree has no generated `.husky/_` hooks; the applicable staged,
  formatting and commit-trailer checks were run explicitly.
- The follow-up evidence commit is append-only. Its full SHA, normal-push
  result and local/live-remote/PR equality are recorded in the task's machine
  blocker and local `delivery-verification.json` / `publication.json`, avoiding
  a self-referential commit hash in this file. Hosted CI is separate from local
  documentation checks and must match the final head before approval.
- At the initial closeout, parent-note and metadata writes remained pending
  Supervisor. No candidate
  handoff, approval, merge, deployment or live/manual pass is claimed. After
  the routing readback, use the then-verified `CANDIDATE_SHA=$(git rev-parse HEAD)`
  and `CANDIDATE_BRANCH=$(git branch --show-current)` with PR #2412 to hand off
  to Claude2; do not call `done`.

## Resumed verification and handoff (2026-10-07 15:53 UTC)

Supervisor resumed this helper after recording the required operator writes.
This is the original owner's continuation of PR #2412 from published head
`6ec56f063e06540d182416cb8506610d81ff6fb0`, not a reviewer rejection or a new
implementation candidate for the parent. No helper review/reopen has occurred.

### Operator receipts and machine-truth readback

The canonical-root receipt file is
`/home/lupin/workspace/drts-fleet-platform/.local/full-system-completion-20261007/command-receipts.jsonl`.
The selected records all report exit 0:

| Line | UTC time | Operator action                           | Verified outcome                                                                                |
| ---- | -------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 87   | 15:50:00 | `assign` history helper                   | `resolved_parent_status=blocked`, `resolved_parent_waiting_for=Claude2`, provisioning next step |
| 88   | 15:50:01 | `assign` planning helper                  | Same blocked disposition; original `resolved_parent_at=2026-10-07T14:26:21Z` preserved          |
| 90   | 15:50:03 | `note` parent                             | Concrete provisioning next step recorded; parent remains blocked awaiting Claude2               |
| 92   | 15:50:05 | `resume-blocked` history helper to `todo` | Only this helper resumed; owner then used `start` for this dispatch                             |

Fresh `show` slices for all three tasks match those receipts. Both helpers'
`resolved_parent_next` exactly equal the parent's `next`. Parent candidate,
review and CI still identify `555a7f697f1a8aad07c56ceab2b1d836f7903313`, CI
status is `success`, and merge remains
`e7e6b85f98561e6b419d198c657018e038f2eefe`. All four required keys are unchanged;
only `reviewed_same_sha_global_ux_harness` has acceptance evidence. The
completed planning helper remains `done`. The history helper's eventual merge
must preserve the already-recorded blocked disposition.

### Rechecked history and evidence durability

After `git fetch origin`, audited dev is
`7a0d2cd6d4f809f4d857243acdd4622f8b7fb558`. All 12 parent file blobs remain
identical at candidate, merge and this dev SHA; PR #2396 still records that
candidate/merge. Local and retained tracking parent refs remain at the parent
candidate; its live remote branch is absent. Both old parent/planning worker
directories are absent. The helper's local/live-remote/PR head matched
`6ec56f063e06540d182416cb8506610d81ff6fb0` before this append-only update. Only
this artifact differs from dev; no trunk synchronization is necessary.

The release classifier still reproduces `history_repair` for the historical
wording and `manual_unblock` for the control. It now classifies the actual
updated parent as `manual_unblock`. This is a text-dependent routing result;
the classifier implementation and its H3 SHA256 are unchanged, so the general
false positive remains an explicitly unresolved follow-up outside this scope.

The previous worker-local evidence directory cited above no longer exists.
Its historical hashes are retained, but are not presented as available files.
Fresh read-only evidence is stored under the canonical-root directory
`/home/lupin/workspace/drts-fleet-platform/.local/sr-live-global-ux-history-repair-20261007-resume`:
`probe.py`, individual task/PR snapshots, `parent-blobs.json`, selected
`operator-receipts.json` (with original line numbers), and command receipts.
`probe.py` calls the actual release classifier and uses only CLI task slices,
Git and GitHub reads; it never edits machine truth or starts a runtime.

Reproduce with `python3 -B` and that directory's `probe.py`. The run at 15:53
exited 0; `verification-before-publication.json` preserves its full identities
and snapshot hashes. Selected receipt JSON SHA256:
`0c32ed53f3830974a6e322346923d5516fa1ef3db57d1374e9f05b0dd14c4804`.
The command exit codes, 12 exact blob comparisons, real-function probe, and
receipt/readback assertions are recorded rather than inferring success from
the dispatch summary.

### §0.7 resumed acceptance ledger

| Finding / acceptance                  | Source and change                                                                         | Previous → resumed result                                                                                      | Verification and remaining limits                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| H1: exact history contamination       | Parent refs, PR #2396 and 12 scoped blobs                                                 | Initial no-contamination finding → reconfirmed on fetched dev                                                  | Read-only probe PASS, exit 0; published author discrepancy preserved                                                     |
| H2: non-destructive routing repair    | Active-release `apply_unblock_parent_resolution`; operator receipts and three task slices | Wrong default `todo` / blocked owner writes → both helper dispositions and parent note corrected by Supervisor | Receipt/readback assertions PASS; planning resolution timestamp preserved; no force push or history rewrite              |
| H3: misleading history classification | Actual `blocked_task_triage_kind`                                                         | Historical text false positive → reproduced; updated parent now `manual_unblock`                               | Probe PASS; general classifier defect remains, no control-plane fix claimed                                              |
| Task-scoped commit/push/PR            | Same single artifact and existing PR #2412                                                | Published initial report → append-only receipt/readback update                                                 | Final candidate/local/remote/PR equality and check receipts recorded at handoff; old-head CI cannot approve the new head |
| Update parent with concrete next step | Receipt line 90 and parent `show`                                                         | Worker write rejected → operator write verified                                                                | PASS; parent stays blocked awaiting Claude2, not resumed to implementation                                               |
| Parent's four acceptance keys         | Parent task slices and original UAT contract                                              | One harness key recorded → unchanged                                                                           | Three live/manual keys remain pending; external provisioning was not re-audited or executed in this continuation         |

The now-actionable next step is Claude2's independent review of this helper,
followed by Operator coordination under the existing parent UAT: protected
`shared-dev-acceptance`, 18 approved app-role sessions with authoritative
readbacks, registered workflow through the immutable release lifecycle,
complete approved recipe bundle, and named keyboard/screen-reader/contrast/
design-mapping evidence before hosted execution on one immutable runtime.
The parent implementation is not reopened. Prior integration success is
neither live acceptance nor a repair of the older flaky assertion.

The final delivery uses a task-scoped commit and ordinary non-force push on
the existing branch/PR. Final SHA, check results and publication readback are
recorded in the local delivery receipt and the active-release `handoff` to
Claude2, avoiding a self-referential hash here. Independent review, matching
hosted CI and merge remain lifecycle gates; no `done`, merge, deployment or
live/manual pass is claimed by this report.
