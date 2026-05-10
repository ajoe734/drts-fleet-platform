# Tenant Console Parity Decisions — 2026-05-10

## TEN-UI-RD-010 — TN_NewBooking contract validation

Status: blocked
Owner: `Codex2`
Reviewer: `Codex`
Last checked: `2026-05-10`

### Decision

Do not implement the TN_NewBooking design's cost-center selector, auto-applied
approval-rule copy, quota impact card, or draft-save affordance yet.

Block the task and return it to supervisor discussion for contract/task
clarification.

### Why this is blocked

The existing backend contract is sufficient for tenant booking creation and
delegate-booking fields, but not for the design's cost-center rule UX:

- `CreateTenantBookingCommand` supports:
  - `bookedBy`
  - `onsiteContact`
  - `costCenter`
  - booking route, passenger, and schedule fields
- `ProductRuleCatalog` only exposes:
  - service bucket / subtype vocabulary
  - pricing authority metadata

What is missing from the published tenant contract:

- tenant-visible cost-center directory/list endpoint or record type
- tenant-visible approval-rule list/evaluation endpoint or record type
- quota/remaining-usage read model for the selected cost center
- draft/save command for tenant booking intake

### Source references

- Product workflow requires booking creation, but does not publish cost-center
  management or approval-rule read models for this route:
  - `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
    sections `9.6.2` and `9.7.2`
- Execution packet explicitly scopes new-booking framing to what current
  authority allows:
  - `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
    section `TEN-UI-005`
- Design target expects richer UI than the current contract publishes:
  - `docs/05-ui/drts-design-canvas/tenant-screens.jsx` `TN_NewBooking`
- The redesign backlog already instructs agents to open a blocker instead of
  inventing missing contracts:
  - `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
  - `ai-status.json` task `TEN-UI-RD-010`

### Verified implementation surface

- Published create-booking command:
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- Published product-rule catalog:
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/product-rule/product-rule.controller.ts`

### Required follow-up

Supervisor should decide one of these before reopening `TEN-UI-RD-010`:

1. Add canonical tenant contracts for cost centers, approval rules, and any
   quota/impact read model needed by TN_NewBooking.
2. Narrow the UI acceptance so the route only ships delegate-booking fields and
   non-authoritative cost-center free-text framing.

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
