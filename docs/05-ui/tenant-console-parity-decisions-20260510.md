# Tenant Console Parity Decisions — 2026-05-10

## 2026-05-13 Implementation Update

- `BE-CC-001` now publishes the tenant cost-center directory contract and
  tenant API surface:
  - `TenantCostCenterRecord`
  - `ListTenantCostCentersQuery`
  - `UpsertTenantCostCenterCommand`
  - `DisableTenantCostCenterCommand`
  - `GET /api/tenant/cost-centers`
  - `GET /api/tenant/cost-centers/:code`
- `POST /api/tenant/cost-centers`
- `POST /api/tenant/cost-centers/disable`
- `TEN-UI-RD-013` can reopen against this canonical directory surface.
- `TEN-UI-RD-010` can reopen against the landed booking-governance contract
  set (`BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001`).
- `TEN-UI-RD-014` requires its own route-scope decision even though the rule,
  quota, and approval contracts now exist.

## TEN-UI-RD-010 — TN_NewBooking contract validation

Status: shipped
Owner: `Codex`
Reviewer: `Codex2`
Last checked: `2026-05-14`

### Decision

Implement TN_NewBooking against the published tenant booking, cost-center,
quota preview, and approval-evaluation contracts.

Keep estimated spend as preview-only input, allow booking-on-behalf metadata,
and omit any unpublished draft-save or tenant-side quoted-fare override path.

### Why this is blocked

The required contract set is now published and wired into booking create:

- `CreateTenantBookingCommand` supports:
  - `passengerId`
  - `bookedBy`
  - `onsiteContact`
  - `costCenter`
  - booking route, passenger, and reservation-window fields
- `TenantCostCenterRecord` plus `GET /api/tenant/cost-centers` provide the
  canonical cost-center selector source.
- `TenantBookingQuotaImpactPreview` plus
  `previewTenantBookingQuotaImpact` provide the quota impact card inputs.
- `TenantApprovalEvaluationResult` plus `evaluateApprovalRules` publish the
  rule warnings, approval outcome, and approval-plan summary.
- `BE-APR-001` wires booking create/update to backend-owned approval state and
  approval-request creation, so the UI can safely allow approval-required
  submissions while continuing to block hard-stop outcomes.

### Source references

- Product workflow and redesign backlog:
  - `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
    sections `9.6.2` and `9.7.2`
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  - `ai-status.json` task `TEN-UI-RD-010`
- Landed backend decision packet and unblock conditions:
  - `docs/05-ui/tenant-canonical-contract-gaps-design-response-20260513.md`
    sections `7` and `8`
- Design target:
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` `TN_NewBooking`

### Verified implementation surface

- Contract types and client methods:
  - `packages/contracts/src/index.ts` (`CreateTenantBookingCommand`,
    `TenantCostCenterRecord`, `TenantBookingQuotaImpactPreview`,
    `TenantApprovalEvaluationResult`)
  - `packages/api-client/src/index.ts` (`listCostCenters`,
    `previewTenantBookingQuotaImpact`, `evaluateApprovalRules`,
    `createTenantBooking`)
