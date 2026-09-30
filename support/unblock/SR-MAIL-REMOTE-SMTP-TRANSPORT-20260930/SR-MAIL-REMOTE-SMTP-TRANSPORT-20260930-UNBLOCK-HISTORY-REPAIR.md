# SMTP unblock history audit — 2026-09-30

Task: `SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930-UNBLOCK-HISTORY-REPAIR`.
Owner: Codex. Reviewer: Claude2. Parent: `SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930`.

**No branch or commit contamination was found.** The parent is blocked on
BOOT-01/STORAGE-01 and coordinated expansion of three caller write scopes.
Preserve its published checkpoint and resume the original branch after that
coordination. This helper changes only this evidence file; it does not repair
the product, change the classifier, or satisfy the parent's acceptance gates.

The remaining helper delivery gate is an operator transaction: the dispatched
worker cannot update the parent or store the helper's unresolved-parent
disposition. Both commands were attempted through the supplied release CLI and
rejected before mutation, including on the next dispatch (section 7). Route this
helper as blocked, waiting for Claude2 to coordinate Supervisor, and keep its PR
in draft until the transaction below is recorded and verified; do not hand off a candidate
whose merge could incorrectly resume the parent.

## 1. Exact history and worktree evidence

Audit at `2026-09-30T03:47:05Z`, after successful `git fetch origin`:

| Ref / fact                                           | Observed value                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Helper initial HEAD / `origin/dev`                   | `01f516f48663366df9f717b389e307726eac0edf`                                                                                                     |
| Local `codex/sr-mail-remote-smtp-transport-20260930` | `a473e760abaa6348948973bd8960b3478aa9f90b`                                                                                                     |
| Fetched remote and live `git ls-remote` parent head  | `a473e760abaa6348948973bd8960b3478aa9f90b`                                                                                                     |
| Parent local versus published ahead/behind           | `0 / 0`                                                                                                                                        |
| Parent/base common ancestor                          | `64b47218ddd1f0c001a1526f1598251857a4d9fd`                                                                                                     |
| `origin/dev...parent` left/right count               | `2 / 2`; ordinary trunk advancement, not local/published divergence                                                                            |
| Parent PR query (`--state all --head` exact branch)  | `[]`                                                                                                                                           |
| Parent checkpoint check runs / commit statuses       | Zero check runs and zero statuses; aggregate `pending` is not a CI pass                                                                        |
| Parent lifecycle                                     | `blocked`, waiting for `Claude2`; no candidate SHA/generation                                                                                  |
| Parent registered worktree                           | None; retained local and remote refs preserve the work                                                                                         |
| Read-only merge feasibility                          | `git merge-tree --write-tree origin/dev codex/sr-mail-remote-smtp-transport-20260930`, exit 0, tree `5887d3e7abc700034ed570bfe5359cd1cff11dbf` |

The helper remains in its Supervisor-assigned isolated worktree on
`codex/sr-mail-remote-smtp-transport-20260930-unblock-history-repair`.
The canonical root was not switched. No parent ref, worktree, or source was
modified. `merge-tree` writes an unattached Git tree, not a merge commit or ref.

Exactly two parent commits are absent from `origin/dev`:

1. `4df0725429124fdf180137bcda5c97f35a95fb62`: secure SMTP adapter and secret mounts.
2. `a473e760abaa6348948973bd8960b3478aa9f90b`: TLS/recipient tests and checkpoint evidence.

Both have the parent's Task-ID, `LLM-Agent: codex`, and `Reviewer: Claude2`.
The parent reflog contains creation from `64b47218…` followed by those two
commits, with no rebase/reset/amend entry. Its nine changed paths all match the
current parent `write_scopes`: the deployment workflow, API package file,
lockfile, four notification-delivery files (including the parent evidence), and
two tests under `tests/unit/notification-delivery/`.

The checkpoint's Git author/committer is Gemini2, matching the repository's
shared `user.name`/`user.email` configuration at audit time. That metadata is
distinct from its Codex task trailers and is not a divergent history or a push
obstruction. Do not amend a published checkpoint to change it. Helper commits
use command-local Codex identity without changing the shared Git configuration.

## 2. Why history repair was selected

The parent's `02:33:30Z` blocker explicitly says its checkpoint was committed
and normally pushed, local/remote match, and it is **not a candidate**. The
`03:43:43Z` `chair_unblock_task_created` event instead describes a committed and
pushed candidate as meeting history-repair conditions.

The active release's
`control_plane/usecases/chair_review_policy.py:blocked_task_triage_kind`
checks for words including `commit` and `push` before other routing categories.
Calling that actual function with the parent slice returns `history_repair`;
the only matching history markers are `commit` and `push`. This reproduces the
classification false positive, not a Git failure. The event and classifier
explain the dispatch's premise; they do not override the ref audit or prove the
parent implementation complete. Changing this shared classifier is outside this
helper's artifact scope.

