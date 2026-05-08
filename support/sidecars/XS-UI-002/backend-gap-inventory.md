# XS-UI-002 Backend Gap Inventory

Task: `XS-UI-002`
Owner: `Codex2`
Reviewer: `Codex`
Date: `2026-05-08`

## Purpose

盤點 2026-05-08 選定 tenant console prototype 新引入或升級的 surface，哪些
backend endpoint / read model 已存在、哪些缺失、哪些 authority 還不夠明確。

本文件只記錄 inventory，不修改 canonical product truth。

## Scope And Evidence

Primary product/topology evidence:

- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
  - `XS-UI-002` task definition
  - guardrail: 不可在前端捏造 webhook delivery、settings、invite 行為
- `docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`
  - selected routes include `/bookings/[bookingId]`, `/webhooks`, `/users`,
    `/settings`, `/cost-centers`, `/rules`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
  - §9.5 route/module map
  - §9.6.1 workspace home
  - §9.6.2 booking management

Implementation evidence:

- `support/sidecars/XS-UI-001/route-to-endpoint-map.md`
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/src/modules/platform-admin/tenants.controller.ts`
- `apps/api/src/common/auth/auth.constants.ts`
- `packages/contracts/src/index.ts`
- `packages/api-client/src/index.ts`

## Executive Summary

| Surface                   | Status    | What is missing                                                                                                                                             |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booking detail richness   | `missing` | tenant-safe timeline, fulfillment summary, explicit invoice linkage                                                                                         |
| Webhook deliveries        | `partial` | tenant-wide delivery feed exists, but replay/retry command is missing; all-endpoint feed also lacks api-client helper                                       |
| Tenant settings           | `missing` | no tenant-scoped settings aggregate or formal update command for the selected `/settings` route                                                             |
| Formal roles / invites    | `partial` | invite/update exist, but backend role catalog is missing the integration-manager role, no resend-invite command exists, and invite lifecycle stays too flat |
| Cost centers              | `missing` | no dedicated tenant cost-center endpoint or read model                                                                                                      |
| Rules / approval behavior | `missing` | no tenant rules endpoint or approval/quota rules read model                                                                                                 |

## Detailed Inventory

### 1. Booking Detail Richness

Prototype asks for an activity-rich booking detail page (`UI-TN-05`) with
timeline, driver summary, fare summary, linked invoice context, and only
authority-safe actions.

What exists:

- `GET /api/tenant/bookings/:bookingId` exists in
  `owned-mobility.controller.ts:216-229`.
- The returned `BookingRecord` includes basic booking attributes plus
  `quotedFare`, `manualFareOverride`, and `complianceGates`
  (`packages/contracts/src/index.ts:1776-1820`).
- Current mapping in `owned-mobility.service.ts:4138-4202` confirms the tenant
  booking projection stops at those fields.

Missing / unclear:

- `BD-1` `missing`:
  tenant-safe timeline endpoint/read model.
  Current canonical trace endpoint is `/api/orders/:orderId/dispatch-trace`,
  but XS-UI-001 already established that tenant does not get a tenant-scoped
  derivative today.
- `BD-2` `unclear`:
  tenant-safe driver / vehicle fulfillment summary.
  `BookingRecord` does not expose any assigned driver / vehicle fields, and no
  tenant projection exists for this today.
- `BD-3` `missing`:
  explicit invoice linkage on booking detail.
  Tenant can read billing profile and invoices separately, but `BookingRecord`
  has no `invoiceId`/artifact linkage and the existing invoice list is not
  keyed back into the booking detail model.

Recommended owner:

- `owned-mobility` for `BD-1` / `BD-2`
- `billing-settlement` for `BD-3`

### 2. Webhook Deliveries

Prototype expects endpoint list plus delivery-log visibility, and likely retry /
replay affordances only when backend support is real.

What exists:

- endpoint CRUD + test + rotate-secret exist at
  `tenant-partner.controller.ts:533-647`
- tenant-wide delivery feed exists at
  `tenant-partner.controller.ts:649-662`
- per-endpoint delivery feed exists at
  `tenant-partner.controller.ts:664-679`

Missing / unclear:

- `WH-1` `missing`:
  no backend retry / replay command exists for a delivery. This is the real
  backend gap blocking any retry button in the selected UI.
- `WH-2` `exists-backend / missing-client`:
  tenant-wide delivery feed already exists, but `@drts/api-client` only exposes
  `listWebhookDeliveries(webhookId)` against the per-endpoint route
  (`packages/api-client/src/index.ts:1276-1282`).
- `WH-3` `exists-backend / missing-client`:
  test webhook and rotate-secret commands are present on the backend but still
  lack api-client helpers.

Recommended owner:

- `tenant-partner` for `WH-1`
- `@drts/api-client` follow-up for `WH-2` / `WH-3`

### 3. Tenant Settings Surface

Selected topology explicitly adds `/settings`, and `UI-TN-16` asks for general
settings, localization, billing contact, tenant status summary, and
privacy/integration settings.

What exists today:

- tenant billing contact/profile can be read via `getBillingProfile()`
  (`packages/api-client/src/index.ts:962-967`) backed by
  `TenantBillingProfile` (`packages/contracts/src/index.ts:2825-2832`)
- notification preferences, SLA profile, and integration-governance package
  exist as separate endpoints in `tenant-partner.controller.ts:478-530,
