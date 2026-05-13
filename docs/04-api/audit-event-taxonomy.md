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

| actionName                                             | First seen at                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `tenant.quota_policy.updated`                          | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1575` |
| `tenant.approval_rule.updated`                         | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1945` |
| `tenant.approval_rule.created`                         | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:1946` |
| `tenant.approval_rule.reordered`                       | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2012` |
| `tenant.approval_rule.disabled`                        | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2045` |
| `booking.approval_rules.evaluated`                     | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2100` |
| `booking.approval_request.ops_nudged_approver`         | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2209` |
| `booking.approval_request.ops_sla_breach_acknowledged` | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2283` |
| `booking.approval_request.created`                     | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2501` |
| `booking.approval_request.cancelled_by_re_evaluation`  | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2577` |
| `tenant.cost_center.coverage_listed`                   | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2739` |
| `tenant.cost_center.updated`                           | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2848` |
| `tenant.cost_center.created`                           | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2849` |
| `tenant.cost_center.disabled`                          | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2900` |
| `booking.approval_request.timeout_escalated`           | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6754` |
| `booking.approval_request.approved`                    | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6865` |
| `booking.approval_request.rejected`                    | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6866` |
| `approver_fallback_used`                               | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:6908` |
| `tenant.quota_reservation.blocked`                     | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:8229` |
| `tenant.quota_ledger.entry_added`                      | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:8639` |
| `tenant.quota_snapshot.refreshed`                      | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:8662` |

<!-- GENERATED:tenant-governance-audit-events:end -->

## Manual Event Notes

### Cost centers

| Event                                | Emits when                                                                             | Resource type                        | Notes                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `tenant.cost_center.created`         | `POST /api/tenant/cost-centers` inserts a directory entry                              | `tenant_cost_center`                 | `newValuesSummary` captures the full normalized directory record.                               |
| `tenant.cost_center.updated`         | `POST /api/tenant/cost-centers` mutates an existing directory entry                    | `tenant_cost_center`                 | The route remains an upsert, but create and update now emit distinct audit names.               |
| `tenant.cost_center.disabled`        | `POST /api/tenant/cost-centers/disable` disables a directory entry                     | `tenant_cost_center`                 | `disabledReason` is included in the audit summary.                                              |
| `tenant.cost_center.coverage_listed` | `GET /api/tenant/cost-centers/coverage` summarizes legacy vs directory-backed bookings | `tenant_cost_center_coverage_report` | Audit summary includes `totalBookings`, `resolvedCount`, `unresolvedCount`, and `disabledHits`. |

### Approval rules

| Event                              | Emits when                                                                 | Resource type          | Notes                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `tenant.approval_rule.created`     | A new rule is inserted through the shared upsert path                      | `tenant_approval_rule` | `newValuesSummary` includes priority, action, approver kinds, and the current rule-version snapshot. |
| `tenant.approval_rule.updated`     | An existing rule is mutated through the same upsert path                   | `tenant_approval_rule` | The service does not emit a separate read-model sync event.                                          |
| `tenant.approval_rule.disabled`    | `POST /api/tenant/approval-rules/{ruleId}/disable` marks the rule inactive | `tenant_approval_rule` | `disabledAt` and `disabledReason` are preserved on the record.                                       |
| `tenant.approval_rule.reordered`   | `POST /api/tenant/approval-rules/reorder` rewrites priorities              | `tenant_approval_rule` | Audit payload records the final ordered rule id list.                                                |
| `booking.approval_rules.evaluated` | `POST /api/tenant/approval-rules/evaluate` runs the pure evaluator         | `booking`              | Dry-run evaluations emit a tenant-governance audit row with evaluator latency and matched rule ids.  |

### Quotas

| Event                              | Emits when                                                                               | Resource type              | Notes                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant.quota_policy.updated`      | `POST /api/tenant/quotas/policies` writes tenant-level or cost-center-level quota policy | `tenant_quota_policy`      | `resourceId` is the tenant id for tenant-wide policy, or the cost-center code for scoped policy.                                                  |
| `tenant.quota_reservation.blocked` | Atomic quota reservation rejects a booking write                                         | `tenant_quota_reservation` | Live source emits this when `QUOTA_INSUFFICIENT_AT_COMMIT` is raised. It is not listed in execution packet §5 but is useful operational evidence. |
| `tenant.quota_ledger.entry_added`  | Reservation flow appends a quota ledger row                                              | `tenant_quota_ledger`      | One audit row is emitted per ledger entry.                                                                                                        |
| `tenant.quota_snapshot.refreshed`  | Reservation flow recalculates the monthly snapshot                                       | `tenant_quota_snapshot`    | Snapshot resource ids are composite keys over tenant, scope, period, and period key.                                                              |

