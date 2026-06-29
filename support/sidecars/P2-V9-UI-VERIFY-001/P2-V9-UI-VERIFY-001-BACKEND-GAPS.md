# P2-V9-UI-VERIFY-001 Backend / Runtime Gap Inventory

- Task: `P2-V9-UI-VERIFY-001`
- Date: `2026-06-29`

## 1. Shared dev API still lacks ROC read endpoints for Ops fallback

- Direct API evidence:
  - `GET https://drts-dev-api-waji3fer3a-uc.a.run.app/api/roc/alerts` -> `404`
  - `GET https://drts-dev-api-waji3fer3a-uc.a.run.app/api/roc/trips` -> `404`
- Affected runtime routes:
  - `/av-fallback`
  - `/av-fallback/passenger-recovery/[orderId]`
  - `/av-fallback/sandbox-exceptions`
- Impact:
  - route smoke was completed in this task via the verify-local proxy/stub used by `playwright.v9-ui-verify.config.ts`
  - shared dev backend parity is still blocked until the ROC read endpoints are deployed to the dev API

## 2. Shared dev API does not expose sandbox-governance data endpoints

- Direct API evidence:
  - `GET https://drts-dev-api-waji3fer3a-uc.a.run.app/api/admin/sandbox-governance/experiments` -> `404`
- Affected runtime routes:
  - `/sandbox`
  - `/sandbox/[experimentId]`
  - `/sandbox/suspend`
- Impact:
  - route chrome and screenshots were captured
  - live experiment rows were not available from the shared dev API
  - populated detail-tab parity could not be re-verified against seeded experiment data in this task

## 3. Shared dev API does not expose tenant sandbox-fulfillment projections

- Direct API evidence:
  - `GET https://drts-dev-api-waji3fer3a-uc.a.run.app/api/tenant/bookings/booking-000032/sandbox-fulfillment` with tenant demo headers -> `404`
- Affected runtime routes:
  - `/bookings/av-fallback`
  - `/bookings/[bookingId]/av-fallback`
- Impact:
  - route smoke was completed in this task via the verify-local booking/projection stub used by `playwright.v9-ui-verify.config.ts`
  - live shared-dev backend parity for the tenant fallback list/detail routes remains blocked until the projection endpoint exists upstream

## 4. Referral embed currently resolves generic `fallback_to_web` copy

- Runtime evidence from the current Playwright smoke:
  - `/embed/[entrySlug]?state=handoff&screen=vehicle_change_in_progress`
  - `/embed/[entrySlug]?state=handoff&screen=human_fallback_assigned`
  - `/embed/[entrySlug]?state=handoff&screen=service_continuing`
  - `/embed/[entrySlug]?state=handoff&screen=eta_updated`
    all render the same embedded fallback copy containing `fallback_to_web` / `內嵌服務暫時無法使用`.
- Affected runtime routes:
  - `/embed/[entrySlug]?state=handoff&screen=vehicle_change_in_progress`
  - `/embed/[entrySlug]?state=handoff&screen=human_fallback_assigned`
  - `/embed/[entrySlug]?state=handoff&screen=service_continuing`
  - `/embed/[entrySlug]?state=handoff&screen=eta_updated`
- Impact:
  - route smoke and screenshots were captured
  - current shared dev content/runtime does not expose the screen-specific handoff copy requested by the query params, so this task does not claim referral screen-state parity beyond route availability