492-503, 681-689`
- platform-side tenant status / enabled modules / quotas exist only on the
  control plane via `PlatformAdminTenantRecord` and
  `POST /platform-admin/tenants/:tenantId/settings`
  (`packages/contracts/src/index.ts:4025-4077`,
  `platform-admin/tenants.controller.ts:27-40`)

Missing / unclear:

- `ST-1` `missing`:
  no tenant-scoped settings aggregate/read model for `/settings`. Current data
  is fragmented across billing, notifications, SLA, and integration governance.
- `ST-2` `missing`:
  no tenant-scoped feature/module visibility endpoint. The only current helper
  calls `/api/admin/flags` (`packages/api-client/src/index.ts:371-373`), which
  XS-UI-001 already marked as a realm mismatch for tenant surfaces.
- `ST-3` `unclear`:
  writable settings authority boundary. Prototype asks for status/privacy/
  integration framing, but enabled modules and quotas are currently platform
  owned, not tenant owned.
- `ST-4` `missing`:
  no localization/profile preference contract under tenant authority. Identity
  context only returns actor/realm/roles/scopes/tenantId, not locale or tenant
  presentation preferences (`packages/contracts/src/index.ts:145-156` and
  `identity.controller.ts`).

Recommended owner:

- `tenant-partner` for aggregate read model and tenant-owned preference fields
- `feature-flags` for tenant-cleared module visibility
- human / product clarification for what remains platform-only

### 4. Formal Roles / Invites

Prototype expects a formal role model rather than the current simplistic
admin/operator/viewer shell assumptions.

What exists:

- role catalog exists in `tenant-partner.service.ts:375-404` with four roles:
  `tenant_admin`, `tenant_ops_admin`, `tenant_finance_admin`, `tenant_viewer`
- matching scope presets exist in `auth.constants.ts:150-205`
- bootstrap/onboarding defaults also still enumerate only those four tenant roles
  in `tenant-onboarding-rollout-runbook.md`
- list users, list roles, invite user, update role all exist via
  `tenant-partner.controller.ts:362-413`
- current contracts are only:
  `CreateTenantUserCommand`, `UpdateTenantRoleCommand`, `TenantUserRoleRecord`
  (`packages/contracts/src/index.ts:1029-1052`)

Missing / unclear:

- `TU-1` `missing`:
  no resend / re-invite command for invited users.
- `TU-2` `partial`:
  invite lifecycle is flattened into `status: invited | active | suspended`;
  there is no richer invite state model for sent/accepted/expired/revoked.
- `TU-3` `missing`:
  product truth requires five formal tenant personas for the selected users
  surface: tenant admin, operator, finance/analyst, integration manager, and
  viewer (`platform-admin-ops-tenant-console-product-spec-20260508.md:1047-1054`,
  `drts-management-ui-review-execution-tasks-20260508.md:326`,
  `tenant-console-and-cross-system-design-execution-packet-20260508.md:441-447`).
  The current backend role catalog and scope presets only expose
  `tenant_admin`, `tenant_ops_admin`, `tenant_finance_admin`, and
  `tenant_viewer`, so there is no formal integration-manager roleCode / display
  model / scope preset for API keys, webhook configuration, and delivery
  visibility authority.
- `TU-4` `partial`:
  even after the backend role catalog is extended, the current tenant portal
  RBAC helper still collapses runtime behavior to `admin | operator | viewer`
  (`apps/tenant-portal-web/lib/rbac.ts`), so downstream UI/auth work is still
  needed to consume the richer backend role model cleanly.

Recommended owner:

- `tenant-partner` + auth/bootstrap scope owners for `TU-3`
- `tenant-partner` for `TU-1` / `TU-2`
- downstream tenant UI/auth work for `TU-4`

### 5. Topology-Specific Gaps From `TEN-UI-001`

The selected route topology also adds `/cost-centers` and `/rules`. These are
not covered by the current tenant authority surface.

#### 5.1 Cost Centers

What exists:

- booking create/update can carry `costCenter` as free text on `BookingRecord`
  and booking commands

Missing:

- `CC-1` `missing`:
  no tenant cost-center catalog/read model
- `CC-2` `missing`:
  no CRUD or governance endpoint for department/quota/usage/approval-owner data
- `CC-3` `unclear`:
  ownership split between `tenant-partner` and `billing-settlement` is not yet
  decided

#### 5.2 Rules / Approval Behavior

What exists:

- SLA and notification preferences exist, but they are not an approval/quota
  rules surface

Missing:

- `RL-1` `missing`:
  no tenant rules index/read model for policy conditions and priority ordering
- `RL-2` `missing`:
  no approval/quota rules command endpoint
- `RL-3` `unclear`:
  the selected prototype mentions approval behavior, but no tenant-side
  approval lifecycle has been confirmed as authority-safe

Recommended owner:

- likely cross-module between `tenant-partner` and `billing-settlement`
- product clarification required before UI hard-codes rule semantics

## Decision Table

| Gap ID | Surface        | Status                            | Type                                                | Probable owner                           |
| ------ | -------------- | --------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| `BD-1` | booking detail | `missing`                         | endpoint/read model                                 | `owned-mobility`                         |
| `BD-2` | booking detail | `unclear`                         | authority + read model                              | `owned-mobility`                         |
| `BD-3` | booking detail | `missing`                         | read model linkage                                  | `billing-settlement`                     |
| `WH-1` | webhooks       | `missing`                         | command endpoint                                    | `tenant-partner`                         |
| `WH-2` | webhooks       | `exists-backend / missing-client` | api-client helper                                   | `@drts/api-client`                       |
| `WH-3` | webhooks       | `exists-backend / missing-client` | api-client helper                                   | `@drts/api-client`                       |
| `ST-1` | settings       | `missing`                         | aggregate read model                                | `tenant-partner`                         |
| `ST-2` | settings       | `missing`                         | tenant-cleared feature visibility                   | `feature-flags`                          |
| `ST-3` | settings       | `unclear`                         | authority split                                     | product + platform-admin                 |
| `ST-4` | settings       | `missing`                         | profile/localization contract                       | `tenant-partner`                         |
| `TU-1` | roles/invites  | `missing`                         | command endpoint                                    | `tenant-partner`                         |
| `TU-2` | roles/invites  | `partial`                         | richer invite state model                           | `tenant-partner`                         |
| `TU-3` | roles/invites  | `missing`                         | role catalog + scope preset for integration manager | `tenant-partner` + auth/bootstrap        |
| `TU-4` | roles/invites  | `partial`                         | UI/auth consumer alignment                          | downstream UI/auth                       |
| `CC-1` | cost centers   | `missing`                         | catalog/read model                                  | `tenant-partner` or `billing-settlement` |
| `CC-2` | cost centers   | `missing`                         | CRUD/governance endpoints                           | `tenant-partner` or `billing-settlement` |
| `CC-3` | cost centers   | `unclear`                         | ownership split                                     | product clarification                    |
| `RL-1` | rules          | `missing`                         | read model                                          | `tenant-partner` + `billing-settlement`  |
| `RL-2` | rules          | `missing`                         | command endpoint                                    | `tenant-partner` + `billing-settlement`  |
| `RL-3` | rules          | `unclear`                         | authority semantics                                 | product clarification                    |

## Closeout

`XS-UI-002` acceptance is satisfied when this inventory is treated as the
backend-gap source for the selected tenant wave:

- booking detail richness has real backend/read-model gaps
- webhook delivery visibility is only partially solved; replay is still missing
- settings is the biggest prototype-only authority gap
- formal role framing is still incomplete because integration-manager backend
  authority/catalog/scope mapping is missing and invite lifecycle is still flat
- topology-added `/cost-centers` and `/rules` currently have no tenant backend
  surface