- Booking create / governance integration:
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`

### Verified implementation surface

- Route shell:
  - `apps/tenant-console-web/app/bookings/new/page.tsx`
- Form UX and local validation:
  - `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx`
- Tenant-console BFF routes:
  - `apps/tenant-console-web/app/api/bookings/policy-preview/route.ts`
  - `apps/tenant-console-web/app/api/bookings/create/route.ts`
- Storybook parity story:
  - `packages/ui-web/src/tenant-new-booking.stories.tsx`

### Scope guardrail

The route must not:

- submit `quotedFare` through tenant booking create or update
- invent a local draft-save workflow
- guess a tenant-side approval override path

## TEN-UI-RD-012 — TN_Addresses contract validation

Status: shipped
Owner: `Claude2`
Reviewer: `Codex2`
Last checked: `2026-05-10`

### Decision

Implement the read-only address-book parity surface against the published
tenant-address contract. No contract extension is required for this route.

### Why this is unblocked

The published tenant contract already exposes the read model and command
needed to back the TN_Addresses artboard:

- `TenantAddressRecord` exposes the artboard's `name`, `text`, `tags`,
  `owner` (`ownerPassengerId`), `active`, masked text, geocode source, and
  quality issues.
- `GET /api/tenant/addresses` and `GET /api/tenant/addresses/export-view`
  return the tenant-scoped lists.
- `POST /api/tenant/addresses` accepts `UpsertTenantAddressCommand` for
  add / edit / disable mutations.
- `packages/api-client/src/index.ts` already publishes
  `listAddresses`, `listAddressExportView`, and `upsertAddress`.

The artboard does not require any cost-center, approval-rule, or
quota-impact read model, so the TEN-UI-RD-010 blocker does not apply.

### Source references

- Tenant address contract:
  - `packages/contracts/src/index.ts` (`TenantAddressRecord`,
    `UpsertTenantAddressCommand`, `TenantAddressExportViewRecord`)
- Tenant address controller:
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
    (`@Get("tenant/addresses")`, `@Get("tenant/addresses/export-view")`,
    `@Post("tenant/addresses")`)
- Tenant API client:
  - `packages/api-client/src/index.ts` (`listAddresses`,
    `listAddressExportView`, `upsertAddress`)
- Design target:
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` `TN_Addresses`

### Verified implementation surface

- Route shell:
  - `apps/tenant-console-web/app/addresses/page.tsx`
- Tenant nav (new "Directory" group with `/addresses`):
  - `apps/tenant-console-web/lib/navigation.ts`
- Storybook parity story:
  - `packages/ui-web/src/tenant-addresses.stories.tsx`

### Scope guardrail

The route stays read-only. Inline mutation, geocode rewriting, and
sensitive-flag toggles remain behind `UpsertTenantAddressCommand` and are
not exposed in this surface.

## TEN-UI-RD-013 — TN_CostCenter contract validation

Status: blocked
Owner: `Codex`
Reviewer: `Codex2`
Last checked: `2026-05-10`

### Decision

Do not implement the TN_CostCenter design yet.

Block the task and return it to supervisor discussion for a canonical tenant
cost-center management contract.

### Why this is blocked

The published tenant/backend contract only treats `costCenter` as optional
booking metadata. It does not publish the directory or policy read models that
the TN_CostCenter artboard requires.

- The canonical tenant route map does not publish a `/cost-centers` module.
- `CreateTenantBookingCommand`, `UpdateTenantBookingCommand`,
  `OwnedOrderRecord`, and `BookingRecord` expose only `costCenter` as a
  string field on booking/order payloads.
- Tenant controllers publish passenger, address, billing, and report routes,
  but no `tenant/cost-centers` read or write endpoint.
- `packages/api-client/src/index.ts` publishes tenant passenger, address,
  billing, report, API-key, and webhook helpers, but no `listCostCenters` or
  `upsertCostCenter` capability.
- `ProductRuleCatalog` exposes service-bucket vocabulary and pricing-authority
  metadata only; it does not publish default approval policy or approver data
  for a cost center.

What is missing from the published tenant contract:

- tenant-visible cost-center list/read model for `code`, `name`, and `owner`
- quota and current-usage read model for each cost center
- default approval-policy / approver metadata per cost center
- create / update / disable command surface for tenant cost-center management

### Source references

- Product route inventory and booking workflow:
  - `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
    sections `9.5`, `9.6.2`, and `9.7.2`
- Design target expects a full management table with quota, usage, and
  approval columns:
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` `TN_CostCenter`
- Canonical contracts and controller/client surface:
  - `packages/contracts/src/index.ts` (`CreateTenantBookingCommand`,
    `UpdateTenantBookingCommand`, `OwnedOrderRecord`, `BookingRecord`,
    `ProductRuleCatalog`)
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `apps/api/src/modules/product-rule/product-rule.controller.ts`
  - `packages/api-client/src/index.ts`
- The redesign backlog already instructs agents to block parity-fill routes
  when the backend contract is missing:
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  - `ai-status.json` task `TEN-UI-RD-013`

### Required follow-up

Supervisor should decide one of these before reopening `TEN-UI-RD-013`:

