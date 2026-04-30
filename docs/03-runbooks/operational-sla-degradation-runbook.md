# Operational SLA and Degradation Runbook

Task: `OPX-GV-004`  
Architecture baseline:
`docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`

## Purpose

This runbook turns the Phase 1 workload and degraded-mode baseline into an
operator-facing response model. It defines what to protect first when one
workflow family or dependency starts breaching its target.

## Protection Order

Protect workflows in this order:

1. intake durability
2. dispatch correctness and queue visibility
3. driver-task state integrity
4. webhook retry and replay safety
5. reporting freshness and export completion

Interpretation:

- Never trade away durable order / dispatch / audit writes to keep exports or webhook fan-out looking healthy.
- If a partial outage forces prioritization, keep the primary source-of-truth write path and explicit queue states first.

## Workflow SLO Reference

| Workflow family | Primary signal | Warning posture | Escalation posture |
| --- | --- | --- | --- |
| Intake | API latency / error rate, phone-order creation lag | p95 approaching 2 s or manual-review growth | durable create/update failures or explicit write-path outage |
| Dispatch | oldest ready-order lag, redispatch growth, exception holds | lag growth beyond normal burst absorption | assignment attempts blocked, stale supply reused, or queue visibility lost |
| Driver updates | stale-location count, heartbeat lag, driver-task write failures | stale-location growth above the observability warning bar | task-state writes failing or dispatch using untrusted supply |
| Webhooks | failed-delivery burst, queued delivery lag | retry backlog growing with core flows healthy | backlog threatens tenant-facing state propagation or endpoint-disable wave |
| Reporting | queued / failed job count, oldest pending index lag | export delay without core workflow impact | evidence / audit workflows blocked by stale report or recording index |

## Fault-Domain Responses

### Forwarder or issuer degraded

Indicators:

- adapter health flips to `degraded`
- eligibility manual-review queue grows
- forwarder sync-status lag appears in observability snapshot

Actions:

1. Confirm whether the failure is transport, auth, or partner-domain rejection.
2. Keep new affected requests in manual-review / fallback flow instead of implying success.
3. Preserve dispatch holds for orders waiting on eligibility or external acceptance truth.
4. Escalate to platform if one adapter family affects multiple tenants.

### Webhook delivery degraded

Indicators:

- `webhook_failure_burst` warning or critical
- queued delivery lag grows faster than retry drain
- one endpoint or secret rotation correlates with failures

Actions:

1. Verify whether the issue is tenant-specific or shared transport.
2. Keep originating business writes committed; do not reopen completed intake or dispatch writes only because callbacks are late.
3. Replay from queue after endpoint correction.
4. Disable only the narrow endpoint scope required by policy.

### Recording or evidentiary pipeline degraded

Indicators:

- `recording_backlog` warning or critical
- call sessions close without recording linkage
- dispatch-recording index jobs remain pending or failed

Actions:

1. Check provider callback health and payload compatibility.
2. Keep `recording_pending` and evidence backlog explicit in operator views.
3. Prevent complaint / audit closure paths from assuming evidence is complete.
4. Prioritize backlog reduction ahead of non-critical reporting jobs.

### Driver telemetry degraded

Indicators:

- `driver_state_lag` warning or critical
- dispatch-eligible supply has stale or missing location
- mobile/network incidents correlate with one cohort or region

Actions:

1. Remove stale supply from trusted dispatch decisions.
2. Compare driver-task state writes against telemetry freshness to separate mobile lag from lifecycle failure.
3. Use manual reassignment only with explicit actor/reason trace.
4. Escalate if stale telemetry persists beyond the critical threshold.

### Reporting worker degraded

Indicators:

- report queue growth
- failed export jobs
- dispatch-recording index lag without dispatch write failures

Actions:

1. Preserve intake and dispatch compute first.
2. Pause or rate-limit heavy export generation if it competes with core workers.
3. Keep report status visible as queued / failed.
4. Re-run index or export jobs only after core queues stabilize.

### Core authority write path degraded or down

Indicators:

- order / dispatch / audit writes fail
- database or transaction boundary unavailable
- operators cannot trust commit acknowledgement

Actions:

1. Treat as incident severity `down`.
2. Stop accepting affected synchronous workflows that cannot be durably recorded.
3. Do not represent manual side-channel handling as completed platform work.
4. Recover write-path health before replaying backlog or fan-out jobs.

## Escalation Rules

- Warning means the workflow is still serviceable but trending toward queue or latency breach; the on-duty owner should investigate before operators start using workaround-only behavior.
- Critical means either the SLO is already at risk or degraded-mode controls are actively in use; the owning lane must coordinate recovery and backlog drain.
- `down` means durable source-of-truth writes are unavailable; fail closed and declare incident.

## Alignment Notes

- Use this runbook with `docs/03-runbooks/operational-observability-alert-runbook.md` for signal detection.
- Use `docs/03-runbooks/tenant-api-webhook-governance-runbook.md` for webhook replay and secret-rotation specifics.
- If workload or SLO targets change, update the architecture baseline first and then this runbook.
