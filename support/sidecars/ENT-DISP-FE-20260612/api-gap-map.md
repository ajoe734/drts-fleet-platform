# Enterprise Dispatch API/Client Gap Map

Date: 2026-06-12
Task: `ENT-DISP-FE-20260612-F` first segment, API/client gap map
Scope: frontend support note only. Do not change `apps/enterprise-dispatch-web`, `apps/api`, or `packages/api-client` from this task.

## Sources Checked

- `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`
- `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md`
- `packages/api-client/src/index.ts`
- `packages/contracts/src/index.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`

## Baseline Decision

Use `/api/tenant/*` as the backend authority. Where the design packet names command endpoints but the current backend exposes older non-command routes, treat that as an adapter decision, not an API error. Frontend workers must not invent command routes such as `/api/tenant/bookings/commands/create` unless backend/client work explicitly adds them later.

Tenant calls should be created through `createTenantClient(baseUrl, tenantId, actorId)` for bootstrap-header auth or `createTenantBearerClient(baseUrl, accessToken, tenantId)` for bearer auth. Both factory helpers set tenant context headers; route workers should not hand-roll tenant headers in multiple places.

## Endpoint And Helper Map

| Need | Design expectation | Current backend | Current `@drts/api-client` helper | Decision for frontend |
|---|---|---|---|---|
| Passenger picker/search | `GET /api/tenant/passengers` | Exists in `tenant-partner.controller.ts` | `listPassengers()` | Safe read-only wiring later. Use fixture first for C workers. |
| Address shortcuts | `GET /api/tenant/addresses` | Exists | `listAddresses()` | Safe read-only wiring later. Use fixture first for C workers. |
| Cost center picker/validity | `GET /api/tenant/cost-centers` | Exists, supports `activeOnly`, `ownerUserId`, `search` | `listCostCenters(options)` and `getCostCenter(code)` | Safe read-only wiring later. Use fixture first for C workers. |
| Tenant quota summary | `GET /api/tenant/quota-summary` or equivalent | Equivalent exists as `GET /api/tenant/quotas` | `getTenantQuotaSummary()` | Adapter decision: map `quota-summary` requirement to `/api/tenant/quotas`; do not add `/quota-summary` in frontend. |
| Cost-center quota summary | Not always named in screen packet, but needed for review | Exists as `GET /api/tenant/cost-centers/:code/quota` | `getCostCenterQuotaSummary(code)` and `getTenantCostCenterQuota(code)` | Safe read-only wiring later if review needs per-cost-center detail. |
| Quota impact preview | `POST /api/tenant/bookings/policy-preview` or equivalent | Equivalent exists as `POST /api/tenant/quotas/preview` | `previewTenantBookingQuotaImpact(options)` | Adapter decision: compose policy preview from quota preview plus approval evaluation. Use fixture first. |
| Approval preview | `POST /api/tenant/bookings/policy-preview` or equivalent | Equivalent exists as `POST /api/tenant/approval-rules/evaluate` | `evaluateApprovalRules(command)` | Adapter decision: no single combined `policy-preview` endpoint today. Use fixture first, then a frontend data adapter can combine both preview calls. |
| Create booking command | `POST /api/tenant/bookings/commands/create` | Exists as `POST /api/tenant/bookings` | `createTenantBooking(command)` | Adapter decision: existing path is the create command endpoint. Do not invent `/commands/create`. |
| Booking history | `GET /api/tenant/bookings`, optional `GET /api/tenant/orders` | Both exist | `listTenantBookings()`, `listTenantOrders(query)` | Safe read-only wiring after fixtures. Prefer `listTenantBookings()` for booking cards; use tenant orders only when order projection is needed. |
| Booking detail | `GET /api/tenant/bookings/:bookingId`, optional `GET /api/tenant/orders/:orderId` | Both exist | `getTenantBooking(bookingId)`, `getTenantOrder(orderId)` | Safe read-only wiring after fixtures. Detail page should keep backend-shaped fixtures until `availableActions` is present. |
| Update booking command | `POST /api/tenant/bookings/:bookingId/commands/update` | Exists as `PUT /api/tenant/bookings/:bookingId` | `updateTenantBooking(bookingId, command)` | Adapter decision: existing `PUT` path is the update command equivalent. Do not invent `/commands/update`. |
| Cancel booking command | `POST /api/tenant/bookings/:bookingId/commands/cancel` | Exists as `POST /api/tenant/bookings/:bookingId/cancel` | `cancelTenantBooking(bookingId, command)` | Adapter decision: existing `/cancel` path is the cancel command equivalent. Do not invent `/commands/cancel`. |
| Approval request status | Needed for approval pending/rejected detail | Exists as `GET /api/tenant/approval-requests` and `GET /api/tenant/approval-requests/:approvalRequestId` | `listApprovalRequests(query)`, `getApprovalRequest(id)` | Safe read-only wiring after booking detail. Use `bookingId` query for lookup. |
| Active trip | Tenant order/trip read endpoints as available | Exists as `GET /api/tenant/trips`; no dedicated `/trip/current` endpoint | `listTenantTrips(query)` | Use fixtures for `/trip` first. Do not invent a current-trip endpoint; later adapter can query trips/orders and select the active candidate. |
| Receipt/outcome | Tenant order/receipt read endpoints as available by channel | No per-booking tenant receipt endpoint found. Billing has `GET /api/tenant/invoices`, `GET /api/tenant/invoices/:invoiceId`, `GET /api/tenant/payables/*` | `listInvoices()`, `listInvoicesRuntime()`, `getTenantPayablesSummary()`, `listTenantPayableLineItems()` | Use receipt fixture/unsupported state first. Do not invent `/api/tenant/receipts/:bookingId`. Wire only after product/backend defines booking-to-artifact ownership. |
| Embed bootstrap | Host-resolved tenant session or signed hand-off token | Generic `POST /api/auth/tenant/bootstrap-session` exists; no enterprise embed hand-off state endpoint found | `createTenantBootstrapSession(command)` plus tenant client factories | Use fixtures for embed identity states. Do not invent host-token validation endpoints in route code. |