1. Add canonical tenant cost-center read/write contracts, including quota,
   usage, owner, and approval metadata.
2. Narrow the UI acceptance so the route ships only after a revised,
   authority-safe informational scope is explicitly approved.

## TEN-UI-RD-011 — TN_Passengers contract validation

Status: shipped
Owner: `Codex`
Reviewer: `Codex2`
Last checked: `2026-05-10`

### Decision

Implement the tenant passengers surface against the published passenger
directory contract. Keep the shipped route read-only and do not recreate
sunset-only consent-version, CSV-import, or visitor-segmentation behavior that
is not published in the tenant contract.

### Why this is unblocked

The published tenant passenger contract already exposes the directory fields
needed for the TN_Passengers artboard's core roster view:

- `TenantPassengerRecord` exposes full name, employee number, department,
  mobile, email, active flag, roles, quality issues, and timestamps.
- `GET /api/tenant/passengers` already returns the tenant-scoped passenger
  directory.
- `POST /api/tenant/passengers` accepts `UpsertTenantPassengerCommand` for
  add / edit / deactivate mutations without inventing a second write surface.
- `packages/api-client/src/index.ts` already publishes `listPassengers` and
  `upsertPassenger`.

The design artboard references consent-version framing, CSV import, and a
visitor tab, but those semantics are not part of the published tenant
passenger contract:

- `TenantPassengerRecord` does not expose consent-version history.
- `TenantPassengerMasterRole` publishes `passenger`, `employee`, `cardholder`,
  and `vip`, but not a dedicated `visitor` enum.
- No tenant passenger import endpoint or batch-import result contract is
  published.

### Source references

- Tenant route inventory and passenger-directory scope:
  - `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
    section `9.6.3`
  - `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
    `Current Repo Baseline`
- Tenant passenger contract:
  - `packages/contracts/src/index.ts` (`TenantPassengerRecord`,
    `TenantPassengerMasterRole`, `TenantPassengerQualityIssue`,
    `UpsertTenantPassengerCommand`)
- Tenant passenger controller:
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
    (`@Get("tenant/passengers")`, `@Post("tenant/passengers")`)
- Tenant API client:
  - `packages/api-client/src/index.ts` (`listPassengers`, `upsertPassenger`)
- Design target:
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` `TN_Passengers`

### Verified implementation surface

- Route shell:
  - `apps/tenant-console-web/app/passengers/page.tsx`
- Tenant nav (new `Directory` group entry with `/passengers`):
  - `apps/tenant-console-web/lib/navigation.ts`
- Storybook parity story:
  - `packages/ui-web/src/tenant-passengers.stories.tsx`

### Scope guardrail

The route stays read-only. It must not:

- infer consent-version or import-job fields that are not in the published
  contract
- invent a dedicated visitor enum or visitor-only data model
- expose CSV import or batch-mutation UX without a published tenant passenger
  import contract

## TEN-UI-RD-014 — TN_Rules contract validation

Status: blocked
Owner: `Codex`
Reviewer: `Codex2`
Last checked: `2026-05-10`

### Decision

Do not implement the TN_Rules design yet.

Block the task and return it to supervisor discussion for a canonical tenant
approval-rule and quota contract.

### Why this is blocked

The published tenant/backend surface does not expose the rule, approver, or
quota models that the TN_Rules artboard requires.

- The design target expects a prioritized rule table with condition, action,
  approver, and active state, plus quota-aware logic such as
  `monthly_quota_remaining < 10%`.
- The canonical tenant route map and module specs do not publish a `/rules`
  route or a tenant approval-rule management module.
- `ProductRuleCatalog` only exposes service-bucket vocabulary and
  pricing-authority hints; it does not publish tenant approval rules,
  approver resolution semantics, or mutable rule state.
- `PlatformTenantQuotaSummary` exists only on `PlatformAdminTenantRecord` for
  platform-admin tenant governance. No tenant-visible quota read model is
  published.
- Tenant controllers expose passengers, addresses, users, notifications, SLA,
  webhooks, audit, and integration governance, but no `tenant/rules`,
  `tenant/quotas`, or approval-policy endpoint.
- `packages/api-client/src/index.ts` publishes no `listRules`,
  `listApprovalRules`, `getTenantQuotas`, or rule-mutation helper for the
  tenant console.

What is missing from the published tenant contract:

- tenant-visible approval-rule list/read model with priority, condition,
  action, approver, and active state
- tenant-visible quota and usage summary that can drive rule conditions
- approver resolution semantics for values such as `cost_center.owner` or
  dual-sign approval
- create / update / pause / reorder command surface for tenant rules, or an
  explicitly approved read-only alternative scope

### Source references

- Tenant route inventory and booking workflow:
  - `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
    sections `9.5`, `9.6.2`, and `9.7.2`
