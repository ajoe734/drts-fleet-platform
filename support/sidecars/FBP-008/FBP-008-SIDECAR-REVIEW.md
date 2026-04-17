# FBP-008 Review Packet & Evidence Summary

**Sidecar Task:** `FBP-008-SIDECAR-REVIEW`  
**Parent Task:** `FBP-008`  
**Helper Kind:** `review_packet`  
**Prepared by:** Codex  
**Assigned Reviewer:** Claude  
**Date:** 2026-04-15 (UTC)  
**Status:** IN PROGRESS - ready to hand off for review

---

## 1. Purpose

This sidecar is a support-only reviewer packet for the already-implemented `FBP-008` Platform
Admin closure. Its job is to condense the parent task's machine-truth trail, commit evidence, and
review chain into one reviewer-ready artifact.

This document does **not** change canonical truth, runtime behavior, contracts, registry state, or
governance state.

---

## 2. Shared-Truth Baseline

The shared coordination files establish the following baseline:

- `ai-status.json` records parent task `FBP-008` as `done`, owner `Codex`, reviewer `Claude`,
  `commit_hash=61547cc`, and three acceptance bullets:
  - Platform Admin 主要 surface 與 PRD breadth 對齊
  - 對應 control-plane authority 與 API parity 補齊，不再是 UI 有 route 但 authority 薄弱
  - RBAC、audit、error envelope 與 contracts 一致
- `current-work.md` mirrors that `FBP-008` is `done` and states that commit `61547cc` records the
  Platform Admin control-plane parity closure.
- `ai-activity-log.jsonl` adds the missing review chain detail that is not fully preserved inside
  the parent task row:
  - `2026-04-15T16:30:07Z`: Claude handed `FBP-008` to Codex for review with commit `61547cc`
  - `2026-04-15T16:47:10Z`: Codex requested changes because tenant suspend/activate mutations
    lacked audit trail coverage in `TenantsService`
  - `2026-04-15T17:02:29Z`: Codex handed back commit `2573c07` as the follow-up that closed the
    remaining Platform Admin P1 gates
  - `2026-04-15T17:05:07Z`: Claude review-approved the parent task
  - `2026-04-15T17:06:09Z`: Codex closed the parent task as `done`

Important reviewer note:

- The machine-tracked parent task row ends on `commit_hash=61547cc`, but the activity/handoff
  chain clearly shows a reviewer-requested follow-up in `2573c07`.
- This packet therefore treats `61547cc` + `2573c07` as the full evidence chain for `FBP-008`
  without rewriting the machine-tracked task row.

---

## 3. Parent Closeout Chain

### 3.1 Initial Closure Commit: `61547cc`

`61547cc` is the main closure commit recorded on the task row.

`git show --stat --summary --name-only 61547cc^..61547cc` shows 12 touched files:

- `apps/api/src/modules/platform-admin/platform-admin.controller.ts`
- `apps/api/src/modules/platform-admin/platform-admin.service.ts`
- `apps/api/src/modules/platform-admin/tenants.controller.ts`
- `apps/api/src/modules/platform-admin/tenants.service.ts`
- `apps/platform-admin-web/app/notices/page.tsx`
- `apps/platform-admin-web/app/payments/page.tsx`
- `apps/platform-admin-web/app/pricing/page.tsx`
- `apps/platform-admin-web/app/tenants/page.tsx`
- `apps/platform-admin-web/app/users/page.tsx`
- `apps/platform-admin-web/components/admin-nav.tsx`
- `packages/api-client/src/index.ts`
- `packages/contracts/src/index.ts`

The owner handoff message and commit body agree on the main payload:

- 12 new `/api/platform-admin/*` backend endpoints
- Platform Admin UI pages rewired off borrowed tenant/shared surfaces
- New Notices & Maintenance page added
- 12 platform-admin API client methods added
- 8 platform-admin contract types added

### 3.2 Review-Requested Follow-up Commit: `2573c07`

`2573c07` is not stored as the parent task's final `commit_hash`, but the shared truth shows it
was the reviewer-requested follow-up that closed the remaining P1 gaps.

`git show --stat --summary --name-only 2573c07^..2573c07` shows 10 touched files:

