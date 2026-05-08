# XS-UI-003 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `XS-UI-003` - Tenant And Management Command Action Matrix
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Claude2`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-08` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical
truth, the design execution packet, runtime behavior, or the parent matrix
itself.

This packet is the review-evidence companion to
`support/sidecars/XS-UI-003/command-action-matrix.md`. The parent matrix is the
canonical artifact; this packet records the independent citation spot-checks
that backed the parent reviewer's `approve` decision and translates that
evidence into a reviewer-facing summary that can outlive the in-band
`review_notes_zh` field.

---

## 1. Scope Boundary

In scope:

- restate the parent task's `acceptance` field and execution-packet `Work` block
  as a coverage checklist against the matrix
- pin the parent's machine-truth dependency on `XS-UI-001` and map the
  downstream tenant slices that consume `XS-UI-003`
- record the independent spot-check evidence (contract line numbers and
  controller route anchors) that confirms the matrix's `supported`,
  `supported-overloaded`, `gap`, and `forbidden` calls
- reproduce the parent reviewer's approval message for traceability

Out of scope:

- editing L1/L2 product truth, `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`,
  or `ai-status.json -> XS-UI-003`
- changing the matrix's command-endpoint conclusions or status calls
- finalizing the parent task; parent owner `Codex2` still owns closeout

---

## 2. Machine Truth Anchors

### Sidecar (this task) - `ai-status.json -> XS-UI-003-SIDECAR-REVIEW`

- owner=`Claude2`
- reviewer=`Codex2`
- depends_on=`XS-UI-001`
- task_class=`sidecar`
- helper_parent=`XS-UI-003`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/XS-UI-003/XS-UI-003-SIDECAR-REVIEW.md`
- acceptance: create support artifacts only; do not edit canonical truth; hand
  off the packet to the assigned reviewer

### Parent - `ai-status.json -> XS-UI-003`

- owner=`Codex2`
- reviewer=`Claude2`
- status=`review_approved` at `2026-05-08T21:21:43Z`
- depends_on=`XS-UI-001`
- acceptance=`command-action matrix filed`
- execution packet section:
  `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
  -> `### XS-UI-003 - Tenant And Management Command Action Matrix`
- recorded review verdict (`review_notes_zh`):
  > 審查通過：matrix 涵蓋 tenant booking/user/api-key/webhook/passenger/address/notification/SLA + platform-admin tenants/notices/maintenance/feature-flag/pricing/public-info/placards + ops dispatch/forwarder/complaint/incident/reconciliation 全部 mutate actions；contract line 1091/1097/1523/1558/1657 與 controller 路徑 (owned-mobility:183/270, tenant-partner:382/444/460/544/560/616, platform-admin/tenants:93, platform-admin:188/241) sample-check 全對；正確標記 supported-overloaded（status 翻轉重用 update command）、gap（webhook retry/replay、tenant resend invite）、forbidden（partner-mode admin、tenant-side fare/dispatch override）。下游 TEN-UI-004..007 可直接消費。

### Upstream dependency already satisfied

- `XS-UI-001` is `done` in `ai-status.json`
- recorded closeout: commit `ac44883ab24395efae49061152d8949c2b8c51c7`
  pushed to `origin/codex/dev-deploy-backend-android`
- artifact: `support/sidecars/XS-UI-001/route-to-endpoint-map.md`

### Authoritative source documents

- `support/sidecars/XS-UI-003/command-action-matrix.md` (parent artifact)
- `support/sidecars/XS-UI-001/route-to-endpoint-map.md`
- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`
  (idempotency-key discipline)

---

## 3. Dependency Map

### A. Upstream machine-truth dependency

| Dep ID      | Status (truth) | What it contributes to `XS-UI-003`                                                                                                                                                                                                                                                                                        |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XS-UI-001` | `done`         | Establishes the tenant route-to-endpoint baseline. The matrix re-uses that mapping to assign each prototype mutate button to a single canonical command endpoint, and to mark the rows where `XS-UI-001` already flagged authority gaps (webhook retry/replay, partner-mode admin actions, tenant feature-flag mutation). |

Assertion:

- The matrix is not inventing new tenant or platform endpoint names; it is
  partitioning the mutate side of the topology that `XS-UI-001` already
  enumerated, then layering command-contract evidence and authority rules.

### B. Downstream consumer map

| Consumer                     | Relationship            | Why `XS-UI-003` matters                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-004`                 | evidence consumer       | Booking detail mutate buttons (update, cancel) must use the matrix's tenant-side endpoints; status edits must remain hidden.                                                                                                                       |
| `TEN-UI-005`                 | evidence consumer       | New-booking flow uses `POST /api/tenant/bookings` with the partner-mode constraints recorded in §2 row "partner mode > create booking".                                                                                                            |
| `TEN-UI-006`                 | hard dependency         | Webhook/API-key product surfaces depend on the matrix to decide which buttons render (create/update/delete/rotate-secret/test) and which stay hidden (retry/replay) until backend support is recorded.                                             |
| `TEN-UI-007`                 | evidence consumer       | Users/roles/audit/settings tenant surfaces inherit the suspend/reactivate `supported-overloaded` rule and the resend-invite `gap`.                                                                                                                 |
| `TEN-UI-008`                 | indirect gate           | Identity/RBAC cutover relies on the role-update overload rule and on platform-admin invite/acknowledge being scoped to platform surfaces only.                                                                                                     |
| `TEN-UI-009`                 | final evidence consumer | Tenant-wave verification carries the matrix's `forbidden` rules forward as part of the wave acceptance.                                                                                                                                            |
| Platform Admin / Ops UI work | parity consumer         | §3 of the matrix is the single mapping point for governance/dispatch/forwarder/complaint/incident/reconciliation mutate actions; downstream UIs in those realms use the matrix to avoid leaking tenant authority into ops surfaces and vice versa. |

Dispatch interpretation:

- The execution packet says `XS-UI-002`, `XS-UI-003`, and `XS-UI-004` should
  land before finalizing tenant workflow implementation that depends on
  endpoint, command, or query truth. With `XS-UI-003` in `review_approved`,
  the command authority half of that bar is met.

---

## 4. Coverage Checklist

Each item below restates the parent acceptance bar -
`command-action matrix filed` - as a reviewable checklist against
`support/sidecars/XS-UI-003/command-action-matrix.md`.

Legend: `[REQUIRED]` = explicit parent acceptance/work item. `[DERIVED]` =
necessary support gate for reviewer confidence.

### A. Required surface coverage `[REQUIRED]`

- [x] **Tenant booking actions** - create, update, cancel covered with
      `CreateTenantBookingCommand`, `UpdateTenantBookingCommand`,
      `CancelOwnedOrderCommand` (matrix §2 rows 1-3).
- [x] **Tenant user / role actions** - invite, role change, suspend,
      reactivate, resend-invite (resend marked `gap`) covered (matrix §2 rows 4-7).
- [x] **Tenant API key actions** - issue, rotate, revoke covered with the
      scope-allowlist constraint preserved (matrix §2 rows 8-10).
- [x] **Tenant webhook actions** - create, update, enable/disable
      (`supported-overloaded` via update command), delete, rotate-secret, test,
      retry, replay (last two marked `gap`) covered (matrix §2 rows 11-19).
- [x] **Tenant data hygiene actions** - passenger and address deactivate
      recorded as `supported-overloaded` (active=false) (matrix §2 rows 20-21).
- [x] **Tenant settings actions** - notifications and SLA covered (matrix §2
      rows 22-23).
- [x] **Partner-mode rules** - `supported` for booking create only;
      `forbidden` for tenant-admin actions (matrix §2 rows 24-25).
- [x] **Platform Admin tenant lifecycle** - create, invite role, acknowledge
      role, update onboarding, set rollout stage, set rollback hold, suspend,
      activate covered (matrix §3 rows 1-8).
- [x] **Platform Admin publish surfaces** - public info, placard, pricing
      rule, plus notice create/resolve and global maintenance mode covered
      (matrix §3 rows 9-13).
- [x] **Platform feature flag actions** - global toggle and tenant override,
      both scoped platform-only (matrix §3 rows 14-15).
- [x] **Ops dispatch actions** - assign, redispatch, reassign, fare override,
      request/approve/reject override, resolve exception hold, resolve no supply
      (matrix §3 rows 16-23).
- [x] **Ops forwarder actions** - sync status, mark sync error, trigger
      fallback, reconcile (matrix §3 rows 24-27).
- [x] **Ops complaint center actions** - create, assign, add note, resolve,
      close, reopen, escalate to incident (matrix §3 rows 28-34).
- [x] **Ops incident center actions** - create, update, resolve, close, add
      service recovery action; resolve/close marked `supported-overloaded` via
      `UpdateIncidentCommand.status` (matrix §3 rows 35-39).
- [x] **Ops revenue / reconciliation actions** - create issue, assign,
      resolve, reopen (matrix §3 rows 40-43).

### B. Status taxonomy clarity `[REQUIRED]`

- [x] Reading rules section §1 explicitly defines `supported`,
      `supported-overloaded`, `gap`, and `forbidden`.
- [x] All POST command rows inherit `Idempotency-Key` discipline by reference
      to the LLM Dev Pack convention rather than re-asserting it per row.
- [x] §4 "Explicit blockers and hide rules" enumerates the six derived
      blockers (B-1..B-6) so downstream UIs cannot accidentally re-add a hidden
      control.
- [x] §5 "Downstream guidance" tells `TEN-UI-004..007` how to consume the
      matrix together with `XS-UI-001` without re-deciding authority on their own.

### C. Evidence quality `[REQUIRED]`

- [x] Each `supported` row points to a specific contract interface (most with
      exact `packages/contracts/src/index.ts:LINE`) plus a controller route.
- [x] Each `supported-overloaded` row identifies the underlying command that
      is being reused and the field that flips status.
- [x] Each `gap` row explicitly says "no canonical command endpoint exists"
      rather than promising a synthetic UI workaround.
- [x] Each `forbidden` row cites the spec section or boundary that disallows
      exposure (spec §9.4.2 / §9.7.9, partner-mode constraints, and the
      ops-vs-tenant authority split).

### D. Independent verification at packet write `[DERIVED]`

These spot-checks were re-run by the sidecar owner to confirm the matrix's
citations after parent review. All anchors resolve exactly:

| Citation in matrix                     | Verified file                                                      | Verified line | Symbol / route                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/index.ts:1042` | `packages/contracts/src/index.ts`                                  | 1042          | `export interface UpdateTenantRoleCommand` (carries `status?: TenantUserRoleStatus`, confirming the suspend/reactivate `supported-overloaded` rule) |
| `packages/contracts/src/index.ts:1091` | `packages/contracts/src/index.ts`                                  | 1091          | `export interface IssueTenantApiKeyCommand`                                                                                                         |
| `packages/contracts/src/index.ts:1097` | `packages/contracts/src/index.ts`                                  | 1097          | `export interface RotateTenantApiKeyCommand`                                                                                                        |
| `packages/contracts/src/index.ts:1523` | `packages/contracts/src/index.ts`                                  | 1523          | `export interface CreateTenantBookingCommand`                                                                                                       |
| `packages/contracts/src/index.ts:1558` | `packages/contracts/src/index.ts`                                  | 1558          | `export interface UpdateTenantBookingCommand`                                                                                                       |
| `packages/contracts/src/index.ts:1657` | `packages/contracts/src/index.ts`                                  | 1657          | `export interface CancelOwnedOrderCommand`                                                                                                          |
| `packages/contracts/src/index.ts:4064` | `packages/contracts/src/index.ts`                                  | 4064          | `export interface InviteTenantRoleCommand`                                                                                                          |
| `owned-mobility.controller.ts:183`     | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` | 183           | `@Post("tenant/bookings")` -> `createTenantBooking`                                                                                                 |
| `owned-mobility.controller.ts:270`     | same                                                               | 270           | `@Post("tenant/bookings/:bookingId/cancel")` -> `cancelTenantBooking`                                                                               |
| `tenant-partner.controller.ts:382`     | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` | 382           | `@Post("tenant/users")` -> `createTenantUser`                                                                                                       |
| `tenant-partner.controller.ts:444`     | same                                                               | 444           | `@Post("tenant/api-keys/:apiKeyId/revoke")` -> `revokeApiKey`                                                                                       |
| `tenant-partner.controller.ts:460`     | same                                                               | 460           | `@Post("tenant/api-keys/:apiKeyId/rotate")` -> `rotateApiKey`                                                                                       |
| `tenant-partner.controller.ts:544`     | same                                                               | 544           | `@Post("tenant/webhooks")` -> `createWebhookEndpoint`                                                                                               |
| `tenant-partner.controller.ts:560`     | same                                                               | 560           | `@Post("tenant/webhooks/test")` -> `sendTestWebhook`                                                                                                |
| `tenant-partner.controller.ts:616`     | same                                                               | 616           | `@Post("tenant/webhooks/:webhookId/rotate-secret")` -> `rotateWebhookSecret`                                                                        |
| `platform-admin.controller.ts:188`     | `apps/api/src/modules/platform-admin/platform-admin.controller.ts` | 188           | `@Post("notices/:noticeId/resolve")` -> `resolveNotice`                                                                                             |
| `platform-admin.controller.ts:241`     | same                                                               | 241           | `@Post("pricing-rules/:ruleId/publish")` -> `publishPlatformPricingRule`                                                                            |

