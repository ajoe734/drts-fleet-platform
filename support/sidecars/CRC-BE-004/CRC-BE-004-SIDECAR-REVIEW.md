# CRC-BE-004 Sidecar Review Packet

- **Parent Task:** `CRC-BE-004`
- **Parent Title:** `settlement-matrix: add partner_referral channel (drts_pays_partner)`
- **Sidecar Task:** `CRC-BE-004-SIDECAR-REVIEW`
- **Sidecar Owner / Reviewer:** `Codex` / `Codex2`
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Machine-Truth Snapshot Date:** `2026-06-14`

## 1. Scope

This sidecar is support-only.

- creates a reviewer packet for `CRC-BE-004`
- does not change canonical product truth
- does not change runtime behavior
- does not claim parent closeout or integration completion

## 2. Machine-Truth Snapshot

`AI_NAME=Codex scripts/ai-status.sh show CRC-BE-004` reports:

- status: `review`
- owner: `Codex`
- reviewer: `Claude2`
- acceptance: `partner_referral channel present with drts_pays_partner; matrix tests pass; typecheck pass`
- recorded verification: `pnpm --dir apps/api exec vitest run tests/unit/billing-settlement.service.test.ts`
- recorded verification: `pnpm --dir apps/api typecheck`

`AI_NAME=Codex scripts/ai-status.sh show CRC-BE-004-SIDECAR-REVIEW` reports:

- status: `in_progress` when this packet was prepared
- reviewer: `Codex2`
- artifact: `support/sidecars/CRC-BE-004/CRC-BE-004-SIDECAR-REVIEW.md`

## 3. Review Target

The parent review target is not the current `origin/dev` baseline in this worktree.

- review commit: `10ee885c916fb97fbaecd4b384cea2768ddfbdfd`
- commit subject: `CRC-BE-004: align partner referral settlement matrix`
- branch containing the review target: `codex/crc-be-004`

Why this matters:

- the assigned sidecar worktree branch `codex/crc-be-004-sidecar-review` is currently aligned with `origin/dev`
- `origin/dev` still shows the older `partner_referral` wording
- reviewer must inspect the parent branch or commit above, not just the local baseline tree

## 4. Parent Diff Summary

`10ee885c` changes only two files:

1. `apps/api/src/modules/billing-settlement/settlement-matrix.ts`
2. `apps/api/tests/unit/billing-settlement.service.test.ts`

Behavioral intent of the parent diff:

- normalizes the referral payer wording to `DRTS platform`
- tightens referral invoice/reconciliation wording to `referral settlement statement` and `referral settlement statement + attribution audit`
- makes the reimbursement rule explicitly carry `drts_pays_partner`
- adds direct unit assertions for `partner_referral`
- adds a consistency test against `ReferralSettlementScaffoldService`

## 5. Dependency Anchor

The parent task depends on referral-channel vocabulary already introduced by `CRC-WP0`.

Repo-visible dependency anchors:

- `packages/contracts/src/referral-channel.ts`
  - exports `PARTNER_REFERRAL_CHANNEL_KEY`
  - exports `REFERRAL_SETTLEMENT_DIRECTION_DRTS_PAYS_PARTNER`
  - exports referral settlement/channel types
- `apps/api/src/modules/billing-settlement/referral-settlement.scaffold.service.ts`
  - scaffold direction is `drts_pays_partner`
  - scaffold payer/payee is `drts_platform -> partner`

Reviewer expectation:

- `CRC-BE-004` should reuse these exports
- it should not invent a second referral settlement vocabulary

## 6. Reviewer Checklist

For `Claude2` on the parent task:

1. Check out `codex/crc-be-004` or inspect commit `10ee885c916fb97fbaecd4b384cea2768ddfbdfd`.
2. Confirm the `partner_referral` row is still keyed by `PARTNER_REFERRAL_CHANNEL_KEY`.
3. Confirm the row semantics now align with the scaffold contract:
   - payer wording: `DRTS platform`
   - settlement direction called out in `reimbursementRule`
   - invoice path: `referral settlement statement`
   - reconciliation path: `referral settlement statement + attribution audit`
4. Confirm the new unit coverage explicitly asserts referral-channel semantics instead of relying on incidental matrix coverage.
5. Confirm the recorded verification commands in machine truth match the reviewed tree:
   - `pnpm --dir apps/api exec vitest run tests/unit/billing-settlement.service.test.ts`
   - `pnpm --dir apps/api typecheck`

For `Codex2` on this sidecar task:

1. Confirm this packet stays within support-artifact scope only.
2. Confirm the machine-truth snapshot above matches `scripts/ai-status.sh show`.
3. Confirm the review target commit and branch are accurate.
4. Confirm the packet clearly distinguishes baseline `origin/dev` from the parent review target branch.

## 7. Evidence Anchors

- parent task state: `AI_NAME=Codex scripts/ai-status.sh show CRC-BE-004`
- sidecar task state: `AI_NAME=Codex scripts/ai-status.sh show CRC-BE-004-SIDECAR-REVIEW`
- parent review commit: `10ee885c916fb97fbaecd4b384cea2768ddfbdfd`
- dependency commit already on `dev`: `19bb64f5b978b07ebd44b7c8c7c2da7191f57cd5`
- dependency file: `packages/contracts/src/referral-channel.ts`
- dependency file: `apps/api/src/modules/billing-settlement/referral-settlement.scaffold.service.ts`
- parent edited file: `apps/api/src/modules/billing-settlement/settlement-matrix.ts`
- parent edited file: `apps/api/tests/unit/billing-settlement.service.test.ts`

## 8. Sidecar Verification

Verification run for this packet:

- `AI_NAME=Codex scripts/ai-status.sh show CRC-BE-004`
- `AI_NAME=Codex scripts/ai-status.sh show CRC-BE-004-SIDECAR-REVIEW`
- `git branch --all --contains 10ee885c916fb97fbaecd4b384cea2768ddfbdfd`
- `git show --stat --summary 10ee885c916fb97fbaecd4b384cea2768ddfbdfd --`
- `git show 10ee885c916fb97fbaecd4b384cea2768ddfbdfd --`

No runtime tests were executed in this sidecar pass because this task is limited to review-packet support material.
