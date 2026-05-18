# TEN-UI-RD-010 Unblock — Planning Decision Reconciliation

Date: 2026-05-18
Owner: Codex
Reviewer: Claude2
Parent task: `TEN-UI-RD-010`
Child task: `TEN-UI-RD-010-UNBLOCK-PLANNING-DECISION`

## Summary

The parent is no longer blocked by a missing product or contract decision.
That decision was already resolved by the tenant-governance contract wave and
recorded in the canonical parity-decision log.

What remains is a delivery-history / machine-truth reconciliation problem:

- the parent task row in `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  is still frozen at the 2026-05-10 blocker
- `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl` shows that
  the task later progressed through review, `done`, reopen, review again, and
  final `done`
- the later 2026-05-16 fix commits are present in the local object database
  and reflog, but they are not reachable from a current local branch and
  `git ls-remote --heads origin` does not currently show the referenced remote
  branch

This means the planning blocker is resolved, but the parent still needs a
closeout/history follow-up.

## Canonical Decision

The accepted `TN_NewBooking` scope remains:

- implement against the published tenant booking, cost-center, quota-preview,
  and approval-evaluation contracts
- keep estimated spend preview-only
- allow booking-on-behalf metadata
- do not invent draft-save or tenant-side quoted-fare override behavior

Canonical planning source:

- `docs/05-ui/tenant-console-parity-decisions-20260510.md`
- `docs/05-ui/tenant-canonical-contract-gaps-design-response-20260513.md`

This child task updates the parity-decision log with a 2026-05-18
reconciliation note so the canonical planning artifact now states explicitly
that any remaining problem is delivery-history repair, not a missing decision.

## Evidence

### 1. Original blocker is stale

Canonical machine truth currently records parent `TEN-UI-RD-010` as:

- owner `Codex2`
- reviewer `Codex`
- status `blocked`
- last update `2026-05-10T18:26:24Z`
- blocker summary: no tenant cost-center directory or approval-rule read model

That blocker matched the pre-contract state from 2026-05-10, but it no longer
matches the accepted planning docs or the later task history.

### 2. Planning unblock already landed

Canonical docs already record that the tenant-governance contract wave
unblocked `TN_NewBooking`:

- `docs/05-ui/tenant-console-parity-decisions-20260510.md`
  - 2026-05-14 head note: `TEN-UI-RD-010` reopened and shipped after
    `BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, and `BE-APR-001`
  - `TEN-UI-RD-010` decision: implement against published booking,
    cost-center, quota-preview, and approval-evaluation contracts
- `docs/05-ui/tenant-canonical-contract-gaps-design-response-20260513.md`
  accepts the tenant-governance contract wave and explicitly positions the UI
  tasks behind those backend contracts instead of re-opening product semantics

### 3. Parent task later shipped, reopened, and closed again

`/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl` records:

- 2026-05-14T03:34:38Z: handoff after quoted-fare regression fix
- 2026-05-14T04:07:00Z: `review_approved`
- 2026-05-14T04:14:04Z: `done` with commit `6e0c9fd`
- 2026-05-16T16:26:08Z: reviewer reopen for datetime-local default bug
- 2026-05-16T23:16:43Z: second `review_approved` for commit `71453bb`
- 2026-05-16T23:18:47Z: final `done` with closeout commit `18bc6e0`

So the parent is not waiting on product semantics. It is waiting on machine
truth / branch-evidence reconciliation.

### 4. Branch evidence drift is real

Repository checks from this task worktree show:

- `git branch -a --contains 6e0c9fd` still finds `codex/be-cc-001-fu-seed`
- `git branch -a --contains 71453bb` finds no current local branch
- `git branch -a --contains 18bc6e0` finds no current local branch
- `git ls-remote --heads origin gemini2/doc-ten-gov-001-finalize` currently
  returns no branch
- `git reflog --all` still records `c9e214c`, `e2132e0`, `71453bb`, and
  `18bc6e0` on `main-worktree/HEAD` dated 2026-05-16

Interpretation: the later post-reopen fixes existed and were recorded in
machine truth, but their branch anchor is not currently durable in the fetched
ref set.

## Decision

Resolve the planning blocker as follows:

1. Keep the accepted `TN_NewBooking` contract-safe scope unchanged.
2. Treat the old blocked parent row as stale machine truth.
3. Route the parent away from planning and toward closeout/history repair.

This task does not attempt that repair directly because its scope is planning
reconciliation, not branch-history repair.

## Parent Next Step

Update parent `TEN-UI-RD-010` with this concrete next step:

Reopen the task from `blocked` because the planning blocker is resolved.
Owner should repair closeout evidence by restoring the final 2026-05-16
implementation/closeout chain (`71453bb`, `18bc6e0`, or an equivalent
re-landed diff) onto a live task branch, then re-close the parent against the
current reachable branch evidence.

If supervisor prefers a dedicated child task, that follow-up should be a
history-repair unblock, not another planning-decision unblock.

## Out of Scope

- re-deciding tenant booking product semantics
- reopening `discussion_planning`
- force-pushing or rewriting shared history from this planning task
