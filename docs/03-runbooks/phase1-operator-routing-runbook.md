# Phase 1 Operator Routing Runbook

Task ref: `ORX-GV-002`  
Architecture anchor:
`docs/02-architecture/phase1-operator-ownership-escalation-matrix-20260501.md`

## Purpose

This runbook is the operator-facing routing set for the highest-risk manual
paths in Phase 1:

- rollback
- manual review
- exception hold
- override approval
- incident escalation
- reconciliation dispute closure

Use it as the first routing reference before opening the task-specific
procedures linked below.

## Shared rules

1. Record actor, reason, request ID, and source screen for every manual state
   change.
2. Do not silently release a blocked workflow.
3. Preserve the original business trace when moving work across lanes:
   `tenantId`, `orderId`, `callId`, `caseNo`, `incidentId`, and
   reconciliation issue identifiers must remain linked.
4. If the next action needs a different authority role, hand off explicitly;
   do not treat "someone else will see it" as a valid workflow step.

## Routing table

| Situation                                          | First owner               | Escalate to                                                                                           | Stop / release rule                                                                                                 | Detailed runbook                                                   |
| -------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Tenant cutover must pause or reverse               | `platform_admin`          | `rollback_owner`, then `cutover_owner` for restart decision                                           | Keep tenant in `rollback_hold` until prior working state is restored and production readiness is re-approved        | `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`            |
| Phone order is still waiting on recording evidence | `call_center_agent`       | `ops_supervisor` if dispatch timing is at risk; `complaint_specialist` if customer remediation starts | Keep the order in explicit recording gate handling until callback lands or the complaint/callback handoff completes | This runbook, "Recording Gate"                                     |
| Partner eligibility is not clearly approved        | `compliance_user`         | `platform_partner_admin`                                                                              | Do not release benefit-sponsored service until fallback evidence or sponsor confirmation is recorded                | `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`    |
| Dispatch order enters `exception_hold`             | `dispatcher`              | `ops_supervisor` for queue resolution; `dispatch_manager` if it becomes a wider dispatch incident     | Hold stays explicit until cancelled, formally released, or escalated into an incident                               | This runbook, "Exception Hold And Override"                        |
| Override is requested on an exception hold         | `dispatcher` as requester | Separate approver under supervisor / manager authority                                                | No self-approval, no silent release, no expired approval reuse                                                      | This runbook, "Exception Hold And Override"                        |
| Dispatch exception becomes a formal incident       | `incident_operator`       | Severity-based target: `ops_supervisor`, `dispatch_manager`, `safety_officer`, or `roc_duty`          | Preserve `sourceDispatchExceptionOrderId` and recovery actions on the incident timeline                             | `docs/03-runbooks/incident-escalation-service-recovery-runbook.md` |
| Settlement mismatch needs resolution               | `finance_user`            | Forwarder shadow-ledger owner or partner finance owner                                                | Retain comments and artifact IDs through assign, resolve, and reopen                                                | `docs/03-runbooks/reconciliation-issue-workflow-runbook.md`        |

## Recording Gate

Use this path when a phone order is visible but recording evidence is not yet
fully linked.

### `recording_pending`

- Owner: `call_center_agent`
- Meaning: the booking exists, but recording callback linkage is still pending
- Required actions:
  - keep callback task visibility active in the callcenter workspace
  - keep complaint handoff available from the same workspace
  - avoid representing the order as evidence-complete

### `recording_missing`

- Owner: `call_center_agent`
- Escalation target:
  - `ops_supervisor` if dispatch timing or SLA is threatened
  - `complaint_specialist` if customer remediation must begin
- Required actions:
  - investigate CTI callback health or linkage failure
  - keep the evidence gap explicit in operator views
  - preserve `callId` and related order linkage before handoff

## Exception Hold And Override

Use this path when dispatch is blocked by supply, compliance, or manual
exception conditions.

### Exception hold baseline

- Owner: `dispatcher`
- Escalation target:
  - `ops_supervisor` for same-shift queue resolution
  - `dispatch_manager` if the failure pattern is broader than one order
- Required actions:
  - keep the order in `exception_hold`
  - preserve reason code and dispatch trace
  - choose one of: cancel, formal release, or incident escalation

### Override request

- Request owner: `dispatcher`
- Approver: separate supervisor or manager authority
- Required fields:
  - override type
  - requester
  - approver
  - reason
  - expiry
  - scope
- Hard rules:
  - no self-approval
  - no reviewer-free silent release
  - expired approvals must not be reused

### Incident handoff

Escalate from exception hold to incident when the order-level dispatch problem
now requires formal service recovery, safety review, or command coordination.

At handoff time:

- preserve the original `orderId`
- create the incident with `sourceDispatchExceptionOrderId`
- keep recovery actions on the incident record instead of burying them in
  dispatch-only notes

## Rollback Routing

Tenant rollout rollback remains platform-governed.

- First owner: `platform_admin`
- Restore authority: `rollback_owner`
- Re-promotion decision: `cutover_owner`

Minimum rollback sequence:

1. Put the tenant into `rollback_hold`.
2. Revert production-facing credentials or endpoints to the prior known-good
   state.
3. Keep `productionStatus` blocked until recovery is confirmed.
4. Re-promote only after the rollback owner confirms recovery and the cutover
   owner accepts the restart timing.

## Reconciliation Disputes

Use finance workflow instead of dispatch or complaint notes when the mismatch is
about settlement truth.

- Owner: `finance_user`
- Escalation target:
  - forwarder shadow-ledger owner for mirror / sync mismatches
  - partner finance owner for sponsor responsibility mismatches
- Required actions:
  - assign the issue explicitly
  - retain artifact IDs in comments and final resolution
  - reopen instead of overwriting prior closeout if new evidence arrives

## Operator Set

This runbook is the top-level routing layer. The detailed procedure set is:

- `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`
- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`
- `docs/03-runbooks/incident-escalation-service-recovery-runbook.md`
- `docs/03-runbooks/reconciliation-issue-workflow-runbook.md`
