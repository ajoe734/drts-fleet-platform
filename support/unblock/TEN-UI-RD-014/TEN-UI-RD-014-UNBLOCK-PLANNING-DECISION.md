# TEN-UI-RD-014 Unblock Planning Decision

Last updated: 2026-05-20
Task: `TEN-UI-RD-014-UNBLOCK-PLANNING-DECISION`
Parent task: `TEN-UI-RD-014`
Owner at dispatch: `Codex`
Reviewer at dispatch: `Claude`

## Summary

The parent task's original 2026-05-10 blocker was valid at the time, but it
was already stale by 2026-05-18. The missing tenant approval-rule / quota
contract decision had already been resolved by the accepted
tenant-governance contract wave, so `TEN-UI-RD-014` should not route back to
`discussion_planning` for a missing product/contract choice. Rebasing this
helper branch onto current `origin/dev` confirms that closeout evidence
already exists there, while the canonical machine-truth root still needs the
parent row reconciled away from the stale blocker.

## Original blocker

`ai-status.json` still records the parent row as:

- status: `blocked`
- waiting_for: `Claude`
- next: "Missing tenant approval-rule/quota contract for TN_Rules; see
  docs/05-ui/tenant-console-parity-decisions-20260510.md and route back to
  discussion_planning for contract or scope decision."

That reflected the 2026-05-10 state correctly.

## Current machine truth gap on 2026-05-20

After rebasing onto current `origin/dev`, the code branch and machine-truth
root disagree:

- current `origin/dev` already records closeout evidence for the route on
  merge commit `7673f8a4568e6ceddeadc05ce744d389a7d05b0b`
- canonical `ai-status.json` still records the parent row as `blocked` with
  the old "missing tenant approval-rule/quota contract" redirect

This helper task exists to close that gap: preserve the planning rationale in
canonical artifacts and update the parent task's machine-truth next step to
the already-shipped closeout evidence.

## What resolved the blocker

The accepted planning + execution artifacts published the missing contract
set:

1. `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md`
   defines the tenant-governance wave and its UI unblock map. For
   `TEN-UI-RD-014`, it states that the route needs `BE-RULE-001`, and
   quota-aware rule UX also needs `BE-QUOTA-001`.
2. `docs/05-ui/tenant-console-parity-decisions-20260510.md` records
   `TEN-UI-RD-014` as `Status: shipped` and says the task reopened after
   `BE-RULE-001`, `BE-QUOTA-001`, and `BE-APR-001` published canonical
   tenant approval-rule, quota, and approval-evaluation contracts.
3. `docs/05-ui/tenant-console-redesign-closeout-20260514.md` records the
   shipped route artifacts, reviewer approval, verification commands, and the
   shipping branch / commit: `origin/codex2/ten-ui-rd-014-closeout` at
   `f0e8265`.

## Decision

Planning blocker resolved.

Canonical routing decision:

- Do not send `TEN-UI-RD-014` back to `discussion_planning` for a missing
  product/contract decision.
- Treat the backend dependency as satisfied by the accepted
  tenant-governance wave artifacts above.
- Route the parent task back into execution closeout / machine-truth
  reconciliation using the shipped branch and commit evidence that already
  exists on current `origin/dev`.

## Parent-task next step

Update the canonical parent row away from the stale 2026-05-10 blocker
message and point it at the concrete execution evidence that already exists
on current `origin/dev`:

- dev merge commit: `7673f8a4568e6ceddeadc05ce744d389a7d05b0b`
- dev merge subject: `OPS-STATUS: close out remaining UI work`
- shipped branch: `origin/codex2/ten-ui-rd-014-closeout`
- shipped route commit: `f0e8265`
- proof artifact: `docs/05-ui/tenant-console-redesign-closeout-20260514.md`
- planning artifact: `docs/05-ui/tenant-console-parity-decisions-20260510.md`

This helper task does not re-close `TEN-UI-RD-014`; it only restores the
correct machine-truth next step so the parent can finish closeout against the
already-shipped route evidence.

## Scope cut

This task does not rewrite the parent task's final owner/reviewer closeout
history, does not change the shipped route implementation branch, and does
not claim the canonical parent row is already closed before machine truth is
actually updated. Any final helper closeout must preserve the already-resolved
planning decision and the existing route evidence on
`origin/codex2/ten-ui-rd-014-closeout`.
