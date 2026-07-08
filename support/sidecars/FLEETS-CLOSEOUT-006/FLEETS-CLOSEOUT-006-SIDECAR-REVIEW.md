# FLEETS-CLOSEOUT-006 — Review Packet & Evidence Summary (Sidecar)

- Sidecar task: `FLEETS-CLOSEOUT-006-SIDECAR-REVIEW`
- Helper kind: `review_packet` (support-only; does not mutate canonical truth)
- Sidecar owner: `Claude`
- Sidecar reviewer: `Codex2`
- Parent task: `FLEETS-CLOSEOUT-006` — "Observability final evidence"
- Compiled from machine truth at parent `last_update = 2026-07-08T07:48:49Z`
- Review candidate branch tip: `origin/codex2/fleets-closeout-006@77b5c802e`
- Reviewed evidence anchor inside the parent packet: `codex2/fleets-closeout-006@0eee0fa59430`

> Scope note: this packet is a read-only consolidation for the parent reviewer/owner path.
> It does not change the canonical evidence file, alert config, runbook, proof test, or
> machine-truth state for `FLEETS-CLOSEOUT-006`.

## 1. Parent Task Snapshot

| Field | Value |
| --- | --- |
| Status | `review` |
| Owner | `Codex2` |
| Reviewer | `Codex` |
| Phase | `map-geofence-production-closeout-20260708` |
| `mutates_canonical` | `true` |
| Last update | `2026-07-08T07:48:49Z` |
| Review branch | `codex2/fleets-closeout-006` |
| Review tip | `77b5c802e` (`FLEETS-CLOSEOUT-006: repair observability closeout SHA evidence`) |
| Recorded integration | branch pushed to `origin/codex2/fleets-closeout-006` |
| Production readiness | Still blocked until all `FLEETS-CLOSEOUT-001..008` are `done` and the readiness verifier passes |

Parent acceptance criteria from machine truth:

1. `MAP-OBS-001-FINAL-EVIDENCE.md` exists with no template placeholders.
2. Every required metric / audit event / recent-window alert / runbook distinction is `PASS` with row-level artifact path/link evidence.
3. Outage, ambiguity, and policy-denial signals are distinguishable.
4. Alert evidence uses recent-window signals, not lifetime counters.

## 2. Dependency Readiness

All declared upstream dependencies are already `done`:

| Dependency | Status |
| --- | --- |
| `MAP-OBS-001` | `done` |
| `FLEETS-CLOSEOUT-001` | `done` |
| `FLEETS-CLOSEOUT-002` | `done` |
| `FLEETS-CLOSEOUT-003` | `done` |
| `FLEETS-CLOSEOUT-005` | `done` |

## 3. Evidence Inventory

Read against `origin/codex2/fleets-closeout-006@77b5c802e`.

| Artifact | Location | Review note |
| --- | --- | --- |
| Final evidence | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | Declares implementation branch/SHA `codex2/fleets-closeout-006@0eee0fa59430`; no template markers remain. |
| Automated evidence log | `support/sidecars/MAP-OBS-001/MAP-OBS-001-AUTOMATED-EVIDENCE-20260701.md` | Referenced from the final evidence header and command log. |
| Alert config | `infra/alerts/map-geofence-alerts.yaml` | Source of truth for the 11 alert rules enforced by the proof test. |
| Map runbook | `docs/03-runbooks/map-geofence-observability-runbook.md` | Contains distinction coverage for outage, ambiguity, denial, manual override, geometry mutation, and geometry rollback. |
| Ops alert runbook | `docs/03-runbooks/operational-observability-alert-runbook.md` | Cross-links evaluator/PostGIS unavailability. |
| Proof test | `apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts` | Now derives the proof artifact branch/SHA from the final evidence text instead of current `HEAD`. |
| Proof JSON | `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` | `verdict = PASS`; branchHead now matches the final evidence anchor `0eee0fa59430`. |

## 4. Required-Signal Coverage Cross-Check

The parent review candidate is materially consistent across alert YAML, final-evidence matrices,
proof test, and proof JSON.

### 4.1 Alerts

All 11 alert rules are present in all required evidence surfaces:

| Alert rule |
| --- |
| `MapProviderErrorRateHigh` |
| `MapProviderLatencyHigh` |
| `MapProviderQuotaUsageHigh` |
| `MapProviderQuotaUsageCritical` |
| `MapProviderOutageFailClosed` |
| `AddressAmbiguitySpike` |
| `CoordinateLessDispatchAttemptHigh` |
| `ServiceAreaPolicyBlockSpike` |
| `ServiceAreaEvaluationUnavailable` |
| `ManualMapOverrideSpike` |
| `ServiceAreaGeometryMutationUnexpected` |

Reviewer conclusion: the earlier failed-review gap around the missing four rules is closed.

### 4.2 Runbook distinctions

The proof JSON records 7 runbook distinctions as `PASS`:

- `Provider Outage`
- `Address Ambiguity`
- `Policy Denial`
- `PostGIS / Evaluator Unavailable`
- `Manual Override`
- `Geometry Mutation`
- `Geometry Rollback`

`Geometry Rollback` remains an inference-backed distinction, evidenced through
publish/retire audit coverage and retire-path runbook checks rather than a separate metric.
That is acceptable as long as the parent reviewer agrees with the evidence model.

### 4.3 Metrics and audit events

The proof artifact still reports:

- 8 required metrics: all `PASS`
- 6 required audit events: all `PASS`
- 11 alerts: all `PASS`
- 7 runbook distinctions: all `PASS`

## 5. What Changed Since The Earlier Packet

Compared with the earlier `claude/fleets-closeout-006-sidecar-review@81dd1e073` packet:

1. Parent machine truth advanced from `last_update = 2026-07-08T07:42:38Z` to `2026-07-08T07:48:49Z`.
2. Parent review tip advanced from `0eee0fa59` to `77b5c802e`.
3. The previous proof-JSON SHA-lag concern is resolved: the proof test now reads the branch/SHA from the final evidence, and the proof JSON matches the final evidence anchor `0eee0fa59430`.
4. The evidence anchor intentionally remains `0eee0fa59430` even though the branch tip is `77b5c802e`, because `77b5c802e` is a consistency repair around the recorded evidence rather than a new observability-behavior change.

## 6. Residual Reviewer Notes

Non-blocking items still worth recording for the parent closeout:

1. `claude/fleets-closeout-006@179e0699c` remains a stale branch that still reflects only the older 9-alert view. It should not be mistaken for the review candidate.
2. The parent packet is ready for reviewer `Codex`, but final integration state is still only branch-level evidence; nothing here implies merged-to-`dev` or deployed status.

## 7. Reviewer Handoff

Sidecar review conclusion for `FLEETS-CLOSEOUT-006-SIDECAR-REVIEW`: `approve`.

Checklist for the parent reviewer (`Codex`):

- Confirm parent machine truth matches §1.
- Confirm the 11-alert set in §4.1 is present across alert YAML, final evidence, proof test, and proof JSON.
- Confirm the 7 runbook distinctions in §4.2, especially the rollback inference model.
- Treat the stale `claude` branch as superseded, non-blocking context only.
- Keep integration language limited to branch-level evidence unless/until separate merge/deploy proof exists.

_No canonical truth was modified by this sidecar. This file is support material only._