Negative-evidence checks (gap / forbidden rules):

- No `@Post("tenant/webhooks/.../retry")` or `.../replay` route exists in
  `apps/api/src/modules/tenant-partner`. The four tenant webhook POST routes
  are exactly: `tenant/webhooks` (544), `tenant/webhooks/test` (560),
  `tenant/webhooks/:webhookId` (580 - update overload), and
  `tenant/webhooks/:webhookId/rotate-secret` (616). The matrix's
  `gap` calls for webhook retry/replay (B-1) match the absence of a route.
- No `tenant/users/:userId/resend` or re-invite route exists in
  `tenant-partner`. The matrix's `gap` call for tenant resend-invite (B-2)
  matches the absence of a route.

---

## 5. Reviewer Focus

For `Codex2` reviewing this sidecar:

- confirm the machine-truth anchor section matches the current
  `ai-status.json` owner/reviewer/status fields for both the sidecar and the
  parent (parent should still be `review_approved`, sidecar in `review` after
  handoff)
- confirm the independent verification table is reproducible: the listed
  contract line numbers and controller route anchors should still resolve to
  the cited symbols in the working tree
- confirm the negative-evidence claims (no retry/replay, no resend-invite)
  still hold with the same `Grep` predicates used in §4.D
- confirm the dependency map does not overstate hard dependencies; only
  `TEN-UI-006` is formal in the execution packet, while the other tenant
  slices and platform/ops UI tasks are recorded as evidence consumers or
  parity consumers