## Backend Behavior Notes

`createTenantBooking()` is not just a plain insert. The service resolves passenger/address/cost center, evaluates quota and approval governance, reserves quota, may create approval requests, records audit, emits webhooks/events, and returns an accepted booking handle.

The current create response is narrow: `orderId`, `bookingId`, `serviceBucket`, `businessDispatchSubtype`, `dispatchSemantics`, and `status`. It does not directly return `approvalState` or `approvalRequestIds`. The submitted page should therefore stay fixture-backed until the data adapter deliberately follows up with `getTenantBooking(bookingId)` or `listApprovalRequests({ bookingId })`.

`BookingRecord` includes `approvalState`, `approvalRequestIds`, `complianceGates`, `orderStatus`, `modifiableUntil`, and `cancelableUntil`, but it does not include booking-level `availableActions`. This is the most important true contract gap for the detail page, because the requirements say workers must not derive action authority from status text.

## True Gaps

| Gap | Impact | Minimum safe handling now |
|---|---|---|
| No booking-level `availableActions` on `BookingRecord` | Detail/edit/cancel UI cannot safely know action authority from backend-shaped data | Use fixture records with `availableActions` for C/D UI work. Keep real edit/cancel disabled or behind a backend action descriptor later. |
| No single `bookings/policy-preview` helper/endpoint | Review page needs one combined policy posture, but backend currently splits quota and approval preview | Use a frontend adapter shape over fixtures now. Later compose `previewTenantBookingQuotaImpact()` and `evaluateApprovalRules()`. |
| Create response lacks approval fields | Submitted page cannot show authoritative approval state from create response alone | Use fixture submitted states now. Later follow create with booking detail or approval request lookup. |
| No dedicated current active trip endpoint | `/trip` cannot fetch a single authoritative current ride directly | Use fixture active-trip states now. Later query tenant trips/orders and select active candidate in a central adapter, not in route components. |
| No per-booking receipt endpoint | `/receipts/[bookingId]` cannot assert downloadable receipt ownership | Use `receipt unavailable for this channel` fixture state unless backend defines booking-to-invoice/artifact mapping. |
| No enterprise embed hand-off validation endpoint/state contract | Embed identity states cannot be wired to real host session yet | Keep all embed identity states fixture/config driven. Later wire only through a central embed session adapter. |

## Adapter Decisions, Not Errors

