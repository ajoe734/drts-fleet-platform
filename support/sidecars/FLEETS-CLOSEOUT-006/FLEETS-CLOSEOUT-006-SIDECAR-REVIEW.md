# FLEETS-CLOSEOUT-006 — Review Packet & Evidence Summary (Sidecar)

- Sidecar task: `FLEETS-CLOSEOUT-006-SIDECAR-REVIEW`
- Helper kind: `review_packet` (support-only; does not mutate canonical truth)
- Sidecar owner: `Claude`
- Sidecar reviewer: `Codex2`
- Parent task: `FLEETS-CLOSEOUT-006` — "Observability final evidence"
- Compiled from machine-truth reads against the `FLEETS-CLOSEOUT-006` snapshot `last_update = 2026-07-08T07:37:48Z`
- Compilation base: `origin/dev` @ this sidecar worktree

> Scope note: this packet is a read-only consolidation to help the parent owner and
> reviewer close out `FLEETS-CLOSEOUT-006`. It does not edit the canonical evidence
> file, alert config, runbook, or the closeout-proof test. All fixes below belong to
> the parent owner (`Codex2`) on the parent branch.

## 1. Parent Task Snapshot

| Field | Value |
| --- | --- |
| Status | `in_progress` (last review **failed**) |
| Owner | `Codex2` |
| Reviewer | `Codex` |
| Phase | `map-geofence-production-closeout-20260708` |
| `mutates_canonical` | `true` |
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

| Artifact | Location | Present on `dev`? | Notes |
| --- | --- | --- | --- |
| Final evidence | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | yes | Parent acceptance points here. Matrices are **stale** vs config (see §4). |
| Automated evidence log | `support/sidecars/MAP-OBS-001/MAP-OBS-001-AUTOMATED-EVIDENCE-20260701.md` | yes | Referenced by the final evidence header. |
| Alert config | `infra/alerts/map-geofence-alerts.yaml` | yes | Defines **11** alert rules (see §4.1). |
| Map runbook | `docs/03-runbooks/map-geofence-observability-runbook.md` | yes | Has all distinction sections incl. `## Geometry Mutation` (line 134). |
| Ops alert runbook | `docs/03-runbooks/operational-observability-alert-runbook.md` | yes | Cross-links PostGIS/evaluator failure mode. |
| Closeout proof test | `apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts` | **no** (only on parent branches) | Diverges between parent branches — see §5. |
| Closeout proof JSON | `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` | **no** (only on parent branches) | Same divergence. |

Runtime/lint/typecheck artifacts for `MAP-OBS-001` live under
`support/sidecars/MAP-OBS-001/artifacts/` (vitest JSON, eslint/prettier/typecheck txt,
`git diff --check`), all recorded `PASS` in the final evidence Command Log.

## 4. Required-Signal Coverage Cross-Check

The underlying **infrastructure is complete on `dev`**, but the **documentation matrices in
`MAP-OBS-001-FINAL-EVIDENCE.md` are stale** relative to that infrastructure. This is the crux
of the failed review.

### 4.1 Alerts: config vs documented matrix

`infra/alerts/map-geofence-alerts.yaml` defines all 11 rules below. The final evidence
"Alert Evidence Matrix" documents only 7 of them.

| Alert rule | In alert YAML | In final-evidence Alert Matrix |
| --- | --- | --- |
| `MapProviderErrorRateHigh` | yes | yes |
| `MapProviderLatencyHigh` | yes | yes |
| `MapProviderQuotaUsageHigh` | yes | yes |
| `MapProviderQuotaUsageCritical` | yes | yes |
| `CoordinateLessDispatchAttemptHigh` | yes | yes |
| `ServiceAreaPolicyBlockSpike` | yes | yes |
| `ServiceAreaEvaluationUnavailable` | yes | yes |
| `MapProviderOutageFailClosed` | yes (`map-geofence-alerts.yaml:48`) | **MISSING** |
| `AddressAmbiguitySpike` | yes (`:59`) | **MISSING** |
| `ManualMapOverrideSpike` | yes (`:103`) | **MISSING** |
| `ServiceAreaGeometryMutationUnexpected` | yes (`:114`) | **MISSING** |

