# MAP-BE-005 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Task ID:** `MAP-BE-005-SIDECAR-ACCEPTANCE`  
**Parent Task:** `MAP-BE-005`  
**Sidecar Owner:** `Codex2`  
**Sidecar Reviewer:** `Claude2`  
**Generated:** `2026-07-01` (UTC)  
**Scope:** support-only artifact; does not edit canonical truth or runtime code.

This packet prepares the reviewer-facing acceptance companion for
`MAP-BE-005` (`Persist service-area snapshot and spatial audit`). It is limited
to support material and follows current machine truth first. Where older
planning docs still say `review` as of `2026-06-30`, this packet treats that as
implementation intent and not the current control-plane state.

## 1. Machine Truth Snapshot

### Sidecar row — `MAP-BE-005-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Claude2`
- status=`in_progress`
- depends_on=`MAP-BE-004`
- artifact=`support/sidecars/MAP-BE-005/MAP-BE-005-SIDECAR-ACCEPTANCE.md`
- acceptance=`Create support artifacts only` / `Do not edit canonical truth` /
  `Hand off the packet to the assigned reviewer`

### Parent row — `MAP-BE-005`

- owner=`Claude2`
- reviewer=`Codex2`
- status=`in_progress`
- depends_on=`MAP-BE-004`
- acceptance:
  - `created orders store coordinate provenance`
  - `evaluation snapshot immutable`
  - `audit events emitted`
  - `legacy text-only state explicit`
  - `api tests pass`
- note on source precedence:
  - machine truth on `2026-07-01` says parent is `in_progress`
  - runbook packet from `2026-06-30` says parent was in `review`
  - reviewer should trust `ai-status.json` state first and use the runbook only
    as accepted implementation scope/evidence inventory

### Hard dependency — `MAP-BE-004`

- status=`done`
- owner=`Codex`
- reviewer=`Codex2`
- commit=`deb5e1d366f1789c29bd26818b14ffcb801a43a3`
- subject=`MAP-BE-004: finalize service-area booking creation enforcement (#1013)`
- push target=`origin/dev`
- why it matters:
  - `MAP-BE-005` snapshots the backend service-area decision made during booking
    creation; without `MAP-BE-004`, there is no stable creation-time decision to
    persist
  - the persisted snapshot is expected to preserve the exact
    allow/block/manual-review result instead of re-evaluating later against
    changed geometry

## 2. Review Surface Anchors

These are the highest-signal files for parent review.

| Surface | Source | Reviewer focus |
| --- | --- | --- |
| Contract enum + snapshot model | `packages/contracts/src/index.ts:96-120`, `packages/contracts/src/index.ts:586-604`, `packages/contracts/src/index.ts:2960` | Confirm `legacy_text` is a first-class coordinate source and `OwnedOrderRecord` can carry `spatialAudit`. |
| Booking-creation snapshot write path | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6052-6085`, `6216-6247`, `6319-6365` | Confirm order creation persists snapshot, sets explicit legacy-text manual-review flag when coordinates are missing, and records `order.spatial_audit.snapshot_created`. |
| Snapshot reuse path | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6142-6155` | Confirm post-creation service-area gating reuses persisted snapshot instead of silently re-evaluating. |
| Snapshot immutability / cloning | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6519-6555`, `7229-7240` | Confirm nested evaluation/provenance data is cloned before exposure. |
| Unit evidence | `apps/api/tests/unit/owned-mobility.service.test.ts:327-387`, `390-452`, `529-550` | Confirm serviceable snapshot capture, explicit legacy-text manual review, audit event creation, and immutability against caller mutation. |

## 3. Design and Planning Anchors

### Accepted task scope from the execution packet

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:365-420`
  defines the parent goal and already-recorded review evidence:
  - persist pickup/dropoff provenance
  - persist service-area decision, area/policy/version refs, and evaluation
    timing
  - emit audit evidence
  - mark text-only legacy orders explicitly
  - verify with API typecheck/test and targeted unit coverage

### Gap inventory context

- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:167`
  records that order-level spatial audit snapshots were added in `MAP-BE-005`
- the same gap document still notes unresolved downstream UX gaps:
  - tenant/concierge/partner forms do not yet show serviceability feedback
  - ops still needs better visibility into policy causes
- reviewer should not reopen `MAP-BE-005` merely because those downstream UI
  tasks are unfinished; those are separate dependencies/consumers

## 4. Dependency / Downstream Map

These are reviewer-relevant edges, not new machine-truth `depends_on` entries.

| Item | Status | Reviewer implication |
| --- | --- | --- |
| `MAP-BE-004` booking creation enforcement | `done` | Snapshot content must reflect the already-enforced backend service-area outcome. |
| `MAP-BE-003` service-area contract/client baseline | upstream context | Snapshot fields should align with existing evaluation contract vocabulary rather than invent a parallel decision schema. |
| `MAP-FE-CALL-001` | downstream consumer | Phone booking/support flows depend on explicit provenance and manual-review evidence for callcenter-created orders. |
| `MAP-FE-TEN-001` | downstream consumer | Tenant entry surfaces depend on persisted creation-time audit state, especially for coordinate-less/manual-review outcomes. |
| `MAP-FE-CON-001` | downstream consumer | Concierge/partner entry depends on the same persisted snapshot instead of later inferred ops-only reasoning. |
| `MAP-FE-OPS-001` | downstream consumer | Ops map/dispatch boards already consume `order.spatialAudit` fields for service area, version, and reason visibility. |
| `MAP-MOB-DRV-001` | downstream consumer | Driver map/navigation depends on stable geometry/reason context from the persisted order record. |
| `MAP-OBS-001` | downstream consumer | Observability evidence expects `coordinate_less_booking_attempts_total`, `service_area.evaluated`, and manual-override/audit linkage to remain attributable to `MAP-BE-005`. |

Reference: `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:150-167,926-944` and `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE-TEMPLATE.md:61-87`.

## 5. Reviewer Checklist For `MAP-BE-005`

1. Verify machine truth first.
   - Parent row should be reviewed against the current `ai-status.json` state,
     even though the runbook packet still describes `review` on `2026-06-30`.

2. Verify contract coverage is explicit.
   - `legacy_text` must exist in the coordinate-source enum.
   - `OwnedOrderSpatialAuditSnapshot` must include actor/surface, decision,
     stop provenance, area/version refs, reason codes, missing items, and
     audit-event refs.
   - `OwnedOrderRecord` must expose `spatialAudit`.

3. Verify booking creation persists a snapshot exactly once per created order.
   - `applyServiceAreaCreationPolicy()` should write `order.spatialAudit`.
   - missing coordinates must add
     `service_area_legacy_text_manual_review`.
   - snapshot audit write should emit
     `order.spatial_audit.snapshot_created`.

4. Verify created orders reuse the persisted snapshot.
   - `resolveServiceAreaGate()` should prefer `order.spatialAudit` over a fresh
     evaluator call.
   - review should fail if created orders can drift with later geometry changes
     without explicit operator action.

5. Verify text-only legacy handling is explicit and fail-safe.
   - text-only orders must surface `coordinateSource: "legacy_text"`
   - missing pickup/dropoff coordinates must remain visible in
     `missingItems`
   - dispatch should not silently proceed as normal serviceable flow

6. Verify immutability is real, not shallow.
   - nested arrays/objects inside `spatialAudit` and
     `serviceAreaEvaluation` must be cloned before returning order detail
   - the unit test that mutates returned snapshot data must still observe a
     clean fresh read

7. Verify verification evidence matches the accepted scope.
   - execution packet records these expected commands:
     - `pnpm exec prettier --check packages/contracts/src/index.ts apps/api/src/modules/owned-mobility/owned-mobility.service.ts apps/api/tests/unit/owned-mobility.service.test.ts`
     - `pnpm --filter @drts/contracts typecheck`
     - `pnpm --filter @drts/contracts lint`
     - `pnpm --filter @drts/contracts test`
     - `pnpm --filter @drts/api typecheck`
     - `pnpm --filter @drts/api lint`
     - `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/owned-mobility.service.test.ts apps/api/tests/unit/service-area.service.test.ts`

## 6. Expected Reviewer Conclusion Shape

If parent acceptance passes, the review conclusion should mention:

- persisted `spatialAudit` contract is present on orders
- creation-time service-area decision is preserved and reused
- legacy text-only orders are explicit manual-review candidates, not silent
  dispatchable records
- `order.spatial_audit.snapshot_created` audit evidence is emitted
- immutability coverage is backed by unit tests, not prose only

If parent acceptance fails, reopen/blocker should point to one of these classes:

- snapshot schema missing required provenance / decision / version fields
- created orders can still drift because evaluation is recomputed instead of
  reused
- text-only legacy orders are not explicit or can dispatch silently
- audit event evidence is missing or not linked back into the snapshot
- immutability is only shallow and returned detail can mutate stored state

## 7. Sidecar Delivery Summary

This sidecar does not claim parent completion. It provides:

- a current machine-truth-first briefing for a parent task whose planning docs
  still carry an older `review` timestamp
- a focused review map across contracts, backend persistence, test evidence,
  and downstream consumers
- a dependency map that keeps downstream UI/ops/observability follow-up work
  separate from the backend snapshot acceptance itself

## 8. Closeout Readiness

- sidecar should be handed to `Claude2` after this support artifact is committed
  and sidecar machine truth moves to `review`
- parent owner `Claude2` remains responsible for deciding when parent
  implementation is actually ready for reviewer acceptance
- no canonical contract/runtime/governance edits are included in this sidecar
