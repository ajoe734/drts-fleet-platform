# SR-LIVE-INVOICE-MAIL-20261007 History Repair

## Contamination Identified
The parent task `SR-LIVE-INVOICE-MAIL-20261007` became blocked because the owner encountered persistent `500 Internal Server Error` responses from the GitHub API when attempting to push the local `gemini2/sr-live-invoice-mail-20261007` branch. The push consistently failed during the remote object resolving phase.

Both the original commit (`f71451db8bda5544880c3f6fb143581d4effb97a`) and its successor (`8eca7ccffecc797bb454a4f92bfdc7c97fc524fb`) share the exact same tree (`d2d007f7efa168925217acd05d31ba68ba5273b4`) and parent (`3547f2086a0a8a2d1264fffdcfbe63e84d7757a3`). Read-only `git cat-file commit f71451db8 | git hash-object -t commit --stdin` reproduced the exact object ID `f71451db8bda5544880c3f6fb143581d4effb97a`. Thus, the remote 500 error root cause is unconfirmed, and it does not substantiate local object corruption.

## Non-Destructive Repair Path
To resolve this without force-pushing or modifying shared history:
1. We created a fresh branch `gemini2/sr-live-invoice-mail-20261007-clean` branching from the last healthy remote state `origin/gemini2/sr-live-invoice-mail-20261007`.
2. We used `git restore` to accurately recreate the exact working tree state from the original commit `f71451db8`.
3. We committed the restored state cleanly to generate a new commit object (`8eca7ccff`).
4. We pushed the new clean branch successfully to the remote.

This approach preserves the entire unpushed diff in a new commit object, side-stepping the GitHub 500 error while leaving the observed original remote ref intact. 

**Clean Successor Branch:** `gemini2/sr-live-invoice-mail-20261007-clean`
**Clean Successor Commit:** `8eca7ccffecc797bb454a4f92bfdc7c97fc524fb`

## Acceptance
- Exact local/remote divergence and tree/parent/ref comparisons established. `git diff --exit-code f71451db8bda5544880c3f6fb143581d4effb97a 8eca7ccffecc797bb454a4f92bfdc7c97fc524fb` returned 0. `git ls-remote origin` returned original branch at `3547f2086a0a8a2d1264fffdcfbe63e84d7757a3` and clean branch at `8eca7ccffecc797bb454a4f92bfdc7c97fc524fb`.
- The new branch has successfully pushed to origin without any 500 errors.
- No history was rewritten destructively on origin; both histories are preserved.

## Next Step for Parent Task
The owner (`Gemini2`) should resume work on `SR-LIVE-INVOICE-MAIL-20261007` by adopting the new branch `gemini2/sr-live-invoice-mail-20261007-clean` as the canonical continuation of the task, verify the state, and handoff the candidate from this new branch. The original local branch `gemini2/sr-live-invoice-mail-20261007` can be abandoned, keeping both histories intact.

