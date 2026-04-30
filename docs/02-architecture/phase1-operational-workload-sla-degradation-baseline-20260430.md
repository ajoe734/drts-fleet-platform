# Phase 1 Operational Workload, SLA, and Degradation Baseline

Status: accepted implementation baseline for `OPX-GV-004`

## Purpose

This document defines the explicit non-functional planning baseline for Phase 1
workflow families. It turns the high-level `4.21 NFR / 容量 / retention`
requirements from
`docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
into concrete workload assumptions, latency targets, and degraded-mode rules.

This is an operational design baseline, not a production capacity guarantee.
Values below are the minimum bar that infra sizing, queue behavior, alerting,
and manual fallback procedures must preserve.

## Scope

The baseline covers these workflow families:

- intake: tenant API bookings, partner / forwarder ingress, phone-order intake
- dispatch: queue entry, candidate selection, assignment, redispatch
- driver updates: heartbeat, location freshness, driver-task state changes
- webhooks: tenant outbound delivery and retry behavior
- reporting: report generation, dispatch / recording index refresh

Related references:

- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
- `docs/03-runbooks/operational-observability-alert-runbook.md`
- `docs/03-runbooks/tenant-api-webhook-governance-runbook.md`
- `infra/seeds/S0001__reference_seed.sql`

## Baseline Rules

- Queue projections are operational views, not independent source-of-truth state.
- SLA breach is a flag and alert condition; it must not overwrite the primary lifecycle state.
- Partial external dependency failure must degrade into an explicit queue, hold, or retry path instead of fabricating success.
- Critical intake and dispatch writes fail closed when authority or compliance truth is unknown.
- Observability thresholds from `OPX-GV-003` remain the minimum alert floor; this baseline adds workflow SLO intent and degraded-mode routing.

## Workload Assumptions

### Shared planning assumptions

- Multi-tenant Phase 1 launch baseline: 10 active tenants, 2 forwarder / issuer integrations, 1 call-center lane.
- Peak windows are commuter spikes and airport / business dispatch bursts.
- Burst capacity target is 3x steady-state for 15 minutes without operator-only recovery.
- A deeper 5x spike may trigger queue growth and degraded-mode behavior, but the platform must preserve durable intake and auditable state transitions.

### Workflow capacity table

| Workflow family | Planned steady-state | Burst target | Concurrency / backlog assumption | Notes |
| --- | --- | --- | --- | --- |
| Intake | 20 booking create/update requests per minute across tenant API, partner ingress, and phone orders | 60 requests per minute for 15 minutes | 50 concurrent intake requests; phone-order lane up to 20 active call sessions | Reservation and realtime orders share intake infrastructure but diverge at queue entry policy |
| Dispatch | 120 queue-entry or dispatch-decision transitions per minute | 300 transitions per minute for 15 minutes | 500 open dispatchable orders across ready, redispatch, and exception projections | Includes auto-dispatch, manual reassignment, and redispatch attempts |
| Driver updates | 2,000 location / availability updates per minute | 6,000 updates per minute for 15 minutes | 1,500 dispatch-eligible drivers; stale-location backlog must stay measurable | Heartbeats can be high-volume but are soft-real-time |
| Webhooks | 300 outbound deliveries per minute | 900 deliveries per minute for 15 minutes | 10,000 queued deliveries retained for retry without dropping audit history | Includes booking, dispatch, and complaint notifications |
| Reporting | 10 report jobs started per minute | 30 jobs started per minute for 15 minutes | 50 concurrent running or queued jobs; 5,000 dispatch-recording index items pending | Heavy exports are async-only and must not block intake or dispatch |

## SLA and Latency Targets

### Workflow target table

| Workflow family | User / operator target | Internal processing target | Availability target | Breach meaning |
| --- | --- | --- | --- | --- |
| Intake | synchronous create / update response p95 <= 2 s, p99 <= 5 s | durable order / request record committed before success response | 99.9% monthly for accepted requests | no silent drop; if authority checks fail, return explicit error or route to manual review |
| Dispatch | ready order to first assignment attempt p95 <= 60 s for realtime, reservation activation within configured confirmation window | candidate fetch + dispatch attempt write p95 <= 10 s per attempt | 99.9% monthly for queue projection and assignment writes | ready orders may queue, but must remain visible with lag and exception reason |
| Driver updates | heartbeat / location ingestion p95 <= 10 s; stale cutoff 5 min; critical stale cutoff 10 min | driver-task state transition write p95 <= 5 s | 99.5% monthly | stale drivers are removed from trusted dispatch supply before silent reuse |
| Webhooks | first delivery attempt within 1 min of emitting event; 95% delivered within 5 min when endpoint is healthy | retry scheduling committed before worker ack | 99.5% monthly for delivery pipeline, excluding tenant endpoint downtime | failures must accumulate in retry / disabled state with audit visibility |
| Reporting | operator query / dashboard read p95 <= 3 s; async export starts within 5 min; standard export completes within 30 min | report job enqueue p95 <= 5 s | 99.0% monthly | stale report or recording index must be visible as pending / failed, not implied complete |

### SLA profile alignment

- Contract SLA templates in `infra/seeds/S0001__reference_seed.sql` remain the business-facing source for wait / arrival / completion thresholds.
- This document defines platform operating SLOs around those templates:
  - intake and dispatch must preserve the ability to measure template breach
  - workflow SLOs must not be looser than the observability alert floor
  - custom tenant or product SLA may tighten business timers but must not bypass degraded-mode controls

## Degradation Model

### Severity levels

| Level | Meaning | Expected behavior |
| --- | --- | --- |
| `healthy` | workload within target and dependencies responsive | normal automatic routing and retries |
| `degraded` | partial dependency or queue pressure issue, but durable core writes still work | queue growth allowed, retries and manual review paths enabled, alerting active |
| `severely_degraded` | sustained lag or multiple dependency failures threaten SLA but source-of-truth writes still function | restrict non-critical work, pause optional fan-out, require operator supervision |
| `down` | source-of-truth write path or critical authority path unavailable | fail closed for affected write flows, preserve audit / recovery instructions |

### Dependency policy table

| Fault domain | Trigger examples | System behavior | Operator expectation |
| --- | --- | --- | --- |
| Forwarder / issuer adapter degraded | timeout burst, transport retry exhaustion, sync-status lag | mark adapter `degraded`; route affected requests to `manual_review_queue` or fallback review path; do not report integration success until callback / reconciliation confirms | review adapter health, clear fallback queue, separate issuer outage from real ineligibility |
| Webhook egress degraded | retry burst, tenant endpoint 5xx / auth mismatch | keep primary transaction committed; enqueue retries; disable only the affected endpoint after policy threshold; preserve audit trail | fix endpoint or secret, replay from queued deliveries, keep tenant-visible status explicit |
| Recording provider degraded | callback missing, recording linkage lag, artifact indexing delay | order may continue if business rule allows, but `recording_pending` / indexing backlog must remain explicit; complaint and evidence flows may be gated | triage callback format / provider outage and clear evidence backlog before audit-close workflows |
| Driver heartbeat degraded | stale or missing location updates from active supply | remove stale drivers from trusted candidate pool; keep assignment history unchanged; surface stale-location counts and lag | verify device / network issue, use map and queue views before manual dispatch override |
| Reporting worker degraded | export queue growth, failed index jobs | keep core dispatch / booking flows online; pause non-critical exports if needed; expose pending / failed jobs | recover workers without prioritizing exports over dispatch-critical queues |
| Core database or authority write path down | order, dispatch, audit, or lifecycle write failure | fail closed for affected synchronous writes; do not accept requests that cannot be durably recorded | declare incident, stop manual assumptions of success, use incident recovery checklist |

## Degradation Rules By Workflow

### Intake

- Tenant API and phone-order writes must fail closed if the platform cannot persist the order or required audit record.
- Partner / issuer eligibility timeouts degrade to explicit manual review or fallback queues when allowed by policy; they do not mint a false eligible state.
- If downstream webhook or report workers are degraded, intake stays online as long as the source-of-truth write path and audit path remain healthy.

### Dispatch

- Queue growth is acceptable during burst periods only if ready, redispatch, exception-hold, and recording-gated orders remain separately visible.
- Candidate selection may degrade to smaller candidate sets or slower reassignment, but not to assigning stale or unverified supply silently.
- Manual reassignment is allowed under degraded conditions, but every override must keep actor, reason, and prior assignment trace.

### Driver Updates

- Driver-task completion and rejection writes remain authoritative even when live map or heartbeat freshness is degraded.
- Supply with stale location must be excluded from trustable real-time availability until freshness recovers or operator explicitly overrides.
- If mobile telemetry volume exceeds target, the platform may shed redundant heartbeat processing before it sheds task-state writes.

### Webhooks

- Outbound webhook failure must not roll back the originating order, dispatch, or complaint write.
- Retry queues are the first degraded path; endpoint disablement is a scoped safety action for one tenant endpoint, not a global outage response.
- Operators need enough metadata to replay safely without exposing raw secrets.

### Reporting

- Reporting is lower priority than intake, dispatch, and driver-state correctness.
- Export and indexing jobs may queue during peak or incident periods, but pending / failed state must remain observable.
- No reporting workflow may claim evidentiary completeness while recording or dispatch index jobs are still pending.

## Implementation and Alerting Implications

- `OPX-GV-003` alert thresholds are the minimum detection floor and should be interpreted against the workload table above.
- Infra sizing, worker concurrency, and retry caps must be reviewed against the burst targets before production rollout.
- Future tenant-specific SLOs may tighten these targets, but any tightening must update both this baseline and the related operator runbook.
- If production evidence disproves these assumptions, update this baseline first, then materialize any required implementation backlog.
