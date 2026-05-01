# ORX-IN-003 Review Notes

Reviewer: `Codex`
Date: `2026-04-30`
Status: `review_approved`

## Result

No blocking findings remain.

## Evidence

- The original `sourcePlatform` blocker is resolved in the live task-read path: forwarded orders now register their mirror-order source on ingest, and persisted forwarded orders re-register that mapping on module init, so restart/reload does not regress the driver-app terminal-state UX.
  - Ingest + restart rehydration now happen in [forwarder.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/forwarder/forwarder.service.ts:83).
  - Driver-task responses still hydrate from the registered mapping in [owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1951).
- The terminal-state / reconciliation workflow now has direct regression coverage, including persisted-order re-registration after module init.
  - Review-fix coverage lives in [forwarder.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/forwarder.service.test.ts:114) and the terminal-state / reconciliation cases later in the same file.

## Verification

- `pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts`

## Notes

- `pnpm --filter @drts/api exec tsc --noEmit` still fails in `src/modules/platform-admin/tenants.service.ts` because the current worktree has unrelated tenant-rollout contract drift (`AcknowledgeTenantRoleCommand`, `InviteTenantRoleCommand`, and `invitedAt` shape mismatches). That failure is outside `ORX-IN-003`'s forwarder scope and did not block this review.
