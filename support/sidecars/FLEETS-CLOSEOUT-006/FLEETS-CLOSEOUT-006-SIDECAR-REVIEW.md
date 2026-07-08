# FLEETS-CLOSEOUT-006 — Review Packet & Evidence Summary (Sidecar)

- Sidecar task: `FLEETS-CLOSEOUT-006-SIDECAR-REVIEW`
- Helper kind: `review_packet` (support-only; does not mutate canonical truth)
- Sidecar owner: `Claude`
- Sidecar reviewer: `Codex2`
- Parent task: `FLEETS-CLOSEOUT-006` — "Observability final evidence"
- Compiled from machine-truth reads against the `FLEETS-CLOSEOUT-006` snapshot `last_update = 2026-07-08T07:42:38Z`
- Branch evidence read from `origin/codex2/fleets-closeout-006` @ `0eee0fa59` ("finalize observability evidence matrix")

> Scope note: this packet is a read-only consolidation to help the parent owner and
> reviewer close out `FLEETS-CLOSEOUT-006`. It does not edit the canonical evidence
> file, alert config, runbook, or the closeout-proof test. Any residual follow-ups
> below belong to the parent owner (`Codex2`) on the parent branch.

## 1. Parent Task Snapshot

| Field | Value |
| --- | --- |
| Status | `review` (owner-finalized, awaiting reviewer) |
| Owner | `Codex2` |
| Reviewer | `Codex` |
| Phase | `map-geofence-production-closeout-20260708` |
| `mutates_canonical` | `true` |
| Last update | `2026-07-08T07:42:38Z` |
| Review branch | `codex2/fleets-closeout-006` @ `0eee0fa59` |
| Recorded integration | `INTEGRATION_STATUS=branch_pushed` (`COMMIT_HASH=0eee0fa5943004d8e1f71f670106f5cae53ddb54`) |
| Production readiness | Blocked until all `FLEETS-CLOSEOUT-001..008` are `done` and the readiness verifier passes |

Parent acceptance criteria (from machine truth):

1. `MAP-OBS-001-FINAL-EVIDENCE.md` exists with no template placeholders.
2. Every required metric / audit event / recent-window alert / runbook distinction is `PASS` with row-level artifact path/link evidence.
3. Outage, ambiguity, and policy-denial signals are distinguishable.
4. Alert evidence uses recent-window signals, not lifetime counters.

## 2. Dependency Readiness

All five upstream dependencies are satisfied, so the parent is dependency-ready:

| Dependency | Status |
| --- | --- |
| `MAP-OBS-001` | `done` (archived; `MAP-OBS-001-FINAL-EVIDENCE.md` verdict = PASS) |
| `FLEETS-CLOSEOUT-001` | `done` |
| `FLEETS-CLOSEOUT-002` | `done` |
| `FLEETS-CLOSEOUT-003` | `done` |
| `FLEETS-CLOSEOUT-005` | `done` |

## 3. Evidence Artifact Inventory

Read from `origin/codex2/fleets-closeout-006` @ `0eee0fa59`.

| Artifact | Location | Notes |
| --- | --- | --- |
| Final evidence | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | Parent acceptance points here. Alert + runbook matrices now cover the full rule set (see §4). |
| Automated evidence log | `support/sidecars/MAP-OBS-001/MAP-OBS-001-AUTOMATED-EVIDENCE-20260701.md` | Referenced by the final evidence header. |
| Alert config | `infra/alerts/map-geofence-alerts.yaml` | Defines the 11 alert rules (see §4.1). |
| Map runbook | `docs/03-runbooks/map-geofence-observability-runbook.md` | Contains the `## Geometry Mutation` distinction section and references `ServiceAreaGeometryMutationUnexpected`. |
| Ops alert runbook | `docs/03-runbooks/operational-observability-alert-runbook.md` | Cross-links the PostGIS/evaluator failure mode. |
| Closeout proof test | `apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts` | `requiredAlerts` now locks all 11 rules + geometry mutation/rollback runbook needles (see §4). |
| Closeout proof JSON | `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` | `verdict = PASS`; 8 metrics, 6 audit events, 11 alerts, 7 runbook distinctions all `PASS`. Minor drift noted in §5. |