## 3. Remaining parent findings and safe continuation

The original evidence remains at
[the parent checkpoint's evidence file](https://github.com/ajoe734/drts-fleet-platform/blob/a473e760abaa6348948973bd8960b3478aa9f90b/apps/api/src/modules/notification-delivery/SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930.md),
which exists on the parent branch and has not landed on dev.
This audit independently read the following production functions at that SHA:

| Finding    | Source and precise remaining behavior                                                                                                                                                                                                                                                                                                                                                                                                                              | Required repair boundary                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BOOT-01    | `audit-notification/audit-notification.module.ts:createAuditNotificationDeliveryService` and `tenant-partner/tenant-partner.module.ts:createTenantInvitationNotificationDeliveryService` return null before the transport factory when `NOTIFICATION_OUTBOX_DIRECTORY` is absent. `regulatory-registry/regulatory-registry.module.ts:createRegistryNotificationDeliveryService` also returns null without validating transport when no storage branch is selected. | Validate transport configuration before optional-storage early returns; retain valid disabled behavior. Coordinate scope for these three module files.             |
| STORAGE-01 | Audit and invitation factories select only `FileMailOutbox`; registry selects PostgreSQL only with `NOTIFICATION_OUTBOX_TYPE=postgres` and enabled `DatabaseService`. The checkpoint's deploy workflow mounts SMTP secrets but supplies neither outbox setting.                                                                                                                                                                                                    | Reuse `DatabaseService`/`PostgresMailOutbox` for durable hosted delivery and wire its selection when SMTP is enabled; do not substitute ephemeral Cloud Run files. |

The original checkpoint reports 132 passing affected tests and a failing
three-assertion actual-factory BOOT-01 probe. Those are historical owner results,
not tests rerun by this documentation helper. No adjacent independent review
candidates exist; this is not a repeated-review finding requiring a new owner.

Concrete continuation, owned by Supervisor/Claude2 and then the original Codex
owner:

1. Record the unresolved disposition and parent next step in section 4. Coordinate
   conflicting assignments and add these exact files to the parent's existing
   `write_scopes`, preserving all prior scopes and acceptance requirements:
   - `apps/api/src/modules/audit-notification/audit-notification.module.ts`
   - `apps/api/src/modules/tenant-partner/tenant-partner.module.ts`
   - `apps/api/src/modules/regulatory-registry/regulatory-registry.module.ts`
2. Only after scope/routing coordination, resume the parent through the current
   release CLI and dispatch Codex to an isolated **parent** worktree. Reuse the
   retained parent branch, not this helper branch and not a new branch from dev.
   Recheck `git worktree list --porcelain` before creating a worktree. If no
   worktree exists and the destination is absent, `git worktree add <assigned-parent-path>
codex/sr-mail-remote-smtp-transport-20260930` preserves its published head.
   If a destination exists but is unregistered, inspect it; never delete it.
3. Fetch and recheck live refs, PR/candidate/CI before editing. At this audit no
   history surgery or synchronization is required. If later integration requires
   syncing dev before handoff, use a normal merge in the parent worktree, with
   task trailers, conflict review, verification and ordinary push. Do not rebase,
   reset, amend, force-push, or cherry-pick the existing stack onto a replacement
   branch merely because dev advanced.
4. Repair BOOT-01 then STORAGE-01 under the expanded scope. Preserve and promote
   the actual-factory regression, rerun affected checks, and arrange any required
   PostgreSQL/provider acceptance through authorized hosted facilities. No VM
   development, browser, standalone SMTP service, or Docker environment.
5. Commit/push the parent's completed work normally; confirm full local SHA,
   remote SHA and dev-targeted PR head match, then hand off to Claude2. The helper
   PR, its checks, and its eventual merge are not parent delivery evidence.

## 4. Required operator transaction — not yet applied

Release CLI:
`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-a5d380901220/tools/development-orchestrator/bin/ai-status.sh`.

Both attempted with `AI_NAME=Codex`, retaining all dispatch guards:

| Attempt                                                                         | Exit / result                                                           | Readback                            |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------- |
| `note` parent with the concrete continuation                                    | 1: `Dispatched worker cannot mutate a different task`                   | Parent unchanged: blocked / Claude2 |
| `assign` this helper, preserving Codex/Claude2, with `TASK_METADATA_JSON` below | 1: `Dispatched workers must use their assigned task lifecycle commands` | Helper disposition absent           |

`TaskBoardCommandExecutor._guard_worker_command` only permits assigned-task
lifecycle commands. `ai_status.py:command_assign` is the metadata writer;
`command_progress` does not consume `TASK_METADATA_JSON`.
`apply_unblock_parent_resolution` otherwise defaults missing disposition to
`todo`, so prose or a progress receipt cannot substitute for this transaction.

Supervisor must execute the following through its existing operator context,
without removing/changing this worker's dispatch environment. Preserve the
parent's current blocked state and do not invent `resolved_parent_at`.

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Claude2",
  "resolved_parent_next": "歷史查核無污染：本機與遠端同為 a473e760abaa6348948973bd8960b3478aa9f90b，保留原分支續作。仍 blocked 等 Claude2 協同 Supervisor 核對衝突並擴充 write_scopes 到 apps/api/src/modules/audit-notification/audit-notification.module.ts、apps/api/src/modules/tenant-partner/tenant-partner.module.ts、apps/api/src/modules/regulatory-registry/regulatory-registry.module.ts；由原 owner Codex 在父任務隔離工作樹修 BOOT-01/STORAGE-01，驗證後提出新候選。不得因 helper 完成自動解除 scope blocker。"
}
```

From the helper checkout (only CLI calls mutate machine truth):

````bash
set -euo pipefail
repair_cli=/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-a5d380901220/tools/development-orchestrator/bin/ai-status.sh
repair_parent=SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930
repair_helper=${repair_parent}-UNBLOCK-HISTORY-REPAIR
repair_artifact=support/unblock/$repair_parent/$repair_helper.md
repair_metadata=$(python3 -c '
import json, pathlib, re, sys
text = pathlib.Path(sys.argv[1]).read_text()
payload = json.loads(re.search(r"```json\n(.*?)\n```", text, re.S).group(1))
assert set(payload) == {"resolved_parent_status", "resolved_parent_waiting_for", "resolved_parent_next"}
print(json.dumps(payload, ensure_ascii=False))
' "$repair_artifact")
AI_NAME=Supervisor TASK_METADATA_JSON="$repair_metadata" \
  "$repair_cli" assign "$repair_helper" Codex Claude2
repair_next=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["resolved_parent_next"])' "$repair_metadata")
AI_NAME=Supervisor "$repair_cli" note "$repair_parent" "$repair_next"
"$repair_cli" show "$repair_helper"
"$repair_cli" show "$repair_parent"
````

Require both mutations to exit 0 and read back the exact three metadata fields,
parent `next` equal to `resolved_parent_next`, and parent still blocked/Claude2.
After this gate, if this helper is blocked, Supervisor must resume **only the
helper** in its operator context:

```bash
AI_NAME=Supervisor "$repair_cli" resume-blocked "$repair_helper" in_progress \
  "Operator disposition and parent next-step transaction verified; Codex may finish helper evidence and handoff. Parent remains blocked/Claude2."