- Design target expects approval-rule and quota-aware behavior:
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` `TN_Rules`
- Canonical contracts and controller/client surface:
  - `packages/contracts/src/index.ts` (`ProductRuleCatalog`,
    `PlatformTenantQuotaSummary`, `PlatformAdminTenantRecord`)
  - `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - `apps/api/src/modules/product-rule/product-rule.controller.ts`
  - `packages/api-client/src/index.ts`
- The redesign backlog already instructs agents to block parity-fill routes
  when the backend contract is missing:
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  - `ai-status.json` task `TEN-UI-RD-014`

### Required follow-up

Supervisor should decide one of these before reopening `TEN-UI-RD-014`:

1. Add canonical tenant approval-rule and quota read/write contracts,
   including approver resolution and rule ordering/state semantics.
2. Narrow the UI acceptance so the route ships only after an authority-safe,
   explicitly approved informational scope is defined.

## TEN-UI-RD-015 — TN_Invoices contract validation

Status: shipped
Owner: `Codex`
Reviewer: `Codex2`
Last checked: `2026-05-10`

### Decision

Implement the tenant invoices surface against the published billing-profile
and invoice-list contracts. Do not add unpublished due-date, expiry, dispute,
or reconciliation fields to make the artboard look fuller.

### Why this is unblocked

The published tenant billing contract already exposes the core data needed to
ship a read-only TN_Invoices route:

- `TenantBillingProfile` exposes invoice title, tax ID, address, contact, and
  billing email for the tenant recipient card.
- `TenantInvoiceRecord` exposes invoice ID, billing period, amount, status,
  pricing snapshot, line items, timestamps, and signed artifact presence.
- `GET /api/tenant/billing/profile` and `GET /api/tenant/invoices` already
  publish tenant-scoped finance data.
- `packages/api-client/src/index.ts` already publishes
  `getBillingProfile`, `listInvoices`, and `generateInvoice`.

The design artboard includes `DUE` and implies short-lived download expiry, but
those fields are not part of the published tenant invoice record. The backend
tracks signed-download expiry internally, yet it is not included in
`TenantInvoiceRecord`, so the route must stop at artifact presence and the
actual `artifactUrl` without inventing extra metadata.

### Source references

- Tenant billing and invoice contracts:
  - `packages/contracts/src/index.ts` (`TenantBillingProfile`,
    `TenantInvoiceRecord`, `InvoiceLineRecord`, `GenerateTenantInvoiceCommand`)
- Tenant billing controller:
  - `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
    (`@Get("tenant/billing/profile")`, `@Get("tenant/invoices")`,
    `@Post("tenant/invoices/generate")`)
- Tenant API client:
  - `packages/api-client/src/index.ts` (`getBillingProfile`, `listInvoices`,
    `generateInvoice`)
- Design target:
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` `TN_Invoices`

### Verified implementation surface

- Route shell:
  - `apps/tenant-console-web/app/invoices/page.tsx`
- Tenant nav (new `Billing` group with `/invoices`):
  - `apps/tenant-console-web/lib/navigation.ts`
- Tenant invoice source-authority helpers:
  - `apps/tenant-console-web/lib/source-domain.ts`
- Storybook parity story:
  - `packages/ui-web/src/tenant-invoices.stories.tsx`

### Scope guardrail

The route stays read-only. It must not:

- infer unpublished `due` or `expiresAt` fields
- expose inline invoice mutation, payment marking, or reconciliation workflow
- treat internal signed-download metadata as part of the published tenant
  contract
