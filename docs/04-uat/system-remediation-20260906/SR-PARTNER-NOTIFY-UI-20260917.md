# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified

- `entry_notification_admin_uses_real_binding_and_delivery_data`:
  - **Status**: NOT MET (Blocked by design handoff).
  - **Reason**: The functional UI is missing. `partner-notification-panel.tsx` is currently a placeholder because canonical design canvas is pending handoff. Awaiting explicit screen requirements approval and design implementation.
- `manual_retry_preserves_single_outbox_owner_and_fence`:
  - **Status**: UNVERIFIED LOCALLY (Awaits hosted CI).
  - **Reason**: The database logic is implemented in `multi-taxi.repository.ts`, but this requires running `notification-ui.postgres.test.ts` against the actual production schema which is only available in hosted CI.
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`:
  - **Status**: UNVERIFIED (Blocked by design handoff).
  - **Reason**: Current placeholder claims no device receipt and discloses no secret, but the required states do not exist yet. Cannot be fully verified until functional UI is implemented based on design.

## Unperformed Gates

- **Browser/live gates**: Unperformed. No local product/API/browser/receiver/DB server was started and no live partner/device verification is available in this environment.
- **Postgres acceptance**: Unperformed locally. `notification-ui.postgres.test.ts` was skipped locally due to missing database connection.

## Handoff Evidence (Gemini)

- **Candidate SHA**: (See commit SHA)
- **Candidate Branch**: gemini/sr-partner-notify-ui-20260917-successor
- **Evidence**:
  - Unit tests run: `npx vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917` (Exit 0, with PG test skipped locally).
  - Typecheck: `npx tsc -b packages/api-client` and root `npx tsc --noEmit` passed.

## Review Findings & Acceptance Criteria Resolution

| Finding / 驗收項 | 狀態 (Status) | 修改位置與說明 | 證據 (Evidence) |
| --- | --- | --- | --- |
| 1. Form uses CanvasInput incorrectly | **FIXED** | `partner-notification-panel.tsx` | Restored to a valid placeholder awaiting design. |
| 2. Hardcoded eventTypes=["*"] | **FIXED** | `partner-notification-panel.tsx` | Code removed in placeholder. |
| 3. COALESCE combines UUID with text | **FIXED** | `multi-taxi.repository.ts:1739` | Aliased as bindingId and bindingVersion correctly. |
| 4. Missing route fields / payload | **FIXED** | `multi-taxi.repository.ts` | Added LEFT JOIN to `phase1_order_partner_notification_routes`. |
| 5. tenantId/partnerId ownership check | **FIXED** | `multi-taxi.repository.ts` | Added COALESCE checks for tenant_id and partner_id. |
| 6. Manual retry logic issues | **FIXED** | `multi-taxi.repository.ts` | Added FOR UPDATE, verified pending status, and fixed requeue logic. |
| 7. fetchState infinite loop | **FIXED** | `partner-notification-panel.tsx` | Code removed in placeholder. |
| 8. Postgres test fixtures & env var | **FIXED** | `notification-ui.postgres.test.ts` | Added fallback to DATABASE_URL and fixed TS error for import.meta. |
| 9. UAT claims/ApiClient tests | **FIXED** | `notification-ui.test.ts` & UAT | Added ApiClient tests; UAT updated with proper status and evidence. |
| 10. Invented UI design | **FIXED** | `partner-notification-panel.tsx` | Replaced invented layout with CanvasEmptyState placeholder. |
| 11. Delivery gates & scratch files | **FIXED** | Removed scratch scripts | Removed `patch_translations.py` and `replace_repo.py`. |
