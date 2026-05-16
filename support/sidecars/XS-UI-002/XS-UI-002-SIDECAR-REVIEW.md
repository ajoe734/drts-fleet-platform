# XS-UI-002 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `XS-UI-002` - Missing Backend Endpoint Gap Inventory
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Codex2`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-08` (UTC) - original draft lineage retained
**Last Refresh:** `2026-05-08` (UTC) - refreshed to match current machine truth and
remove stale parent closeout guidance
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical truth,
the design execution packet, runtime behavior, or the parent inventory itself.

This packet is the review-evidence companion to
`support/sidecars/XS-UI-002/backend-gap-inventory.md`. The parent inventory is the
canonical artifact; this packet records the independent citation spot-checks that
backed (and re-verify) the parent reviewer's `approve` decision and translates that
evidence into a reviewer-facing summary that can outlive the in-band `next` field on
`ai-status.json -> XS-UI-002`.

---

## 1. Scope Boundary

In scope:

- restate the parent task's `acceptance` field and execution-packet `Work` block as a
  coverage checklist against the inventory
- pin the parent's machine-truth dependency on `XS-UI-001` and map the downstream
  tenant slices that consume `XS-UI-002`
- record the independent spot-check evidence (contract line numbers, controller route
  anchors, api-client helper anchors, role-catalog scope presets) that confirms the
  inventory's `exists`, `exists-backend / missing-client`, `partial`, `missing`, and
  `unclear` calls
- record the parent task's current closeout state so the packet does not preserve stale
  `review_approved` guidance
- separate the previously recorded whitespace blocker on the parent inventory from the
  current state, where the blocker is cleared

Out of scope:

- editing L1/L2 product truth, `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`,
  or `ai-status.json -> XS-UI-002`
- changing the inventory's backend conclusions, route authority decisions, or probable
  ownership calls
- re-handing-off the parent task; parent `XS-UI-002` is already `done`

---

## 2. Machine Truth Anchors

### Sidecar (this task) - `ai-status.json -> XS-UI-002-SIDECAR-REVIEW`

- owner=`Codex2`
- reviewer=`Codex`
- task_class=`sidecar`
- helper_parent=`XS-UI-002`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- depends_on=`XS-UI-001`
- artifacts=`support/sidecars/XS-UI-002/XS-UI-002-SIDECAR-REVIEW.md`
- acceptance: create support artifacts only; do not edit canonical truth; hand off the
  packet to the assigned reviewer
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent - `ai-status.json -> XS-UI-002`

- owner=`Codex2`
- reviewer=`Codex`
- status=`done`
- depends_on=`XS-UI-001`
- acceptance=`backend-gap inventory filed`
- artifact root=`support/sidecars/XS-UI-002`
- recorded closeout evidence:
  - commit=`0df70c384d41563d6a6f74c953f1df66c38678b0`
  - subject=`XS-UI-002 backend gap inventory`
  - push remote=`origin`
  - push branch=`codex/dev-deploy-backend-android`
- current `next` note records owner finalization evidence:
  the parent inventory matches the recorded commit, the normal non-force push exists on
  `origin/codex/dev-deploy-backend-android`, and the whitespace check passed before
  commit

### Upstream dependency already satisfied

- `XS-UI-001` is `done` in `ai-status.json`
- recorded closeout: commit `ac44883ab24395efae49061152d8949c2b8c51c7`
- artifact: `support/sidecars/XS-UI-001/route-to-endpoint-map.md`

### Authoritative source documents

- `support/sidecars/XS-UI-002/backend-gap-inventory.md` (parent artifact)
- `support/sidecars/XS-UI-002/XS-UI-002-SIDECAR-ACCEPTANCE.md` (sibling acceptance
  sidecar; separate support artifact; this review packet does not gate on it)
- `support/sidecars/XS-UI-001/route-to-endpoint-map.md`
- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- `docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`

---

## 3. Dependency Map

### A. Upstream machine-truth dependency

