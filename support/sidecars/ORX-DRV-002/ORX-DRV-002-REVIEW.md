# ORX-DRV-002 Review Notes

Reviewer: `Codex2`
Date: `2026-04-30`
Status: `review_approved`

## Re-review Result

The previously reported replay lifecycle blocker is addressed.

1. Pending completion replay no longer self-cancels when it marks the UI as submitting.
   Evidence:
   - The trip screen moved replay orchestration into [`use-pending-completion-replay.ts`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/use-pending-completion-replay.ts:1), which tracks the active task id and in-flight request id outside the effect dependency that toggles `submittingAction`.
   - The hook claims one pending completion request at a time via [`pending-completion-replay.ts`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/pending-completion-replay.ts:1), sets `submittingAction` for the UI, and still reaches `onReplayCompleted`, `onIdentityFailure`, or `onReplayError` after the awaited replay settles.
   - The trip screen now wires replay success back through `loadTrip(false)` and stale-session failures back through onboarding reset in [`trip.tsx`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:437) and [`trip.tsx`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:579).
   - Hook coverage locks the previously broken lifecycle in [`use-pending-completion-replay.test.ts`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/tests/unit/use-pending-completion-replay.test.ts:58), including the success path across the `submittingAction` rerender, auth-failure routing, and same-request retry after a transient error.

2. Duplicate completion replay and stale call-recording state handling stay aligned with the backend acceptance surface.
   Evidence:
   - The driver API client now persists pending completion payloads with a stable request id, replays them with both `X-Request-Id` and `Idempotency-Key`, clears terminal proof errors, and preserves stale-session recovery state in [`api-client.ts`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/api-client.ts:159).
   - The owned-mobility service now short-circuits duplicate driver completions when the replayed request id already appears on the canonical task trace log, instead of creating a second completion side effect, in [`owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2703) and [`owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:3620).
   - Owned-mobility also now listens for recording state changes so closed calls without a linked recording transition to `recording_missing` with the matching compliance gate and queue-entry reason in [`owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:180) and [`owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:4016).

## Verification

- `pnpm --filter @drts/driver-app exec vitest run tests/unit/pending-completion-replay.test.ts tests/unit/use-pending-completion-replay.test.ts tests/unit/driver-identity-bootstrap.test.ts` ✅
- `pnpm --filter @drts/driver-app exec tsc --noEmit` ✅
- `pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility-task-events.test.ts` ✅
- `pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility.service.test.ts tests/unit/owned-mobility-compliance-gates.test.ts` ✅
