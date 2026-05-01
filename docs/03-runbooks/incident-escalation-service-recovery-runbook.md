# Incident Escalation, Service Recovery, and Dispatch-Exception Handoff Runbook

Task: ORX-CS-002

## 1. Purpose

This runbook describes the operational procedures for incident escalation,
service recovery actions, and the handoff path from dispatch exceptions to
formal incidents.

Cross-lane ownership routing for incident escalation and adjacent exception /
override states is summarized in
`docs/03-runbooks/phase1-operator-routing-runbook.md`.

## 2. Escalation Targets

Every incident may optionally have an `escalationTarget` that routes ownership:

| Target             | Role                          | When to use                                                 |
| ------------------ | ----------------------------- | ----------------------------------------------------------- |
| `ops_supervisor`   | Ops shift supervisor          | Standard operational incidents                              |
| `dispatch_manager` | Dispatch operations manager   | Dispatch-related exceptions and failures                    |
| `safety_officer`   | Safety and compliance officer | Safety, injury, and property damage incidents               |
| `roc_duty`         | ROC duty officer              | Critical incidents requiring immediate command coordination |

Escalation targets are set during incident creation or updated via the incident
edit form. Each change is recorded in the incident timeline with actor and
timestamp.

## 3. Severity Levels

| Severity   | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| `low`      | Informational or minor issue, no immediate action required |
| `medium`   | Operational impact, standard resolution timeline           |
| `high`     | Significant impact, priority resolution within shift       |
| `critical` | Safety or major operational failure, immediate escalation  |

Severity can be changed after creation. Each change is tracked in the timeline
as a `severity_escalated` entry.

## 4. Dispatch Exception to Incident Handoff

When a dispatch order enters `exception_hold` status, operators can create a
formal incident from the dispatch console. The handoff:

1. Operator clicks "Escalate to incident" on the exception-hold order card in
   the dispatch workflow page.
2. The system pre-fills the incident with:
   - Order ID and exception reason code from the dispatch exception
   - Operational category
   - The exception note as the description
3. The `sourceDispatchExceptionOrderId` field preserves the link back to the
   original dispatch order, ensuring the full trace chain is not broken.
4. A `dispatch_exception_handoff` timeline entry is created automatically.

### API endpoint

```
POST /api/incidents/from-dispatch-exception
{
  "orderId": "ORD-...",
  "exceptionReasonCode": "no_eligible_supply",
  "exceptionNote": "Optional context",
  "severity": "high",
  "escalationTarget": "dispatch_manager",
  "reportedBy": "ops-user-001"
}
```

## 5. Service Recovery Actions

After an incident is created, operators can record service recovery actions to
document what was done to restore service and compensate affected parties.

### Available action types

| Type                  | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `passenger_recontact` | Passenger was contacted to confirm status and next steps |
| `fare_adjustment`     | Fare was adjusted, refunded, or credited                 |
| `redispatch_ordered`  | A replacement dispatch was ordered                       |
| `voucher_issued`      | A voucher or credit was issued to the passenger          |
| `apology_sent`        | A formal apology notification was sent                   |
| `driver_reassigned`   | A different driver was assigned                          |
| `other`               | Any other recovery action                                |

Each action is:

- Recorded with the actor who performed it and a note explaining the action
- Visible in the incident detail view under "Service Recovery Actions"
- Added to the incident timeline as a `service_recovery_action` entry
- Persisted on the incident record for audit and review

### API endpoint

```
POST /api/incidents/:incidentId/service-recovery
{
  "actionType": "passenger_recontact",
  "note": "Called passenger to confirm alternative transport arranged",
  "actor": "ops-user-001"
}
```

## 6. Cross-Lane Workflow

### Complaint to incident

Complaints can be escalated to incidents via `POST /api/complaints/:caseNo/escalate-to-incident`.
The complaint and incident are bidirectionally linked.

### Dispatch exception to incident

Dispatch exceptions can be escalated via `POST /api/incidents/from-dispatch-exception`.
The original order trace is preserved through `sourceDispatchExceptionOrderId`.

### Incident to service recovery

Service recovery actions are recorded on incidents to document operational
remediation steps.

## 7. Audit Trail

All escalation, severity change, assignment, and service recovery actions produce:

- Timeline entries on the incident
- Audit log records via the audit notification service
- Persistence to the database for compliance review