- `apps/api/src/modules/platform-admin/platform-admin.controller.ts`
- `apps/api/src/modules/platform-admin/platform-admin.service.ts`
- `apps/api/src/modules/platform-admin/tenants.controller.ts`
- `apps/api/src/modules/platform-admin/tenants.service.ts`
- `apps/platform-admin-web/app/audit/page.tsx`
- `apps/platform-admin-web/app/page.tsx`
- `apps/platform-admin-web/app/pricing/page.tsx`
- `apps/platform-admin-web/app/tenants/page.tsx`
- `packages/api-client/src/index.ts`
- `packages/contracts/src/index.ts`

The `2026-04-15T17:02:29Z` handoff message states that `2573c07` added:

- typed tenant create/edit authority with code uniqueness, quotas, and `enabledModules`
- tenant lifecycle audit for suspend / activate
- pricing draft -> publish workflow with versioned old/new audit
- audit UI expansion to show old/new values
- home route cards aligned with the Notices surface

---

## 4. Implementation Evidence Snapshot

The repo state currently still reflects the parent-task evidence summarized above.

### 4.1 Dedicated Platform Admin API Surface

`packages/api-client/src/index.ts` now exposes dedicated Platform Admin methods instead of leaning
on tenant/shared APIs:

- `listPlatformAdminUsers`, `createPlatformAdminUser`, `updatePlatformAdminUserRole`
- `listPlatformNotices`, `publishPlatformNotice`, `resolvePlatformNotice`
- `getPlatformMaintenanceMode`, `setPlatformMaintenanceMode`
- `listPlatformPricingRules`, `createPlatformPricingRule`, `publishPlatformPricingRule`
- `listPlatformInvoices`
- `suspendTenant`, `activateTenant`

These methods point to explicit `/api/platform-admin/*` routes such as:

- `/api/platform-admin/users`
- `/api/platform-admin/notices`
- `/api/platform-admin/maintenance-mode`
- `/api/platform-admin/pricing-rules`
- `/api/platform-admin/invoices`
- `/api/platform-admin/tenants/:tenantId/suspend`
- `/api/platform-admin/tenants/:tenantId/activate`

### 4.2 Platform-Admin Header / Realm Posture

`createPlatformAdminClient()` in `packages/api-client/src/index.ts` sets:

- `x-actor-type: platform_admin`
- `x-actor-id: <actor>`
- `x-realm: platform`

This matches the reviewer approval message's RBAC claim and supports the parent task's "dedicated
platform authority" acceptance statement.

### 4.3 Surface Breadth

`apps/platform-admin-web/components/admin-nav.tsx` enumerates 11 Platform Admin destinations:

- `/`
- `/tenants`
- `/users`
- `/fleet`
- `/switchboard`
- `/pricing`
- `/payments`
- `/health`
- `/notices`
- `/audit`
- `/feature-flags`

`apps/platform-admin-web/app/page.tsx` also presents the full control-plane route family, including
the Notices & Maintenance surface that was called out in the closure commit.

### 4.4 Tenant Lifecycle Authority and Audit

Evidence in `apps/api/src/modules/platform-admin/tenants.service.ts` and
`apps/api/src/modules/platform-admin/tenants.controller.ts` shows:

- explicit suspend / activate endpoints under `/api/platform-admin/tenants/:tenantId/*`
- `TENANT_CODE_CONFLICT` guard via `ApiRequestError(HttpStatus.CONFLICT, ...)`
- typed tenant settings for `enabledModules` and `quotas`
- audit payloads using `actorType: "platform_admin"`
- `oldValuesSummary` / `newValuesSummary` for create, update, and lifecycle mutations

This is directly consistent with the reviewer-requested change at `2026-04-15T16:47:10Z`.

### 4.5 Pricing Draft -> Publish with Versioned Audit

Evidence in `apps/api/src/modules/platform-admin/platform-admin.controller.ts`,
`apps/api/src/modules/platform-admin/platform-admin.service.ts`, and
`packages/api-client/src/index.ts` shows:

- dedicated publish endpoint:
  `POST /api/platform-admin/pricing-rules/:ruleId/publish`
- client method `publishPlatformPricingRule(ruleId, command)`
- publish logic that archives the previous active rule and writes old/new audit summaries
- UI publish flow in `apps/platform-admin-web/app/pricing/page.tsx`

This matches the reviewer approval note that pricing draft -> publish correctly archives the
previous active rule with versioned audit.

### 4.6 Audit UI Old/New Value Inspection

`apps/platform-admin-web/app/audit/page.tsx` now:

