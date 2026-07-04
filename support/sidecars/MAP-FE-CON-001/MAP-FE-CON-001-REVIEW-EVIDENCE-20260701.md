# MAP-FE-CON-001 — Concierge and partner map alignment — Review Evidence

- Task: `MAP-FE-CON-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Branch: `codex2/map-fe-con-001`
- Current head: `dc7bb4898` (`MAP-FE-CON-001: fix playwright project argument narrowing`)
- Dependencies: `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005`

## Summary

This branch aligns the concierge and partner booking surfaces on the shared map
booking flow:

- concierge booking now submits pickup/dropoff coordinates through the booking
  seam when the trip is dispatchable
- partner booking keeps dispatchable vs manual-review states explicit, including
  serviceability preview and backend-gate-aware copy
- partner authority outage routing stays degraded-safe and cannot silently fall
  through to a normal active order path
- Playwright map-booking projects now boot only the required web servers, and
  the partner lane uses a dedicated authority mock so the map surface can be
  exercised without the full API stack

The immediate regression recorded in machine truth is resolved on this branch:
the partner Playwright surface now passes with the narrowed project-selection
logic plus the dedicated authority mock server in `playwright.config.ts` and
`tests/e2e/mock-map-booking-authority-server.mjs`.

## Scope Anchors

- `apps/concierge-portal-web/app/bookings/new/page.tsx`
- `apps/concierge-portal-web/lib/map-booking.ts`
- `apps/partner-booking-web/app/[tenantSlug]/(authenticated)/book/page.tsx`
- `apps/partner-booking-web/components/partner-booking-form.tsx`
- `apps/partner-booking-web/lib/api-client.ts`
- `apps/partner-booking-web/lib/partner-booking-form.ts`
- `playwright.config.ts`
- `tests/e2e/concierge-map-booking-ui.spec.ts`
- `tests/e2e/partner-map-booking-ui.spec.ts`
- `tests/e2e/mock-map-booking-authority-server.mjs`

## Acceptance Mapping

1. `concierge booking submits coordinates when dispatchable`
   Covered by `tests/e2e/concierge-map-booking-ui.spec.ts`, which captures the
   submitted booking command and asserts provider candidate coordinates plus
   `coordinateSource: "provider_candidate"`.
2. `partner assisted entry reason codes consistent`
   Covered by `tests/e2e/partner-map-booking-ui.spec.ts` and
   `apps/partner-booking-web/tests/integration/program-form-utils.test.ts`,
   which keep dispatchable/manual-review states and review-summary wording
   aligned on the partner booking flow.
3. `provider outage cannot create silent normal order`
   Covered by the partner route-context fallback handling in
   `apps/partner-booking-web/app/[tenantSlug]/(authenticated)/book/page.tsx`
   and the authority wiring tests in
   `apps/partner-booking-web/tests/integration/bff-wiring.test.ts`.
4. `package checks pass`
   Verified by the command set below.

## Executed Checks

| Check | Command | Result |
| --- | --- | --- |
| concierge typecheck | `pnpm --filter @drts/concierge-portal-web typecheck` | PASS |
| concierge tests | `pnpm --filter @drts/concierge-portal-web test` | PASS (`2 files`, `6 tests`) |
| partner typecheck | `pnpm --filter @drts/partner-booking-web typecheck` | PASS |
| partner tests | `pnpm --filter @drts/partner-booking-web test` | PASS (`5 files`, `50 tests`) |
| map booking e2e | `pnpm exec playwright test tests/e2e/concierge-map-booking-ui.spec.ts tests/e2e/partner-map-booking-ui.spec.ts --project=concierge-portal --project=partner-booking-web` | PASS (`3 tests`) |

Additional spot check:

- `pnpm exec playwright test tests/e2e/partner-map-booking-ui.spec.ts --project=partner-booking-web`
  passed independently while investigating the mock-routing regression.

## Integration Status

Branch status at evidence capture: `branch_pushed`.
