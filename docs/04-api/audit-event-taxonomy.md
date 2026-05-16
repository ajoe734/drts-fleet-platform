# Tenant Governance Audit Event Taxonomy

This document tracks the tenant-governance audit surface introduced by the
cost-center, quota, approval-rule, and approval-request slices.

- Auto-generated source section: `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- Related lifecycle source outside the generator: `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- Regenerate with: `node scripts/generate-tenant-governance-audit-taxonomy.mjs`
- Comparison baseline: `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md` §5

## Generated Service Events

<!-- GENERATED:tenant-governance-audit-events:start -->

_Source of truth: `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`_

| actionName                                                | First seen at                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------- |
| `tenant.quota_policy.updated`                             | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1578` |
| `tenant.approval_rule.updated`                            | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1816` |
| `tenant.approval_rule.created`                            | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1817` |
| `tenant.approval_rule.reordered`                          | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1883` |
| `tenant.approval_rule.disabled`                           | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1916` |
| `booking.approval_rules.evaluated`                        | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1971` |
| `booking.approval_request.created`                        | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2175` |
| `booking.approval_request.cancelled_by_re_evaluation`     | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2252` |
| `booking.approval_request.nudged_by_ops`                  | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:285`  |
| `booking.approval_request.sla_breach_acknowledged_by_ops` | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:287`  |
| `list_cost_center_coverage`                               | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2468` |
| `upsert_cost_center`                                      | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2576` |
| `disable_cost_center`                                     | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2627` |
| `booking.approval_request.timeout_escalated`              | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6565` |
| `booking.approval_request.approved`                       | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6676` |
| `booking.approval_request.rejected`                       | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6677` |
| `approver_fallback_used`                                  | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6719` |
| `tenant.quota_reservation.blocked`                        | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:7801` |
| `tenant.quota_ledger.entry_added`                         | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:8147` |
| `tenant.quota_snapshot.refreshed`                         | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:8166` |
| `booking.cost_center.validation_rejected`                 | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:8196` |

<!-- GENERATED:tenant-governance-audit-events:end -->

## Manual Event Notes

### Cost centers

| Event                                     | Emits when                                                                                | Resource type                        | Notes                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `upsert_cost_center`                      | `POST /api/tenant/cost-centers` creates or updates a directory entry                      | `tenant_cost_center`                 | The live service uses one audit action for both insert and update flows; infer create vs update from prior state.                       |
| `disable_cost_center`                     | `POST /api/tenant/cost-centers/disable` disables a directory entry                        | `tenant_cost_center`                 | `disabledReason` is included in the audit summary.                                                                                      |
| `list_cost_center_coverage`               | `GET /api/tenant/cost-centers/coverage` summarizes legacy vs directory-backed bookings    | `tenant_cost_center_coverage_report` | Audit summary includes `totalBookings`, `resolvedCount`, `unresolvedCount`, and `disabledHits`.                                         |
| `booking.cost_center.validation_rejected` | Booking create or update rejects an invalid, unknown, or disabled tenant cost-center code | `tenant_cost_center`                 | `newValuesSummary.errorCode` is one of `BOOKING_COST_CENTER_INVALID`, `BOOKING_COST_CENTER_UNKNOWN`, or `BOOKING_COST_CENTER_DISABLED`. |

### Approval rules

| Event                              | Emits when                                                                 | Resource type          | Notes                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `tenant.approval_rule.created`     | A new rule is inserted through the shared upsert path                      | `tenant_approval_rule` | `newValuesSummary` includes priority, action, approver kinds, and the current rule-version snapshot. |
| `tenant.approval_rule.updated`     | An existing rule is mutated through the same upsert path                   | `tenant_approval_rule` | The service does not emit a separate read-model sync event.                                          |
| `tenant.approval_rule.disabled`    | `POST /api/tenant/approval-rules/{ruleId}/disable` marks the rule inactive | `tenant_approval_rule` | `disabledAt` and `disabledReason` are preserved on the record.                                       |
| `tenant.approval_rule.reordered`   | `POST /api/tenant/approval-rules/reorder` rewrites priorities              | `tenant_approval_rule` | Audit payload records the final ordered rule id list.                                                |
| `booking.approval_rules.evaluated` | `POST /api/tenant/approval-rules/evaluate` runs the pure evaluator         | `booking`              | Dry-run evaluations emit a tenant-governance audit row with evaluator latency and matched rule ids.  |

### Quotas

| Event                              | Emits when                                                                               | Resource type           | Notes                                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant.quota_policy.updated`      | `POST /api/tenant/quotas/policies` writes tenant-level or cost-center-level quota policy | `tenant_quota_policy`   | `resourceId` is the tenant id for tenant-wide policy, or the cost-center code for scoped policy.                                                                                        |
| `tenant.quota_ledger.entry_added`  | Reservation flow appends a quota ledger row                                              | `tenant_quota_ledger`   | One audit row is emitted per ledger entry.                                                                                                                                              |
| `tenant.quota_snapshot.refreshed`  | Reservation flow recalculates the monthly snapshot                                       | `tenant_quota_snapshot` | Snapshot resource ids are composite keys over tenant, scope, period, and period key.                                                                                                    |
| `tenant.quota_reservation.blocked` | Atomic quota reservation rejects a booking write at commit time                          | `booking`               | `newValuesSummary.errorCode` is `QUOTA_INSUFFICIENT_AT_COMMIT`, plus the blocked scope, dimension, and remaining values. This is extra live-source evidence beyond execution-packet §5. |

