# FLEETS-CLOSEOUT-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `FLEETS-CLOSEOUT-006` - Observability final evidence
**Sidecar Owner / Reviewer:** `Claude` / `Codex2`
**Parent Owner / Reviewer:** `Gemini2` / `Codex`
**Generated:** `2026-07-08` (UTC)
**Snapshot timestamps:** parent `2026-07-08T04:39:23Z`; sidecar `2026-07-08T06:11:57Z`; parent-only dep `FLEETS-CLOSEOUT-001` `2026-07-08T06:12:30Z`

> Scope: support artifact only. This packet does not mutate canonical truth, does not replace parent evidence, and must not be read as production-readiness approval.

---

## 1. Scope Boundary

This sidecar only assembles:

- the acceptance checklist for `FLEETS-CLOSEOUT-006`
- a dependency map across `MAP-OBS-001`, `FLEETS-CLOSEOUT-002`, `FLEETS-CLOSEOUT-003`, `FLEETS-CLOSEOUT-005`, plus parent-only gate `FLEETS-CLOSEOUT-001`
- a support packet for the parent owner/reviewer handoff

Out of scope:

- editing `support/sidecars/MAP-OBS-001/*`
- editing runtime, alerts, runbooks, contracts, or product truth
- marking the parent task `done`
- claiming readiness verifier success or deploy publication

---

## 2. Machine-Truth Snapshot

### Parent `FLEETS-CLOSEOUT-006`

| Field | Value |
| --- | --- |
| Status | `in_progress` |
| Owner / Reviewer | `Gemini2` / `Codex` |
| Primary evidence | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| Artifacts | `support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md`, `support/sidecars/MAP-OBS-001/`, `infra/alerts/map-geofence-alerts.yaml`, `docs/03-runbooks/`, `apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts`, `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` |
| Readiness posture | parent `next` says `readiness=fail 12 failures`; do not mark `done` until all `FLEETS-CLOSEOUT-001..008` are `done` and `scripts/verify-map-geofence-production-readiness.mjs` passes |

Parent acceptance, copied from machine truth:

1. `MAP-OBS-001-FINAL-EVIDENCE.md exists with no template placeholders`
2. `every required metric audit event recent-window alert and runbook distinction is PASS with row-level artifact path/link evidence`
3. `outage ambiguity and policy-denial signals are distinguishable`
4. `alert evidence uses recent-window signals not lifetime counters`

### Sidecar `FLEETS-CLOSEOUT-006-SIDECAR-ACCEPTANCE`

| Field | Value |
| --- | --- |
| Status | `review` |
| Owner / Reviewer | `Claude` / `Codex2` |
| Helper kind | `acceptance_packet` |
| `mutates_canonical` | `false` |
| Declared artifact | `support/sidecars/FLEETS-CLOSEOUT-006/FLEETS-CLOSEOUT-006-SIDECAR-ACCEPTANCE.md` |

---

## 3. Dependency Map

### 3.1 Formal sidecar dependencies

| Dependency | Shared-truth status | Evidence status now | Why it matters to `FLEETS-CLOSEOUT-006` | Reviewer note |
| --- | --- | --- | --- | --- |
| `MAP-OBS-001` | no standalone task entry returned by `scripts/ai-status.sh show` | evidence present | supplies the observability evidence family finalized by closeout-006 | treat as folded evidence anchor, not as a resolvable live task |
| `FLEETS-CLOSEOUT-002` | `done` | present | anti-bypass proof that fail-closed map outcomes cannot produce normal dispatchable orders | safe to cite as closed dependency |
| `FLEETS-CLOSEOUT-003` | `done` | present | governance publish/version proof that backs policy-denial and publish/retire observability semantics | safe to cite as closed dependency |
| `FLEETS-CLOSEOUT-005` | `done` | present | Gate D mobile/navigation proof carried into the same closeout wave | safe to cite as closed dependency |

### 3.2 Parent-only gating dependency

| Dependency | Shared-truth status | Why it still matters |
| --- | --- | --- |
| `FLEETS-CLOSEOUT-001` | `in_progress` | parent `FLEETS-CLOSEOUT-006.depends_on` includes it; closeout-006 should not be described as wave-complete or readiness-clear while Gate A proof is still open |

### 3.3 `MAP-OBS-001` interpretation note

`MAP-OBS-001` is referenced by the parent and sidecar dependency lists, but it is not currently addressable as a standalone machine-truth task ID. The supportable reading is:

