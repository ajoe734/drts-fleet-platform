# ORX-DP-001 Review Notes

Reviewer: `Codex`
Date: `2026-04-30`
Status: `review_approved`

## Result

No blocking findings remain.

## Evidence

- Queue families and queue-entry reasons are explicit in the shared contract and are carried on the order payload instead of being inferred from raw status strings.
  - Queue-family / entry-reason enums are defined in [index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:1037).
  - `OwnedOrderRecord` exposes `queueFamily` and `queueEntryReason` in [index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:1528).
- The owned-mobility state system deterministically maps exception hold, manual review, recording gate, redispatch, reservation confirmation, and realtime-ready states into those explicit queue families and reasons.
  - Queue resolution is implemented in [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:4153).
- The dispatch UI now surfaces queue family, queue-entry reason, and phone-order recording state together in the operator workflow so recording-gated queues are distinguishable from the other queue families.
  - Phone-order recording badge derivation and rendering live in [dispatch-workflow.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:139) and [dispatch-workflow.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:686).
- Reviewer follow-up fix: the shared zh recording-state label used by both call-center and dispatch previously read as callback work, which would have made the recording-gated badge misleading in Chinese. That wording is now corrected to recording semantics in [translations.ts](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/lib/translations.ts:1551) and [translations.ts](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/lib/translations.ts:1582).
- Regression coverage exists for the queue-state matrix and for the underlying call-session recording-state lifecycle.
  - Queue-state assertions are in [owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/owned-mobility.service.test.ts:821).
  - Recording-state assertions are in [callcenter.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/callcenter.service.test.ts:8).

## Verification

- `pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility.service.test.ts tests/unit/owned-mobility-compliance-gates.test.ts tests/unit/callcenter.service.test.ts`
- `pnpm --filter @drts/ops-console-web typecheck`

## Notes

- `packages/contracts/src/index.ts` contains unrelated in-flight contract edits in the current worktree. This review is scoped to the dispatch queue-family / queue-entry slices cited above and does not certify the unrelated contract additions in that file.
