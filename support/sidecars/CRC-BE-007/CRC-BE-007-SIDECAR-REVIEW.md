# CRC-BE-007 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`  
**Parent Task:** `CRC-BE-007`  
**Parent Owner / Reviewer:** `Codex` / `Claude2`  
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`  
**Generated:** `2026-06-14` (UTC)  
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet is support-only. It does not modify canonical truth or the parent
implementation. Its purpose is to give the sidecar reviewer and the parent
reviewer one place to audit the live machine-truth snapshot, the actual parent
commit under review, the acceptance-to-evidence map, and one material scope
warning in the parent diff.

---

## 1. Scope Boundary

In scope:

- snapshot the parent and sidecar state from machine truth
- pin the parent review target to the actual implementation commit
- map the parent acceptance bar to concrete files, routes, guards, and tests
- call out review hotspots that are easy to miss in the parent diff

Out of scope:

- editing L1/L2 product truth
- editing the parent implementation
- changing parent status, approval, closeout, push, or integration state

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar task `CRC-BE-007-SIDECAR-REVIEW`

`scripts/ai-status.sh show CRC-BE-007-SIDECAR-REVIEW` currently records:

- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- helper_parent=`CRC-BE-007`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/CRC-BE-007/CRC-BE-007-SIDECAR-REVIEW.md`
- last_update=`2026-06-14T09:33:38Z`

Relevant activity-log anchors:

- `2026-06-14T09:33:04Z` sidecar auto-created for parent `CRC-BE-007`
- `2026-06-14T09:33:09Z` owner rebalanced from `Gemini2` to `Codex`
- `2026-06-14T09:33:38Z` `Codex` started packet preparation

### 2.2 Parent task `CRC-BE-007`

`scripts/ai-status.sh show CRC-BE-007` currently records:

- owner=`Codex`
- reviewer=`Claude2`
- status=`review`
- depends_on=`CRC-BE-005`
- acceptance=`Partner sees only own usage/revenue/statements; cross-partner read denied; typecheck + test pass`
- last_update=`2026-06-14T09:32:11Z`

Recorded parent `next` field:

> Added partner-scoped referral dashboard/usage/revenue/statements APIs under
> `/partner/referral/*` with partner-entry scope enforcement, auth policy
> coverage, and unit tests. Verification:
> `pnpm --filter @drts/api typecheck`; `node /home/edna/workspace/drts-fleet-platform/node_modules/vitest/vitest.mjs run tests/unit/auth-bootstrap.test.ts tests/unit/tenant-partner.service.test.ts`

Relevant parent activity-log anchors:

- `2026-06-14T09:22:04Z` owner rebalanced from `Claude2` to `Codex`
- `2026-06-14T09:22:31Z` `Codex` started implementation
- `2026-06-14T09:32:11Z` `Codex` handed off to `Claude2` for review

---

## 3. Review Anchor Revision

The parent review target is the local branch-tip commit on `codex/crc-be-007`:

- commit=`f39874c052ef3076754d299bc268ba9e6a00521f`
- subject=`feat(CRC-BE-007): add referral partner read APIs`
- trailers:
  - `LLM-Agent: codex`
  - `Task-ID: CRC-BE-007`
  - `Reviewer: Claude2`

`git diff --stat origin/dev..f39874c052ef3076754d299bc268ba9e6a00521f` reports:

- `15 files changed, 515 insertions(+), 333 deletions(-)`

Most relevant changed files for the acceptance bar:

- `apps/api/src/common/auth/auth.policy.ts`
- `apps/api/src/modules/tenant-partner/partner-referral-portal.types.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/tests/unit/auth-bootstrap.test.ts`
- `apps/api/tests/unit/tenant-partner.service.test.ts`

Important review note:

- `git branch -r --contains f39874c...` returned no remote branch. At this
  snapshot the review target is a local commit, not yet confirmed on any remote
  ref from this worktree.

---

## 4. Acceptance-To-Evidence Map

### 4.1 Partner sees own dashboard / usage / revenue / statements

New controller routes are added at:

- `GET /partner/referral/dashboard` at `tenant-partner.controller.ts:295`
- `GET /partner/referral/usage` at `tenant-partner.controller.ts:313`
- `GET /partner/referral/revenue` at `tenant-partner.controller.ts:329`
- `GET /partner/referral/statements` at `tenant-partner.controller.ts:345`
- `GET /partner/referral/statements/:period` at `tenant-partner.controller.ts:361`

Anchor:

- [tenant-partner.controller.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-crc-be-007-sidecar-review/apps/api/src/modules/tenant-partner/tenant-partner.controller.ts)
  Review against commit `f39874c...` lines `295-377`.

The service methods serving those routes are added at:

- `getPartnerReferralDashboard` at `tenant-partner.service.ts:3840`
- `listPartnerReferralUsage` at `tenant-partner.service.ts:3873`
- `listPartnerReferralRevenue` at `tenant-partner.service.ts:3885`
- `listPartnerReferralStatements` at `tenant-partner.service.ts:3899`
- `getPartnerReferralStatement` at `tenant-partner.service.ts:3908`

These methods all resolve the caller's `partnerEntrySlug` from identity and then
delegate to `BillingSettlementService.listReferralStatements()` /
`getReferralStatement()` for the actual period and statement data.

### 4.2 Cross-partner read denied

Portal-scope enforcement is centralized in
`requirePartnerReferralPortalEntry()` at `tenant-partner.service.ts:7583`.

It explicitly rejects:

- missing/non-partner identity with `PARTNER_SCOPE_REQUIRED`
- tenant / partner / program / entry mismatches with `PARTNER_SCOPE_MISMATCH`
- non-referral partner entries with `PARTNER_SCOPE_UNSUPPORTED`

This is the key authorization invariant for the parent task.

### 4.3 Auth policy coverage

`auth.policy.ts:97-105` adds explicit route-policy resolution for
`partner/referral/*`:

- route key prefix `partner:referral:*`
- required scope `billing:read`
- allowed realms from `baseAllowedRealms("partner")`
- description `Referral partner self-service access`

`auth-bootstrap.test.ts:265-292` covers all five referral routes, including the
period-detail form `/api/partner/referral/statements/2026-06`.

### 4.4 Response shapes for the portal

`partner-referral-portal.types.ts:5-36` adds three portal-facing read models:

- `PartnerReferralUsagePeriodRecord`
- `PartnerReferralRevenuePeriodRecord`
- `PartnerReferralDashboardRecord`

These are support types only inside the API module and are derived from
`ReferralStatementRecord` plus `MoneyAmount`.

### 4.5 Unit verification coverage

`tenant-partner.service.test.ts:2765-2900` covers:

- happy-path partner-scoped dashboard / usage / revenue / statements
- expected seeded totals:
  - `activeUserCount = 2`
  - `tripCount = 2`
  - `gmv.amountMinor = 150000`
  - `shareAmount / estimatedShareAmount.amountMinor = 22500`
- `PARTNER_SCOPE_MISMATCH` rejection
- `PARTNER_SCOPE_UNSUPPORTED` rejection

The parent handoff records these verification commands:

- `pnpm --filter @drts/api typecheck`
- `node /home/edna/workspace/drts-fleet-platform/node_modules/vitest/vitest.mjs run tests/unit/auth-bootstrap.test.ts tests/unit/tenant-partner.service.test.ts`

---

## 5. Reviewer Hotspots

### 5.1 Material scope expansion beyond read APIs

The parent commit does more than add `/partner/referral/*` reads. It also
removes the earlier partner-ingress handoff surface:

- controller route `POST partner/ingress/handoff` is deleted
- `CreatePartnerIngressHandoffCommand` and `PartnerIngressHandoffSession` are
  removed from `packages/contracts/src/referral-channel.ts`
- `referral_passenger` is removed from auth actor types and JWT payload shape
- `apps/api/tests/unit/tenant-partner.controller.test.ts` is deleted

This may be intentional cleanup, but it is broader than the parent task title.
The reviewer should explicitly decide whether that removal is acceptable inside
`CRC-BE-007` or should be split/reopened.

### 5.2 Seed dependency for happy-path evidence

The happy-path portal test depends on the newly seeded referral-channel entry
`referral-demo-community` inside `tenant-partner.service.ts`. Review should
confirm that this seed is acceptable test/runtime scaffolding for the task and
that it matches the statement seed already introduced by `CRC-BE-005`.

### 5.3 Remote publication not yet evidenced here

This sidecar found the review target commit locally, but did not find any remote
branch containing it. That is not a review blocker by itself, because the parent
is still only in `review`, not `done`. It does mean reviewer comments should
anchor to commit `f39874c...` or the local branch `codex/crc-be-007`, not assume
the change is already published.

---

## 6. Reviewer Handoff

For `Codex2` as sidecar reviewer:

- Verify that this packet correctly reflects machine truth for both the sidecar
  and parent as of `2026-06-14`.
- Confirm the parent review anchor is `f39874c052ef3076754d299bc268ba9e6a00521f`.
- Sanity-check the acceptance map against the parent diff and the two recorded
  verification commands.
- Decide whether the ingress-handoff / `referral_passenger` removals are within
  acceptable parent scope or warrant a reopen note back to the parent reviewer.

For `Claude2` as parent reviewer:

- Review the parent against commit `f39874c...`, with special attention to the
  scope-enforcement helper and the broader cleanup noted above.