- confirm the packet does not modify any canonical truth: matrix file
  unchanged, `ai-status.json -> XS-UI-003` unchanged, execution packet
  unchanged

---

## 6. Parent Closeout Notes

The parent `XS-UI-003` is already in `review_approved`. Closeout is the
parent owner's responsibility, not this sidecar's:

1. Parent owner `Codex2` chooses whether to absorb any of this packet's
   wording back into the matrix (no edits are required for approval).
2. Parent owner records `COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, and
   `PUSH_BRANCH` for the matrix commit, then runs the canonical
   `AI_NAME=Codex2 scripts/ai-status.sh done XS-UI-003 "..."` finalize step.
3. This packet itself is a sidecar and may close with `NO_COMMIT_REQUIRED=1`
   per the sidecar closeout exception in `AI_COLLABORATION_GUIDE.md` §5.

No re-handoff of the parent task is required from this sidecar; the parent
review verdict already stands in machine truth.

---

## 7. Artifacts Created / Updated

- `support/sidecars/XS-UI-003/XS-UI-003-SIDECAR-REVIEW.md` (this file - new)

No edits were made to:

- `support/sidecars/XS-UI-003/command-action-matrix.md`
- `ai-status.json -> XS-UI-003`
- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- any L1/L2 product truth, contract source, or controller code
