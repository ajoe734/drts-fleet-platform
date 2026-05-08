# XS-UI-001 — Tenant Console Route-To-Endpoint Mapping Packet

Date: 2026-05-08
Owner: Claude2
Reviewer: Codex
Depends on: TEN-UI-001 (`done` 2026-05-08, commit e122e8b)
Execution packet: `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
Source spec: `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
Boundary contract: `docs/02-architecture/tenant-commute-hub-boundary.md`

## 0. Purpose

This packet maps the tenant-console surfaces selected by the 2026-05-08 execution
packet (shell / home, bookings list / detail / new booking, API keys, webhooks,
audit, users, settings) to the canonical `/api/tenant/*` and adjacent backend
endpoints they must consume. It distinguishes three statuses per row:

- `existing` — endpoint and contract exist today and are realm-cleared for
  tenant consumption.
- `probable owner` — there is no tenant-cleared endpoint yet, but the canonical
  authority owner is unambiguous and the gap can be filled by extending the
  named module.
- `authority gap` — the design depth in the spec implies behavior that has no
  unambiguous backend authority owner today; this row must be resolved during
  XS-UI-002 / XS-UI-003 / XS-UI-004 before downstream `TEN-UI-*` slices act on
  it.

The acceptance bar is `route-to-endpoint mapping filed and cited in machine
truth`. Implementation slices `TEN-UI-002` … `TEN-UI-008` must read from this
packet; they may not invent new tenant-side endpoint names without first
extending or refuting the mapping below.

The packet is intentionally about authority surfaces, not UI ergonomics. Filter
shape normalization (`XS-UI-004`), command-action authority matrix
(`XS-UI-003`), and missing-backend gap inventory (`XS-UI-002`) are scoped out
here except where they are required to disambiguate an endpoint owner.

## 1. Adopted topology baseline (TEN-UI-001)

- live production tenant UI is the external `tenant-commute-hub` repo; this
  packet does not replace it.
- the in-repo formal tenant-console landing zone is the planned
  `apps/tenant-console-web` target.
- `apps/tenant-portal-web` stays as a sunset reference shell. The mapping below
  describes what calls _should_ land in the new target, not a directive to
  re-skin the sunset shell.
- `/api/tenant/*` is the only authority surface for tenant-console execution.
  Adjacent canonical surfaces (`/api/auth/tenant/bootstrap-session`,
  `/api/admin/flags`, `/api/audit`) are listed where the spec requires them but
  remain governed by their own RBAC realm.
- partner booking mode (`/partner/:entrySlug` host or future host-resolved
  entry) consumes `/api/auth/partner/bootstrap-session` and
  `/api/partner/eligibility/*`; it is mapped at the bottom of this packet but
  must remain navigationally isolated from tenant-admin mode per topology
  decision SD-DP-20260508-004.

## 2. Cross-cutting wire conventions

These apply to every row in §3. They are not repeated per route.

- **API prefix.** `apps/api/src/main.ts:12` sets the global prefix to `api`, so
  every controller path below is reached at `/api/<controller-prefix>/<route>`.
  When a controller uses `@Controller()` (no prefix), the route segment in the
  decorator IS the full post-`/api` path.
- **Auth.** Tenant-admin mode uses the email-only bootstrap → server-issued
  Bearer session pattern published by
  `auth.controller.ts:135 @Post("tenant/bootstrap-session")`. Consumers must
  attach the resulting `Authorization: Bearer <jwt>` header on every
  subsequent call. Demo cookie / role simulation is NOT productized; the
  `apps/tenant-portal-web` static `DEMO_TENANT_ID` (`apps/tenant-portal-web/lib/api-client.ts:11-12`)
  is a sunset-shell artifact only and must not survive into
  `apps/tenant-console-web`.
- **Tenant scoping header.** Every `tenant/*` endpoint resolves the tenant via
  `x-tenant-id` (see `tenant-partner.controller.ts:55` and
  `owned-mobility.controller.ts` `requireTenantId()`); it is non-optional once
  bootstrap completes. Platform-admin cross-tenant calls use `x-tenant-code`
  per the boundary contract §2 — those calls are out of scope for tenant
  console.
- **Idempotency.** All POST commands listed below are command endpoints subject
  to the `Idempotency-Key` rule in dev-pack §3.2.6. The shared
  `@drts/api-client` is the only place where this header should be generated;
  page code must not invent its own retry path.
- **Wire shape.** `snake_case` JSON over the wire, list envelope `{ items[],
page_info? }`, error envelope `{ error: { code, message, retryable } }`.
  Runtime camelCase normalization is the responsibility of `@drts/api-client`
  (`packages/api-client/src/index.ts`).
- **Signed download.** Any `artifactUrl`, invoice download, or report job
  artifact must be a short-lived server-issued URL; tenant console must never
  cache one as a long-term link (boundary contract §5 _Signed download_).
- **Audit append-only.** `audit` rows are observation-only; the tenant console
  never writes audit entries — backend domain services do.

## 3. Route-to-endpoint map per selected surface

Each subsection below corresponds to a route in the proposed map of spec §9.5.
Each row gives: HTTP method + path, controller `file:line`, the
`@drts/api-client` helper that should remain the single ingress, the contract
DTO under `@drts/contracts`, and any authority caveat.

### 3.1 `/` — Workspace Home

Spec source: §9.6.1 (Workspace Home).

The home surface is an aggregator; there is no dedicated `tenant/home` endpoint
today. The spec requires: tenant identity context, module enablement,
integration health, pending bookings / recent updates, quick links.

