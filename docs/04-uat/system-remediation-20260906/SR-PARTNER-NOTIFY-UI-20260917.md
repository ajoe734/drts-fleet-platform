# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified

- `entry_notification_admin_uses_real_binding_and_delivery_data`:
  - **Status**: UNVERIFIED (Awaits Design Handoff).
  - **Reason**: Replaced the invented UI layout with a placeholder per the design contract because the canonical canvas is missing. The API and client side are fully implemented.
- `manual_retry_preserves_single_outbox_owner_and_fence`:
  - **Status**: UNVERIFIED (Awaits hosted CI).
  - **Reason**: The database logic (`multi-taxi.repository.ts`) implements retry budget (`attempt_count >= maxAttempts`), readiness/ownership checks (via `PartnerNotificationDispatchFacade.resolveNotificationRoute`), and relevance checking, with audit logs appended to `retryHistory`. Real PG verification is skipped locally.
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`:
  - **Status**: UNVERIFIED (Awaits Design Handoff).
  - **Reason**: Cannot be tested locally without an approved UI design.

## Unperformed Gates

- **Browser/live gates**: UNPERFORMED. No local product/API/browser/receiver/DB server was started and no live partner/device verification is available in this environment.
- **Postgres acceptance**: SKIP locally. `notification-ui.postgres.test.ts` skipped locally due to missing `PARTNER_NOTIFY_UI_TEST_DATABASE_URL`. Will run in CI.

## Handoff Evidence (Gemini)

- **Candidate Branch**: gemini/sr-partner-notify-ui-20260917
- **Candidate SHA**: (Will be recorded by Orchestrator on push)
- **Evidence**:
  - `pnpm run -F @drts/api-client typecheck`: Exit 0
  - `pnpm run lint`: Exit 0

## Review Findings & Acceptance Criteria Resolution

| Finding / 驗收項 | 狀態 (Status) | 修改位置與說明 | 證據 (Evidence) |
| --- | --- | --- | --- |
| 1. Functional UI absent, CanvasInput | STOP (Awaits Design) | `partner-notification-panel.tsx` | Replaced invented layout with placeholder banner. |
| 2. Hardcoded eventTypes=["*"] | STOP (Awaits Design) | `partner-notification-panel.tsx` | Removed from placeholder. |
| 3. COALESCE combines UUID with text | PASS | `multi-taxi.repository.ts:1743` | Casted explicitly to `::uuid`. |
| 4. Missing route fields / payload | PASS | `multi-taxi.repository.ts` | Joined `phase1_order_partner_notification_routes` in list and retry. |
| 5. tenantId/partnerId ownership check | PASS | `multi-taxi.repository.ts` | Filter/reject historical ownership mismatches. |
| 6. Manual retry budget, readiness | PASS | `multi-taxi.repository.ts` | Added maxAttempts check, readiness facade verification, supersession. |
| 7. fetchState infinite loop, 409 | STOP (Awaits Design) | `partner-notification-panel.tsx` | Removed from placeholder. |
| 8. Postgres test fixtures & env var | SKIP (Awaits CI) | `notification-ui.postgres.test.ts` | Lint fixed. PG tests left skipped locally, wired into CI package.json integration test. |
| 9. UAT claims/ApiClient tests | PASS | `SR-PARTNER-NOTIFY-UI-20260917.md` | UAT updated to reflect actual status (skip/unverified). |
| 10. Incidental Scope changes / UI | PASS | `03_ui_design_delta.md`, `partner-notification-panel.tsx` | Invented layout removed, replaced with placeholder. Canvas gap handed off. |