```

Then redispatch the original owner, update this same artifact with transaction
evidence, verify the new helper head, and hand off to Claude2 with
`CANDIDATE_SHA`, `CANDIDATE_BRANCH` and PR URL. Do not directly call `done` or
treat this helper as scope authorization. Resuming the helper does not authorize
resuming the parent or changing its source scopes.

## 5. Acceptance and verification ledger

Machine-specific command outputs are under this assigned checkout's
`.local/SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930-UNBLOCK-HISTORY-REPAIR/`.
They are supporting local receipts, not substitutes for this committed report.

| Finding / acceptance                                                | Source / modification                                     | Old → observed result                                                                          | Command, version, evidence                                                                                                     | Remaining limit                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Identify exact history contamination                                | Parent refs, reflog, nine-path scope audit; section 1     | Dispatch alleges history problem → no local/published divergence or foreign task delta         | Fetch/ref/reflog/diff/PR queries and asserted audit, exit 0; `history-audit.json`; parent `a473e760…`, helper base `01f516f4…` | Snapshot; recheck before parent resumption                         |
| Explain routing mismatch                                            | Active release `a5d380901220`: `blocked_task_triage_kind` | Actual parent slice reproduces `history_repair` from `commit`/`push` words                     | Actual function invocation with CLI `show` slice, exit 0; same audit JSON                                                      | Classifier not changed                                             |
| Non-destructive continuation                                        | Retained parent branch; sections 1 and 3                  | No surgery needed; clean synthetic merge feasible                                              | `git merge-tree --write-tree`, exit 0, tree above; `git diff --check origin/dev...parent`, exit 0                              | No parent merge executed; BOOT-01/STORAGE-01 remain                |
| Parent blocker source                                               | Three actual factories and deploy workflow at checkpoint  | Historical failing probe retained; static early returns/outbox absence independently confirmed | `git show a473e760:<path>`, exit 0; original parent artifact                                                                   | No product regression rerun in this docs-only helper               |
| Task-scoped commit/push/PR                                          | This artifact only                                        | Prepared for normal branch publication                                                         | Delivery receipt below and helper progress record identify the published head                                                  | Not a candidate until operator gate is applied                     |
| Update parent with concrete next step; preserve blocked disposition | Section 4 CLI transaction                                 | Both writes rejected, parent unchanged, helper fields absent                                   | Each status command exit 1; `status-guard-results.json`, before/after task slices                                              | **Unmet: Supervisor operator transaction required before handoff** |

Documentation checks apply to this helper: scoped formatting, diff whitespace,
commit trailers, artifact JSON/command consistency, and matching published head.
Product unit/typecheck/PG/browser/live-provider tests are not applicable to this
single report change and are not claimed passed. No product service or deployment
was started. Hosted CI/review/merge remain separate lifecycle gates.

## 6. Delivery receipt

Anchor `ed0d8d2728b4c3b27441c0e9b0c55ce4016ecf85` was normally pushed to
`codex/sr-mail-remote-smtp-transport-20260930-unblock-history-repair`.
[Draft PR #2230](https://github.com/ajoe734/drts-fleet-platform/pull/2230)
targets dev and initially matched that exact head. The subsequent append-only
report correction is identified by the final published SHA in the helper's
canonical progress record and PR head; no self-referential SHA is embedded here.

Local checks completed with exit 0: Prettier, `git diff --check`, commit trailers,
exact disposition JSON versus the attempted transaction, operator command
`bash -n`, artifact-only diff, and existence of the cited commit objects.
Tool versions: Git 2.43.0, Node 22.23.2, pnpm 10.33.0.

CITE-01 was found by the initial anchor's hosted
[Canonical consistency job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36666258319/job/109731468148):
exit 1 because the parent evidence link's code-formatted label was interpreted as
a file in this helper checkout. The file exists only on the unpublished-to-dev
parent branch. This revision uses a descriptive label and retains the immutable
GitHub checkpoint URL, making that distinction explicit. The same production
checker, `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev
--head HEAD`, is rerun locally; final hosted run results belong to their actual
head and are recorded in the helper progress receipt, not inherited from the
anchor. Raw initial failure log: local `ci-initial-canonical.log`.

The initial delivery retained an in-progress task with the operator blocker.
Section 7 records why the next dispatch instead routes this helper as blocked
until section 4 is applied. No candidate has been handed off; no parent
acceptance, independent helper review, or merge is claimed.

## 7. Redispatch verification and operator routing

Dispatch `codex-20260930T041108Z-a1fb862a` rechecked the same published report,
`5b90b8c20e621dca54e6e0d7a0a177f773124699`, before this append-only update.
The worker retained its supplied `owner`/Codex identity and assigned task ID.
No operator impersonation or dispatch-environment removal was used.

| Check / finding                    | Result and evidence                                                                                                                                                                                                                                                                                                                                                       | Remaining boundary                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Published history and draft PR     | Fresh fetch and live remote lookup: parent remains `a473e760abaa6348948973bd8960b3478aa9f90b`, local/published divergence `0 / 0`; helper local, remote and PR #2230 head all equal `5b90b8c20e621dca54e6e0d7a0a177f773124699`; PR is open, draft, targeting dev. Parent PR query still returns `[]`. All commands exit 0.                                                | No history repair or parent synchronization needed.                                                               |
| Prior report checks                | Read both completed runs at that exact helper SHA: [CI](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36666426586) success and [ci-integ](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36666426558) success. PR rollup: 15 success, 10 scope-skipped, zero pending or failed.                                                                | Skips do not satisfy acceptance; these runs are not checks for the new report revision.                           |
| Operator gate remains reproducible | At `2026-09-30T04:13:29Z`, the actual release CLI again rejected parent `note` and helper metadata `assign`, each exit 1 with the same guards as section 4. Exact before/after task slices compare equal; all three helper disposition fields remain absent. Local `redispatch_probe.py` exits 0 after asserting those outcomes; receipt `redispatch-guard-results.json`. | Parent update acceptance remains unmet. No blind retry or premature handoff.                                      |
| Classifier and scope boundaries    | The actual release `blocked_task_triage_kind` still returns `history_repair` for the unchanged parent slice. `command_handoff` and `command_progress` do not persist the required disposition metadata; `command_assign` does, but is operator-only for this dispatch.                                                                                                    | The documented operator transaction is still necessary. BOOT-01/STORAGE-01 remain with the original parent owner. |

The earlier dispatch's `.local` receipts were not present in this checkout on
redispatch; they are not claimed to have been reread. The committed sections
above preserve that earlier evidence. This dispatch's new probe and receipt are
under the same task-specific `.local` directory and support the newly repeated
guard observations.

After verification/publication of this report revision, record a helper
`blocker` waiting for Claude2 through the supplied release CLI. The blocker is
the missing operator transaction, with the exact action in section 4; further
owner-only dispatches cannot perform it. Keep PR #2230 in draft and leave the
parent blocked/Claude2. The final canonical blocker receipt identifies this
revision's published head and its own completed checks.