| Need from spec                         | Status           | Endpoint                                                                       | Controller `file:line`                                                                                      | api-client helper                                     | Contract                                       |
| -------------------------------------- | ---------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| tenant identity context                | existing         | `GET /api/identity/context`                                                    | `identity/identity.controller.ts:15`                                                                        | `getIdentityContext()`                                | `IdentityContext`                              |
| module enablement / feature visibility | authority gap    | `GET /api/admin/flags` (current)                                               | `feature-flags/feature-flags.controller.ts:20`                                                              | `getFeatureFlags()`                                   | `FeatureFlagSummary`                           |
| pending bookings preview               | existing         | `GET /api/tenant/bookings` (filter client-side until §3.2 `XS-UI-004` settles) | `owned-mobility/owned-mobility.controller.ts:201`                                                           | `listTenantBookings()`                                | `BookingRecord[]` (envelope)                   |
| integration readiness summary          | existing         | `GET /api/tenant/integration-governance`                                       | `tenant-partner/tenant-partner.controller.ts:492`                                                           | `getTenantIntegrationGovernancePackage()`             | `TenantIntegrationGovernancePackage`           |
| billing / notice reminders             | existing (split) | `GET /api/tenant/billing/profile` + `GET /api/tenant/notifications/feed`       | `billing-settlement/billing-settlement.controller.ts:51`; `tenant-partner/tenant-partner.controller.ts:505` | `getBillingProfile()`, `listTenantNotificationFeed()` | `TenantBillingProfile`, `NotificationRecord[]` |

Authority gaps for the home surface:

- `H-1` Module enablement read currently calls the platform-admin
  `admin/flags` controller, which is RBAC-cleared for platform realm and
  served as a side-channel by the sunset shell
  (`apps/tenant-portal-web/app/page.tsx:20`). For productization, the formal
  target needs a tenant-scoped feature/module visibility view. **Probable
  owner:** `feature-flags` module — extend with a tenant-cleared
  `GET /api/tenant/feature-visibility` (or equivalent) before
  `TEN-UI-002`/`TEN-UI-003` lock home-surface contracts.
- `H-2` Spec calls for a single home payload, but no single aggregator
  endpoint exists. **Resolution:** keep aggregation in the api-client BFF
  layer; do NOT introduce a derived schema in page code (boundary §1 S-5).
  This is a presentation choice, not a backend gap.

### 3.2 `/bookings` — Booking List

Spec source: §9.6.2 (Booking Management — list portion).

| Need                                              | Status                       | Endpoint                                                           | Controller `file:line`                            | api-client helper      | Contract                                 |
| ------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- | ---------------------- | ---------------------------------------- |
| List tenant bookings                              | existing                     | `GET /api/tenant/bookings`                                         | `owned-mobility/owned-mobility.controller.ts:201` | `listTenantBookings()` | `BookingRecord[]`                        |
| Service-bucket / status / date / passenger filter | authority gap (filter shape) | same endpoint, query params unspecified today                      | same                                              | same                   | `XS-UI-004` will normalize filter shape  |
| Pagination cursor                                 | existing (envelope only)     | `GET /api/tenant/bookings` returns `page_info` via `toApiListData` | `common/api-envelope`                             | n/a                    | `XS-UI-004` should formalize page params |

Authority gaps:

- `BL-1` `GET /api/tenant/bookings` returns the unfiltered envelope today.
  Spec §9.6.2 calls for `status` / window filters; this is a query-shape
  authority gap whose owner is the `owned-mobility` module. **Probable owner:**
  `owned-mobility` (extend `listTenantBookings` to accept `status[]`,
  `from`/`to`, `passenger_id`, `cost_center`). Mark for `XS-UI-004` to lock
  shared filter shape across tenant + ops list views.

### 3.3 `/bookings/:id` — Booking Detail

Spec source: §9.6.2 (detail portion). Spec requires: timeline, passenger /
route context, driver / fulfillment summary when authority allows, fare /
invoice context where available, allowed actions only.

| Need                                 | Status                   | Endpoint                                                                                                                                                                                                    | Controller `file:line`                                   | api-client helper              | Contract                         |
| ------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------ | -------------------------------- |
| Booking record                       | existing                 | `GET /api/tenant/bookings/:bookingId`                                                                                                                                                                       | `owned-mobility/owned-mobility.controller.ts:216`        | `getTenantBooking(id)`         | `BookingRecord`                  |
| Update booking                       | existing                 | `PUT /api/tenant/bookings/:bookingId`                                                                                                                                                                       | `owned-mobility/owned-mobility.controller.ts:232`        | `updateTenantBooking(id, cmd)` | `UpdateTenantBookingCommand`     |
| Cancel booking                       | existing                 | `POST /api/tenant/bookings/:bookingId/cancel`                                                                                                                                                               | `owned-mobility/owned-mobility.controller.ts:270`        | `cancelTenantBooking(id, cmd)` | `CancelOwnedOrderCommand`        |
| Modifiable / cancelable windows      | existing (record fields) | `BookingRecord.modifiableUntil` / `.cancelableUntil`                                                                                                                                                        | `packages/contracts/src/index.ts:1792`                   | n/a                            | enforce read-only when expired   |
| Compliance gates surface             | existing (record fields) | `BookingRecord.complianceGates`                                                                                                                                                                             | `packages/contracts/src/index.ts:1817`                   | n/a                            | display-only                     |
| Manual fare override surface         | existing (record fields) | `BookingRecord.manualFareOverride`                                                                                                                                                                          | `packages/contracts/src/index.ts:1816`                   | n/a                            | display-only                     |
| Booking timeline (state transitions) | authority gap            | dispatch trace exists at `GET /api/orders/:orderId/dispatch-trace` (`owned-mobility/owned-mobility.controller.ts:148`) but is NOT realm-cleared for tenant — current `RequireRealms` set excludes `tenant`. | same                                                     | n/a                            | needs tenant-scoped derivative   |
| Driver / fulfillment summary         | authority gap            | no tenant-cleared driver task projection exists; `driver/tasks/*` is driver realm                                                                                                                           | n/a                                                      | n/a                            | needs tenant-projection contract |
| Linked invoice context               | existing (indirect)      | `GET /api/tenant/invoices` filtered by booking period                                                                                                                                                       | `billing-settlement/billing-settlement.controller.ts:96` | `listInvoices()`               | `TenantInvoiceRecord[]`          |

Authority gaps:

- `BD-1` Tenant-cleared booking timeline. The dispatch-trace endpoint is the
  only canonical source for state transitions but is locked to platform / ops
  realms today. **Probable owner:** `owned-mobility` — extend with a
  tenant-projected `GET /api/tenant/bookings/:bookingId/timeline` that returns
  redacted/scoped trace events (no driver PII unless authority permits) before
  `TEN-UI-004` ships the new detail surface.
- `BD-2` Tenant-cleared driver / vehicle fulfillment summary. Spec §9.6.2
  conditions this on "when authority allows"; today no tenant-cleared
  projection exists. **Probable owner:** `owned-mobility` (driver task
  projection scoped to the tenant's order). Mark as `unclear` until
  `XS-UI-002` / `XS-UI-003` confirm whether tenants have authority to see
  vehicle / driver identity at all.
- `BD-3` Linkage between `BookingRecord` and `TenantInvoiceRecord` is via
  period only today. If spec §9.6.2 requires explicit `invoiceId` linkage on
  the booking detail, that is a `billing-settlement` extension. Keep as
  `authority gap` pending `XS-UI-002`.

### 3.4 `/bookings/new` — Booking Create

Spec source: §9.6.2 + §9.7.2 (Booking creation workflow).

| Need                                         | Status               | Endpoint                                                                                                                                              | Controller `file:line`                            | api-client helper               | Contract                                     |
| -------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------- | -------------------------------------------- |
| Create booking                               | existing             | `POST /api/tenant/bookings`                                                                                                                           | `owned-mobility/owned-mobility.controller.ts:183` | `createTenantBooking(cmd)`      | `CreateTenantBookingCommand`                 |
| Passenger lookup                             | existing             | `GET /api/tenant/passengers`                                                                                                                          | `tenant-partner/tenant-partner.controller.ts:294` | `listPassengers()`              | `TenantPassengerRecord[]`                    |
| Address lookup                               | existing             | `GET /api/tenant/addresses`                                                                                                                           | `tenant-partner/tenant-partner.controller.ts:322` | `listAddresses()`               | `TenantAddressRecord[]`                      |
| Service-bucket / subtype catalog             | existing             | `GET /api/product-rule/catalog`                                                                                                                       | `product-rule/product-rule.controller.ts:16`      | `getProductRuleCatalog()`       | `ProductRuleCatalog`                         |
| Cost center catalog                          | authority gap        | none — `CreateTenantBookingCommand.costCenter` is a free-text string today (`packages/contracts/src/index.ts:1543`)                                   | n/a                                               | n/a                             | needs catalog endpoint or accepted free-text |
| Approval-impact framing                      | authority gap        | spec §9.6.2 mentions "cost-center and approval-impact framing where current authority allows" — no backend authority for tenant-side approvals exists | n/a                                               | n/a                             | mark `unclear`; `XS-UI-002` to assess        |
| Vehicle preference catalog                   | existing (free text) | `CreateTenantBookingCommand.vehiclePreference` is free-text                                                                                           | n/a                                               | n/a                             | accept free-text per current contract        |
| Eligibility verification (partner mode only) | existing             | `POST /api/partner/eligibility/verify`                                                                                                                | `tenant-partner/tenant-partner.controller.ts:230` | `verifyPartnerEligibility(cmd)` | `VerifyPartnerEligibilityCommand`            |

Authority gaps:

- `BN-1` Cost-center catalog. Today `costCenter` is free text. If spec §9.6.2
  expects a list-of-values UI, that is a new endpoint. **Probable owner:**
  `tenant-partner` (alongside passenger / address master) OR
  `billing-settlement` (if cost centers must align with invoice line slicing).
  Defer ownership decision to `XS-UI-002`.
- `BN-2` Approval-impact framing. The current command has `signoffRequired`
  but no separate approval-state read model. Mark `unclear`; flag for
  `XS-UI-002` to confirm whether tenant-side approval lifecycle is in
  authority scope at all.

### 3.5 `/passengers` — Passenger Directory

Spec source: §9.6.3.

| Need                      | Status        | Endpoint                                                                                                    | Controller `file:line`                            | api-client helper      | Contract                                  |
| ------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------- | ----------------------------------------- |
| List passengers           | existing      | `GET /api/tenant/passengers`                                                                                | `tenant-partner/tenant-partner.controller.ts:294` | `listPassengers()`     | `TenantPassengerRecord[]`                 |
| Create / update passenger | existing      | `POST /api/tenant/passengers`                                                                               | `tenant-partner/tenant-partner.controller.ts:306` | `upsertPassenger(cmd)` | `UpsertTenantPassengerCommand`            |
| Deactivate / delete       | authority gap | no dedicated command — must be expressed via upsert with `active` flag (per `UpsertTenantPassengerCommand`) | same                                              | same                   | confirm authority semantic in `XS-UI-003` |

Authority gaps:

- `PD-1` Hard delete vs deactivate. Boundary §2 N-5 forbids DELETE for
  lifecycle termination. **Probable owner:** `tenant-partner` — confirm whether
  `UpsertTenantPassengerCommand.active=false` is the canonical deactivate
  command, and document it in `XS-UI-003`.

### 3.6 `/addresses` — Address Book

Spec source: §9.6.4.

| Need                | Status        | Endpoint                                                     | Controller `file:line`                            | api-client helper         | Contract                          |
| ------------------- | ------------- | ------------------------------------------------------------ | ------------------------------------------------- | ------------------------- | --------------------------------- |
| List addresses      | existing      | `GET /api/tenant/addresses`                                  | `tenant-partner/tenant-partner.controller.ts:322` | `listAddresses()`         | `TenantAddressRecord[]`           |
| Export view         | existing      | `GET /api/tenant/addresses/export-view`                      | `tenant-partner/tenant-partner.controller.ts:334` | `listAddressExportView()` | `TenantAddressExportViewRecord[]` |
| Upsert address      | existing      | `POST /api/tenant/addresses`                                 | `tenant-partner/tenant-partner.controller.ts:346` | `upsertAddress(cmd)`      | `UpsertTenantAddressCommand`      |
| Deactivate / delete | authority gap | same pattern as `PD-1` — confirm `active=false` is canonical | same                                              | same                      | confirm in `XS-UI-003`            |

### 3.7 `/users` — Tenant Users

Spec source: §9.6.5.

| Need                  | Status               | Endpoint                                                                                                                                                             | Controller `file:line`                            | api-client helper               | Contract                                  |
| --------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------- | ----------------------------------------- |
| List tenant users     | existing             | `GET /api/tenant/users`                                                                                                                                              | `tenant-partner/tenant-partner.controller.ts:362` | `listTenantUsers()`             | `TenantUserRoleRecord[]`                  |
| Role catalog          | existing             | `GET /api/tenant/roles`                                                                                                                                              | `tenant-partner/tenant-partner.controller.ts:374` | `listTenantRoles()`             | `TenantRoleCatalogRecord[]`               |
| Invite user           | existing             | `POST /api/tenant/users`                                                                                                                                             | `tenant-partner/tenant-partner.controller.ts:382` | `createTenantUser(cmd)`         | `CreateTenantUserCommand`                 |
| Update role           | existing             | `POST /api/tenant/users/:userId/role`                                                                                                                                | `tenant-partner/tenant-partner.controller.ts:398` | `updateTenantRole(userId, cmd)` | `UpdateTenantRoleCommand`                 |
| Suspend / re-activate | existing-by-overload | same `POST /api/tenant/users/:userId/role` — `UpdateTenantRoleCommand.status` accepts `invited \| active \| suspended` (`packages/contracts/src/index.ts:1042-1045`) | same                                              | same                            | confirm authority semantic in `XS-UI-003` |
| Re-send invite        | authority gap        | no dedicated re-invite command                                                                                                                                       | n/a                                               | n/a                             | flag for `XS-UI-002`                      |

Authority gaps:

- `TU-1` Suspend semantic is overloaded onto `update-role` because
  `UpdateTenantRoleCommand.status` is the only writable status field today.
  Spec §9.6.5 is satisfied, but the command-action matrix in `XS-UI-003`
  should call this out so future UI does not invent a separate `suspend`
  endpoint. **Probable owner:** `tenant-partner` (decide whether to keep
  overloaded or split into a dedicated `update-status` command).
- `TU-2` Re-invite / resend invite. No backend command exists. **Probable
  owner:** `tenant-partner`; mark `unclear` until `XS-UI-002` confirms whether
  invite lifecycle is in scope.

### 3.8 `/notifications` — Notification Preferences

Spec source: §9.6.6.

| Need                        | Status          | Endpoint                                                                                                           | Controller `file:line`                              | api-client helper               | Contract                           |
| --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------- | ---------------------------------- |
| Get current subscriptions   | existing        | `GET /api/tenant/notifications`                                                                                    | `tenant-partner/tenant-partner.controller.ts:478`   | `getNotificationPreferences()`  | `TenantNotificationPreferences`    |
| Update subscriptions        | existing        | `POST /api/tenant/notifications`                                                                                   | `tenant-partner/tenant-partner.controller.ts:517`   | `updateNotifications(cmd)`      | `UpdateTenantNotificationsCommand` |
| Channel allowlist           | existing (enum) | `TenantNotificationSubscription.channel ∈ { email, webhook, ops_console }` (`packages/contracts/src/index.ts:797`) | n/a                                                 | n/a                             | matches spec §9.6.6                |
| Notification feed (history) | existing        | `GET /api/tenant/notifications/feed`                                                                               | `tenant-partner/tenant-partner.controller.ts:505`   | `listTenantNotificationFeed()`  | `NotificationRecord[]`             |
| Mark notifications read     | existing        | `POST /api/notifications/read`                                                                                     | `audit-notification/notifications.controller.ts:24` | (not yet exposed in api-client) | `MarkNotificationsReadCommand`     |

Authority gaps:

- `NT-1` `markNotificationsRead` exists on the backend but has no
  `@drts/api-client` helper today. **Probable owner:** api-client (no backend
  change required). Mark for inclusion alongside `TEN-UI-007` if Workspace
  Home or notifications surface needs it. Not a backend authority gap.

### 3.9 `/sla` — SLA Profile

Spec source: §9.6.7.

| Need               | Status   | Endpoint               | Controller `file:line`                            | api-client helper       | Contract                        |
| ------------------ | -------- | ---------------------- | ------------------------------------------------- | ----------------------- | ------------------------------- |
| Get SLA profile    | existing | `GET /api/tenant/sla`  | `tenant-partner/tenant-partner.controller.ts:681` | `getSlaProfile()`       | `TenantSlaProfile`              |
| Update SLA profile | existing | `POST /api/tenant/sla` | `tenant-partner/tenant-partner.controller.ts:692` | `updateSlaProfile(cmd)` | `UpdateTenantSlaProfileCommand` |

No authority gaps. SLA shape (`waitThresholdMin` / `arrivalThresholdMin` /
`completionThresholdMin`) matches spec §9.6.7 verbatim.

### 3.10 `/webhooks` — Webhook Management

Spec source: §9.6.8 + boundary contract §4.

| Need                                           | Status                            | Endpoint                                                                                                               | Controller `file:line`                            | api-client helper                                                                                                                                          | Contract                             |
| ---------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| List endpoints                                 | existing                          | `GET /api/tenant/webhooks`                                                                                             | `tenant-partner/tenant-partner.controller.ts:533` | `listWebhooks()`                                                                                                                                           | `TenantWebhookEndpoint[]`            |
| Create endpoint                                | existing                          | `POST /api/tenant/webhooks`                                                                                            | `tenant-partner/tenant-partner.controller.ts:544` | `createWebhookEndpoint(cmd)`                                                                                                                               | `CreateTenantWebhookEndpointCommand` |
| Update endpoint (incl. status)                 | existing                          | `POST /api/tenant/webhooks/:webhookId`                                                                                 | `tenant-partner/tenant-partner.controller.ts:580` | `updateWebhookEndpoint(id, cmd)`                                                                                                                           | `UpdateTenantWebhookEndpointCommand` |
| Delete endpoint                                | existing (allowed)                | `DELETE /api/tenant/webhooks/:webhookId`                                                                               | `tenant-partner/tenant-partner.controller.ts:598` | `deleteWebhookEndpoint(id)`                                                                                                                                | n/a                                  |
| Send test event                                | existing                          | `POST /api/tenant/webhooks/test`                                                                                       | `tenant-partner/tenant-partner.controller.ts:560` | (not yet exposed in api-client)                                                                                                                            | `SendTestWebhookCommand`             |
| Rotate signing secret                          | existing                          | `POST /api/tenant/webhooks/:webhookId/rotate-secret`                                                                   | `tenant-partner/tenant-partner.controller.ts:616` | (not yet exposed in api-client)                                                                                                                            | inline `{ secret, rotationReason? }` |
| Delivery log (all endpoints, tenant-wide feed) | existing-backend / api-client gap | `GET /api/tenant/webhooks/deliveries`                                                                                  | `tenant-partner/tenant-partner.controller.ts:649` | (not yet exposed in api-client; existing `listWebhookDeliveries(webhookId)` only hits the per-endpoint route, see `packages/api-client/src/index.ts:1276`) | `WebhookDeliveryRecord[]`            |
| Delivery log (per endpoint)                    | existing                          | `GET /api/tenant/webhooks/:webhookId/deliveries`                                                                       | `tenant-partner/tenant-partner.controller.ts:664` | `listWebhookDeliveries(webhookId)` (`packages/api-client/src/index.ts:1276-1282`)                                                                          | `WebhookDeliveryRecord[]`            |
| Retry / replay a delivery                      | authority gap                     | no command endpoint exists today                                                                                       | n/a                                               | n/a                                                                                                                                                        | needs new command                    |
| Retry policy read                              | existing (record field)           | `TenantWebhookEndpoint.retryPolicy` and `runtimeMetadata.retryPolicy` (`packages/contracts/src/index.ts:876, 833-849`) | n/a                                               | n/a                                                                                                                                                        | display-only                         |

Authority gaps:

- `WH-1` Webhook delivery retry / replay. Spec §9.6.8 says "retry / replay
  affordances only if backend support is confirmed". Today no command exists.
  **Probable owner:** `tenant-partner` (`webhook-dispatch.service.ts`).
  Boundary contract §4 WH-3 forbids the FRONTEND from retrying — any retry
  surface must call a backend command, not bypass the dispatcher. Resolve
  before `TEN-UI-006` exposes any retry/replay button. Keep as `unclear` per
  spec wording.
- `WH-2` `sendTestWebhook` and `rotateWebhookSecret` exist on the backend but
  have no `@drts/api-client` helpers yet. Not a backend authority gap; track
  as api-client work for `TEN-UI-006`.
- `WH-3` Tenant-wide delivery feed (`GET /api/tenant/webhooks/deliveries`)
  exists on the backend (`tenant-partner/tenant-partner.controller.ts:649`)
  but is NOT exposed by `@drts/api-client`. The current
  `listWebhookDeliveries(webhookId)` helper takes a required `webhookId` and
  only hits the per-endpoint route (`packages/api-client/src/index.ts:1276`).
  Spec §9.6.8 calls for a single delivery surface across the tenant's
  endpoints, so a new helper (e.g. `listAllWebhookDeliveries()` or an
  optional-`webhookId` overload) must be added. Not a backend authority gap;
  track as api-client work for `TEN-UI-006`.

### 3.11 `/api-keys` — API Keys

Spec source: §9.6.9.

| Need              | Status                   | Endpoint                                                                         | Controller `file:line`                            | api-client helper       | Contract                    |
| ----------------- | ------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------- | --------------------------- |
| List keys         | existing                 | `GET /api/tenant/api-keys`                                                       | `tenant-partner/tenant-partner.controller.ts:416` | `listApiKeys()`         | `TenantApiKeyRecord[]`      |
| Issue key         | existing                 | `POST /api/tenant/api-keys`                                                      | `tenant-partner/tenant-partner.controller.ts:428` | `issueApiKey(cmd)`      | `IssueTenantApiKeyCommand`  |
| Rotate key        | existing                 | `POST /api/tenant/api-keys/:apiKeyId/rotate`                                     | `tenant-partner/tenant-partner.controller.ts:460` | `rotateApiKey(id, cmd)` | `RotateTenantApiKeyCommand` |
| Revoke key        | existing                 | `POST /api/tenant/api-keys/:apiKeyId/revoke`                                     | `tenant-partner/tenant-partner.controller.ts:444` | `revokeApiKey(id)`      | n/a (empty body)            |
| Scope catalog     | existing (constant)      | `TENANT_API_KEY_ALLOWED_SCOPES` (`packages/contracts/src/index.ts:1067-1079`)    | n/a                                               | n/a                     | display-only                |
| Governance policy | existing (record fields) | `TenantApiKeyGovernancePolicy` exposed via integration governance package (§3.1) | n/a                                               | n/a                     | display-only                |

No authority gaps. Record shape (`keyPrefix`, `maskedSuffix`, `scopes`,
`lastUsedAt`, `expiresAt`, `revokedAt`, `createdAt`) matches spec §9.6.9 line
items.

### 3.12 `/billing` — Billing & Invoices

Spec source: §9.6.10.

| Need                      | Status                  | Endpoint                                                 | Controller `file:line`                                    | api-client helper               | Contract                                       |
| ------------------------- | ----------------------- | -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------- | ---------------------------------------------- |
| Billing profile (read)    | existing                | `GET /api/tenant/billing/profile`                        | `billing-settlement/billing-settlement.controller.ts:51`  | `getBillingProfile()`           | `TenantBillingProfile`                         |
| Billing profile (update)  | existing                | `POST /api/tenant/billing/profile`                       | `billing-settlement/billing-settlement.controller.ts:64`  | (not yet exposed in api-client) | `UpdateTenantBillingProfileCommand`            |
| Generate invoice (tenant) | existing                | `POST /api/tenant/invoices/generate`                     | `billing-settlement/billing-settlement.controller.ts:80`  | `generateInvoice(cmd)`          | `GenerateTenantInvoiceCommand`                 |
| List invoices             | existing                | `GET /api/tenant/invoices`                               | `billing-settlement/billing-settlement.controller.ts:96`  | `listInvoices()`                | `TenantInvoiceRecord[]`                        |
| Invoice detail            | existing                | `GET /api/tenant/invoices/:invoiceId`                    | `billing-settlement/billing-settlement.controller.ts:107` | (not yet exposed in api-client) | `TenantInvoiceRecord`                          |
| Artifact download         | existing (record field) | `TenantInvoiceRecord.artifactUrl` is a server-issued URL | `packages/contracts/src/index.ts:2865`                    | n/a                             | must be treated as short-lived per boundary §5 |

Authority gaps:

- `BI-1` Invoice approval / dispute. Spec §9.6.10 stops at "view + download";
  no command surface is required. If future scope adds dispute, mark as new
  authority gap. None for now.
- `BI-2` `getInvoiceById` and `updateBillingProfile` exist server-side but
  have no api-client helpers; track as api-client work for `TEN-UI-007`. Not
  a backend authority gap.

### 3.13 `/reports` — Reports

Spec source: §9.6.11.

| Need                     | Status                  | Endpoint                                                                            | Controller `file:line`                                | api-client helper            | Contract                    |
| ------------------------ | ----------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------- | --------------------------- |
| Create tenant report job | existing                | `POST /api/tenant/reports/jobs`                                                     | `reporting-filing/reporting-filing.controller.ts:48`  | `createTenantReportJob(cmd)` | `CreateReportJobCommand`    |
| List tenant report jobs  | existing                | `GET /api/tenant/reports/jobs`                                                      | `reporting-filing/reporting-filing.controller.ts:79`  | `listTenantReportJobs()`     | `ReportJobRecord[]`         |
| Tenant report job detail | existing                | `GET /api/tenant/reports/:jobId`                                                    | `reporting-filing/reporting-filing.controller.ts:107` | `getTenantReportJob(jobId)`  | `ReportJobDetailRecord`     |
| Artifact download        | existing (record field) | `ReportJobDetailRecord` exposes signed artifact URLs via `download-signing.util.ts` | `reporting-filing/download-signing.util.ts`           | n/a                          | short-lived per boundary §5 |

No authority gaps. Spec §9.6.11 inputs (job type, format, status, artifact,
expiresAt, createdAt) all map to existing record fields.

### 3.14 `/audit` — Audit Trail

Spec source: §9.6.12.

| Need                     | Status                       | Endpoint                                                   | Controller `file:line`                            | api-client helper       | Contract                         |
| ------------------------ | ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------- | ----------------------- | -------------------------------- |
| List tenant audit        | existing                     | `GET /api/tenant/audit`                                    | `tenant-partner/tenant-partner.controller.ts:708` | `listTenantAuditLogs()` | `AuditLogRecord[]`               |
| Filter by module / actor | authority gap (filter shape) | endpoint accepts no filter params today                    | same                                              | same                    | `XS-UI-004` to lock filter shape |
| Append-only enforcement  | existing                     | enforced by backend domain services per boundary §4 AU-1/2 | n/a                                               | n/a                     | display-only on tenant side      |

Authority gaps:

- `AU-1` Audit filter shape. Today the tenant audit endpoint returns the
  unfiltered list. Spec §9.6.12 calls for filterable display
  (createdAt, actorType, moduleName, actionName, resourceType, requestId).
  **Probable owner:** `audit-notification` / `tenant-partner` (whichever serves
  the tenant projection). Mark for `XS-UI-004` to share the filter shape with
  platform admin's `/audit` view.

### 3.15 `/feature-flags` — Feature Visibility

Spec source: §9.5 row "Feature Visibility — read-only".

| Need                                    | Status                        | Endpoint                                                                     | Controller `file:line`                             | api-client helper        | Contract             |
| --------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------ | -------------------- |
| Read flag list                          | existing-but-mismatched-realm | `GET /api/admin/flags`                                                       | `feature-flags/feature-flags.controller.ts:20`     | `getFeatureFlags()`      | `FeatureFlagSummary` |
| Toggle / override (forbidden in tenant) | platform-only                 | `PATCH /api/admin/flags/:key`, `POST /api/admin/flags/:key/tenant-overrides` | `feature-flags/feature-flags.controller.ts:47, 57` | `updateFeatureFlag(...)` | platform realm only  |

Authority gaps:

- `FF-1` Tenant-scoped read of feature visibility. Same gap as `H-1`:
  current tenant portal calls `admin/flags` directly, which is RBAC-cleared
  for the platform realm. **Probable owner:** `feature-flags` — add a
  tenant-cleared read endpoint (or a `RequireRealms("tenant", ...)` carve-out
  on the existing `flags/:key/enabled` route at line 80). Resolve before any
  tenant-side feature-visibility surface ships under `apps/tenant-console-web`.
- `FF-2` Tenant must NEVER expose toggle / override. Boundary §3 D-7 and §1
  S-3 reinforce that gating happens server-side.

### 3.16 `/integration-governance` — Integration Readiness (recommended)

Spec source: §9.6.13. Recommended new product page; aggregator over already-
existing data.

Spec §9.6.13 lists six readiness facets: API key readiness, webhook endpoint
readiness, notification routing readiness, SLA profile completeness, **report
availability**, and **module enablement**. The current
`TenantIntegrationGovernancePackage` only covers the first three baselines and
the API key / webhook governance policies; SLA, report availability, and
module enablement are NOT included
(`packages/contracts/src/index.ts:1119-1127`,
`apps/api/src/modules/tenant-partner/tenant-partner.service.ts:780-793`).

| Need (per spec §9.6.13 facet)                                                                    | Status                                 | Endpoint                                 | Controller `file:line`                            | api-client helper                         | Contract                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------- | ------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aggregated readiness package (API key / webhook / notification baselines + onboarding checklist) | existing (partial coverage of §9.6.13) | `GET /api/tenant/integration-governance` | `tenant-partner/tenant-partner.controller.ts:492` | `getTenantIntegrationGovernancePackage()` | `TenantIntegrationGovernancePackage` (`apiKeyPolicy`, `webhookPolicy`, `baselineWebhookEvents`, `baselineNotificationSubscriptions`, `onboardingChecklist`)                         |
| API key readiness                                                                                | existing (in package)                  | same                                     | same                                              | same                                      | `apiKeyPolicy` (`TenantApiKeyGovernancePolicy`)                                                                                                                                     |
| Webhook endpoint readiness                                                                       | existing (in package)                  | same                                     | same                                              | same                                      | `webhookPolicy` + `baselineWebhookEvents`                                                                                                                                           |
| Notification routing readiness                                                                   | existing (in package)                  | same                                     | same                                              | same                                      | `baselineNotificationSubscriptions`                                                                                                                                                 |
| SLA profile completeness                                                                         | existing (compose, separate endpoint)  | `GET /api/tenant/sla`                    | `tenant-partner/tenant-partner.controller.ts:681` | `getSlaProfile()`                         | `TenantSlaProfile` (see §3.9)                                                                                                                                                       |
| Report availability                                                                              | authority gap                          | n/a                                      | n/a                                               | n/a                                       | no per-tenant report-availability surface today; static catalog `REPORT_JOB_TYPES` (`packages/contracts/src/index.ts:3106-3110`) lists job types but is not a tenant readiness view |
| Module enablement                                                                                | authority gap                          | n/a (same gap as `H-1` / `FF-1`)         | n/a                                               | n/a                                       | tenant-cleared module / feature visibility read does not exist today                                                                                                                |

Authority gaps:

- `IG-1` Report availability is a §9.6.13 facet but is NOT included in
  `TenantIntegrationGovernancePackage` and has no standalone tenant-cleared
  endpoint. **Probable owner:** `reporting-filing` (extend the governance
  package with a `reportAvailability` block, or add a tenant-cleared
  `GET /api/tenant/reports/availability` view). Resolve in `XS-UI-002`
  before any integration-governance UI ships.
- `IG-2` Module enablement is a §9.6.13 facet but is NOT included in the
  package. This is the same backend gap as `H-1` (Workspace Home module
  enablement) and `FF-1` (tenant-cleared feature visibility). **Resolution
  reference:** see `H-1` / `FF-1`. The integration-governance page should
  consume whichever tenant-cleared feature/module visibility endpoint
  closes those gaps; do not add a separate read path.
- `IG-3` SLA profile completeness is currently sourced from the separate
  `GET /api/tenant/sla` endpoint (§3.9). Spec §9.6.13 places it inside the
  readiness aggregate, but the api-client may compose this client-side
  (boundary §1 S-5). **Probable owner:** presentation choice in api-client;
  not a backend authority gap. If a future product call wants a single-call
  aggregate, extend `TenantIntegrationGovernancePackage` with `slaProfile`
  via the `tenant-partner` module.

## 4. Tenant identity / bootstrap (cross-route prerequisite)

Spec source: §9.7.1 + boundary contract §5 _Auth context_.

| Need                          | Status      | Endpoint                                  | Controller `file:line`                                           | api-client helper                   | Contract                                                         |
| ----------------------------- | ----------- | ----------------------------------------- | ---------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| Tenant bootstrap session      | existing    | `POST /api/auth/tenant/bootstrap-session` | `auth/auth.controller.ts:135`                                    | `createTenantBootstrapSession(cmd)` | `CreateTenantBootstrapSessionCommand` → `TenantBootstrapSession` |
| Identity context              | existing    | `GET /api/identity/context`               | `identity/identity.controller.ts:15`                             | `getIdentityContext()`              | `IdentityContext`                                                |
| Demo cookie / role simulation | sunset only | n/a                                       | `apps/tenant-portal-web/lib/api-client.ts:11-12` static demo IDs | n/a                                 | MUST NOT survive into `apps/tenant-console-web`                  |

Authority gaps:

- `ID-1` `TEN-UI-008` is the canonical slice that removes demo / static
  tenant-id assumptions. This packet does not introduce a new endpoint; it
  records that bootstrap + identity-context are the only authority surfaces
  for the new product target.

## 5. Partner booking mode (separate route group)

Spec source: §9.4.2 + §9.7.9. Same in-repo app (per TEN-UI-001), but explicit
nav / route-group isolation.

| Need                                                                   | Status                                                                                             | Endpoint                                                          | Controller `file:line`                               | api-client helper                               | Contract                                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| Partner bootstrap session                                              | existing                                                                                           | `POST /api/auth/partner/bootstrap-session`                        | `auth/auth.controller.ts:233`                        | `createPartnerBootstrapSession(cmd)`            | `CreatePartnerBootstrapSessionCommand`                                                |
| Partner entry catalog (open)                                           | existing                                                                                           | `GET /api/partner/entries`, `GET /api/partner/entries/:entrySlug` | `tenant-partner/tenant-partner.controller.ts:83, 92` | `listPartnerEntries()`, `getPartnerEntry(slug)` | `PartnerChannelEntryRecord`                                                           |
| Eligibility verification                                               | existing                                                                                           | `POST /api/partner/eligibility/verify`                            | `tenant-partner/tenant-partner.controller.ts:230`    | `verifyPartnerEligibility(cmd)`                 | `VerifyPartnerEligibilityCommand` → `PartnerEligibilityVerificationRecord`            |
| Eligibility lookup                                                     | existing                                                                                           | `GET /api/partner/eligibility/:eligibilityVerificationId`         | `tenant-partner/tenant-partner.controller.ts:245`    | `getPartnerEligibilityVerification(id)`         | `PartnerEligibilityVerificationRecord`                                                |
| Partner-mode booking creation                                          | existing (same endpoint as tenant mode, with `partnerEntrySlug` + `eligibilityVerificationId` set) | `POST /api/tenant/bookings`                                       | `owned-mobility/owned-mobility.controller.ts:183`    | `createTenantBooking(cmd)`                      | `CreateTenantBookingCommand` (fields `partnerEntrySlug`, `eligibilityVerificationId`) |
| Hidden surfaces (API keys, users, audit, billing admin, webhook admin) | forbidden                                                                                          | n/a                                                               | n/a                                                  | n/a                                             | partner mode must not navigate to these per spec §9.4.2                               |

Authority gaps:

- `PM-1` Spec §9.7.9 implies the partner success page may need a minimal
  tracking view of the just-created booking. The existing
  `GET /api/tenant/bookings/:bookingId` works but requires the partner
  bootstrap session to carry tenant scope. Confirm in `XS-UI-003` whether
  partner mode is allowed to GET a booking after creation, or whether a
  redacted partner-cleared projection is required.

## 6. Authority gap inventory (consolidated)

| ID   | Surface                             | Gap                                                                                     | Probable owner                                                 | Status                                             |
| ---- | ----------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| H-1  | Workspace Home / Feature Visibility | tenant-cleared module enablement read                                                   | `feature-flags` (extend with tenant realm or new tenant route) | unclear                                            |
| BL-1 | Booking List                        | filter / pagination shape (status, window, passenger, cost-center)                      | `owned-mobility`                                               | filter-shape gap; resolve in `XS-UI-004`           |
| BD-1 | Booking Detail                      | tenant-projected booking timeline                                                       | `owned-mobility`                                               | unclear                                            |
| BD-2 | Booking Detail                      | tenant-cleared driver / fulfillment summary                                             | `owned-mobility`                                               | unclear (authority may simply forbid)              |
| BD-3 | Booking Detail                      | explicit `BookingRecord` ↔ `TenantInvoiceRecord` linkage                                | `billing-settlement`                                           | unclear                                            |
| BN-1 | New Booking                         | cost-center catalog                                                                     | `tenant-partner` or `billing-settlement`                       | unclear                                            |
| BN-2 | New Booking                         | tenant-side approval-impact framing                                                     | n/a (likely out of authority)                                  | unclear                                            |
| PD-1 | Passengers                          | canonical deactivate semantic for upsert                                                | `tenant-partner`                                               | confirm in `XS-UI-003`                             |
| TU-1 | Users                               | suspend command overloaded onto update-role                                             | `tenant-partner`                                               | confirm in `XS-UI-003`                             |
| TU-2 | Users                               | resend invite                                                                           | `tenant-partner`                                               | unclear                                            |
| WH-1 | Webhooks                            | tenant-cleared retry / replay command                                                   | `tenant-partner` (`webhook-dispatch.service.ts`)               | unclear; spec §9.6.8 conditions on backend support |
| WH-3 | Webhooks                            | api-client helper for tenant-wide delivery feed (`GET /api/tenant/webhooks/deliveries`) | `@drts/api-client`                                             | exists (api-client gap); closes via `TEN-UI-006`   |
| AU-1 | Audit                               | tenant-audit filter shape (module / actor / etc.)                                       | `audit-notification` / `tenant-partner`                        | filter-shape gap; resolve in `XS-UI-004`           |
| FF-1 | Feature Flags                       | tenant-cleared read endpoint                                                            | `feature-flags`                                                | unclear                                            |
| IG-1 | Integration Governance              | report availability facet missing from package                                          | `reporting-filing`                                             | unclear; resolve in `XS-UI-002`                    |
| IG-2 | Integration Governance              | module enablement facet missing from package                                            | `feature-flags` (closes via `H-1` / `FF-1`)                    | unclear; same root cause as `H-1` / `FF-1`         |
| IG-3 | Integration Governance              | SLA facet sourced from separate endpoint, not the package                               | `@drts/api-client` (presentation compose)                      | not a backend gap; presentation choice             |
| ID-1 | Cross-route                         | demo cookie / static tenant-id removal                                                  | `auth` (already exists; consumer change)                       | exists; closes via `TEN-UI-008`                    |
| PM-1 | Partner Mode                        | partner-cleared booking lookup after creation                                           | `owned-mobility` / `tenant-partner`                            | unclear; confirm in `XS-UI-003`                    |

Filter / query shape gaps (`BL-1`, `AU-1`) feed `XS-UI-004`. Command-action
authority gaps (`PD-1`, `TU-1`, `TU-2`, `WH-1`, `PM-1`) feed `XS-UI-003`.
Read-model gaps (`H-1`, `BD-1`, `BD-2`, `BD-3`, `BN-1`, `BN-2`, `FF-1`,
`IG-1`, `IG-2`) feed `XS-UI-002`. Identity / RBAC gap (`ID-1`) is closed in
`TEN-UI-008` and does not require a new endpoint. Pure api-client / wiring
gaps (`WH-3`, plus the api-client-only `NT-1`, `WH-2`, `BI-2`) close inside
the corresponding `TEN-UI-*` slices and do not need backend authority work.

## 7. Hand-off

Reviewer (`Codex`) checklist:

1. Confirm every endpoint citation resolves at the file:line shown.
2. Confirm the authority-gap inventory is correctly partitioned across
   `XS-UI-002` / `XS-UI-003` / `XS-UI-004` ownership.
3. Flag any tenant-mode call I marked `existing` that the backend actually
   guards under a non-tenant realm decorator (counter-example would be
   audit / webhook delivery list, where I confirmed
   `RequireRealms("tenant", "platform", "ops")`).
4. Confirm partner mode boundary holds — partner-cleared callers should reach
   only the rows in §5 plus the partner-flagged variant of `POST
/api/tenant/bookings`.

Implementation slices `TEN-UI-002` … `TEN-UI-008` consume this packet as their
authority surface. They MUST NOT introduce new tenant-side endpoint names
without first updating §3 / §6 here.