| Dep ID      | Status (truth) | What it contributes to `XS-UI-002`                                                                                                                                                                                                                                                                                                                                             |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `XS-UI-001` | `done`         | Establishes the tenant route-to-endpoint baseline. The inventory does not invent new tenant or platform endpoint names; it refines the rows that `XS-UI-001` left as authority gaps (booking detail richness, webhook retry/replay, tenant settings aggregate, formal role/invite lifecycle, plus the topology-only `/cost-centers` and `/rules` routes that have no backend). |

Assertion:

- `XS-UI-002` only classifies status against existing tenant routes plus the additional
  topology routes that `XS-UI-001` already enumerated. No new endpoint surface is
  invented in the inventory.

### B. Downstream consumer map

| Consumer     | Relationship            | Why `XS-UI-002` matters                                                                                                                                                                                                                                |
| ------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TEN-UI-004` | evidence consumer       | Booking detail surface needs `BD-1`, `BD-2`, and `BD-3` resolved before it can ship a tenant-safe timeline, fulfillment summary, or explicit invoice linkage.                                                                                          |
| `TEN-UI-005` | evidence consumer       | New-booking framing depends on `CC-1`..`CC-3` and `RL-3` so that the UI does not invent a cost-center catalog or approval semantics that the backend cannot enforce.                                                                                   |
| `TEN-UI-006` | hard dependency         | Webhook/API-key productization formally lists `XS-UI-002` in its `depends_on`; retry/replay affordances must stay hidden until `WH-1` is resolved, and the `WH-2`/`WH-3` `exists-backend / missing-client` rows mean api-client follow-up is required. |
| `TEN-UI-007` | evidence consumer       | Audit/users/settings/roles work directly overlaps `ST-1`..`ST-4` and `TU-1`..`TU-4`, even though the task's current machine-truth dependency set does not formally list `XS-UI-002`.                                                                   |
| `TEN-UI-008` | indirect gate           | Identity/RBAC cutover holds until role/governance surfaces are explicit; `TU-3`, `TU-4`, `ST-2`, and `ST-3` are part of that clarity.                                                                                                                  |
| `TEN-UI-009` | final evidence consumer | Tenant-wave verification formally depends on `XS-UI-002` and must carry the accepted backend-gap constraints forward into wave acceptance.                                                                                                             |

Dispatch interpretation:

- The execution packet says `XS-UI-002`, `XS-UI-003`, and `XS-UI-004` should land before
  finalizing tenant workflow implementation that depends on endpoint, command, or query
  truth. With `XS-UI-002` already `done`, the read-side authority half of that
  bar is met and downstream UI tasks can consume the inventory's status calls without
  re-deciding backend coverage on their own.

---

## 4. Coverage Checklist

Each item below restates the parent acceptance bar -
`backend-gap inventory filed` - as a reviewable checklist against
`support/sidecars/XS-UI-002/backend-gap-inventory.md`.

Legend: `[REQUIRED]` = explicit parent acceptance/work item.
`[DERIVED]` = necessary support gate for reviewer confidence or for downstream UI
consumers.

### A. Required surface coverage `[REQUIRED]`

- [x] **Booking detail richness** - `BD-1` tenant-safe timeline, `BD-2` tenant-safe
      driver/vehicle fulfillment summary, `BD-3` booking-to-invoice linkage
      (inventory §1, decision-table rows 1-3).
- [x] **Webhook delivery visibility** - `WH-1` missing retry/replay command, `WH-2`
      tenant-wide delivery feed exists on backend but lacks api-client helper, `WH-3`
      test/rotate commands exist on backend but lack api-client helpers (inventory §2,
      decision-table rows 4-6).
- [x] **Tenant settings surface** - `ST-1` missing aggregate, `ST-2` missing
      tenant-cleared feature/module visibility, `ST-3` unclear tenant-vs-platform
      authority split, `ST-4` missing localization/profile preference contract
      (inventory §3, decision-table rows 7-10).
- [x] **Formal roles / invite management** - `TU-1` missing resend/re-invite command,
      `TU-2` partial invite lifecycle model, `TU-3` missing integration-manager role
      catalog/scope preset, `TU-4` partial UI/auth consumer alignment (inventory §4,
      decision-table rows 11-14).
- [x] **Topology-specific gaps from `TEN-UI-001`** - `CC-1`..`CC-3` for `/cost-centers`
      and `RL-1`..`RL-3` for `/rules` (inventory §5, decision-table rows 15-20).

### B. Status taxonomy clarity `[REQUIRED]`

- [x] Every top-level surface in the executive summary has an explicit status
      (`missing`, `partial`).
- [x] Every detailed sub-gap in the decision table has an explicit status and a
      probable owner.
- [x] The inventory preserves the required `exists / missing / unclear` intent and
      adds two narrower derived states where backend coverage is non-binary:
  - `partial` = some backend support exists, but lifecycle or authority is incomplete
  - `exists-backend / missing-client` = backend endpoint exists, but the tenant client
    surface is still blocked by missing `@drts/api-client` coverage
- [x] These derived statuses are narrower than `unclear`, not looser, so the inventory
      still satisfies the parent acceptance language even though it does not collapse
      every row to one of the three original words.

### C. Evidence quality `[REQUIRED]`

- [x] Product/topology evidence is cited: tenant-console design execution packet,
      tenant-console product spec, and the route-topology decision document
      `SD-DP-20260508-004`.
- [x] Implementation evidence is cited: `tenant-partner`, `owned-mobility`,
      `platform-admin`, `auth.constants`, `@drts/contracts`, and `@drts/api-client`.
- [x] Ownership routing is captured both inline in the prose and in the consolidated
      decision table at the end of the inventory.

### D. Independent verification at packet write `[DERIVED]`

These spot-checks were re-run by the sidecar owner against the working tree on
`2026-05-08`. All anchors resolve to the cited symbols.

| Citation in inventory                           | Verified file                                                      | Verified line | Symbol / route                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `owned-mobility.controller.ts:216-229`          | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` | 216           | `@Get("tenant/bookings/:bookingId")` -> `getTenantBooking` (no timeline/driver/invoice fields in the response wiring)                                                                                                                                   |
| `packages/contracts/src/index.ts:1776-1820`     | `packages/contracts/src/index.ts`                                  | 1776          | `export interface BookingRecord` - confirmed: `quotedFare`, `manualFareOverride`, `complianceGates`, no `timeline`, `driverId`, `vehicleId`, or `invoiceId` fields                                                                                      |
| `tenant-partner.controller.ts:533-647`          | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` | 533-647       | webhook CRUD + test + rotate-secret routes: `533` GET list, `544` POST create, `560` POST test, `580` POST update, `598` DELETE, `616` POST rotate-secret                                                                                               |
| `tenant-partner.controller.ts:649-662`          | same                                                               | 649           | `@Get("tenant/webhooks/deliveries")` -> tenant-wide delivery feed                                                                                                                                                                                       |
| `tenant-partner.controller.ts:664-679`          | same                                                               | 664           | `@Get("tenant/webhooks/:webhookId/deliveries")` -> per-endpoint delivery feed                                                                                                                                                                           |
| `packages/api-client/src/index.ts:1276-1282`    | `packages/api-client/src/index.ts`                                 | 1286          | `async listWebhookDeliveries(webhookId)` - the helper exists at line 1286 (small drift from the inventory's 1276-1282 anchor; the helper symbol and per-endpoint behavior are unchanged); see §6 for the reviewer-callable note                         |
| `packages/api-client/src/index.ts:972-973`      | `packages/api-client/src/index.ts`                                 | 972           | `async getBillingProfile()` -> `/api/tenant/billing/profile`, the tenant billing profile read helper used by `/settings`-adjacent flows                                                                                                                 |
| `packages/contracts/src/index.ts:2825-2832`     | `packages/contracts/src/index.ts`                                  | 2825          | `export interface TenantBillingProfile` - confirmed at the cited range                                                                                                                                                                                  |
| `tenant-partner.controller.ts:478-530, 492-503` | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` | 478-530       | notification preferences / SLA / integration governance routes (separate endpoints, no aggregate)                                                                                                                                                       |
| `tenant-partner.controller.ts:681-689`          | same                                                               | 681           | `@Get("tenant/sla")` -> `getSlaProfile`                                                                                                                                                                                                                 |
| `tenant-partner.service.ts:375-404`             | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`    | 375-404       | `TENANT_ROLE_CATALOG` containing exactly four roles: `tenant_admin`, `tenant_ops_admin`, `tenant_finance_admin`, `tenant_viewer` (no `integration_manager` entry)                                                                                       |
| `auth.constants.ts:150-205`                     | `apps/api/src/common/auth/auth.constants.ts`                       | 150-205       | `AUTH_TENANT_ROLE_SCOPE_PRESETS` keys match the four-role catalog exactly; no `integration_manager` preset                                                                                                                                              |
| `tenant-partner.controller.ts:362-413`          | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` | 362-413       | tenant user CRUD: list users, list roles, invite user, update role - no resend/re-invite endpoint in this block                                                                                                                                         |
| `packages/contracts/src/index.ts:1029-1052`     | `packages/contracts/src/index.ts`                                  | 1025-1052     | `TenantUserRoleRecord`, `CreateTenantUserCommand`, `UpdateTenantRoleCommand`, `TenantRoleCatalogRecord` confirmed at the cited range; invite-state field is the flat `status: TenantUserRoleStatus` with no separate sent/accepted/expired/revoked enum |
| `packages/contracts/src/index.ts:4025-4077`     | `packages/contracts/src/index.ts`                                  | ~4025         | `PlatformAdminTenantRecord` and platform-admin tenant-settings POST surface confirmed                                                                                                                                                                   |
| `platform-admin/tenants.controller.ts:27-40`    | `apps/api/src/modules/platform-admin/tenants.controller.ts`        | 27            | `POST /platform-admin/tenants/:tenantId/settings` confirmed (platform authority, not tenant)                                                                                                                                                            |
| `packages/api-client/src/index.ts:371-373`      | `packages/api-client/src/index.ts`                                 | 371           | `getFeatureFlags` calls `/api/admin/flags` - confirmed: only the platform admin flag endpoint exists in the api-client; no tenant-cleared feature visibility helper                                                                                     |

