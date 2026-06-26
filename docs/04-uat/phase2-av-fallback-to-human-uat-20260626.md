# Phase 2 AV Fallback-To-Human UAT — 2026-06-26

## `UAT-AV-010` — Human taxi fallback on AV failure preserves booking / ETA / audit chain

**Objective**

Validate that `POST /api/roc/trips/{id}/fallback-to-human` reuses the original booking and order, creates a Phase 1 human assignment, updates ETA, and produces a sandbox-exception report without breaking the dispatch / billing / audit chain.

**Preconditions**

1. A sandbox-owned trip exists on the same `orderId` / `bookingId` pair used for the AV dispatch attempt.
2. The trip has either:
   - a sandbox gate decision with `fallbackRequired = true`, or
   - an active AV assignment that ROC must replace with a human driver.
3. ROC provides a human `vehicleId`, human `driverId`, and revised ETA minutes.

**Steps**

1. Create a tenant booking and dispatch job under owned mobility.
2. Trigger one of the two fallback sources:
   - sandbox gate block (`fallbackRequired = true`), or
   - ROC manual intervention after AV assignment.
3. Call `POST /api/roc/trips/{id}/fallback-to-human`.
4. Inspect the returned receipt, fallback report, order snapshot, assignment/task state, and audit logs.

**Assertions**

1. The route returns the same canonical `orderId`; if the trip originated from a booking, the same `bookingId` is preserved.
2. No replacement booking or replacement order is created.
3. A new human assignment/task is created on the existing dispatch chain.
4. If an AV assignment existed, it is cancelled and replaced by the new human assignment on the same dispatch job.
5. `etaSnapshot` is updated to the revised passenger ETA.
6. The order carries fallback/report compliance markers and a `roc.fallback_to_human` trace record.
7. ROC emits:
   - `roc.intervention.started`
   - `roc.intervention.resolved`
   - `roc.fallback_to_human.reported`
8. A sandbox-exception report is returned with:
   - original order / booking references
   - fallback assignment/task references
   - AV reason codes when a gate decision exists
   - report artifact id

**Repo Evidence**

1. Integration coverage: `apps/api/tests/integration/int-p2-008-roc-human-fallback.test.ts`
2. E2E wrapper: `tests/e2e/E2E-P2-008-roc-human-fallback.sh`
3. Supporting gate coverage: `apps/api/tests/integration/int-p2-002-sandbox-dispatch-hook.test.ts`

**Result**

Current repo evidence is satisfied when `E2E-P2-008-roc-human-fallback.sh` passes locally and the integration assertions above remain green.
