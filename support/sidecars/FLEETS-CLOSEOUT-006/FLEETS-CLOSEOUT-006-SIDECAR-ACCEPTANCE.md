# FLEETS-CLOSEOUT-006 — Sidecar Acceptance Packet & Dependency Map

Support artifact for parent task `FLEETS-CLOSEOUT-006` (Observability final evidence).

- **Sidecar task:** `FLEETS-CLOSEOUT-006-SIDECAR-ACCEPTANCE`
- **Helper kind:** `acceptance_packet` (support-only, `mutates_canonical: false`)
- **Sidecar owner:** `Claude` · **Sidecar reviewer:** `Gemini2`
- **Parent task:** `FLEETS-CLOSEOUT-006` · parent owner `Gemini2` · parent reviewer `Codex`
- **Phase / closeout family:** `map-geofence-production-closeout-20260708`
- **Packet date:** `2026-07-08`
- **Provenance:** `claude/fleets-closeout-006-sidecar-acceptance` @ `a167bf6bc61d1897bf118cd140e1b319eb1477a2` (base `origin/dev`, 0/0 divergence at packet time)

> **Scope guardrail.** This packet only assembles a checklist, dependency map, and
> artifact index to help the parent owner/reviewer land `FLEETS-CLOSEOUT-006`.
> It creates no canonical truth. It does not mark the parent task `done`, does not
> assert production readiness, and does not re-run or replace the parent's own
> verifier/publication closeout. All PASS/PENDING marks below are _transcribed from
> the parent-owned evidence artifacts as they stood at packet time_ — they are a
> reading aid, not an independent re-certification.

---

## 1. Parent Task Snapshot