### Approval requests and fallbacks

| Event                                                     | Emits when                                                                                                                 | Resource type             | Notes                                                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `booking.approval_request.created`                        | Booking governance creates a new approval request                                                                          | `booking`                 | The audit summary captures `approvalRequestId`, `bookingId`, `orderId`, approver resolution output, and timeout.  |
| `booking.approval_request.approved`                       | An approver decision resolves the request as approved                                                                      | `booking`                 | Emitted only when the request leaves `pending`.                                                                   |
| `booking.approval_request.rejected`                       | An approver decision resolves the request as rejected                                                                      | `booking`                 | `reasonCode` is included when the reject command supplies it.                                                     |
| `booking.approval_request.timeout_escalated`              | A tenant admin manually escalates the request                                                                              | `booking`                 | Phase 1 uses manual escalation; the timeout cron route remains a 501 stub.                                        |
| `booking.approval_request.nudged_by_ops`                  | `POST /api/ops/approval-requests/{approvalRequestId}/nudge` records an ops follow-up against a pending request             | `tenant_approval_request` | Audit summary includes `bookingId`, `orderId`, and the optional `reasonNote` entered by ops.                      |
| `booking.approval_request.sla_breach_acknowledged_by_ops` | `POST /api/ops/approval-requests/{approvalRequestId}/acknowledge-breach` records that ops acknowledged an SLA-risk request | `tenant_approval_request` | This is an ops-queue acknowledgement marker only; it does not resolve or escalate the approval request by itself. |
| `booking.approval_request.cancelled_by_re_evaluation`     | Booking update re-evaluation makes approval unnecessary                                                                    | `booking`                 | Existing pending requests are bulk-cancelled with the original evaluation ids preserved.                          |
| `approver_fallback_used`                                  | `cost_center_owner` cannot be resolved and the service falls back to escalation target or tenant admin                     | `booking`                 | The audit summary records both the original descriptor and the fallback descriptor.                               |

### Booking governance lifecycle (`owned-mobility.service.ts`)

| Event                            | Emits when                                                                               | Resource type | Notes                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `booking.approval_state.changed` | Owned-mobility updates a booking's approval state after evaluation or request resolution | `booking`     | This event is emitted by `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`, not by the generated source file above. |

The current `owned-mobility.service.ts` does not emit standalone
`booking.cost_center.assigned` or `booking.governance.evaluated` action names.
Those entries remain in execution-packet §5 as design-time expectations, but
they do not appear in the live implementation scanned for this document.

## Execution Packet Alignment Review

The execution packet's endpoint inventory is fully represented in
`docs/04-api/openapi-spec.yaml`. For audit names, the current live
implementation differs from execution-packet §5 in a few concrete ways:

| Execution packet §5 entry            | Live source status                                                                            | Documentation treatment                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `tenant.cost_center.created`         | Not emitted verbatim; the live service collapses create and update into `upsert_cost_center`. | Documented under the cost-center manual section above. |
| `tenant.cost_center.updated`         | Not emitted verbatim; the live service collapses create and update into `upsert_cost_center`. | Documented under the cost-center manual section above. |
| `tenant.cost_center.disabled`        | Renamed in live code to `disable_cost_center`.                                                | Documented under the cost-center manual section above. |
| `tenant.cost_center.coverage_listed` | Renamed in live code to `list_cost_center_coverage`.                                          | Documented under the cost-center manual section above. |
| `booking.cost_center.assigned`       | Not present as a standalone action name in the current `owned-mobility.service.ts`.           | Explicitly called out as packet-only drift.            |
| `booking.governance.evaluated`       | Not present as a standalone action name in the current `owned-mobility.service.ts`.           | Explicitly called out as packet-only drift.            |
| `booking.approval_state.changed`     | Emitted, but from `owned-mobility.service.ts` instead of `tenant-partner.service.ts`.         | Documented in the manual lifecycle section above.      |

The live implementation also emits two governance-protection events that are
not listed in execution-packet §5:

| Live-only event                                           | Source status                                                                                      | Documentation treatment                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `tenant.quota_reservation.blocked`                        | Emitted when atomic quota reservation rejects a booking write with `QUOTA_INSUFFICIENT_AT_COMMIT`. | Documented under the quota manual section above.            |
| `booking.cost_center.validation_rejected`                 | Emitted when booking flows reject invalid, unknown, or disabled cost-center values.                | Documented under the cost-center manual section above.      |
| `booking.approval_request.nudged_by_ops`                  | Emitted when ops uses the approval queue nudge endpoint to leave a reminder or reason note.        | Documented under the approval-request manual section above. |
| `booking.approval_request.sla_breach_acknowledged_by_ops` | Emitted when ops acknowledges an SLA-risk approval request from the queue surface.                 | Documented under the approval-request manual section above. |

Current live source therefore resolves the packet inventory as:

- 15 event names emitted verbatim
- 4 cost-center names represented by renamed or collapsed live actions
- 2 packet-only names not present in the current code path scan
- 4 additional live-only governance events outside packet §5
