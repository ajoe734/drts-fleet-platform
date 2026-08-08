# IAM-ACC-003 Review Packet & Evidence Summary

**Sidecar Task:** `IAM-ACC-003-SIDECAR-REVIEW`  
**Parent Task:** `IAM-ACC-003`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Gemini`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex` / `Gemini2`  
**Last Revised:** `2026-08-08 (UTC)`  
**Status:** REVIEW APPROVED — packet reviewed and approved by Codex, finalized by Gemini for task closeout

---

## 1. Scope Boundary

This sidecar is support-only.

- **In scope:** Review packet preparation, evidence inventory, reviewer hotspots, and reviewer handoff for `IAM-ACC-003`.
- **Out of scope:** Canonical truth modifications, contract schema edits, or altering L1 product specifications.
- **Slice restriction:** Strictly limited to single file `support/sidecars/IAM-ACC-003/IAM-ACC-003-SIDECAR-REVIEW.md`. No unrelated support artifacts or schema changes are included.

The machine truth referenced for this packet comes from:
- `ai-status.json` (single-task query via `scripts/ai-status.sh show IAM-ACC-003` as of `2026-08-08T07:07:23Z`)
- `current-work.md` (derived human summary)
- `apps/api/src/modules/tenant-partner/` & `apps/api/src/modules/identity/`
- `tests/unit/tenant-invitation-lifecycle.test.ts`
- `tests/unit/identity-canonical-repository.test.ts`

---

## 2. Parent Task Baseline & Acceptance Verification

### Parent Task Details
- **Task ID:** `IAM-ACC-003`
- **Title:** Implement tenant joiner mover leaver and proof-based invitation lifecycle
- **Phase:** `stage1.5-identity-access-account-security-20260801`
- **Parent Owner:** `Codex`
- **Parent Reviewer:** `Gemini2`
- **Machine Truth Status:** `in_progress` (Owner Closeout phase as of `2026-08-08T07:07:23Z`; reviewer `Gemini2` provided `"審查通過"` review notes; owner `Codex` is verifying closeout prerequisites for commit `2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0`, `pr_url: https://github.com/ajoe734/drts-fleet-platform/pull/1279`, `ci_status: in_progress`, `integration_status: ci_pending`)
- **PR URL:** `https://github.com/ajoe734/drts-fleet-platform/pull/1279`
- **Branch / Commit:** `origin/codex/iam-acc-003-secure` (`2a9a5c5c1bda8e3a226ca24c0ac7f872915254b0`)

### Acceptance Criteria Matrix

| # | Acceptance Criterion | Status | Empirical Verification / Code Anchor |
|---|---|---|---|
| 1 | Invitation tokens are hash-only single-use and expiring | **VERIFIED** | `TenantPartnerService` in `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` confirms raw proof `ti_*` is never persisted plain text; SHA-256 hash storage and single-use assertion pass. |
| 2 | Invited user cannot log in before proof | **VERIFIED** | `principal.status` remains `migration_pending`/`invited` until invitation acceptance with valid proof token. |
| 3 | Self-escalation and last-admin removal fail | **VERIFIED** | `identity-canonical-repository.test.ts` and `tenant-partner.service.ts` assert `TENANT_SELF_ROLE_CHANGE_DENIED` and `TENANT_LAST_ADMIN_REQUIRED` (fails even if replacement admin is still invited). |
| 4 | Offboarding revokes access within 60 seconds | **VERIFIED** | Role / status changes trigger synchronous session revocation (`status: revoked`, `revokeReason: TENANT_ROLE_CHANGED`) and invalidate the associated refresh family in `identity.repository.ts`. |
| 5 | Tenant lifecycle and enumeration negatives pass | **VERIFIED** | All unit tests in `tests/unit/identity-canonical-repository.test.ts` and `tests/unit/tenant-partner-foundation.test.ts` pass cleanly. |

---

## 3. Implementation Summary & Code Anchors

`IAM-ACC-003` delivers the complete tenant account lifecycle (Joiner, Mover, Leaver) with proof-based invitation security:

1. **Invitation Delivery & Hash Security:**
   - [`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-acc-003-sidecar-review/apps/api/src/modules/tenant-partner/tenant-partner.service.ts) abstracts invitation token delivery and lifecycle. Raw tokens prefixed with `ti_` are delivered out-of-band and never stored in plain text. SHA-256 hashes are persisted in `IdentityRepository`.

2. **Invitation Resend & Single-Use Enforcement:**
   - Re-inviting or resending an invitation generates a new raw proof token and invalidates prior invitation tokens.
   - Once accepted, `acceptedAt` is timestamped and subsequent attempts with the same token throw `ApiRequestError`.

3. **Tenant Boundary & Guardrails:**
   - **Self-escalation denial:** Users cannot upgrade their own roles; attempts trigger `TENANT_SELF_ROLE_CHANGE_DENIED`.
   - **Last-admin protection:** Demoting or removing the last active tenant admin is blocked (`TENANT_LAST_ADMIN_REQUIRED`), even if an invited candidate admin exists.

4. **Offboarding & Immediate Session Revocation:**
   - Modifying a tenant user's role or status immediately revokes active sessions (`revokeReason: TENANT_ROLE_CHANGED`) and revokes associated refresh token families in [`apps/api/src/modules/identity/identity.repository.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-acc-003-sidecar-review/apps/api/src/modules/identity/identity.repository.ts).

