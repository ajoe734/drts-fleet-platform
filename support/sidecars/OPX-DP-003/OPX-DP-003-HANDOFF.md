# OPX-DP-003 Owner Handoff

Owner: `Codex2`  
Reviewer: `Codex`  
Date: `2026-04-30`  
Observed task status: `in_progress`

## Result

`OPX-DP-003` is ready for re-review on the current repo state.

This handoff addresses the specific `changes_requested` finding in
[OPX-DP-003-REVIEW.md](/home/edna/workspace/drts-fleet-platform/support/sidecars/OPX-DP-003/OPX-DP-003-REVIEW.md):
`exception_hold` orders can no longer leave hold through the generic
redispatch path.

## What Changed

### 1. Backend now blocks redispatch bypass for exception-hold orders

- Added a hard guard in
  [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1325)
  so `redispatchOrder()` throws `EXCEPTION_HOLD_REQUIRES_RESOLUTION` when
  either `order.status` or `reservationHoldStatus` is `exception_hold`.
- This preserves `resolveExceptionHold()` as the only path that can release or
  cancel an exception hold with required reason, trace, actor identity, and
  downstream duty capture.

### 2. Dispatch UI no longer offers generic redispatch for held orders

- Narrowed the warning-button render condition in
  [apps/ops-console-web/app/dispatch/dispatch-workflow.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:1007)
  so the generic `redispatch` button only appears for
  `redispatch_required` and `dispatch_timeout`, not `exception_hold`.
- Exception-hold rows keep only the explicit audited actions already added by
  this task: `release`, `cancel`, and incident escalation.

### 3. Added regression coverage for the rejected bypass

- Added a focused unit test in
  [apps/api/tests/unit/owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/owned-mobility.service.test.ts:1665)
  that drives a reservation booking into `exception_hold`, attempts
  `redispatchOrder()`, asserts `ApiRequestError`, verifies
  `EXCEPTION_HOLD_REQUIRES_RESOLUTION`, and confirms the order remains in
  `exception_hold`.

## Verification

Executed on current repo state:

```sh
pnpm -C apps/api exec vitest run tests/unit/owned-mobility.service.test.ts
pnpm -C apps/api exec tsc --noEmit
pnpm -C apps/ops-console-web exec tsc --noEmit
```

Observed result:

- targeted owned-mobility suite passed: `1 file`, `37 tests`
- `apps/api` TypeScript check passed
- `apps/ops-console-web` TypeScript check passed

## Review Ask

Please review against current `HEAD` and focus on whether the bypass is now
fully closed end-to-end:

- UI should not expose generic redispatch from `exception_hold`
- API should reject direct `redispatchOrder()` calls for held orders
- regression coverage should prove exception-hold state is preserved until
  `resolveExceptionHold()` is used