These four missing rows are exactly what the parent reviewer flagged.

### 4.2 Runbook distinctions: runbook vs documented matrix

The map runbook (`docs/03-runbooks/map-geofence-observability-runbook.md`) already contains a
dedicated `## Geometry Mutation` section (line 134) and references
`ServiceAreaGeometryMutationUnexpected`. The final-evidence "Runbook Distinction Matrix"
documents `provider outage`, `address ambiguity`, `policy denial`, `postgis`, and
`manual override`, but **omits a geometry mutation / rollback row**.

### 4.3 Metrics & audit events

Metrics and audit-event matrices in the final evidence are complete and each row is `PASS`
with artifact evidence. All 8 required metrics and 6 required audit events are covered,
including `service_area_geometry_mutations_total`, `service_area.policy.published`, and
`service_area.policy.retired`.

## 5. Risk: Divergent Parent Branches

Two parent branches exist and **disagree on the enforced alert set** in the closeout-proof
test — the reviewer should ensure only one is promoted:

| Branch | Tip | Closeout-proof test enforces |
| --- | --- | --- |
| `codex2/fleets-closeout-006` (recorded owner = `Codex2`) | `82d124aac` "finalize observability closeout proof" | 7 alerts (`requiredAlerts` = the 7 already documented) |
| `claude/fleets-closeout-006` (prior owner) | `179e0699c` "lock exact required PASS row set" | 9 alerts (adds `AddressAmbiguitySpike`, `ManualMapOverrideSpike`) |

Neither branch modifies `MAP-OBS-001-FINAL-EVIDENCE.md`, so on **both** the alert matrix stays
at 7 rows. Note the mismatch: the parent reviewer asked for **all four** missing rows
(incl. `MapProviderOutageFailClosed` and `ServiceAreaGeometryMutationUnexpected`), but the
stricter `claude` test only locks in two of them, and the `codex2` test locks in none of the
four. Whoever finalizes must reconcile the closeout-proof `requiredAlerts` array, the alert
YAML (11 rules), and the final-evidence matrix so all three agree.

Parent-branch closeout-proof also writes a proof JSON under
`support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/` — the two branches emit different
filenames (`...proof-20260708T000000Z.json` vs `...proof-20260708.json`), another sign of drift
to reconcile.

## 6. Open Review Gaps (punch-list for parent owner)

To clear the failed review, the parent owner (`Codex2`) must, in canonical files (out of scope
for this sidecar):

1. **Add the four missing alert rows** to the `## Alert Evidence Matrix` in
   `MAP-OBS-001-FINAL-EVIDENCE.md`, each `PASS` with recent-window query + artifact evidence:
   `MapProviderOutageFailClosed`, `AddressAmbiguitySpike`, `ManualMapOverrideSpike`,
   `ServiceAreaGeometryMutationUnexpected`.
2. **Add a geometry mutation / rollback row** to the `## Runbook Distinction Matrix`, pointing at
   `docs/03-runbooks/map-geofence-observability-runbook.md#geometry-mutation`.
3. **Reconcile the closeout-proof `requiredAlerts`** array with the 11-rule alert YAML and the
   refreshed final-evidence matrix so the proof test, config, and evidence agree, and collapse
   the divergent parent branches / proof-JSON filenames to one.
4. **Refresh stale packet metadata** the reviewer called out (packet still shows `Owner Claude`
   / branch `claude/fleets-closeout-006`; recorded owner is now `Codex2`).
5. Re-run the closeout-proof test + lint/typecheck and re-hand off to reviewer `Codex`.

## 7. Reviewer Handoff (for `Codex2`)

This packet is support material only; it creates no canonical change. Reviewer checklist:

- [ ] Confirm the §4 config-vs-documentation gap is correctly characterized (infra complete,
      evidence matrices stale — not missing alert rules).
- [ ] Confirm the §5 branch divergence and required reconciliation (11 YAML rules vs 7/9 test
      rows vs 4 reviewer-requested rows).
- [ ] Confirm the §6 punch-list is the complete set needed to clear the parent's failed review.
- [ ] Absorb any of this into the parent closeout if useful, or `reopen`/`blocker` this sidecar
      with specifics.

_No canonical truth was modified by this sidecar. Only this packet file was created._
