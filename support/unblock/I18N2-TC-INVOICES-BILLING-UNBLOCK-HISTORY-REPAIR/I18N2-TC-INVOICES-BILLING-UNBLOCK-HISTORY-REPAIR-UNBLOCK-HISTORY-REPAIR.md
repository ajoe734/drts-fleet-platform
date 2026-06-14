# I18N2-TC-INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR Unblock History Repair

## Scope

- Task: `I18N2-TC-INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR-UNBLOCK-HISTORY-REPAIR`
- Parent: `I18N2-TC-INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR`
- Grandparent: `I18N2-TC-INVOICES-BILLING`
- Owner: `Codex`
- Reviewer: `Gemini2`
- Audit timestamp: `2026-06-14`

## Diagnosis

The remaining blockage is no longer in git branch history. The parent unblock
task already has the correct audit branch, pushed commit, and approved report.
What remains blocked is its final `review_approved -> done` machine-truth
transition.

1. The parent unblock task is `blocked`, but its branch already contains a
   pushed closeout commit:
   `origin/codex/i18n2-tc-invoices-billing-unblock-history-repair @ dc66cd2b5`
   with subject
   `I18N2-TC-INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR: finalize history repair closeout`.
2. The grandparent canonical task `I18N2-TC-INVOICES-BILLING` is already
   `done`, and its `next` field already records the correct canonical outcome:
   content merged to `dev` via `b2fbdf220`, no implementation work remains.
3. `scripts/ai_status.py:command_done()` always calls
   `apply_unblock_parent_resolution()` for `task_class=unblock`.
4. `apply_unblock_parent_resolution()` only accepts `PARENT_STATUS` values in
   `{backlog,todo,in_progress,blocked}` and then unconditionally overwrites the
   helper parent status.
5. Because the parent unblock task points at
   `helper_parent=I18N2-TC-INVOICES-BILLING`, running
   `scripts/ai-status.sh done I18N2-TC-INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR`
   would mutate the already-`done` grandparent back into one of those active
   statuses, regressing machine truth.

This helper-of-helper task exists because the parent unblock task cannot be
closed safely with the current `done` command semantics.

## Exact Contamination

The contamination is state-layer contamination between helper-task closeout
automation and an already-finished canonical parent:

1. Git history is repaired already:
   the parent unblock branch is pushed and review-approved.
2. Canonical delivery is repaired already:
   the grandparent canonical task is `done`, and `dev` contains the integrated
   invoices+billing payload.
3. The remaining failure is in the closeout script contract:
   unblock children may only resume their parent into a non-`done` state.
4. Therefore the parent unblock task is forced to remain `blocked` even though
   its own acceptance work is complete, because the final automation step would
   corrupt the grandparent's finished status.

## Evidence

### Task state

- `AI_NAME=Codex scripts/ai-status.sh show I18N2-TC-INVOICES-BILLING`
  shows the grandparent is already `done`.
- `AI_NAME=Codex scripts/ai-status.sh show I18N2-TC-INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR`
  shows the parent unblock task is `blocked` only because `done` is unsafe.

### Branch and commit state

- `git log --oneline origin/dev..codex/i18n2-tc-invoices-billing-unblock-history-repair`
  shows only the two expected report commits:
  `3a268f91d` and `dc66cd2b5`.
- `git rev-list --left-right --count origin/dev...codex/i18n2-tc-invoices-billing-unblock-history-repair`
  returns `3 2`, confirming the branch is a bounded audit rail, not unpushed
  implementation work.
- `git show --stat --summary --format=fuller dc66cd2b5`
  confirms the pushed closeout commit exists and only touches the unblock
  report.

### Script-level root cause

- `scripts/ai_status.py:2110-2134` shows `command_done()` always invokes
  `apply_unblock_parent_resolution()` after setting the child task to `done`.
- `scripts/ai_status.py:1024-1050` shows
  `apply_unblock_parent_resolution()` refuses any `PARENT_STATUS` outside
  `{backlog,todo,in_progress,blocked}` and then overwrites
  `parent["status"] = resume_status`.
- `.orchestrator/test_ai_status.py:168-198` covers the allowed safe case where
  an unblock child keeps its parent `blocked`; there is no test path that
  preserves an already-`done` parent.

## Non-Destructive Repair Path

Do not force-push any branch and do not reopen the grandparent canonical task.

1. Keep `I18N2-TC-INVOICES-BILLING` as `done`.
2. Keep
   `origin/codex/i18n2-tc-invoices-billing-unblock-history-repair @ dc66cd2b5`
   as immutable audit evidence.
3. Do not run `done` on `I18N2-TC-INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR`
   until tooling or supervisor logic can preserve a `done` helper parent.
4. Record the parent unblock task's concrete next step as:
   "tooling/supervisor reconcile required; helper closeout must preserve
   grandparent done state instead of auto-resuming it."
5. If final closure is required before tooling changes, it must be performed by
   a supervisor-approved machine-truth reconciliation path that does not call
   `command_done()` with a live `helper_parent` pointing at an already-done
   canonical task.

## Why This Is Safe

- No remote branch is rewritten.
- No force-push is required.
- The already-finished grandparent canonical task remains untouched.
- The already-pushed parent unblock branch remains the canonical audit branch.
- The only change is documenting the script-level closeout hazard and updating
  the blocked task's next step to a precise operator action.

## Verification Performed

- `AI_NAME=Codex scripts/ai-status.sh show I18N2-TC-INVOICES-BILLING`
- `AI_NAME=Codex scripts/ai-status.sh show I18N2-TC-INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR`
- `git log --oneline origin/dev..codex/i18n2-tc-invoices-billing-unblock-history-repair`
- `git rev-list --left-right --count origin/dev...codex/i18n2-tc-invoices-billing-unblock-history-repair`
- `git show --stat --summary --format=fuller dc66cd2b5`
- `sed -n '1024,1050p' scripts/ai_status.py`
- `sed -n '2110,2134p' scripts/ai_status.py`
- `sed -n '168,198p' .orchestrator/test_ai_status.py`

## Unblocked Next Step For Parent

Keep `I18N2-TC-INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR` in `blocked` with a
concrete note for supervisor/tooling reconciliation:

`scripts/ai_status.py command_done must preserve helper_parent=done (or a
supervisor/operator must finalize the helper without apply_unblock_parent_resolution);
do not run normal done until that path exists.`