Negative-evidence checks (`missing` / `unclear` rules):

- `Grep` for `tenant/webhooks/.../retry|replay` under `apps/api/src/modules/tenant-partner`
  returns no matches. The inventory's `WH-1 missing` call (no backend retry/replay
  command) matches the absence of a route.
- `Grep` for `tenant/users/.../resend` (or any `re-invite` route) under
  `apps/api/src/modules/tenant-partner` returns no matches. The inventory's
  `TU-1 missing` call matches.
- `Grep` for `integration_manager` or `integration-manager` across `*.{ts,tsx,md}`
  returns matches only inside `support/sidecars/XS-UI-002/*.md` (the inventory itself
  and the acceptance sidecar). No backend role catalog, no scope preset, no controller
  use, no contract field uses the role. The inventory's `TU-3 missing` call matches.
- `Grep` for `tenant/cost-centers`, `tenant/rules`, or `tenant/settings` route paths
  under `apps/api/src` returns no matches. The inventory's `CC-1`/`CC-2`, `RL-1`/`RL-2`,
  and `ST-1` `missing` calls match the absence of routes.
- `git diff --no-index --check -- /dev/null support/sidecars/XS-UI-002/backend-gap-inventory.md`
  produces no whitespace diagnostics in this repo even though the command exits `1`
  when diffing against `/dev/null`. The whitespace blocker recorded in the prior parent
  reopen and in the acceptance sidecar's "Current parent re-handoff gates" section is
  still cleared because the check output is empty.

