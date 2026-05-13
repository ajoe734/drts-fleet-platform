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

These alerts cover the tenant governance controls added after the approval-rule,
quota, and cost-center wave. The canonical metric namespace is:

- `tenant_governance.approval.*`
- `tenant_governance.quota.*`
- `tenant_governance.cost_center.*`

The Prometheus bridge used by Grafana and alert rules normalizes dots to
underscores, so `tenant_governance.approval.pending_count` is queried as
`tenant_governance_approval_pending_count` in panel expressions.

| Alert key                      | Primary route | Secondary route | Measured value                                  | Warning | Critical |
| ------------------------------ | ------------- | --------------- | ----------------------------------------------- | ------- | -------- |
| `tenant_quota_near_exhaustion` | ops           | platform        | max tenant quota usage percent                  | 95%     | none     |
| `tenant_pending_approval_age`  | ops           | tenant_admin    | oldest pending approval age                     | 24h     | 48h      |
| `tenant_evaluator_latency_p95` | platform      | none            | approval evaluator p95 latency                  | 200ms   | none     |
| `tenant_quota_race_failures`   | platform      | ops             | `QUOTA_INSUFFICIENT_AT_COMMIT` count per minute | 10/min  | none     |

### Tenant quota near exhaustion

Check:

- the `Quota Usage By Tenant` panel for the tenant and current period
- recent `tenant.quota_snapshot.refreshed` and `tenant.quota_ledger.entry_added`
  audit rows
- whether the spike is tenant-wide or isolated to one cost center

Likely actions:

- confirm whether the tenant intended the quota level and current period scope
- raise or rebalance quota policy only after tenant_admin confirmation
- if usage is unexpected, inspect duplicate booking retries or replayed commit
  paths before changing policy

### Pending approval age

Check:

- `Pending Approvals` and `Pending Approval p95 Age`
- whether requests are stuck on the original approver set or should already
  have escalated to `tenant_admin`
- any missing notification / contact path for the approver group

Likely actions:

- contact the tenant approver or tenant_admin immediately at the 24h warning
- at 48h, page the owning on-call and verify the request can still be decided
  safely
- if escalation automation did not fire, inspect the approval request audit
  trail before manually intervening

### Evaluator latency p95

Check:

- recent approval-rule edits with large condition sets
- quota snapshot churn for the same tenant and period
- repository / database latency during booking evaluation

Likely actions:

- rollback the most recent problematic rule edit if latency regressed sharply
- inspect repository lock contention around quota snapshots
- involve platform on-call if multiple tenants cross the threshold together

### Quota race failures

Check:

- `Race Failures/min`
- concurrent booking bursts for the same tenant or cost center
- caller retry loops that may be replaying the same commit attempt

Likely actions:

- confirm whether failures are expected under quota saturation or indicate a
  lost-update pattern
- inspect the quota reservation path before suppressing alerts
- coordinate with tenant_admin if the tenant needs temporary quota relief to
  stop customer-facing failures

## Notes

- This runbook documents the workflow-health contract added by `OPX-GV-003`.
- It does not define tenancy-specific paging calendars or on-call rotations.
- Use the `OPX-GV-004` baseline for workflow SLO intent, degraded-mode policy, and fault-domain routing.