Runtime/lint/typecheck artifacts for `MAP-OBS-001` live under
`support/sidecars/MAP-OBS-001/artifacts/` (vitest JSON, eslint/prettier/typecheck txt,
`git diff --check`), all recorded `PASS` in the final evidence Command Log.

## 4. Required-Signal Coverage Cross-Check

Against `origin/codex2/fleets-closeout-006` @ `0eee0fa59`, the four alert rows and the geometry
mutation/rollback runbook rows that the earlier review flagged as missing are now present and
`PASS` across all three surfaces (alert YAML, final-evidence matrices, and the closeout-proof
test + JSON). This resolves the crux of the prior failed review.

### 4.1 Alerts: config vs documented matrix vs proof

`infra/alerts/map-geofence-alerts.yaml` defines all 11 rules. The final-evidence "Alert Evidence
Matrix", the proof-test `requiredAlerts` array, and the proof JSON `acceptance.alerts` list now
all enumerate the same 11 rules, each `PASS` with a recent-window source metric and artifact
evidence.

| Alert rule | In alert YAML | In final-evidence matrix | In proof test `requiredAlerts` | In proof JSON |
| --- | --- | --- | --- | --- |
| `MapProviderErrorRateHigh` | yes | yes | yes | PASS |
| `MapProviderLatencyHigh` | yes | yes | yes | PASS |
| `MapProviderQuotaUsageHigh` | yes | yes | yes | PASS |
| `MapProviderQuotaUsageCritical` | yes | yes | yes | PASS |
| `CoordinateLessDispatchAttemptHigh` | yes | yes | yes | PASS |
| `ServiceAreaPolicyBlockSpike` | yes | yes | yes | PASS |
| `ServiceAreaEvaluationUnavailable` | yes | yes | yes | PASS |
| `MapProviderOutageFailClosed` | yes (`:48`) | yes (was missing) | yes | PASS |
| `AddressAmbiguitySpike` | yes (`:59`) | yes (was missing) | yes | PASS |
| `ManualMapOverrideSpike` | yes (`:103`) | yes (was missing) | yes | PASS |
| `ServiceAreaGeometryMutationUnexpected` | yes (`:114`) | yes (was missing) | yes | PASS |

The proof test also asserts recent-window discipline negatively — it fails if
`increase(map_provider_errors_total[1d])` or `increase(service_area_policy_blocks_total[1d])`
appear (acceptance criterion 4).

### 4.2 Runbook distinctions: runbook vs documented matrix vs proof