## Helper Candidate Evidence
- **Helper Branch:** `gemini2/sr-live-invoice-mail-20261007-unblock-history-repair`
- **Helper PR:** [PR #2411](https://github.com/ajoe734/drts-fleet-platform/pull/2411)
- **PR Head Verification:** The `gh pr view 2411` confirms the remote head tracks the candidate commit of this branch.

---

## 2026-10-20 Re-Triaged History Audit, Preserved Lineage, and Parent Disposition

### 1. Why Chairman Recreated `SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR` on `2026-10-20T02:13:26Z`

1. **Prior Helpers Archived out of Active `status["tasks"]`**:
   - The first `SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR` delivery (candidate `87aadb1c2683223e17d02c81930cdc4d2f9e3884`, [PR #2411](https://github.com/ajoe734/drts-fleet-platform/pull/2411)) was approved by `Codex` and squash-merged into `dev` as `7a0d2cd6d4f809f4d857243acdd4622f8b7fb558` on `2026-10-07T15:47:52Z` (`resolved_parent_at: 2026-10-07T15:52:48Z`).
   - A subsequent manual-unblock helper `SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK` (candidate `f6649b5325809b35a59144cbf708201f0a41aade`, [PR #2426](https://github.com/ajoe734/drts-fleet-platform/pull/2426), artifact `support/unblock/SR-LIVE-INVOICE-MAIL-20261007/SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK.md`) was approved by `Codex` and squash-merged into `dev` as `7c06879337cc6deba6c50b168bdc8533884233c9` on `2026-10-08T02:44:20Z` with `resolved_parent_status: "blocked"`, `resolved_parent_waiting_for: "Pi"`, and `resolved_parent_at: "2026-10-08T02:46:42Z"` (verified in `.local/full-system-completion-20261008/metadata-readbacks.json`).
   - On `2026-10-19`, `tools/development-orchestrator/bin/ai_status.py::prune_state_for_size` archived both completed helper tasks out of active `status["tasks"]` into `/home/lupin/workspace/drts-fleet-platform/ai-task-archive.jsonl` (`_archived_at: 2026-10-19T05:01:51Z` for `SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR` and `_archived_at: 2026-10-19T08:21:15Z` for `SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK`) and recorded their IDs in `archived_task_ids`.
2. **Substring Match on `"history"` in Parent `next` Field**:
   - On `2026-10-16T00:08:52Z`, a coordination note for `CI-FULL-UNIT-BUDGET-AND-COVERAGE-FLOW-20261015` was appended to `SR-LIVE-INVOICE-MAIL-20261007.next` containing the phrases `"existing-blocker HOLD/history"` and `"no deploy/manual/history waiver"`.
   - `tools/development-orchestrator/control_plane/usecases/chair_review_policy.py::blocked_task_triage_kind` (lines 79–90) checks `any(token in text for token in ("rebase", "non-fast-forward", "worktree", "dirty", "contaminat", "history"))` before checking manual-acceptance tokens. Because `"history"` appears in `SR-LIVE-INVOICE-MAIL-20261007.next`, `blocked_task_triage_kind` returns `"history_repair"`.
   - Because `tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py::completed_unblock_task_for_parent` (lines 204–216) and `create_chair_unblock_task` (line 7780) only inspect active `status["tasks"]` (and do not check `archived_task_ids` / `ai-task-archive.jsonl`), Chairman blocked-task triage recreated `SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR` on `2026-10-20T02:13:26Z` (`owner: Gemini2`, `reviewer: Claude2` replacing quota-paused `Codex`).

### 2. Complete Branch, Worktree, and Commit Custody Audit (Zero Active Contamination)

All historical parent and helper branches are preserved locally and on `origin` without force-push, rebase, or history destruction, and the parent's approved source candidate is already merged into `dev` and byte-identical to `origin/dev`:

| Ref / Artifact | Local SHA | `origin` SHA | PR & State | Role / Custody Status |
| --- | --- | --- | --- | --- |
| `f71451db8bda5544880c3f6fb143581d4effb97a` | `f71451db8bda5544880c3f6fb143581d4effb97a` | N/A (unpushed commit object) | N/A | Original local commit that hit GitHub HTTP 500 during push; shares exact tree `d2d007f7efa168925217acd05d31ba68ba5273b4` and parent `3547f2086a0a8a2d1264fffdcfbe63e84d7757a3` with `8eca7ccffecc797bb454a4f92bfdc7c97fc524fb`. |
| `gemini2/sr-live-invoice-mail-20261007-clean` | `8eca7ccffecc797bb454a4f92bfdc7c97fc524fb` | `8eca7ccffecc797bb454a4f92bfdc7c97fc524fb` | N/A (preserved branch) | First non-destructive clean successor branch documented in PR #2411 above. |
| `gemini2/sr-live-invoice-mail-20261007` | `9a6cf0a6dacd54a09c0187323f0b75241a44cfae` | `9a6cf0a6dacd54a09c0187323f0b75241a44cfae` | [PR #2395](https://github.com/ajoe734/drts-fleet-platform/pull/2395) (`MERGED` at `19b69e7299b735b1bd16254b429432c5ed699bfc` -> `212f9d9ef67de00cf2c519168e454aec8c193acc`), [PR #2424](https://github.com/ajoe734/drts-fleet-platform/pull/2424) (`OPEN`, superseded) | After PR #2395 squash-merged as `212f9d9ef67de00cf2c519168e454aec8c193acc`, continuing on the pre-squash branch left 7 pre-squash commits (`19b69e7299b7`, `d69f1e461465`, `216fdd13bd85`, `b77a0784d47c`, `571b65da415b`, `ca322268a7f4`, `336c144e6196`) in `212f9d9ef67de00cf2c519168e454aec8c193acc..9a6cf0a6dacd54a09c0187323f0b75241a44cfae` that failed F14 commit-trailer validation. Preserved untouched without force-push. |
| `gemini2/sr-live-invoice-mail-20261007-r2` | `48ad199e461859afd3c843e2e29503107b47f6ad` | `48ad199e461859afd3c843e2e29503107b47f6ad` | [PR #2401](https://github.com/ajoe734/drts-fleet-platform/pull/2401) (`OPEN`, superseded) | Intermediate remediation branch (`48ad199e461859afd3c843e2e29503107b47f6ad`). Preserved untouched without force-push. |
| `gemini2/sr-live-invoice-mail-20261007-v2` | `e901ba057a09e4590fa723211bdc1f6ad482ac98` | `e901ba057a09e4590fa723211bdc1f6ad482ac98` | [PR #2425](https://github.com/ajoe734/drts-fleet-platform/pull/2425) (`MERGED` into `dev` as `e788524839c6b7640b64b110b62786815f3e7b51` on `2026-10-07T21:23:47Z`) | Canonical clean successor branch rooted directly on `212f9d9ef67de00cf2c519168e454aec8c193acc` (5 non-merge commits, all trailer-compliant). Approved by `Codex` (`2026-10-07T21:09:44Z`), CI `37687306186` `success`, merged into `dev` as `e788524839c6b7640b64b110b62786815f3e7b51`. |
| `gemini2/sr-live-invoice-mail-20261007-unblock-manual-unblock` | `f6649b5325809b35a59144cbf708201f0a41aade` | `f6649b5325809b35a59144cbf708201f0a41aade` | [PR #2426](https://github.com/ajoe734/drts-fleet-platform/pull/2426) (`MERGED` into `dev` as `7c06879337cc6deba6c50b168bdc8533884233c9` on `2026-10-08T02:44:20Z`) | Prior manual-unblock helper branch. |

- **Worktree Hygiene**: `git worktree list` shows no worktree checked out on any parent `SR-LIVE-INVOICE-MAIL-20261007*` branch other than this isolated helper worktree (`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-live-invoice-mail-20261007-unblock-history-repair` on `gemini2/sr-live-invoice-mail-20261007-unblock-history-repair`).
- **Ancestry & Artifact Identity on `origin/dev` (`afddbd70c20932798e8fb2431d2a8b1597bf10f5`)**:
  - `git merge-base --is-ancestor` confirms that `212f9d9ef67de00cf2c519168e454aec8c193acc` (PR #2395), `7a0d2cd6d4f809f4d857243acdd4622f8b7fb558` (PR #2411), `e788524839c6b7640b64b110b62786815f3e7b51` (PR #2425), `7c06879337cc6deba6c50b168bdc8533884233c9` (PR #2426), and `c5080728448504bf45b9059a4831ed72ba40da93` (PR #2720, `CI-FULL-UNIT-BUDGET-AND-COVERAGE-FLOW-20261015`) are all ancestors of `origin/dev`.
  - `git diff --exit-code e901ba057a09e4590fa723211bdc1f6ad482ac98 origin/dev -- tests/e2e/system-remediation/sr-live-invoice-mail-20261007/ tests/unit/system-remediation/sr-live-invoice-mail-20261007/ .github/workflows/live-invoice-mail-acceptance.yml playwright.live-invoice-mail.config.ts docs/04-uat/system-remediation-20260906/SR-LIVE-INVOICE-MAIL-20261007.md` exits `0` (all five parent task-scoped artifacts on `origin/dev` are byte-identical to the reviewed candidate `e901ba057a09e4590fa723211bdc1f6ad482ac98`).
- **Task Spec & Read-Dependency Provenance**:
  - Parent `task_spec_ref` `/home/lupin/workspace/drts-fleet-platform/.local/full-system-completion-20261007/SR-LIVE-INVOICE-MAIL-20261007.md`: SHA256 `eb771cb3878ac8e6cd21358cd223d6b149c353ebc24c47e574695cf82da691a6`.
  - Parent `read_dependencies` archived under `/home/lupin/workspace/drts-fleet-platform/.local/_archive-goal-continuation/goal-continuation-20261015T2342-remaining-original-frontier-root.tar.zst` (inspected in-memory via `tar --zstd -xOf` without extracting large files, per disk guardrail):
    - `two-original-helper-and-Bank-existing-unit-budget-complete-CI-repair-readonly-diagnosis.json`: SHA256 `6f39dd1fc249298f39118c3a7317d868b9aecdc69e71237de4c39e598c8d99c8`.
    - `CI-FULL-UNIT-BUDGET-AND-COVERAGE-FLOW-20261015.registration-R1.task-spec.json`: SHA256 `1a9b05601f7fbb5a2bbb611b6419683ecdf74d8dc5bd5672e6faa48a58c5698f`.
    - Furthermore, `CI-FULL-UNIT-BUDGET-AND-COVERAGE-FLOW-20261015` is now canonically `done` and merged into `dev` at `c5080728448504bf45b9059a4831ed72ba40da93` ([PR #2720](https://github.com/ajoe734/drts-fleet-platform/pull/2720)).

### 3. Fresh Offline Verification of Merged Parent Artifacts (`2026-10-20`)

Executed in this worktree after merging `origin/dev` (`afddbd70c20932798e8fb2431d2a8b1597bf10f5` -> `5ce61aa5e612b29602ee2118f17a45ba8a76a80b`), honoring the VM restriction (no product dev server, browser/Playwright runner, or Docker Compose started):

- `python3 -m unittest discover -s tests/unit/system-remediation/sr-live-invoice-mail-20261007 -p "test_*.py" -v`: **PASS** (`Ran 13 tests in 5.985s`, `OK`).
- `python3 -m unittest discover -s tests/unit/system-remediation/sr-live-mail-001 -p "test_*.py" -v`: **PASS** (`Ran 41 tests in 1.312s`, `OK`).
- `pnpm exec vitest run tests/unit/system-remediation/sr-live-invoice-mail-20261007/`: **PASS** (`2 passed (2)`, `38 passed (38)` across `spec-guards.test.ts` and `bootstrap.test.ts`).
- `pnpm exec tsc -p tests/e2e/system-remediation/sr-live-invoice-mail-20261007/tsconfig.live.json --noEmit`: **PASS** (exit `0`).
- `pnpm exec eslint --max-warnings=0 tests/e2e/system-remediation/sr-live-invoice-mail-20261007 tests/unit/system-remediation/sr-live-invoice-mail-20261007 playwright.live-invoice-mail.config.ts`: **PASS** (exit `0`).

### 4. Concrete Parent Blocker and Required Non-Destructive Disposition

1. **Actual External Acceptance Blocker on `SR-LIVE-INVOICE-MAIL-20261007`**:
   - Live GitHub Actions query `gh run list --workflow 377833148 --limit 10` on `2026-10-20T02:37:13Z` confirms no new `Live Invoice Mail Acceptance` runs have occurred since `37689594180` (`2026-10-07T21:28:00Z`, `failure` in `input-validation` job `113026069488`).
   - Live repository variable query `gh variable list` on `2026-10-20T02:37:13Z` confirms zero `DRTS_LIVE_INVOICE_MAIL_*` variables are configured on the repository (only `DRTS_LIVE_MAIL_*` for invitation mail exist).
   - Therefore, `SR-LIVE-INVOICE-MAIL-20261007` remains genuinely blocked on Operator `Pi` (under Supervisor coordination) to:
     1. Provision the approved `DRTS_LIVE_INVOICE_MAIL_*` repository variables and the three real OIDC role/fixture sessions mapped in `.github/workflows/live-invoice-mail-acceptance.yml` (`lines 47-61, 109-119`) and `tests/e2e/system-remediation/sr-live-invoice-mail-20261007/session-bootstrap.ts` (`createInvoiceMailEnvAdapter` / `validateMailSessionInputs`).
     2. Verify the immutable deployed dev Cloud Run revision SHA includes the merged parent harness (`e788524839c6b7640b64b110b62786815f3e7b51`) and no active or scheduled deployment runs through teardown.
     3. Trigger `gh workflow run 377833148 --ref dev -f candidate_sha=<verified-full-deployed-source-sha>` and record all four `required_acceptance` keys (`reviewed_invoice_live_harness_same_sha_ci`, `authorized_invoice_runtime_recipient_and_fixture`, `genuine_invoice_mail_provider_inbox_and_download`, `invoice_idempotency_failure_readback_and_cleanup`) via `record-acceptance`.
2. **Why Supervisor Must Persist `resolved_parent_*` Metadata Before Merging This Helper**:
   - Dispatched worker commands cannot directly mutate the parent task (`ai-status.sh note SR-LIVE-INVOICE-MAIL-20261007 ...` exits `1` with `Dispatched worker cannot mutate a different task (SR-LIVE-INVOICE-MAIL-20261007) while assigned to SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR`) and cannot call `assign` on the helper to inject `TASK_METADATA_JSON` (`ai-status.sh assign SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR ...` exits `1` with `Dispatched workers must use their assigned task lifecycle commands, not 'assign'`), as enforced by `TaskBoardCommandExecutor._guard_worker_command` (`tools/development-orchestrator/control_plane/usecases/task_board_commands.py:82-90`) and recorded in `/home/lupin/workspace/drts-fleet-platform/.local/sr-live-invoice-mail-history-repair-20261020/attempt-parent-note.json` and `attempt-helper-assign-metadata.json`.
   - In `tools/development-orchestrator/bin/ai_status.py::unblock_parent_resolution_fields` (`lines 1118-1135`), if `resolved_parent_status` is unset when this helper merges, `transition_after_merge` defaults `SR-LIVE-INVOICE-MAIL-20261007` to `status: "todo"`, `waiting_for: null`, and overwrites `next` with `"Unblock task SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR completed; resume parent delivery."` (reproduced in `/home/lupin/workspace/drts-fleet-platform/.local/sr-live-invoice-mail-history-repair-20261020/disposition-probe.json`).
   - Setting `resolved_parent_status="blocked"`, `resolved_parent_waiting_for="Pi"`, and `resolved_parent_next` on `SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR` before helper merge preserves `SR-LIVE-INVOICE-MAIL-20261007` as `status: "blocked"`, `waiting_for: "Pi"`, and keeps the completed helper in `status["tasks"]` with `helper_kind: "history_repair"` so `completed_unblock_task_for_parent` prevents duplicate helper creation.
3. **Exact Supervisor Command Block (Run from Un-Dispatched Supervisor Context Before Merge)**:
   ```bash
   CLI="/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-7a294772a5c2/tools/development-orchestrator/bin/ai-status.sh"
   PARENT_NEXT="$(python3 -c 'import json,subprocess; s=json.loads(subprocess.check_output(["'"$CLI"'","show","SR-LIVE-INVOICE-MAIL-20261007"],text=True))["next"]; print(s + " | 2026-10-20 SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR re-verified: no active git/worktree/commit contamination exists; parent candidate e901ba057a09e4590fa723211bdc1f6ad482ac98 is merged on dev as e788524839c6b7640b64b110b62786815f3e7b51 (PR #2425) with byte-identical artifacts on origin/dev and CI-FULL-UNIT-BUDGET-AND-COVERAGE-FLOW-20261015 is merged as c5080728448504bf45b9059a4831ed72ba40da93 (PR #2720); prior helpers PR #2411 (7a0d2cd6d4f809f4d857243acdd4622f8b7fb558) and PR #2426 (7c06879337cc6deba6c50b168bdc8533884233c9) were archived to ai-task-archive.jsonl on 2026-10-19; keep parent status=blocked, waiting_for=Pi pending DRTS_LIVE_INVOICE_MAIL_* and 3-role fixture provisioning plus workflow 377833148 run and record-acceptance for all 4 required_acceptance keys.")')"
   TASK_METADATA_JSON="$(python3 -c 'import json,sys; print(json.dumps({"resolved_parent_status":"blocked","resolved_parent_waiting_for":"Pi","resolved_parent_next":sys.argv[1]},ensure_ascii=False))' "$PARENT_NEXT")" \
     AI_NAME=Supervisor "$CLI" assign SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR Gemini2 Claude2 \
     "Persist blocked/Pi parent resolution metadata on SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-HISTORY-REPAIR before merge"
   AI_NAME=Supervisor "$CLI" note SR-LIVE-INVOICE-MAIL-20261007 "$PARENT_NEXT"
   ```

### 5. §0.7 Acceptance & Reproducible Verification Summary

| Acceptance Criterion | Status | Evidence & Reproducible Command |
| --- | --- | --- |
| Identify the exact branch/worktree/commit contamination that keeps the parent blocked | **Satisfied** | Sections 1–2 above prove no active Git contamination remains: original HTTP 500 commit `f71451db8bda5544880c3f6fb143581d4effb97a` -> clean branch `8eca7ccffecc797bb454a4f92bfdc7c97fc524fb` (PR #2411) and pre-squash trailer failure `9a6cf0a6dacd54a09c0187323f0b75241a44cfae` (PR #2424) -> clean branch `gemini2/sr-live-invoice-mail-20261007-v2` at `e901ba057a09e4590fa723211bdc1f6ad482ac98` merged into `dev` via PR #2425 as `e788524839c6b7640b64b110b62786815f3e7b51`. Recreated helper was triggered by 2026-10-19 archive pruning (`ai-task-archive.jsonl`) + `"history"` token in parent `next`. |
| Repair or document a non-destructive repair path without force-pushing shared history | **Satisfied** | All historical parent and helper refs remain intact on `origin`; `origin/dev` (`afddbd70c20932798e8fb2431d2a8b1597bf10f5`) was merged non-destructively into `gemini2/sr-live-invoice-mail-20261007-unblock-history-repair` (`5ce61aa5e612b29602ee2118f17a45ba8a76a80b`); all 5 parent artifacts on `origin/dev` match `e901ba057a09e4590fa723211bdc1f6ad482ac98` (`git diff --exit-code` = `0`). |
| Produce task-scoped commit/push/PR evidence for any canonical change | **Satisfied** | Preserved 2026-10-07 delivery (`87aadb1c2683223e17d02c81930cdc4d2f9e3884`, [PR #2411](https://github.com/ajoe734/drts-fleet-platform/pull/2411), merged `7a0d2cd6d4f809f4d857243acdd4622f8b7fb558`) plus 2026-10-20 continuation candidate on `gemini2/sr-live-invoice-mail-20261007-unblock-history-repair` ([PR #2860](https://github.com/ajoe734/drts-fleet-platform/pull/2860)). |
| Update the parent task with the concrete unblocked next step | **Satisfied** | Direct worker mutation guard receipts recorded in `/home/lupin/workspace/drts-fleet-platform/.local/sr-live-invoice-mail-history-repair-20261020/attempt-parent-note.json` and `attempt-helper-assign-metadata.json`; in-memory `transition_after_merge` proof in `disposition-probe.json`; exact Supervisor CLI command block documented in Section 4.3 to preserve `status=blocked`, `waiting_for=Pi`, and `resolved_parent_next` (3089 chars <= 4000 limit). |
| Automated offline receipt verifier | **Satisfied** | `python3 /home/lupin/workspace/drts-fleet-platform/.local/sr-live-invoice-mail-history-repair-20261020/verify.py` -> `PASS`. |
