# OPX-CM-001 Review Notes

Reviewer: Codex
Date: 2026-04-29
Task: Recording, proof, and eligibility gate matrix implementation

## Findings

1. `release_to_dispatch` is currently unusable for reservation orders.
   - [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1349) transitions `exception_hold -> requested`, but [packages/contracts/src/index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:980) only allows `exception_hold -> released`.
   - Reproduced with `pnpm --filter @drts/api exec node -r ts-node/register -e '...'`: the call fails with `INVALID_HOLD_TRANSITION`.

2. Manual fare override can mutate closed fixed-price orders and create split fare truth.
   - [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:935) checks only `order.fixedPrice`, not order lifecycle status.
   - Completed trips snapshot fare into the driver task at [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2203), so a later override changes `order.quotedFare` without updating the completed task fare.

3. The new order mutations do not publish an ops dispatch event, so the new compliance/revenue board state stays stale.
   - The dispatch board only reacts to `order_created`, `dispatch_job_updated`, `driver_location_updated`, and `supply_lifecycle_updated` at [apps/ops-console-web/app/dispatch/dispatch-workflow.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:169).
   - Event types exposed by the stream are limited to those publishers at [apps/api/src/common/ops-dispatch-events.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/common/ops-dispatch-events.service.ts:151).
   - Neither `applyManualFareOverride` nor `resolveExceptionHold(...release...)` emits any dispatch event after persisting order changes at [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:982) and [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1363).

## Verification

- `pnpm --filter @drts/api test -- tests/unit/owned-mobility.service.test.ts tests/unit/owned-mobility-compliance-gates.test.ts`
- `pnpm --filter @drts/api exec node -r ts-node/register -e '...'` to reproduce the invalid hold transition on `release_to_dispatch`