| Design command name | Existing route/helper to call | Notes |
|---|---|---|
| `POST /api/tenant/bookings/commands/create` | `POST /api/tenant/bookings` via `createTenantBooking()` | Existing route accepts `CreateTenantBookingCommand` and performs governance side effects. |
| `POST /api/tenant/bookings/:bookingId/commands/update` | `PUT /api/tenant/bookings/:bookingId` via `updateTenantBooking()` | Existing route accepts `UpdateTenantBookingCommand` and can re-evaluate approval. |
| `POST /api/tenant/bookings/:bookingId/commands/cancel` | `POST /api/tenant/bookings/:bookingId/cancel` via `cancelTenantBooking()` | Existing route calls order cancellation and returns mapped booking. |
| `GET /api/tenant/quota-summary` | `GET /api/tenant/quotas` via `getTenantQuotaSummary()` | Equivalent tenant quota summary. |
| `POST /api/tenant/bookings/policy-preview` | `POST /api/tenant/quotas/preview` plus `POST /api/tenant/approval-rules/evaluate` | Compose in a frontend data adapter only; do not expose invented path strings in route code. |

## Where A-E Workers Should Stay Fixture-Backed

| Worker/slice | Fixture-backed area | Reason |
|---|---|---|
| A scaffold | All data | App target is being created; no API dependency should be introduced. |
| B shell/primitives | Tenant identity, policy reminder counts, active trip summary | Shell can render shape contracts without binding auth/session. |
| C booking flow | Passenger/address/cost center lists, quota preview, approval preview, create submitted states | Preview is split across endpoints and create response is narrow. Keep UI moving without inventing endpoints. |
| D history/detail/trip/receipt | Booking list/detail, timeline, `availableActions`, active trip progress, driver/vehicle/ETA, receipt ready/unsupported | `availableActions`, current trip, and receipt ownership are not fully backed by current booking contract. |
| E gates/embed | Auth required, suspended, approval pending/rejected, quota blocked, no supply, degraded, all embed identity states | Gate copy can be support-safe fixture/config. Embed hand-off endpoint is not defined. |

## Lowest-Risk API Wiring Order

1. Create one Enterprise Dispatch data adapter boundary in the app and keep route components endpoint-free.
2. Wire tenant client creation with `createTenantClient()` or `createTenantBearerClient()`, including `x-tenant-id` from the chosen session/bootstrap source.
3. Wire read-only reference data: `listPassengers()`, `listAddresses()`, `listCostCenters()`, `getTenantQuotaSummary()`, and optionally `getCostCenterQuotaSummary(code)`.
4. Wire read-only booking projections: `listTenantBookings()` and `getTenantBooking(bookingId)`. Keep fixture `availableActions` until backend provides real action descriptors.
5. Wire preview as an adapter-composed `policyPreview`: call `previewTenantBookingQuotaImpact()` and `evaluateApprovalRules()` and normalize the result into one view model.
6. Wire create with `createTenantBooking()`, preserving accepted/pending language. Follow up with `getTenantBooking(bookingId)` or `listApprovalRequests({ bookingId })` before showing authoritative approval state.
7. Wire approval request reads for approval pending/rejected detail pages.
8. Wire update/cancel only after the UI has backend-owned action descriptors or an explicit product decision for action gating.
9. Wire active trip from `listTenantTrips(query)` or tenant orders only in the central adapter; do not add `/trip/current` in route code.
10. Wire receipt/outcome last, and only after backend/product defines a tenant-visible booking-to-receipt or booking-to-artifact contract.

## Verification Notes

- Confirmed existing tenant booking routes in `owned-mobility.controller.ts`: `POST /api/tenant/bookings`, `GET /api/tenant/bookings`, `GET /api/tenant/bookings/:bookingId`, `PUT /api/tenant/bookings/:bookingId`, `POST /api/tenant/bookings/:bookingId/cancel`.
- Confirmed existing tenant partner routes in `tenant-partner.controller.ts`: passengers, addresses, cost centers, quotas, quota preview, approval rule evaluate, approval requests, orders, trips, and service programs.
- Confirmed billing has tenant invoice/payable reads, but no per-booking receipt route.
- Confirmed API client helpers exist for the current backend routes listed above.
- Confirmed this task intentionally did not modify frontend app code, API code, or api-client code.