- the evidence anchor exists at `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
- git history shows the observability family was previously closed on commits including `918ab7766` and `43baac584`
- `FLEETS-CLOSEOUT-006` is the active closeout task that now consolidates that evidence into the production-closeout wave

This is sufficient for a support packet, but the parent owner should avoid wording that implies `MAP-OBS-001` is still a separately queryable open task.

### 3.4 Dependency verdict

- Sidecar-declared deps are materially satisfied for review use: one folded evidence anchor (`MAP-OBS-001`) plus three `done` closeout tasks (`002/003/005`).
- Parent-level completion is still gated by `FLEETS-CLOSEOUT-001` and the failing readiness verifier.

---

## 4. Parent Acceptance Expansion

### AC-1 - `MAP-OBS-001-FINAL-EVIDENCE.md` exists with no template placeholders

| Check | State | Anchor |
| --- | --- | --- |
| final evidence doc exists | `PASS` | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| concrete `branch@sha` recorded | `PASS` | header records `codex/map-obs-001@43baac5843a2` and merge-base `origin/dev@abd6755a6eb1091dd38e99a1de50ebabebf22bb4` |
| placeholder/template scan | `reviewer spot-check required` | separate template file `MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md` exists by design; reviewer should confirm the final evidence doc itself contains no unresolved template markers |

### AC-2 - every required metric, audit event, recent-window alert, and runbook distinction is PASS with row-level artifact evidence

| Matrix | Snapshot reading |
| --- | --- |
| Verifier Topic Marker Matrix | all 6 rows read `PASS` with artifact links |
| Metrics Evidence Matrix | all 8 rows read `PASS` with artifact links |
| Audit Event Evidence Matrix | all 6 rows read `PASS` with artifact links |
| Alert Evidence Matrix | all 7 rows read `PASS` with artifact links |
| Runbook Distinction Matrix | all 5 rows read `PASS` with artifact links |
| Command Log | vitest, typecheck, lint, prettier, and `git diff --check` are all recorded `PASS` |

Primary anchors:

- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-AUTOMATED-EVIDENCE-20260701.md`
- `support/sidecars/MAP-OBS-001/artifacts/`

### AC-3 - outage, ambiguity, and policy-denial signals are distinguishable

| Distinction | State | Anchor |
| --- | --- | --- |
| provider outage vs ambiguity | `PASS` | `OBS-MAP-PROVIDER-OUTAGE` and `OBS-MAP-ADDRESS-AMBIGUITY` rows stay separate |
| policy denial vs out-of-area | `PASS` | `service_area_policy_blocks_total` / `OBS-MAP-POLICY-DENIAL` rows |
| coordinate-less fail-closed vs normal dispatch | `PASS` | `coordinate_less_booking_attempts_total` / `OBS-MAP-COORDINATELESS-ATTEMPT` rows |

### AC-4 - alert evidence uses recent-window signals, not lifetime counters

| Alert | Windowed signal in evidence |
| --- | --- |
| `MapProviderErrorRateHigh` | `5m rate` |
| `MapProviderLatencyHigh` | `10m p95` |
| `MapProviderQuotaUsageHigh` | `15m` |
| `MapProviderQuotaUsageCritical` | `5m` |
| `CoordinateLessDispatchAttemptHigh` | `5m` |
| `ServiceAreaPolicyBlockSpike` | `15m` |
| `ServiceAreaEvaluationUnavailable` | `10m` |

Support reading: the alert evidence is aligned with recent-window expressions in `infra/alerts/map-geofence-alerts.yaml`, not lifetime totals.

---

## 5. Open Parent Gates

These are intentionally outside the sidecar PASS scope and must remain explicit:

- `FLEETS-CLOSEOUT-001` is still `in_progress`, so Gate A closeout is not yet closed.
- Parent `next` still records `readiness=fail 12 failures`.
- `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` is a parent-owned finalization artifact and was not verified from this sidecar.
- `MAP-OBS-001` final evidence itself still carries `EXTERNAL-GATED` items: exporter wiring, dashboard/live alert parsing, and staged traffic across surfaces.

Result: this packet can support review approval of the sidecar artifact, but it must not be used to claim parent `done`, `merged_to_dev`, or `dev_deployed`.

---

## 6. Support Packet Index

Use these anchors without rewriting their conclusions:

- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-AUTOMATED-EVIDENCE-20260701.md`
- `support/sidecars/MAP-OBS-001/artifacts/`
- `support/sidecars/MAP-REL-001/MAP-PRODUCTION-CLOSEOUT-FLEETS-TASK-BOARD-20260708.md`
- `infra/alerts/map-geofence-alerts.yaml`
- `docs/03-runbooks/map-geofence-observability-runbook.md`
- `docs/03-runbooks/operational-observability-alert-runbook.md`
- `apps/api/tests/unit/map-geofence-observability-closeout-proof.test.ts`

---

## 7. Reviewer / Owner Hotspots

For sidecar reviewer `Codex2`:

1. Confirm the packet does not invent a live `MAP-OBS-001` task state and instead treats it as folded evidence with concrete anchors.
2. Confirm `FLEETS-CLOSEOUT-001` is described as current `in_progress`, not the earlier stale `blocked` state.
3. Confirm no parent-level readiness claim is implied while `readiness=fail 12 failures` remains in machine truth.

For parent owner `Gemini2` and parent reviewer `Codex`:

1. Re-run the placeholder scan against `MAP-OBS-001-FINAL-EVIDENCE.md` before parent closeout.
2. Generate and verify `support/sidecars/MAP-OBS-001/artifacts/closeout-20260708/fleets-closeout-006-observability-proof.json` during parent finalization.
3. Do not mark the parent `done` until `FLEETS-CLOSEOUT-001` is closed and the readiness verifier passes.

---

## 8. Sidecar Acceptance Checklist

- [x] Output is limited to `support/sidecars/FLEETS-CLOSEOUT-006/FLEETS-CLOSEOUT-006-SIDECAR-ACCEPTANCE.md`
- [x] No canonical truth or runtime files were edited
- [x] Parent acceptance bullets are copied from machine truth
- [x] Dependency map distinguishes sidecar deps from the parent-only gate
- [x] `MAP-OBS-001` is called out as a folded evidence anchor rather than a live task
- [x] Open parent gates are explicit so this packet cannot be misread as production-ready closeout

_Integration status for this sidecar remains `not_applicable` because the diff is support-only._
