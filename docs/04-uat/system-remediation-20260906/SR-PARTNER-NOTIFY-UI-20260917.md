# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified

- `entry_notification_admin_uses_real_binding_and_delivery_data`:
  - **Status**: UNVERIFIED (Awaits Design Handoff).
  - **Reason**: Replaced the invented UI layout with a placeholder per the design contract because the canonical canvas is missing. The API and client side are fully implemented using functional html inputs.
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
  - `pnpm run build`: Exit 0
  - `pnpm run test`: Exit 0

## Review Findings & Acceptance Criteria Resolution

| Finding / 驗收項                      | 狀態 (Status)        | 修改位置與說明                                            | 證據 (Evidence)                                                                                                                 |
| ------------------------------------- | -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Functional UI absent, CanvasInput  | PASS                 | `partner-notification-panel.tsx`                          | Replaced CanvasInput with standard HTML \`<input>\` utilizing \`formInputStyle\` from governance-form-styles to provide a functional editable control within the placeholder. |
| 2. Hardcoded eventTypes=["*"]         | PASS                 | `partner-notification-panel.tsx`                          | Updated update payload to use existing `binding.eventTypes` or default 5 passenger event types.                                                                     |
| 3. COALESCE combines UUID with text   | PASS                 | `multi-taxi.repository.ts:1743`                           | Casted explicitly to `::uuid`.                                                                                                  |
| 4. Missing route fields / payload     | PASS                 | `multi-taxi.repository.ts`                                | Joined `phase1_order_partner_notification_routes` in list and retry.                                                            |
| 5. tenantId/partnerId ownership check | PASS                 | `multi-taxi.repository.ts`                                | Filter/reject historical ownership mismatches.                                                                                  |
| 6. Manual retry budget, readiness     | PASS                 | `multi-taxi.repository.ts`                                | Added maxAttempts check, readiness facade verification, supersession.                                                           |
| 7. fetchState infinite loop, 409      | PASS                 | `partner-notification-panel.tsx`                          | Removed error from dependency array, used `statusCode` instead of `status` for ApiClientError, explicit refetch on 409.         |
| 8. Postgres test fixtures & env var   | SKIP (Awaits CI)     | `notification-ui.postgres.test.ts`                        | Lint and missing phase1_owned_orders fixture fixed. PG tests left skipped locally, wired into CI package.json integration test. |
| 9. UAT claims/ApiClient tests         | PASS                 | `notification-ui.test.tsx`                                | Added real component tests using React Testing Library to verify UI behavior on 409 conflicts and 404 absence.                  |
| 10. Incidental Scope changes / UI     | PASS                 | `translations.ts`, `partner-notification-panel.tsx`       | Kept CanvasBanner placeholder. Added translated enum keys for binding/stage/failure labels instead of raw strings.              |

## Handoff Evidence (Gemini Verified)

- **Verifier**: Gemini
- **Action**: Confirmed local build and tests pass for Gemini2's fixes. Verified absence of out-of-scope scratch files.
- **Evidence**:
  - `pnpm build`: Exit 0
  - `pnpm test`: Exit 0
