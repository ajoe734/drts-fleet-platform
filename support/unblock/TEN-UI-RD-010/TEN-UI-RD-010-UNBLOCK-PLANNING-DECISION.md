# TEN-UI-RD-010 Unblock — Planning Decision Reconciliation

Date: 2026-05-20
Owner: Codex
Reviewer: Claude
Parent task: `TEN-UI-RD-010`
Child task: `TEN-UI-RD-010-UNBLOCK-PLANNING-DECISION`

## Summary

`TEN-UI-RD-010` is not blocked by a missing product or contract decision
anymore. The tenant-governance contract wave already resolved the planning
question, and the current `origin/dev` planning artifacts record the screen as
shipped.

The remaining gap was control-plane drift. This unblock task routes the stale
parent row away from the 2026-05-10 pre-contract blocker and back to normal
closeout sync, because the canonical planning and delivery evidence already
resolved the product question.

## Canonical Decision

The accepted `TN_NewBooking` scope stays unchanged:

- implement against the published tenant booking, cost-center, quota-preview,
  and approval-evaluation contracts
- keep estimated spend preview-only
- allow booking-on-behalf metadata
- do not invent draft-save or tenant-side quoted-fare override behavior

Canonical planning sources:

- `docs/05-ui/tenant-console-parity-decisions-20260510.md`
- `docs/05-ui/tenant-canonical-contract-gaps-design-response-20260513.md`
- `docs/05-ui/tenant-console-redesign-closeout-20260514.md`

## Evidence

### 1. The original planning blocker was stale and has now been rerouted

Before this reconciliation, the canonical machine-truth root recorded parent
`TEN-UI-RD-010` as:

- status `blocked`
- last update `2026-05-10T18:26:24Z`
- blocker summary: no tenant cost-center directory or approval-rule read model

That matched the pre-contract state on 2026-05-10, but it no longer matched
the accepted planning docs or the shipped Wave 3 closeout evidence on
`origin/dev`.

The canonical root now records parent `TEN-UI-RD-010` as:

- status `in_progress`
- last update `2026-05-20T05:45:45Z`
- next step: sync the stale parent row to the shipped `origin/dev` evidence
  already recorded in the parity decision log, redesign closeout doc, and dev
  merge `7673f8a`

This confirms the unblock outcome is routing and control-plane repair, not a
new planning decision.

### 2. Canonical planning artifacts already resolved the product decision

The current `origin/dev` parity-decision log records:

- 2026-05-14 Wave 3 closeout update: `TEN-UI-RD-010` reopened after
  `BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, and `BE-APR-001`
- `TEN-UI-RD-010` decision: implement against published booking,
  cost-center, quota-preview, and approval-evaluation contracts
- 2026-05-18 machine-truth refresh: `TEN-UI-RD-010` closeout is preserved in
  the refreshed Wave 3 packet instead of returning to planning

The accepted design response for the tenant-governance wave also explicitly
frames these UI tasks as waiting on backend contract delivery, not on new
product semantics.

### 3. The shipped closeout is already documented on `origin/dev`

`docs/05-ui/tenant-console-redesign-closeout-20260514.md` records:

- `TEN-UI-RD-010` approved at `2026-05-18T15:18:15Z`
- shipped commit `12616aa`
- push branch `codex/ten-ui-rd-010`
- the final payload merged into `origin/dev` and is reflected by the dev-side
  machine-truth row for `TEN-UI-RD-010`

Interpretation: the blocker is not product uncertainty. The stale root task row
needed to be rerouted to the already-shipped planning and delivery record.

## Decision

Resolve the planning blocker as follows:

1. Keep the accepted `TN_NewBooking` contract-safe scope unchanged.
2. Treat the old `blocked` parent row in the supervisor machine-truth root as
   stale.
3. Route the parent back into execution/control-plane reconciliation instead of
   reopening planning.

## Parent Next Step

Canonical machine truth now records parent `TEN-UI-RD-010` with this next
step:

Planning blocker resolved. Reopen the parent from stale `blocked` state and
sync its task row to the shipped `origin/dev` evidence already recorded in
`tenant-console-parity-decisions-20260510.md` and
`tenant-console-redesign-closeout-20260514.md`, then continue normal closeout
from that reachable evidence instead of sending the task back to
`discussion_planning`.

If a follow-up is still needed after the status sync, it should be a delivery
or machine-truth reconciliation task, not another planning-decision unblock.

## Out of Scope

- re-deciding tenant booking product semantics
- reopening `discussion_planning`
- inventing new tenant cost-center or approval-rule behavior
