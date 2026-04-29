# OPX-IN-004 Owner Handoff

Owner: `Codex`
Reviewer: `Codex2`
Date: `2026-04-29`
Status: `ready_for_review`

## Summary

This handoff supersedes the earlier `OPX-IN-004-REVIEW.md` finding that the
worktree only contained `owned-mobility` event-bus changes. The current delta
now includes the task-scoped `forwarder`, driver-app copy, contracts, and
architecture artifacts required by the execution packet.

## What Changed

- `apps/api/src/modules/forwarder/forwarder.service.ts`
  - Added explicit forwarded-order operating state for:
    - `orderDomain=forwarded`
    - `dispatchSemantics=forwarder_broadcast`
    - `financeContext` with external-platform authority / `shadow_only` ledger
    - `lastSyncError`, `manualFallback`, and `reconciliationJob`
  - Hardened driver accept relay so missing adapter or upstream accept failures
    become `sync_failed`, degrade/down adapter health, and queue reconciliation.
  - Added explicit manual fallback engagement and reconciliation completion
    flows.
- `apps/api/src/modules/forwarder/forwarder.controller.ts`
  - Added owner-facing endpoints for `sync-failed`, `manual-fallback`,
    `reconciliation/complete`, `sync-errors`, and `reconciliation-jobs`.
- `apps/api/src/modules/owned-mobility/owned-mobility-task-events.service.ts`
  - Added Postgres `LISTEN/NOTIFY` bridge with gzip fallback so task-mirror
    events can survive multi-instance fan-out; this is support work for the
    source-aware task mirror boundary in the OPX-IN-004 write scope.
- `apps/driver-app/app/jobs.tsx`
  - Driver copy now states that route, fare, and completion authority remain
    with the source platform and directs drivers to dispatch for manual
    fallback if sync stalls.
- `packages/contracts/src/index.ts`
  - Added forwarder sync-failure, manual-fallback, reconciliation commands and
    the related record shapes consumed by the service/controller.
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
  - Added the forwarded-order lifecycle, operating boundaries, and explicit
    failure/reconciliation model.
- `docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md`
  - Updated the forwarder gap section to reflect what this slice now
    materializes and what non-functional work remains open.

## Verification

Passed in the current worktree:

- `pnpm --filter @drts/api test -- --run tests/unit/forwarder.service.test.ts`
- `pnpm --filter @drts/api test -- --run tests/unit/owned-mobility-task-events.service.test.ts`
- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/driver-app typecheck`

Note: the Vitest invocations still execute the package suite under the current
script wiring, but both relevant test files are present and the suite passed.

## Reviewer Focus

- Confirm the forwarder acceptance slice is now materially present, not just
  the task-event bridge.
- Confirm the architecture text and driver-app copy line up with the forwarder
  service behavior and contract additions.
- Ignore unrelated existing repo worktree noise outside the files listed above.
