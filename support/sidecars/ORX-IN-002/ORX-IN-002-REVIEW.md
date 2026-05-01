# ORX-IN-002 Review Notes

Reviewer: `Codex`
Date: `2026-04-30`
Status: `changes_requested`

## Findings

1. The new review-resolution path can convert an explicit `ineligible` denial into
   `eligible` with a plain `approve` decision, bypassing the separate override
   boundary required by the runbook.
   Evidence:
   - `resolvePartnerEligibilityReview()` derives `resolvedStatus` only from
     `command.decision`, so `decision === "approve"` promotes both
     `manual_review` and `ineligible` records to `eligible` in
     [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2061)
     and
     [tenant-partner.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2078).
   - The runbook explicitly says `ineligible` cases must stay failed unless a
     separate approved override process exists, and it separately tells ops not
     to present `ineligible` cases as transient or releasable in
     [partner-eligibility-manual-review-runbook.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/partner-eligibility-manual-review-runbook.md:20)
     and
     [partner-eligibility-manual-review-runbook.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/partner-eligibility-manual-review-runbook.md:39).
   - The task acceptance for ORX-IN-002 is to surface review-needed failures
     without silently creating invalid orders in
     [phase1-operational-remediation-execution-packet-20260430.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/phase1-operational-remediation-execution-packet-20260430.md:280).
     Impact:
   - An ops reviewer can turn a hard issuer/card-program denial into an
     `eligible` verification with one POST to
     `/api/ops/partner/eligibility/reviews/resolve`, which effectively creates
     an ad hoc override workflow inside ORX-IN-002 without the separate
     approval/audit gate the runbook requires.
     Fix ask:
   - Restrict `approve` to `manual_review` records only, or introduce a separate
     override-specific workflow instead of letting ORX-IN-002 rewrite
     `ineligible` records to `eligible`.
   - Add a regression proving `approve` on an `ineligible` verification fails
     with a conflict while `deny` still preserves the denial path.

## Notes

- The earlier queue-redaction blocker is fixed on the current worktree:
  `listPartnerEligibilityReviewQueue()` now returns
  `PartnerEligibilityReviewQueueItem` DTOs, and the service tests cover the
  evidence/detail separation.

## Verification

- `pnpm --filter @drts/api exec vitest run tests/unit/tenant-partner.service.test.ts`
- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/api-client typecheck`
- `pnpm --filter @drts/ops-console-web exec tsc --noEmit`
