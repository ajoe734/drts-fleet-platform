# ORX-DP-002 Review Notes

Reviewer: `Codex`
Date: `2026-04-30`
Status: `changes_requested`

## Findings

1. `exception_hold` orders can still bypass the audited release/cancel path through the generic redispatch flow, so the operator workflow is not actually closed end-to-end.
   Evidence:
   - The dispatch UI still shows the generic `redispatch` action for `exception_hold` rows and wires it to `client.redispatchOrder(orderId, "operator_redispatch")` instead of forcing the dedicated exception-hold resolution flow: [dispatch-workflow.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:440) and [dispatch-workflow.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:1007).
   - The backend `redispatchOrder()` path does not reject `order.status === "exception_hold"` or `order.reservationHoldStatus === "exception_hold"`. It immediately flips the order to `redispatch_required`, records a normal redispatch trace/audit entry, and re-enters `dispatchOrder()`: [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1313) and [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1065).
   - The only audited path for exception-hold exit is still `resolveExceptionHold()`, which requires authenticated actor context plus non-empty `reason` and `traceId`, and captures downstream reviewer/stage metadata. Generic redispatch bypasses all of that: [owned-mobility.controller.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:321) and [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1401).
     Impact:
   - An operator can move an exception-hold booking back into dispatch without the audited release/cancel semantics, which weakens the very escalation controls this slice is supposed to formalize.
     Fix ask:
   - Remove or disable the generic redispatch action for `exception_hold` rows in the dispatch UI.
   - Add a backend guard so `redispatchOrder()` rejects orders that are still in `exception_hold`.
   - Add regression coverage proving exception-hold orders cannot bypass `resolveExceptionHold()`.

## Verification

- `pnpm --filter @drts/contracts build` ✅
- `pnpm -C apps/api exec tsc --noEmit` ✅
- `pnpm -C apps/api exec vitest run tests/unit/owned-mobility.service.test.ts` ✅
- `pnpm -C apps/ops-console-web exec tsc --noEmit` ✅

## Notes

- The current `owned-mobility.service.test.ts` suite passes, but it does not exercise the `exception_hold -> redispatchOrder()` bypass path described above.