### Approval requests and fallbacks

| Event                                                  | Emits when                                                                                             | Resource type             | Notes                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `booking.approval_request.created`                     | Booking governance creates a new approval request                                                      | `booking`                 | The audit summary captures `approvalRequestId`, `bookingId`, `orderId`, approver resolution output, and timeout. |
| `booking.approval_request.approved`                    | An approver decision resolves the request as approved                                                  | `booking`                 | Emitted only when the request leaves `pending`.                                                                  |
| `booking.approval_request.rejected`                    | An approver decision resolves the request as rejected                                                  | `booking`                 | `reasonCode` is included when the reject command supplies it.                                                    |
| `booking.approval_request.timeout_escalated`           | A tenant admin manually escalates the request                                                          | `booking`                 | Phase 1 uses manual escalation; the timeout cron route remains a 501 stub.                                       |
| `booking.approval_request.cancelled_by_re_evaluation`  | Booking update re-evaluation makes approval unnecessary                                                | `booking`                 | Existing pending requests are bulk-cancelled with the original evaluation ids preserved.                         |
| `booking.approval_request.ops_nudged_approver`         | Ops nudges an approver from the cross-tenant queue                                                     | `tenant_approval_request` | This is a follow-on observability / ops-console event beyond the original packet §5 inventory.                   |
| `booking.approval_request.ops_sla_breach_acknowledged` | Ops acknowledges an approval SLA breach                                                                | `tenant_approval_request` | This is a follow-on observability / ops-console event beyond the original packet §5 inventory.                   |
| `approver_fallback_used`                               | `cost_center_owner` cannot be resolved and the service falls back to escalation target or tenant admin | `booking`                 | The audit summary records both the original descriptor and the fallback descriptor.                              |

### Booking governance lifecycle (`owned-mobility.service.ts`)

| Event                            | Emits when                                                                               | Resource type | Notes                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `booking.cost_center.assigned`   | Booking create/update persists a changed resolved cost center onto the order             | `booking`     | Emitted only when the booking has a `bookingId`, a resolved `costCenter`, and the normalized cost-center code differs from the previous value.                                             |
| `booking.governance.evaluated`   | Booking governance evaluation finishes during create/update flow                         | `booking`     | The audit summary records `evaluationId`, decision, approval-required/blocked flags, matched rule ids, and the cost-center/rule-version/quota-snapshot context persisted with the booking. |
| `booking.approval_state.changed` | Owned-mobility updates a booking's approval state after evaluation or request resolution | `booking`     | This event is emitted by `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`, not by the generated source file above.                                                          |

## Execution Packet Alignment Review

The execution packet's endpoint inventory is fully represented in
`docs/04-api/openapi-spec.yaml`. For audit names, the live source differs from
the packet in a small number of places:

| Execution packet §5 entry                              | Live source status                                                                                    | Documentation treatment                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `booking.cost_center.assigned`                         | Emitted from `owned-mobility.service.ts` rather than the generated `tenant-partner.service.ts` source | Documented in the manual lifecycle section above. |
| `booking.governance.evaluated`                         | Emitted from `owned-mobility.service.ts` rather than the generated `tenant-partner.service.ts` source | Documented in the manual lifecycle section above. |
| `booking.approval_state.changed`                       | Emitted, but from `owned-mobility.service.ts` instead of `tenant-partner.service.ts`                  | Documented in the manual section above.           |
| `booking.approval_request.ops_nudged_approver`         | Extra live-source event beyond packet §5                                                              | Documented in the manual section above.           |
| `booking.approval_request.ops_sla_breach_acknowledged` | Extra live-source event beyond packet §5                                                              | Documented in the manual section above.           |
| `tenant.quota_reservation.blocked`                     | Extra live-source event beyond packet §5                                                              | Documented in the manual section above.           |

All remaining packet §5 event names are emitted exactly as written, with
service ownership split between `tenant-partner.service.ts` (generated section)
and `owned-mobility.service.ts` (manual lifecycle notes).