---

## 4. Evidence Inventory

| ID | Item | Location / Anchor |
|---|---|---|
| E-1 | Machine Truth Status | `ai-status.json` (`IAM-ACC-003` state: `in_progress` Owner Closeout phase; reviewer `Gemini2` notes: "審查通過") |
| E-2 | Tenant Partner Logic & Guardrails | [`apps/api/src/modules/tenant-partner/tenant-partner.service.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-acc-003-sidecar-review/apps/api/src/modules/tenant-partner/tenant-partner.service.ts) |
| E-3 | Canonical Identity Repository | [`apps/api/src/modules/identity/identity.repository.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-acc-003-sidecar-review/apps/api/src/modules/identity/identity.repository.ts) |
| E-4 | Unit Tests (Identity Canonical Repo) | [`tests/unit/identity-canonical-repository.test.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-acc-003-sidecar-review/tests/unit/identity-canonical-repository.test.ts) |
| E-5 | Unit Tests (Tenant Partner Foundation) | [`tests/unit/tenant-partner-foundation.test.ts`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-iam-acc-003-sidecar-review/tests/unit/tenant-partner-foundation.test.ts) |

---

## 5. Reviewer Hotspots

Reviewer `Codex` should confirm:

1. **Hash-Only Proof Storage:** Raw invitation tokens (`ti_*`) are delivered via `TenantInvitationDeliveryService` and are never exposed in API responses or persistent storage.
2. **Single-Use & Invalidation on Resend:** Resending an invitation invalidates prior raw proof tokens; accepting an invitation is idempotent and single-use.
3. **Last-Admin Protection:** The system correctly blocks demotion of the final active tenant admin even if invited replacement admins exist.
4. **Self-Escalation Denial:** Users cannot modify their own tenant roles (`TENANT_SELF_ROLE_CHANGE_DENIED`).
5. **Immediate Session Revocation:** Tenant role and status updates trigger synchronous session invalidation and refresh token family revocation.
6. **Support Scope Boundaries:** This packet is support-only (`mutates_canonical: false`), limited strictly to `support/sidecars/IAM-ACC-003/IAM-ACC-003-SIDECAR-REVIEW.md`, and does not alter canonical contracts or specs.

---

## 6. Execution Commands & Handoff Workflow

### Owner Handoff (Gemini -> Codex)

```bash
AI_NAME=Gemini scripts/ai-status.sh handoff IAM-ACC-003-SIDECAR-REVIEW Codex \
  "IAM-ACC-003 review packet updated at support/sidecars/IAM-ACC-003/IAM-ACC-003-SIDECAR-REVIEW.md. Refreshed parent task machine truth status (state: in_progress Owner Closeout phase as of 2026-08-08T07:07:23Z following Gemini2 review approval), verified 5 acceptance criteria, code anchors, and clean single-file support artifact boundary without modifying canonical truth."
```

### Reviewer Approval (Codex)

```bash
AI_NAME=Codex \
REVIEW_FILE=support/sidecars/IAM-ACC-003/IAM-ACC-003-SIDECAR-REVIEW.md \
REVIEW_NOTES_ZH="審查通過：IAM-ACC-003 review packet 已完整彙整 Parent Task 驗證結果與代碼錨點（Hash-only 邀請、單次使用與過期機制、Last-admin 與 Self-escalation 防護、Session 立即撤銷），正確對齊 Parent Status 為 in_progress (Owner Closeout 階段，Gemini2 已審查通過)，且檔邊界嚴格限定於 support artifact，未修改 canonical truth。" \
scripts/ai-status.sh approve IAM-ACC-003-SIDECAR-REVIEW \
  "Review approved: IAM-ACC-003 sidecar review packet accurately summarizes parent implementation evidence, guardrails, machine truth status (in_progress owner closeout post Gemini2 approval), and verification results."
```

### Owner Finalize Closeout (Gemini)

```bash
AI_NAME=Gemini COMMIT_HASH=<sha> COMMIT_SUBJECT="docs(IAM-ACC-003-SIDECAR-REVIEW): finalize approved sidecar review packet" PUSH_REMOTE=origin PUSH_BRANCH=gemini/iam-acc-003-sidecar-review INTEGRATION_STATUS=branch_pushed scripts/ai-status.sh done IAM-ACC-003-SIDECAR-REVIEW \
  "Done: IAM-ACC-003 sidecar review packet delivered and approved. Support artifact recorded."
```

---

## 7. Change Log

- **2026-08-08:** Initial review packet created for `IAM-ACC-003-SIDECAR-REVIEW` by Gemini.
- **2026-08-08 (Revision 2):** Refreshed packet against machine truth to reflect parent task `IAM-ACC-003` status as `in_progress` (Owner Closeout phase following `Gemini2` review approval as of `2026-08-08T07:07:23Z`), enforced single-file packet hygiene under `support/sidecars/IAM-ACC-003/IAM-ACC-003-SIDECAR-REVIEW.md`, and updated reviewer handoff instructions.
- **2026-08-08 (Closeout):** Packet approved by reviewer Codex (`review_approved`); owner closeout finalized by Gemini.

