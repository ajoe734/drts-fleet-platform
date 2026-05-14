# Operational Observability Alert Runbook

Task: `OPX-GV-003`  
Surfaces:

- `GET /api/operational-observability`
- Ops Console `dashboard`
- Platform Admin `health`

## Purpose

This runbook defines the minimum operational visibility bar for Phase 1 workflow health. The goal is to make dispatch lag, recording backlog, driver-state lag, webhook failures, and partner eligibility review backlog measurable from one shared snapshot.

The current thresholds are operational defaults for Phase 1. They are intentionally conservative and can be tightened later by `OPX-GV-004` when formal SLO / paging policy work is ready.

The formal workload, SLA, and degradation baseline now lives in
`docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`.

## Alert Taxonomy

| Alert key                    | Primary route | Secondary route | Measured value                                                | Warning | Critical |
| ---------------------------- | ------------- | --------------- | ------------------------------------------------------------- | ------- | -------- |
| `dispatch_lag`               | ops           | platform        | oldest ready / redispatch order lag                           | 10 min  | 20 min   |
| `recording_backlog`          | ops           | none            | oldest recording-pending order or call-session lag            | 5 min   | 15 min   |
| `driver_state_lag`           | ops           | none            | oldest stale driver location lag for dispatch-eligible supply | 10 min  | 20 min   |
| `webhook_failure_burst`      | platform      | none            | failed webhook deliveries in trailing 1 hour                  | 2       | 5        |
| `eligibility_review_backlog` | ops           | platform        | total partner eligibility manual-review / denied queue        | 2       | 4        |

## Snapshot Fields

The shared snapshot exposes these workflow families:

- `dispatch`
  - active orders
  - queue depth
  - lagged orders
  - redispatch / exception-hold / dispatch-failed counts
  - oldest ready-order lag
- `recording`
  - phone-order count
  - linked ratio
  - recording-pending order count
  - call sessions still missing recording linkage
  - oldest pending lag
- `driverState`
  - total / available / dispatch-eligible / offline drivers
  - stale-location count
  - missing-location count
  - oldest location lag
- `webhook`
  - total / active / disabled endpoints
  - queued deliveries
  - failed deliveries in the trailing hour
  - oldest queued-delivery lag
- `eligibility`
  - total review queue
  - manual-review queue
  - manual-fallback queue
  - ineligible queue
  - recent failures in 24 hours
- `reporting`
  - queued or running jobs
  - failed jobs
  - dispatch-recording-index jobs still pending
- `adapters`
  - healthy / degraded / down forwarder adapters

## Role Views

### Ops route

Focus areas:

- dispatch
- recording
- driver state
- reporting

Default response order:

1. Clear `dispatch_lag` first because it directly affects active trip fulfillment.
2. Clear `recording_backlog` next so phone-order evidence and downstream complaint flows do not drift.
3. Investigate `driver_state_lag` before trusting supply availability in dispatch decisions.
4. Work `eligibility_review_backlog` before releasing partner-funded dispatch or settlement actions.

### Platform route

Focus areas:

- dispatch
- webhook
- eligibility
- reporting
- adapters

Default response order:

1. Stabilize `webhook_failure_burst` by checking disabled endpoints, recent tenant changes, and repeated retry loops.
2. Review `eligibility_review_backlog` for systemic adapter, contract, or issuer-side failures.
3. Use adapter health counts plus forwarder adapter detail to confirm whether platform integrations are degraded or down.
4. Keep `dispatch_lag` visible because prolonged platform-side integration failures can surface as queue growth.

## Triage Guidance

### `dispatch_lag`

Check:

- ready / redispatch order growth
- dispatch queue depth
- exception-hold and dispatch-failed counts
- stale driver locations that may make supply look healthier than it is

Likely actions:

- reassign or redispatch stuck orders
- resolve exception holds blocking ready orders
- verify supply eligibility and location freshness

### `recording_backlog`

Check:

- `recording_pending` orders
- closed or active call sessions still missing `recordingId`
- report queue for `dispatch_recording_index`

Likely actions:

- verify CTI callback flow
- confirm recording provider reference / callback payload format
- escalate if recording evidence is required for complaint or audit follow-up

### `driver_state_lag`

Check:

- dispatch-eligible drivers with no location
- dispatch-eligible drivers with stale location heartbeat
- concurrent driver device or connectivity issues

Likely actions:

- confirm heartbeat path from driver devices
- remove stale supply from dispatch decisions until heartbeat recovers
- compare with ops-console supply and shift views

### `webhook_failure_burst`

Check:

- disabled tenant endpoints
- queued delivery backlog
- recent endpoint edits or secret rotations
- adapter-wide transport errors vs tenant-specific failures

Likely actions:

- re-run tenant webhook tests after endpoint fixes
- confirm shared secret alignment
- inspect retry growth before disabling or rotating endpoints again

### `eligibility_review_backlog`

Check:

- manual-review cases caused by issuer timeout / retry exhaustion
- ineligible bursts tied to one partner entry or one tenant
- manual fallback requests still awaiting ops action

Likely actions:

- review partner contract configuration
- separate issuer outage from true ineligible traffic
- clear or annotate fallback cases before dispatch / settlement release

## Tenant Governance Alerts

This alert set covers the tenant governance metrics namespace:

- Logical namespace: `tenant_governance.approval.*`, `tenant_governance.quota.*`, `tenant_governance.cost_center.*`
- Prometheus export names used by Grafana / alert rules replace dots with underscores, for example `tenant_governance_approval_pending_count`.

Alert inventory:

- `TenantGovernanceQuotaUsageHigh`
  Trigger: quota usage above 95% for 10 minutes.
  Response: confirm whether the tenant is near a genuine monthly cap, review the latest `tenant.quota_snapshot.refreshed` audit rows, and decide whether to raise the quota, switch enforcement to `require_approval`, or ask the tenant admin to release stale reservations.
- `TenantGovernancePendingApprovalP95AgeHigh`
  Trigger: p95 pending approval age above 24 hours for 15 minutes.
  Response: open the tenant approval queue, identify which approvers are stalling, and re-drive approver notifications or escalate to the fallback chain.
- `TenantGovernancePendingApprovalOldestCritical`
  Trigger: oldest pending approval age above 48 hours for 15 minutes.
  Response: treat as an on-call escalation. Confirm whether the request can be manually approved/rejected, whether the approver set is resolvable, and whether the tenant needs a temporary tenant-admin override while configuration is repaired.
- `TenantGovernanceEvaluatorLatencyHigh`
  Trigger: evaluator p95 latency above 200ms for 10 minutes.
  Response: inspect recent `booking.approval_rules.evaluated` audit rows for rule explosion or malformed condition sets, then compare with API latency and database health before changing rule volume.
- `TenantGovernanceQuotaRaceFailuresHigh`
  Trigger: more than 10 `QUOTA_INSUFFICIENT_AT_COMMIT` race failures per minute for 5 minutes.
  Response: verify whether one tenant is oversubscribing the same quota window, inspect `tenant.quota_reservation.blocked` and `tenant.quota_ledger.entry_added` audit rows, and consider temporarily reducing concurrency or widening the quota while the booking burst is investigated.

Supporting dashboard panels:

- pending approvals + p95 age
- quota usage by tenant
- evaluator latency p50/p95/p99
- ledger writes per second
- race failures per minute
- validation rejects per minute by cost-center error code

## Notes

- This runbook documents the workflow-health contract added by `OPX-GV-003`.
- It does not define tenancy-specific paging calendars or on-call rotations.
- Use the `OPX-GV-004` baseline for workflow SLO intent, degraded-mode policy, and fault-domain routing.
