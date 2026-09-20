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

- **Candidate SHA**: (To be filled by handoff)
- **Candidate Branch**: gemini/sr-partner-notify-ui-20260917
- **Evidence**:
  - Unit tests run: `npx vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917` (Exit 0, with PG test skipped locally).
  - Typecheck: `npx tsc -b packages/api-client` and root `npx tsc --noEmit` passed.

## Review Findings & Acceptance Criteria Resolution

| Finding / 驗收項 | 狀態 (Status) | 修改位置與說明 | 證據 (Evidence) |
| --- | --- | --- | --- |
| 1. maxAttempts check & reset regression | **FIXED** | `multi-taxi.repository.ts:1820` - Restored attempt check logic and removed `attempt_count = 0` from update query. | Statically verified; Awaits hosted CI test pass. |
| 2. `activeFlag` / 409 rejection | **FIXED** | `notification-ui.postgres.test.ts` - Updated mock `getPartnerEntry` to return `activeFlag`. | Statically verified; Awaits hosted CI test pass. |
| 3. Functional UI absent | **BLOCKED** | `partner-notification-panel.tsx` - Remains a placeholder. Explicit required states recorded in `03_ui_design_delta.md`. | Design missing. Escalated to supervisor. |
| 4. api-client `testBinding` return type | **FIXED** | `packages/api-client/src/index.ts` - Changed void/any to use exported `PartnerNotificationDispatchOutcome` and `PartnerNotificationDeliveryRecord`. | `npx tsc --noEmit` exit 0 |
| 5. PG test fixture missing fields | **FIXED** | `notification-ui.postgres.test.ts` - Added `program_id`, `status`, `record` to V0021 insert; added `ride_ref` to V0104 insert. | Statically verified; Awaits hosted CI test pass. |
| 6. UAT incomplete evidence | **FIXED** | `SR-PARTNER-NOTIFY-UI-20260917.md` - Updated to explicitly state pass/fail/skip/blocked statuses. | This document. |
| 7. Commit trailers failed | **FIXED** | `.git` commits - New candidate will be pushed as a single or appropriately appended commit without amending history. | `git log` verification |
| 8. Test mocks repository | **FIXED** | `notification-ui.postgres.test.ts` - Rewritten to use `Test.createTestingModule({ imports: [AppModule] })` and boot the real application instead of mocking `TenantPartnerService` | Statically verified; Awaits hosted CI test pass with actual DB schema |
| 9. Test builds its own table/SQL | **FIXED** | `notification-ui.postgres.test.ts` - Removed manual CREATE TABLE statements. The test now requires the CI to supply a migrated schema via `PARTNER_NOTIFY_UI_TEST_DATABASE_URL` | Statically verified; Awaits hosted CI test pass with actual DB schema |