- reads `oldValuesSummary` and `newValuesSummary` from `AuditLogRecord`
- shows a detail toggle when either summary exists
- renders paired "Old Values" and "New Values" cards

This is the UI-side evidence for the reviewer's "audit old/new values" approval statement.

### 4.7 Contract Breadth

`packages/contracts/src/index.ts` includes the typed primitives the follow-up handoff called out,
including:

- `PlatformAdminTenantRecord`
- `PlatformTenantModule`
- `PlatformTenantQuotaSummary`
- create/update tenant commands with `enabledModules` and `quotas`
- audit-log support fields `oldValuesSummary` and `newValuesSummary`

---

## 5. Acceptance Criteria Evaluation

Using only the shared task truth plus the implementation evidence above:

| Parent AC                                                                             | Verdict | Evidence                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform Admin 主要 surface 與 PRD breadth 對齊                                       | PASS    | 11 nav destinations, Notices surface added, dedicated Users / Pricing / Payments / Tenants authority surfaces, home page route family aligned                                                            |
| 對應 control-plane authority 與 API parity 補齊，不再是 UI 有 route 但 authority 薄弱 | PASS    | Dedicated `/api/platform-admin/*` endpoints and matching API client methods replace borrowed tenant/shared authority                                                                                     |
| RBAC、audit、error envelope 與 contracts 一致                                         | PASS    | `createPlatformAdminClient()` uses `platform_admin` headers, tenant/pricing writes emit old/new audit summaries, `TENANT_CODE_CONFLICT` uses `ApiRequestError`, contracts expose the needed typed shapes |

---

## 6. Reviewer-Facing Findings

No new blocking issue was found while assembling this sidecar packet.

The only material nuance worth preserving for review/audit purposes is:

- `FBP-008` finalization is split across the parent task row (`commit_hash=61547cc`) and the
  activity/handoff chain (`2573c07` follow-up before approval).
- This is a documentation/evidence-shape nuance, not a request to mutate machine truth.
- Reviewer Claude should judge this sidecar packet on whether it accurately preserves that split
  evidence chain without inventing or deleting facts.

---

## 7. Reviewer Checklist For Claude

Claude should validate:

1. This packet remains support-only and does not modify L1/L2 truth or runtime code.
2. The parent timeline is faithfully reconstructed from `ai-status.json`, `current-work.md`, and
   `ai-activity-log.jsonl`.
3. The packet preserves the reviewer-requested change sequence:
   initial closure -> audit-gap reopen -> `2573c07` follow-up -> review approval -> done.
4. The evidence summary is consistent with the touched files and current implementation anchors:
   dedicated platform-admin APIs, `platform_admin` headers, lifecycle audit, pricing publish audit,
   audit old/new inspection, and typed tenant quota/module contracts.
5. The packet clearly records the machine-truth nuance around `61547cc` vs `2573c07` without
   trying to rewrite the parent task row.

If those checks pass, Claude can approve this sidecar and return it to Codex for
`NO_COMMIT_REQUIRED=1` closeout.

---

## 8. Suggested Approval / Closeout Commands

Reviewer approval:

```bash
AI_NAME=Claude \
REVIEW_FILE=support/sidecars/FBP-008/FBP-008-SIDECAR-REVIEW.md \
REVIEW_NOTES_ZH='審查通過：review packet 已正確彙整 FBP-008 的 parent closeout chain，清楚區分 61547cc 主體 closure 與 2573c07 reviewer-requested follow-up；專屬 /api/platform-admin/* authority、platform_admin header posture、tenant lifecycle audit、pricing publish old/new audit 與 audit UI evidence 均已記錄，且未改動 canonical truth。|回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 收尾。' \
./scripts/ai-status.sh approve FBP-008-SIDECAR-REVIEW \
  "Review approved. FBP-008 sidecar packet captures the full closeout chain and implementation evidence without changing machine truth."
```

Owner closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 \
./scripts/ai-status.sh done FBP-008-SIDECAR-REVIEW \
  "Done: FBP-008 review packet records the parent task's closeout chain, evidence summary, and reviewer handoff without changing canonical truth."
```

---

This packet is a sidecar support artifact. It documents the `FBP-008` review/evidence chain; it
does not replace the parent task record, rewrite the commit metadata stored in `ai-status.json`, or
change any canonical implementation surface.