---

## 5. Reviewer Focus

For `Codex` reviewing this sidecar:

- confirm the machine-truth anchor section in §2 matches the current `ai-status.json`
  owner/reviewer fields for the sidecar and the current `done` closeout state for the
  parent task
- confirm the independent verification table in §4.D is reproducible: each contract
  line number, controller route line number, and api-client helper line number should
  resolve to the cited symbol in the working tree (only known drift is the api-client
  `listWebhookDeliveries` helper, anchored at line 1286 vs inventory's 1276-1282; the
  helper itself is unchanged)
- confirm the negative-evidence claims (no retry/replay route, no resend route, no
  integration-manager role anywhere outside the sidecar markdown, no tenant-side
  cost-center/rules/settings route) still hold with the same `Grep` predicates used in
  §4.D
- confirm the dependency map does not overstate hard dependencies; only `TEN-UI-006`
  and `TEN-UI-009` are formal in the execution packet, while the other tenant slices
  are recorded as evidence consumers or indirect gates
- confirm the packet does not snapshot mutable sidecar lifecycle fields and instead
  defers `status` / `next` / `last_update` to `ai-status.json`
- confirm this packet does not modify any canonical truth: the inventory file is
  unchanged, `ai-status.json -> XS-UI-002` is unchanged, the design execution packet
  is unchanged, the tenant-console product spec is unchanged