The proof JSON `acceptance.runbookDistinctions` now records 7 distinctions, all `PASS`:
`Provider Outage`, `Address Ambiguity`, `Policy Denial`, `PostGIS / Evaluator Unavailable`,
`Manual Override`, `Geometry Mutation`, and `Geometry Rollback`. The proof test enforces matching
`finalEvidenceNeedle` / `runbookNeedle` pairs for each (including
`geometry mutation / OBS-MAP-GEOMETRY-MUTATION: PASS` and
`geometry rollback / OBS-MAP-GEOMETRY-MUTATION: PASS`). The geometry-rollback row carries an
explicit inference note (rollback is evidenced by publish/retire audit coverage and the
runbook's retire-path checks) rather than a separate metric — a reviewer judgment call to
confirm.

### 4.3 Metrics & audit events

Metrics and audit-event matrices are complete and each row is `PASS` with artifact evidence:
8 required metrics (incl. `service_area_geometry_mutations_total`) and 6 required audit events
(incl. `service_area.policy.published` and `service_area.policy.retired`) are covered.

## 5. Branch State & Residual Drift

The parent owner is now `Codex2`, and the review candidate is `codex2/fleets-closeout-006`:

| Branch | Tip | Closeout-proof `requiredAlerts` | Role |
| --- | --- | --- | --- |
| `codex2/fleets-closeout-006` | `0eee0fa59` "finalize observability evidence matrix" | 11 (full rule set) | **Review candidate** (recorded owner = `Codex2`) |
| `claude/fleets-closeout-006` | `179e0699c` "lock exact required PASS row set" | 9 (adds only `AddressAmbiguitySpike`, `ManualMapOverrideSpike`) | Stale prior-owner branch; superseded |

Reconciliation is essentially complete on the review candidate: the alert YAML (11 rules), the
final-evidence matrix, the proof-test `requiredAlerts`, and the proof JSON all agree on 11 alerts.
Two residual items for the reviewer to note, neither blocking:

1. **Proof-JSON `branchHead` lag.** The proof JSON at tip `0eee0fa59` records
   `branchHead = codex2/fleets-closeout-006@82d124aac…` — the prior commit, before the
   final-evidence matrix rows landed in `0eee0fa59`. The evidence content is consistent; only the
   self-referenced sha is one commit behind. Worth a cosmetic refresh so the proof anchors to its
   own tip.
2. **Stale `claude` branch.** `claude/fleets-closeout-006` @ `179e0699c` still exists and locks
   only 9 alerts. It is superseded by the `codex2` candidate and should not be promoted; whoever
   integrates should confirm only `codex2/fleets-closeout-006` is merged.

## 6. Verification Checklist (evidence now in place)

The prior failed-review punch-list is now satisfied on `codex2/fleets-closeout-006` @ `0eee0fa59`.
Status per item:

1. **Four previously-missing alert rows** — DONE. `MapProviderOutageFailClosed`,
   `AddressAmbiguitySpike`, `ManualMapOverrideSpike`, `ServiceAreaGeometryMutationUnexpected` are
   `PASS` in the final-evidence Alert Matrix, `requiredAlerts`, and the proof JSON.
2. **Geometry mutation / rollback runbook rows** — DONE. Both distinctions are `PASS` in the proof
   JSON and enforced by the proof test against the final evidence + map runbook.
3. **Reconcile closeout-proof `requiredAlerts` with the 11-rule YAML and the matrix** — DONE on the
   candidate branch; see §4.1. Residual: collapse/retire the stale `claude` branch (§5.2).
4. **Refresh stale packet metadata** — DONE in this revision (parent status `review`, owner
   `Codex2`, reviewer `Codex`, branch `codex2/fleets-closeout-006` @ `0eee0fa59`).
5. **Re-run closeout-proof + lint/typecheck and re-hand off to reviewer `Codex`** — owner recorded
   this via `INTEGRATION_STATUS=branch_pushed`; reviewer to re-run and confirm (see §7).

## 7. Reviewer Handoff (for `Codex2`)

This packet is support material only; it creates no canonical change. Reviewer checklist:

- [ ] Confirm the §1 parent snapshot matches machine truth (`review`, owner `Codex2`, reviewer
      `Codex`, last_update `2026-07-08T07:42:38Z`, branch `codex2/fleets-closeout-006` @ `0eee0fa59`).
- [ ] Confirm the §4 coverage cross-check — all 11 alerts and 7 runbook distinctions `PASS` across
      alert YAML, final-evidence matrices, proof test, and proof JSON.
- [ ] Confirm the §4.2 geometry-rollback inference (evidenced via publish/retire audit coverage) is
      an acceptable reviewer judgment rather than a required standalone metric.
- [ ] Note the §5 residuals (proof-JSON `branchHead` sha lag; stale `claude` branch) as non-blocking
      follow-ups for the parent owner / integrator.
- [ ] Absorb any of this into the parent closeout if useful, or `reopen`/`blocker` this sidecar with
      specifics.

_No canonical truth was modified by this sidecar. Only this packet file was updated._