| Field                | Value                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parent id            | `FLEETS-CLOSEOUT-006`                                                                                                                                                                                                                           |
| Title                | Observability final evidence                                                                                                                                                                                                                    |
| Status (packet time) | `in_progress`                                                                                                                                                                                                                                   |
| Owner / Reviewer     | `Gemini2` / `Codex`                                                                                                                                                                                                                             |
| Consolidates         | `MAP-OBS-001` final observability evidence                                                                                                                                                                                                      |
| Primary evidence doc | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`                                                                                                                                                                                    |
| Readiness posture    | MAP production readiness verifier still reports `fail` (parent `next`: `readiness=fail 12 failures`); readiness stays blocked until all `FLEETS-CLOSEOUT-001..008` are `done` and `scripts/verify-map-geofence-production-readiness.mjs` passes |

Parent acceptance criteria (verbatim from the task board):

1. `MAP-OBS-001-FINAL-EVIDENCE.md` exists with no template placeholders.
2. Every required metric, audit event, recent-window alert, and runbook distinction is `PASS` with row-level artifact path/link evidence.
3. Outage, ambiguity, and policy-denial signals are distinguishable.
4. Alert evidence uses recent-window signals, not lifetime counters.

---

## 2. Dependency Map

Two dependency scopes are shown: (a) this **sidecar's declared `depends_on`**, and
(b) the **parent `FLEETS-CLOSEOUT-006` `depends_on`**, which additionally includes
`FLEETS-CLOSEOUT-001`. The parent cannot finalize until its own dependency set is
satisfied, so `FLEETS-CLOSEOUT-001` is surfaced here even though it is outside the
sidecar's declared list.

| Dependency            | In sidecar deps? | In parent deps? | Status (packet time)       | Owner / Reviewer    | What it supplies to closeout-006                                                                                                                           | Gating?                          |
| --------------------- | :--------------: | :-------------: | -------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `MAP-OBS-001`         |        ✅        |       ✅        | archived / folded into 006 | Codex (impl)        | The observability implementation + `MAP-OBS-001-FINAL-EVIDENCE.md` that closeout-006 finalizes (metrics, audit events, alerts, runbook distinctions)       | Satisfied — evidence doc present |
| `FLEETS-CLOSEOUT-002` |        ✅        |       ✅        | `done`                     | `Claude` / `Codex2` | Cross-surface persisted anti-bypass proof (fail-closed dispatch cannot bypass geofence)                                                                    | Satisfied                        |
| `FLEETS-CLOSEOUT-003` |        ✅        |       ✅        | `done`                     | `Codex2` / `Codex`  | Platform Admin publish + policy version proof (governance publish path)                                                                                    | Satisfied                        |
| `FLEETS-CLOSEOUT-005` |        ✅        |       ✅        | `done`                     | `Codex2` / `Codex`  | Driver native map/navigation UAT (Gate D packet)                                                                                                           | Satisfied                        |
| `FLEETS-CLOSEOUT-001` | ➖ (parent-only) |       ✅        | `blocked`                  | `Codex` / `Codex2`  | Callcenter persisted spatial proof (Gate A). Blocked on a merge-commit-subject `Commit-trailers` CI gate; see `FLEETS-CLOSEOUT-001-UNBLOCK-HISTORY-REPAIR` | **Yes — open for parent**        |

**Dependency verdict.** Of the sidecar's four declared dependencies, all four are
satisfied (`MAP-OBS-001` archived with evidence present; `002/003/005` `done`). The
parent's fifth dependency `FLEETS-CLOSEOUT-001` is still `blocked`, so the parent
owner should treat closeout-006 finalization as gated on `FLEETS-CLOSEOUT-001`
clearing (and on the overall readiness verifier passing) even after the observability
evidence itself is complete.

### Sibling closeout wave (context, not a dependency)

| Task                  | Status        | Note                                                                           |
| --------------------- | ------------- | ------------------------------------------------------------------------------ |
| `FLEETS-CLOSEOUT-004` | `in_progress` | Sibling in the same wave; has its own `FLEETS-CLOSEOUT-004-SIDECAR-ACCEPTANCE` |
| `FLEETS-CLOSEOUT-007` | `backlog`     | Downstream of the readiness gate                                               |
| `FLEETS-CLOSEOUT-008` | `backlog`     | Downstream of the readiness gate                                               |

---

## 3. Acceptance Checklist

Transcribed from `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` and
`support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md`
as of packet time. "Source rows" point the reviewer at the exact matrix to spot-check.

### AC-1 — Final evidence doc exists, no template placeholders

| Check                                             | State                  | Source                                                                                                                                                      |
| ------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAP-OBS-001-FINAL-EVIDENCE.md` present           | ✅ present             | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`                                                                                                |
| No unresolved template markers/placeholder tokens | ⚠️ reviewer spot-check | Parent owner/reviewer to confirm against `final_evidence_integrity` rule; a separate `...-FINAL-EVIDENCE-TEMPLATE.md` intentionally remains as the template |
| Concrete `branch@sha` + merge-base recorded       | ✅ present             | Evidence doc header: `codex/map-obs-001@43baac5843a2`, merge-base `origin/dev@abd6755a6eb1091dd38e99a1de50ebabebf22bb4`                                     |

### AC-2 — Every required metric / audit event / alert / runbook distinction is PASS with row-level artifact evidence

| Evidence matrix                                                                | Rows all `PASS`? | Row-level artifact paths? | Source section                                                          |
| ------------------------------------------------------------------------------ | :--------------: | :-----------------------: | ----------------------------------------------------------------------- |
| Verifier Topic Marker Matrix (6 topics)                                        |        ✅        |            ✅             | "Verifier Topic Marker Matrix"                                          |
| Metrics Evidence Matrix (8 metrics)                                            |        ✅        |            ✅             | "Metrics Evidence Matrix"                                               |
| Audit Event Evidence Matrix (6 events)                                         |        ✅        |            ✅             | "Audit Event Evidence Matrix"                                           |
| Alert Evidence Matrix (7 alerts)                                               |        ✅        |            ✅             | "Alert Evidence Matrix"                                                 |
| Runbook Distinction Matrix                                                     |        ✅        |            ✅             | "Runbook Distinction Matrix"                                            |
| Command/automation summary (vitest/typecheck/lint/prettier/`git diff --check`) |        ✅        |            ✅             | Automation summary table + `MAP-OBS-001-AUTOMATED-EVIDENCE-20260701.md` |

### AC-3 — Outage / ambiguity / policy-denial signals are distinguishable

| Distinction                                     | State | Evidence anchor                                                                                                                                                                                 |
| ----------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider outage vs ambiguity vs coordinate-less | ✅    | `map_provider_errors_total` (`providerErrorCount`/`providerOutageCount`) kept separate from ambiguity + coordinate-less counters — `OBS-MAP-PROVIDER-OUTAGE` / `OBS-MAP-ADDRESS-AMBIGUITY` rows |
| Policy denial vs out-of-area                    | ✅    | `service_area_policy_blocks_total` (`policyDenialCount`) separate from out-of-area counter — `OBS-MAP-POLICY-DENIAL` row                                                                        |
| Coordinate-less fail-closed vs normal dispatch  | ✅    | `coordinate_less_booking_attempts_total` dedicated counters + audit — `OBS-MAP-COORDINATELESS-ATTEMPT` row                                                                                      |

### AC-4 — Alert evidence uses recent-window signals, not lifetime counters

| Alert                               | Window  | State |
| ----------------------------------- | ------- | ----- |
| `MapProviderErrorRateHigh`          | 5m rate | ✅    |
| `MapProviderLatencyHigh`            | 10m p95 | ✅    |
| `MapProviderQuotaUsageHigh`         | 15m     | ✅    |
| `MapProviderQuotaUsageCritical`     | 5m      | ✅    |
| `CoordinateLessDispatchAttemptHigh` | 5m      | ✅    |
| `ServiceAreaPolicyBlockSpike`       | 15m     | ✅    |
| `ServiceAreaEvaluationUnavailable`  | 10m     | ✅    |

All alert rules reference recent-window `rate(...)`/`p95` expressions in
`infra/alerts/map-geofence-alerts.yaml`, not lifetime totals — satisfying AC-4.

### AC-5 — Parent-level / release gates (NOT satisfiable inside closeout-006)

These remain open and are called out so the parent task is not prematurely marked
`done` or described as production-ready:

- ⛔ **Dependency gate:** `FLEETS-CLOSEOUT-001` is `blocked` (see §2).
- ⛔ **Readiness verifier:** `scripts/verify-map-geofence-production-readiness.mjs` reports `fail` (`12 failures` per parent `next`); readiness stays blocked until all `FLEETS-CLOSEOUT-001..008` are `done`.
- 🔶 **`EXTERNAL-GATED` (outside repo-backed scope):** Prometheus/OTel exporter mapping, Grafana/dashboard panels + live alert-file parse validation, and staged/UAT traffic across all surfaces — enumerated under "External Gates Still Open" in the OBS evidence doc.
- 🔶 **Proof JSON:** `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` is a parent-owned closeout artifact; not present at packet time — the parent owner is expected to generate it as part of finalization.

---

## 4. Support Packet — Artifact Index

Canonical evidence (parent-owned; do not edit from this sidecar):

- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` — final observability evidence (metrics, audit, alerts, runbook matrices).
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-AUTOMATED-EVIDENCE-20260701.md` — automated evidence log.
- `support/sidecars/MAP-OBS-001/artifacts/` — vitest JSON, typecheck, eslint, prettier, `git diff --check` transcripts.
- `infra/alerts/map-geofence-alerts.yaml` — recent-window alert rules (AC-4).
- `docs/03-runbooks/map-geofence-observability-runbook.md` — outage/ambiguity/policy-denial/PostGIS/evaluator/override/rollback runbook distinctions (AC-3).
- `docs/03-runbooks/operational-observability-alert-runbook.md` — alert response runbook.
- `apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts` — closeout proof test (parent artifact).

Release/readiness controls (parent + release owned):

- `scripts/verify-map-geofence-production-readiness.mjs` — production readiness verifier (currently `fail`).
- `scripts/verify-map-geofence-dispatch-integrity.mjs` — dispatch integrity verifier.
- `support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md` — closeout board / gate summary.
- `support/sidecars/MAP-REL-001/MAP-READINESS-BLOCKER-REPORT.md` — readiness blocker report.

Pending (to be produced by parent finalization):

- `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json`.

---

## 5. Handoff Notes for Reviewer (`Gemini2`) & Parent Owner

1. **What this packet asserts:** the four sidecar-declared dependencies are satisfied,
   and the observability evidence matrices in `MAP-OBS-001-FINAL-EVIDENCE.md` read as
   all-`PASS` with row-level artifact links, matching parent AC-1..AC-4 at packet time.
2. **What it deliberately does not assert:** that `FLEETS-CLOSEOUT-006` may be marked
   `done`. Two parent-level gates are still open — `FLEETS-CLOSEOUT-001` (`blocked`) and
   the readiness verifier (`fail`) — plus the `EXTERNAL-GATED` items in §3 AC-5.
3. **Recommended reviewer spot-checks:** (a) AC-1 placeholder/template scan of the
   evidence doc; (b) confirm the pending proof JSON is generated before parent `done`;
   (c) confirm `FLEETS-CLOSEOUT-001` clears and the readiness verifier turns green
   before any production-readiness claim.
4. **Absorption:** the parent owner decides whether/what to fold from this packet into
   the mainline closeout record. This sidecar edits no canonical truth.

---

_Generated as a support-only acceptance packet. Integration status for this sidecar:
`not_applicable` (whole diff is under `support/sidecars/`)._
