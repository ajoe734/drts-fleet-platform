# OPX-DP-003 Review Notes

Reviewer: `Codex`
Date: `2026-04-30`
Status: `review_approved`

## Result

No blocking findings remain. The prior `exception_hold` bypass is closed on the
current worktree.

## Evidence

- Backend redispatch now hard-rejects orders that are still in
  `exception_hold`, returning `EXCEPTION_HOLD_REQUIRES_RESOLUTION` before any
  redispatch side effects run:
  [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1325).
- The dispatch board no longer renders generic redispatch actions for
  `exception_hold` rows. Those rows now expose only the explicit exception-hold
  controls (`release`, `cancel`, incident escalation), while generic
  redispatch stays limited to `redispatch_required` and `dispatch_timeout`:
  [apps/ops-console-web/app/dispatch/dispatch-workflow.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:1007)
  and
  [dispatch-workflow.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:1056).
- Regression coverage now proves that `redispatchOrder()` cannot move a held
  reservation out of `exception_hold`, and that the order state remains held
  until `resolveExceptionHold()` is used:
  [apps/api/tests/unit/owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/owned-mobility.service.test.ts:1665).

## Verification

- `pnpm --filter @drts/contracts build`
- `pnpm -C apps/api exec vitest run tests/unit/owned-mobility.service.test.ts`
- `pnpm -C apps/api exec tsc --noEmit`
- `pnpm -C apps/ops-console-web exec tsc --noEmit`

All four commands passed on the current worktree. Focused review was anchored
against [OPX-DP-003-HANDOFF.md](/home/edna/workspace/drts-fleet-platform/support/sidecars/OPX-DP-003/OPX-DP-003-HANDOFF.md).
