# TEN-UI-009 Tenant Console Verification Packet

- **Task:** `TEN-UI-009` - Tenant Console Verification Packet
- **Owner:** `Codex`
- **Reviewer:** `Claude2`
- **Execution Packet:** `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- **Generated:** `2026-05-09` (UTC)
- **Machine-Truth Status At Draft Time:** `in_progress` in `ai-status.json`

This packet is the final evidence gate for the selected tenant-console wave. It
captures the adopted topology from `TEN-UI-001`, the dependency closure from
`XS-UI-001` ... `TEN-UI-008`, the route-by-route parity state of the current
working tree, the endpoint / command mappings that the selected wave actually
uses, the accepted deviations that do not justify reopening upstream tasks, and
the remaining backend / RBAC qualifications that the reviewer must keep
explicit.

## 1. Verification Summary

- `pnpm --filter @drts/tenant-portal-web typecheck` passed on `2026-05-09`.
- `pnpm --filter @drts/tenant-console-web typecheck` passed on `2026-05-09`.
- The adopted in-repo tenant target is `apps/tenant-console-web`; `apps/tenant-portal-web`
  remains a sunset reference shell, and production traffic still lives in the
  external `tenant-commute-hub` repo.
- The selected shell exposes all nine selected-wave routes in static navigation:
  `/`, `/bookings`, `/bookings/[bookingId]`, `/bookings/new`, `/api-keys`,
  `/webhooks`, `/audit`, `/users`, `/settings`
  (`apps/tenant-console-web/lib/navigation.ts:12-68`,
  `apps/tenant-console-web/components/tenant-shell.tsx:17-63`).
- Current selected-shell parity is uneven by design:
  - implemented with real tenant reads: `/`, `/bookings`, `/bookings/[bookingId]`,
    `/audit`, `/users`, `/settings`
  - selected-shell placeholder / IA slot only: `/bookings/new`, `/api-keys`,
    `/webhooks`
- RBAC evidence is also split:
  - selected shell already uses tenant-scoped headers and backend identity /
    role / settings reads
  - full session bootstrap, capability-derived navigation, and capability-gated
    mutations still live in the legacy portal cutover from `TEN-UI-008`
  - the selected shell therefore does **not** yet prove full selected-target
    RBAC parity on its own

## 2. Scope Boundary

In scope:

- verify selected-wave route coverage for tenant home, bookings, integrations,
  governance, and RBAC-facing surfaces
- restate the chosen topology and sunset rule so route parity is judged against
  the right app target
- record the endpoint / command / query model actually consumed by the current
  shell and the legacy carry-over surfaces
- capture accepted deviations and unresolved backend gaps without inventing new
  product semantics

Out of scope:

- editing canonical L1/L2 product truth, reopening closed dependencies, or
  claiming new backend contracts
- rewriting runtime code in this task
- treating deferred prototype surfaces as part of this selected wave

## 3. Topology And Upstream Closure

### 3.1 Chosen topology

- `TEN-UI-001` closed the in-repo topology question in favor of
  `apps/tenant-console-web` as the only allowed in-repo tenant-console landing
  zone (`ai-status.json`, commit `e122e8b`; `apps/tenant-portal-web/README.md:3-25`).
- The same README keeps `apps/tenant-portal-web` under an explicit
  `SUNSET — NOT PRODUCTION` banner and says future `TEN-UI-*` work must not be
  routed there.
- `apps/tenant-console-web/components/tenant-shell.tsx:60-63` also states that
  current production traffic still lives in `tenant-commute-hub`; this repo's
  selected shell is the in-repo target IA, not the live production portal.

### 3.2 Dependency closure

All eleven formal dependencies of `TEN-UI-009` are `done` in machine truth, and
the transitive topology anchor from `TEN-UI-001` is also `done`.

| Task         | Status | Commit    | Why this packet depends on it                                                                                             |
| ------------ | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `TEN-UI-001` | `done` | `e122e8b` | Fixes the target app and sunset rule so parity is judged against `apps/tenant-console-web`, not `apps/tenant-portal-web`. |
| `XS-UI-001`  | `done` | `ac44883` | Canonical route-to-endpoint map for all selected tenant surfaces.                                                         |
| `XS-UI-002`  | `done` | `0df70c3` | Backend gap inventory for booking detail, webhooks, settings, and formal role coverage.                                   |
| `XS-UI-003`  | `done` | `7b76d9f` | Command-action limits for booking, user, API-key, and webhook mutations.                                                  |
| `XS-UI-004`  | `done` | `c480243` | Shared query/filter vocabulary, especially for booking list semantics.                                                    |
| `TEN-UI-002` | `done` | `845f996` | Selected shell, IA slots, and route map in `apps/tenant-console-web`.                                                     |
| `TEN-UI-003` | `done` | `6166e91` | Home dashboard baseline for identity, bookings, reminders, and integration posture.                                       |
| `TEN-UI-004` | `done` | `d4e36a1` | Booking list/detail parity, shared query model, and allowed booking actions.                                              |
| `TEN-UI-005` | `done` | `c4249ce` | Productized create-booking workflow evidence, even though selected shell still carries a placeholder.                     |
| `TEN-UI-006` | `done` | `7ed1ab1` | API-key and webhook productization evidence plus integration-gap framing.                                                 |
| `TEN-UI-007` | `done` | `94c8f39` | Audit, users, and settings governance framing.                                                                            |
| `TEN-UI-008` | `done` | `9b5fb12` | Tenant identity / RBAC cutover evidence and legacy portal capability model.                                               |

## 4. Acceptance Command Evidence

Commands run during packet preparation on `2026-05-09` (UTC):

| Command                                            | Result | Note                       |
| -------------------------------------------------- | ------ | -------------------------- |
| `pnpm --filter @drts/tenant-portal-web typecheck`  | PASS   | `tsc --noEmit` exited `0`. |
| `pnpm --filter @drts/tenant-console-web typecheck` | PASS   | `tsc --noEmit` exited `0`. |

Acceptance note:

- The machine-truth acceptance line still names `@drts/tenant-portal-web`, which
  reflects legacy task metadata drift called out by `TEN-UI-006` and the
  `TEN-UI-009` acceptance sidecar.
- This packet therefore records both commands: the legacy acceptance command and
  the selected-target command for `apps/tenant-console-web`.

## 5. Route-By-Route Parity

Primary IA exposure is static and explicit in
`apps/tenant-console-web/lib/navigation.ts:12-68` and
`apps/tenant-console-web/components/tenant-shell.tsx:17-63`. The route rows
below distinguish selected-shell runtime evidence from legacy portal carry-over
evidence when the selected shell still stops at IA-only placeholders.

| Route                   | Result                                                                      | Current evidence                                                                                                                                                                                                                                                                                    | Endpoint / command mapping                                                                                                                                                   | Verification note                                                                                                                                                                                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | Implemented with qualification                                              | `apps/tenant-console-web/app/page.tsx:39-88,111-299`                                                                                                                                                                                                                                                | `getIdentityContext()`, `getFeatureFlags({ tenantId })`, `listTenantBookings()`, `listInvoices()`, `listTenantNotificationFeed()`, `getTenantIntegrationGovernancePackage()` | Home is a real selected-shell aggregator, but it still uses fixed demo bootstrap (`apps/tenant-console-web/lib/api-client.ts:3-12`) and reads feature visibility through the existing feature-flag helper rather than a tenant-cleared dedicated module-visibility endpoint.                 |
| `/bookings`             | Implemented with qualification                                              | `apps/tenant-console-web/app/bookings/page.tsx:23-270`, `apps/tenant-console-web/lib/booking-list.ts:35-209`                                                                                                                                                                                        | `listTenantBookings()` plus shared query keys `q`, `status`, `dateField`, `dateFrom`, `dateTo`, `page`, `pageSize`                                                           | The page follows the `XS-UI-004` vocabulary and `OwnedOrderStatus` guardrail, but filtering/pagination are still applied in page code around an unfiltered booking list rather than a server-side query DTO.                                                                                 |
| `/bookings/[bookingId]` | Implemented with qualification                                              | `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx:73-305`, `apps/tenant-console-web/components/booking-command-panel.tsx:27-277`, `apps/tenant-console-web/app/api/bookings/[bookingId]/update/route.ts:6-22`, `apps/tenant-console-web/app/api/bookings/[bookingId]/cancel/route.ts:5-24` | `getTenantBooking(id)`, `listInvoices()`, `updateTenantBooking(id, cmd)`, `cancelTenantBooking(id, cmd)`                                                                     | Detail parity is real for booking summary, rider context, fare context, and allowed commands, but timeline rows are synthesized from `BookingRecord` fields instead of a tenant-safe timeline endpoint, and no tenant-safe driver/vehicle projection is present.                             |
| `/bookings/new`         | Accepted deviation: selected-shell placeholder, legacy product depth exists | Selected shell: `apps/tenant-console-web/app/bookings/new/page.tsx:8-42`. Legacy depth: `apps/tenant-portal-web/app/bookings/new/page.tsx:292-760`                                                                                                                                                  | Canonical create path is still `createTenantBooking(cmd)`, with `listPassengers()`, `listAddresses()`, and `getProductRuleCatalog()` feeding the richer form                 | The IA slot is live in the selected shell, but the policy-aware intake form still lives in the sunset portal. This is a migration gap that must be called out, not hidden behind a parity claim.                                                                                             |
| `/api-keys`             | Accepted deviation: selected-shell IA slot, legacy product depth exists     | Selected shell: `apps/tenant-console-web/app/api-keys/page.tsx:7-33`. Legacy depth: `apps/tenant-portal-web/app/api-keys/page.tsx:283-434,520-876`                                                                                                                                                  | `listApiKeys()`, `issueApiKey()`, `rotateApiKey()`, `revokeApiKey()`                                                                                                         | The selected shell only reserves the top-level IA. The legacy portal still carries the governed scope catalog, masked inventory, issue/rotate/revoke flows, and one-time reveal path referenced by `TEN-UI-008`. Reviewer must treat that as carry-over evidence, not selected-shell parity. |
| `/webhooks`             | Accepted deviation: selected-shell IA slot, legacy product depth exists     | Selected shell: `apps/tenant-console-web/app/webhooks/page.tsx:7-37`. Legacy depth: `apps/tenant-portal-web/app/webhooks/page.tsx:209-418,935-1048`                                                                                                                                                 | `listWebhooks()`, `createWebhookEndpoint()`, `updateWebhookEndpoint()`, `deleteWebhookEndpoint()`, `listWebhookDeliveries(webhookId)`                                        | The selected shell keeps the navigation slot and guardrail copy. The legacy portal still carries endpoint management and delivery-log visibility. Retry/replay remains unsupported, and rotate-secret / send-test are backend-supported but not selected-shell wired here.                   |
| `/audit`                | Implemented                                                                 | `apps/tenant-console-web/app/audit/page.tsx:12-90`                                                                                                                                                                                                                                                  | `listTenantAuditLogs()`                                                                                                                                                      | The selected shell is directly backed by `/api/tenant/audit`, keeps the surface read-only, and explicitly avoids platform evidence-governance claims.                                                                                                                                        |
| `/users`                | Implemented with RBAC qualification                                         | `apps/tenant-console-web/app/users/page.tsx:39-137`                                                                                                                                                                                                                                                 | `listTenantUsers()`, `listTenantRoles()`                                                                                                                                     | The selected shell correctly reads the backend role catalog and tenant user roster, but it currently stops at display/reporting. Invite, role change, and capability-derived nav/action gating still live in the legacy portal / `TEN-UI-008` cutover rather than the selected shell.        |
| `/settings`             | Implemented with qualification                                              | `apps/tenant-console-web/app/settings/page.tsx:17-109`                                                                                                                                                                                                                                              | `getNotificationPreferences()`, `getSlaProfile()`, `getTenantIntegrationGovernancePackage()`, `getFeatureFlags({ tenantId })`                                                | Selected-shell settings parity is a page-level aggregate over real reads, but there is still no formal tenant settings aggregate endpoint, no tenant-cleared feature-visibility endpoint, and no locale/profile preference contract.                                                         |

## 6. Accepted Deviations For This Wave

These are real drifts, but they do not justify reopening already-closed
dependencies. They must simply stay explicit in review.

1. `apps/tenant-console-web` is the selected in-repo target, but `/bookings/new`,
   `/api-keys`, and `/webhooks` are still selected-shell placeholders while the
   deeper create/integration workflows remain evidenced in the sunset portal.
2. Booking detail currently composes a human-readable timeline from booking
   record fields rather than consuming a dedicated tenant-safe timeline read
   model.
3. Settings parity is aggregate/read-only in the selected shell. It is not yet a
   formal tenant settings contract.
4. The selected wave intentionally excludes prototype-only or later-wave surfaces
   such as passengers, addresses, cost centers, rules, invoices, and reports.
   Their absence here is deferred scope, not silent omission.

## 7. Command And Backend Gap Mapping

### 7.1 Mutate-command limits that the packet preserves

- Booking surfaces may only expose `create`, `update`, and `cancel` against the
  canonical tenant booking commands
  (`support/sidecars/XS-UI-003/command-action-matrix.md:42-46`).
- Tenant user lifecycle may expose invite and role/status changes, but must not
  invent a dedicated resend-invite command
  (`support/sidecars/XS-UI-003/command-action-matrix.md:47-51`).
- API-key surfaces may expose issue / rotate / revoke only
  (`support/sidecars/XS-UI-003/command-action-matrix.md:52-54`).
- Webhook enable / disable is an update-command status flip, not a distinct
  endpoint, and retry / replay remain blocked until a real backend command
  exists (`support/sidecars/XS-UI-003/command-action-matrix.md:55-63,127-134`).
- Booking list query semantics must stay on the normalized `q`, `status`,
  `dateField`, `dateFrom`, `dateTo`, `page`, `pageSize` vocabulary
  (`support/sidecars/XS-UI-004/filter-normalization-packet.md:83-145,210-249`).

### 7.2 Remaining backend / contract gaps carried into review

| Gap ID | Surface              | Status                            | Current impact on parity claim                                                                                      |
| ------ | -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `BD-1` | booking detail       | `missing`                         | No tenant-safe timeline endpoint exists; selected shell uses record-derived checkpoints only.                       |
| `BD-2` | booking detail       | `unclear`                         | No tenant-safe driver / vehicle fulfillment summary exists.                                                         |
| `BD-3` | booking detail       | `missing`                         | Invoice linkage is indirect; selected shell filters invoice records locally by order reference.                     |
| `WH-1` | webhooks             | `missing`                         | No retry / replay command exists; reviewer must reject any claim otherwise.                                         |
| `WH-2` | webhooks             | `exists-backend / missing-client` | Tenant-wide delivery feed exists in backend but still lacks the shared api-client helper called out by `XS-UI-002`. |
| `WH-3` | webhooks             | `exists-backend / missing-client` | Rotate-secret and send-test backend commands exist, but selected-shell evidence here does not wire them.            |
| `ST-1` | settings             | `missing`                         | `/settings` is still a page-level aggregate, not a formal tenant settings read model.                               |
| `ST-2` | settings             | `missing`                         | Tenant-cleared module-visibility endpoint is still absent; current feature flag read is a carry-over helper.        |
| `ST-4` | settings             | `missing`                         | No locale / presentation preference contract exists for tenant authority.                                           |
| `TU-1` | users                | `missing`                         | No resend-invite command exists.                                                                                    |
| `TU-3` | users / integrations | `missing`                         | Backend role catalog still lacks a distinct formal integration-manager role code.                                   |
| `TU-4` | users / RBAC         | `partial`                         | Richer backend role framing exists conceptually, but selected-shell capability consumption is still incomplete.     |

Source: `support/sidecars/XS-UI-002/backend-gap-inventory.md:44-52,71-123,145-216,262-285`.

## 8. Identity And RBAC Verification Notes

### 8.1 What the selected shell already proves

- `apps/tenant-console-web/lib/api-client.ts:3-12` uses the shared tenant client
  factory, and `packages/api-client/src/index.ts:2180-2188` sets tenant-scoped
  headers (`x-actor-type=tenant_admin`, `x-realm=tenant`, `x-tenant-id`).
- `apps/tenant-console-web/app/page.tsx:39-88` reads `IdentityContext`
  directly from the backend and surfaces tenant / realm / actor / auth mode on
  the home route.
- `apps/tenant-console-web/app/users/page.tsx:39-137` reads tenant users plus
  backend role catalog instead of hard-coding a local role table.
- `apps/tenant-console-web/app/settings/page.tsx:17-109` reads notification,
  SLA, governance, and feature data from backend-owned helpers.

### 8.2 What the selected shell still does **not** prove

- Bootstrap is still fixed to `DEMO_TENANT_ID` / `DEMO_ACTOR_ID`
  (`apps/tenant-console-web/lib/api-client.ts:3-12`), so the selected shell is
  not yet dynamically bound to a real backend-issued tenant session.
- Navigation is static and unconditional
  (`apps/tenant-console-web/lib/navigation.ts:12-68`,
  `apps/tenant-console-web/components/tenant-shell.tsx:28-50`); it is not
  filtered from a role snapshot.
- The selected shell has no central RBAC helper equivalent to the legacy portal
  `getTenantRoleSnapshot()` / capability matrix.

### 8.3 Where the authoritative RBAC cutover evidence still lives

- `TEN-UI-008` documented the backend-issued tenant bootstrap flow, server-side
  role snapshot, capability matrix, and capability-gated navigation /
  integration controls in the legacy portal:
  - `apps/tenant-portal-web/app/layout.tsx:56-80` resolves the tenant session
    and renders nav from `getTenantPortalNavItems(...)`
  - `apps/tenant-portal-web/lib/rbac.ts:45-128,158-179,222-265` derives
    capabilities from backend roles/scopes and filters navigation from them
  - `apps/tenant-portal-web/app/api-keys/page.tsx:283-434,732-876` gates API-key
    admin actions from `canManageApiKeys`
  - `apps/tenant-portal-web/app/webhooks/page.tsx:209-418,935-1048` gates webhook
    writes from `canWriteWebhooks`
- `support/sidecars/TEN-UI-008/TEN-UI-008-SIDECAR-REVIEW.md:22-89` is the
  reviewer-facing summary of that cutover.

RBAC conclusion:

- `TEN-UI-009` can legitimately claim that tenant authority reads and the legacy
  RBAC cutover evidence exist in the repo.
- `TEN-UI-009` cannot honestly claim that the **selected shell itself** has
  finished the full dynamic session / capability-gated cutover. That remains a
  qualification on route parity, especially for `/api-keys`, `/webhooks`,
  `/users`, and the shell navigation model.

## 9. Reviewer Focus

1. Confirm the packet keeps the topology straight: selected in-repo target is
   `apps/tenant-console-web`, while `apps/tenant-portal-web` is sunset-only and
   used here only as legacy migration evidence.
2. Confirm the three integration/create routes are described as placeholders /
   carry-over evidence, not as full selected-shell parity.
3. Confirm the command and backend-gap notes stay aligned with `XS-UI-002`,
   `XS-UI-003`, and `XS-UI-004`, especially the webhook retry/replay prohibition
   and the booking-query vocabulary.
4. Confirm the RBAC section distinguishes backend-issued legacy portal cutover
   evidence from the selected shell's still-static bootstrap/navigation model.
