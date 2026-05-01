# ORX-FN-001 Review Notes

Reviewer: `Codex`
Date: `2026-04-30`
Status: `review_approved`

## Outcome

No blocking findings remain for this slice.

Resolved items verified in the current worktree:

1. The prior localization regression is fixed.
   Evidence:
   - [payments/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/payments/page.tsx:196) now resolves payer / sponsor / invoice owner / invoice path / receipt / payout / discount / reimbursement / reconciliation cells through `describeMatrixField(...)` instead of rendering raw backend English strings directly.
   - [revenue/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/revenue/page.tsx:234) does the same for the revenue settlement matrix.
   - [translations.ts](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/lib/translations.ts:1113) and [translations.ts](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/lib/translations.ts:1926) now include zh copy for the new sponsor / invoice owner / payout / discount / reimbursement matrix fields.

2. The forwarded-channel routing bug is fixed and covered by tests.
   Evidence:
   - [settlement-matrix.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/billing-settlement/settlement-matrix.ts:103) now returns `forwarded_shadow` immediately when `orderSource === "external_platform"`, before the partner fallback branch.
   - [billing-settlement.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/billing-settlement.service.test.ts:46) now covers tenant, partner, phone, and forwarded channel routing explicitly.

## Verification

- `pnpm --filter @drts/api exec vitest run tests/unit/billing-settlement.service.test.ts tests/unit/reporting-filing.service.test.ts`
- `pnpm --filter @drts/platform-admin-web exec tsc --noEmit`
- `pnpm --filter @drts/ops-console-web exec tsc --noEmit`

## Notes

- Review scope is limited to the ORX-FN-001 settlement-matrix API/UI surfaces and their targeted tests.
- `packages/contracts/src/index.ts` and the broader translation files contain unrelated in-flight edits in the current worktree; this approval is based only on the ORX-FN-001 sections cited above.
