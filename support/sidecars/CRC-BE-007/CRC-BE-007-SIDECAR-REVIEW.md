# CRC-BE-007 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`  
**Parent Task:** `CRC-BE-007`  
**Assigned Reviewer:** `Claude2`  
**Generated:** `2026-06-14` (UTC)  
**Status:** `CLOSED REVIEW SUPPORT ARTIFACT`

This file is support-only. It does not modify canonical truth or the parent
implementation. It captures the review anchor, acceptance evidence, and the
final sidecar closeout audit after the packet reached `done`.

---

## 1. Scope Boundary

In scope:

- preserve the parent review anchor and acceptance evidence map
- summarize the machine-truth closeout state for this sidecar
- record any review hotspot the parent reviewer should have audited

Out of scope:

- editing L1/L2 product truth
- editing the parent implementation
- changing parent runtime, registry, governance, or contract behavior

---

## 2. Machine-Truth Closeout Snapshot

`AI_NAME=Codex scripts/ai-status.sh show CRC-BE-007-SIDECAR-REVIEW` now records:

- owner=`Codex`
- reviewer=`Claude2`
- status=`done`
- helper_parent=`CRC-BE-007`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/CRC-BE-007/CRC-BE-007-SIDECAR-REVIEW.md`
- review_file=`.orchestrator/chair-reviews/20260614T094233Z-codex.md`
- integration_status=`not_applicable`
- last_update=`2026-06-14T12:39:07Z`
- next=`Sidecar chairman operational review packet delivered and approved; closing out.`

This worktree no longer has a live active-board record for parent task
`CRC-BE-007`, so the parent review anchor below is preserved from the earlier
review packet evidence rather than re-reading a pruned task slice.

---

## 3. Parent Review Anchor

The parent implementation reviewed by `Claude2` was anchored to:

- commit=`f39874c052ef3076754d299bc268ba9e6a00521f`
- subject=`feat(CRC-BE-007): add referral partner read APIs`
- trailers:
  - `LLM-Agent: codex`
  - `Task-ID: CRC-BE-007`
  - `Reviewer: Claude2`

At packet-preparation time, `git diff --stat origin/dev..f39874c052ef3076754d299bc268ba9e6a00521f`
reported:

- `15 files changed, 515 insertions(+), 333 deletions(-)`

Most relevant parent files for the acceptance bar:

- `apps/api/src/common/auth/auth.policy.ts`
- `apps/api/src/modules/tenant-partner/partner-referral-portal.types.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/tests/unit/auth-bootstrap.test.ts`
- `apps/api/tests/unit/tenant-partner.service.test.ts`

---

## 4. Acceptance-To-Evidence Map

### 4.1 Partner sees own dashboard / usage / revenue / statements

Parent controller routes added for the referral partner portal:

- `GET /partner/referral/dashboard`
- `GET /partner/referral/usage`
- `GET /partner/referral/revenue`
- `GET /partner/referral/statements`
- `GET /partner/referral/statements/:period`

Parent service methods added for those reads:

- `getPartnerReferralDashboard`
- `listPartnerReferralUsage`
- `listPartnerReferralRevenue`
- `listPartnerReferralStatements`
- `getPartnerReferralStatement`

These methods resolve the caller's `partnerEntrySlug` from identity and then
delegate to the billing-settlement statement read path.

### 4.2 Cross-partner read denied

Portal-scope enforcement is centralized in
`requirePartnerReferralPortalEntry()` inside
`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`.

The packet verified explicit rejection paths for:

- missing or non-partner identity via `PARTNER_SCOPE_REQUIRED`
- tenant / partner / program / entry mismatch via `PARTNER_SCOPE_MISMATCH`
- non-referral partner entries via `PARTNER_SCOPE_UNSUPPORTED`

### 4.3 Auth policy coverage

`apps/api/src/common/auth/auth.policy.ts` adds route-policy resolution for
`partner/referral/*` with:

- route key prefix `partner:referral:*`
- required scope `billing:read`
- partner realm restriction

`apps/api/tests/unit/auth-bootstrap.test.ts` covers all five referral routes,
including the period-detail endpoint.

### 4.4 Portal response shapes

`apps/api/src/modules/tenant-partner/partner-referral-portal.types.ts` adds:

- `PartnerReferralUsagePeriodRecord`
- `PartnerReferralRevenuePeriodRecord`
- `PartnerReferralDashboardRecord`

### 4.5 Verification recorded by the parent handoff

The packet preserved these parent verification commands:

- `pnpm --filter @drts/api typecheck`
- `node /home/edna/workspace/drts-fleet-platform/node_modules/vitest/vitest.mjs run tests/unit/auth-bootstrap.test.ts tests/unit/tenant-partner.service.test.ts`

---

## 5. Review Hotspot Preserved From Packet Preparation

The parent commit appeared broader than pure read-API addition. The packet
flagged that the same parent diff also removed the earlier partner-ingress
handoff surface:

- controller route `POST partner/ingress/handoff`
- `CreatePartnerIngressHandoffCommand`
- `PartnerIngressHandoffSession`
- `referral_passenger` auth actor / JWT shape
- `apps/api/tests/unit/tenant-partner.controller.test.ts`

This was called out so the parent reviewer could decide whether that cleanup was
acceptable inside `CRC-BE-007` or should have been split.

---

## 6. Closeout Audit

This closeout revision corrects two stale details from the first packet draft:

- the sidecar reviewer is `Claude2`, not `Codex2`
- the sidecar lifecycle is now `done`, not `in_progress`

No canonical implementation files were changed in this sidecar. The only owned
artifact is this packet.
