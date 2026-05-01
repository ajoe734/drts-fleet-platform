# Phase 1 Operator Ownership And Escalation Matrix

Task ref: `ORX-GV-002`

This document is the architecture-side ownership map for the highest-risk
negative flows that now exist across Phase 1. It consolidates the owner,
review, escalation, and handoff expectations that were previously spread across
task-specific runbooks.

Operator-facing routing lives at:

- `docs/03-runbooks/phase1-operator-routing-runbook.md`

## Source anchors

- `docs/02-architecture/phase1-operational-complete-remediation-plan-20260430.md`
- `docs/02-architecture/phase1-role-scenario-and-negative-flow-matrix-20260430.md`
- `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`
- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`
- `docs/03-runbooks/incident-escalation-service-recovery-runbook.md`
- `docs/03-runbooks/reconciliation-issue-workflow-runbook.md`

## Hard rules

1. Every exception, override, rollback, escalation, and mismatch path must name
   a primary human owner.
2. Every release or closeout action must preserve actor, reason, and trace.
3. `driver_user` and partner/tenant callers never self-approve governance
   bypasses.
4. Manual review lanes stay explicit until a responsible internal role closes
   them.

## Matrix

| Workflow family                          | Trigger or state                                                                       | Primary owner       | Escalation target                                                                                                     | Review / rollback gate                                                                                                     | Primary operator surfaces                                        | Detailed procedure                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| Tenant rollout rollback                  | `rollback_hold`, blocked production promotion, failed cutover                          | `platform_admin`    | `rollback_owner` restores prior state; `cutover_owner` decides re-promotion timing                                    | Production promotion stays blocked until rollback recovery is confirmed and `productionStatus` is re-approved              | `platform-admin` tenant rollout record                           | `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`            |
| Phone-order recording gate               | `recording_pending`, `recording_missing`, callback overdue, complaint handoff          | `call_center_agent` | `ops_supervisor` when dispatch timing is at risk; `complaint_specialist` when a passenger case must open              | Order remains visible in recording gate flow until recording callback lands or the complaint/callback handoff is completed | `ops-console-web` callcenter workspace and dispatch queue        | `docs/03-runbooks/phase1-operator-routing-runbook.md`              |
| Partner eligibility manual review        | `manual_review`, issuer retry exhaustion, explicit denial needing offline confirmation | `compliance_user`   | `platform_partner_admin` for sponsor / issuer governance follow-up                                                    | Do not release benefit-sponsored service until fallback evidence or sponsor confirmation is recorded                       | `ops-console-web` contracts review queue                         | `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`    |
| Dispatch exception hold and override     | `exception_hold`, override requested, override rejected, override expired              | `dispatcher`        | `ops_supervisor` for same-shift resolution; `dispatch_manager` if the hold becomes an incident-level dispatch failure | No silent release; override requires requester plus separate approver with traceable reason and expiry                     | `ops-console-web` dispatch workflow and callcenter detail card   | `docs/03-runbooks/phase1-operator-routing-runbook.md`              |
| Incident escalation and service recovery | incident opened directly or from dispatch exception                                    | `incident_operator` | `ops_supervisor`, `dispatch_manager`, `safety_officer`, or `roc_duty` by severity and category                        | Service recovery evidence and dispatch source linkage stay attached to the incident timeline                               | `ops-console-web` incidents lane; driver incident entry          | `docs/03-runbooks/incident-escalation-service-recovery-runbook.md` |
| Reconciliation mismatch review           | forwarder mismatch, partner-sponsor mismatch, reopened settlement dispute              | `finance_user`      | Forwarder shadow-ledger owner or partner finance owner, depending on mismatch family                                  | Comments, artifact ids, and prior closeout history are retained across reopen/resolve cycles                               | `platform-admin` payments and `ops-console-web` revenue surfaces | `docs/03-runbooks/reconciliation-issue-workflow-runbook.md`        |

## Canonical handoff points

| From                | To                                | When the handoff happens                                                                                               |
| ------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `call_center_agent` | `dispatcher`                      | A phone order is created and moves into dispatch-visible queue states such as `recording_pending` or `exception_hold`. |
| `call_center_agent` | `complaint_specialist`            | Passenger follow-up becomes a complaint case rather than a booking-only callback.                                      |
| `dispatcher`        | `incident_operator`               | A dispatch exception must become a formal incident with preserved order trace.                                         |
| `dispatcher`        | `ops_supervisor`                  | No-supply, timeout, or override decisions exceed ordinary dispatcher authority.                                        |
| `compliance_user`   | `platform_partner_admin`          | Issuer / sponsor evidence requires program-level or partner-level governance action.                                   |
| `platform_admin`    | `rollback_owner`                  | Tenant rollout must revert to the prior known-good state.                                                              |
| `finance_user`      | external or partner finance owner | Settlement truth depends on external confirmation or sponsor-side evidence.                                            |

## Boundary notes

- Complaint and incident are separate lanes. A complaint may escalate into an
  incident, but complaint ownership does not silently become incident
  ownership.
- Dispatch exception handling and incident escalation are linked but distinct.
  `exception_hold` remains a dispatch-state authority until an incident record
  is created.
- Tenant rollout rollback is platform-owned. `tenant-commute-hub` may display
  rollout state, but it is not the authority for rollback release.