---

## 6. Known Drift Items

These are the citation-anchor drifts the sidecar owner observed between the inventory
and the current working tree at packet write. They are recorded here for reviewer
transparency rather than treated as content blockers; none of them affects the
inventory's status calls.

1. `packages/api-client/src/index.ts` -> `listWebhookDeliveries(webhookId)` is at line
   `1286` in the working tree. The inventory cites lines `1276-1282` for the helper.
   The helper signature, behavior, and route binding (`/api/tenant/webhooks/{webhookId}/deliveries`)
   are unchanged; only the line range drifted. No edit is required for parent
   approval.
2. `packages/api-client/src/index.ts` -> `getBillingProfile()` is at lines `972-973`
   in the working tree. The inventory still cites `962-967`, which now resolves to
   `linkComplaintToIncident(...)`. The underlying billing-profile helper and route
   binding (`/api/tenant/billing/profile`) are unchanged, so the inventory's `ST-*`
   conclusions still hold; this is a stale line-range citation in the already-done
   parent artifact and should be treated as reviewer-transparency evidence, not as a
   reopened content dispute.
3. `packages/contracts/src/index.ts` -> `TenantUserRoleRecord` actually starts at line
   `1025` rather than `1029`. The cited block (`1029-1052`) covers the four interfaces
   the inventory is reading and remains a correct citation range; only the start line
   for `TenantUserRoleRecord` is one row earlier than implied. Decision-table
   conclusions for `TU-1`..`TU-4` are unchanged.

All items above would be cosmetic line-range refreshes, not status changes. The reviewer
may either:

- accept this drift as a note in the review record without requesting an inventory
  edit (recommended; the parent task is already `done`), or
- request a follow-up sidecar that refreshes the line ranges in the inventory if
  byte-exact line citations are deemed mandatory in this repo.

---

## 7. Parent State Note

The parent `XS-UI-002` is already `done` in machine truth. This sidecar does not reopen
or re-handoff the parent task; it only packages reviewer support evidence around the
already-closed inventory.

---

## 8. Artifacts Created / Updated

- `support/sidecars/XS-UI-002/XS-UI-002-SIDECAR-REVIEW.md` (this file)

No edits were made to:

- `support/sidecars/XS-UI-002/backend-gap-inventory.md`
- `support/sidecars/XS-UI-002/XS-UI-002-SIDECAR-ACCEPTANCE.md`
- `ai-status.json -> XS-UI-002`
- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- any L1/L2 product truth, contract source, controller code, or api-client code
