# ENT-DISP-FE-20260612 Tenant API Gap Map

## Scope

This app remains a shell-only UI until an Enterprise Dispatch design canvas exists, but its authority consumption can still be made explicit and testable.

## `/api/tenant/*` wiring map

| Lane | Status | Authority route(s) | App-local adapter | Note |
|---|---|---|---|---|
| Booking intake | wired | `POST /api/tenant/bookings` | `adaptBookingFixtureToCreateCommand()` -> `createTenantBooking()` | Enterprise Dispatch fixture data maps cleanly onto the canonical tenant booking command with subtype `enterprise_dispatch`. |
| Gate state | derived | `GET /api/tenant/bookings/:bookingId` | `summarizeBookingGates()` | No dedicated tenant gate endpoint is present in `@drts/api-client`; gate/readiness state comes from `BookingRecord.complianceGates`. |
| Embed | unsupported | none | `resolveDispatchEmbedDisposition()` | Phase 1 cross-app movement is deep-link based (`CrossAppResourceLink`), not embedded sub-apps. The adapter therefore blocks embed mode and returns a fallback deep link only. |

## Test evidence

- Unit: `apps/enterprise-dispatch-web/tests/unit/dispatch-fixture-adapter.test.ts`
- Smoke: `apps/enterprise-dispatch-web/tests/smoke/tenant-contract-wiring.test.ts`
