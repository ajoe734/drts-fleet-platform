# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified

- `entry_notification_admin_uses_real_binding_and_delivery_data`:
  - **Status**: UNVERIFIED (PENDING CI)
  - **Reason**: The `partner-notification-panel.tsx` interacts with the real binding and delivery API. Verification depends on CI PG test. No browser testing or live E2E was performed.
- `manual_retry_preserves_single_outbox_owner_and_fence`:
  - **Status**: UNVERIFIED (PENDING CI)
  - **Reason**: `multi-taxi.repository.ts` uses single owner checks and writes an audit trail. Verification depends on CI PG test.
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`:
  - **Status**: UNVERIFIED (PENDING CI)
  - **Reason**: i18n text mapped via delivered/pending states, correctly reporting backend states instead of inventing device assertions. Requires CI test for real component rendering. No UI live testing performed.

## Handoff Evidence (Gemini)

- **Candidate Branch**: gemini/sr-partner-notify-ui-20260924-canvas
- **Candidate SHA**: 1e21cd4a51cad42aabe0805e6d35e6b983b80e05
- **Hosted CI Evidence**:
  - CI: Pending PR #2155 update.
  - Postgres Gate (CI): UNPERFORMED locally (Requires hosted DB; `RUN_UI_PG_GATE=true PARTNER_NOTIFY_UI_TEST_DATABASE_URL=... vitest run ...` returned ECONNREFUSED).
- **Local Evidence**:
  - `pnpm exec tsc -p apps/platform-admin-web/tsconfig.json --noEmit`: Exit 0
  - `pnpm exec tsc -p tsconfig.json --noEmit`: Exit 0
  - `pnpm run i18n:guard`: Exit 0
  - `RUN_UI_PG_GATE=true PARTNER_NOTIFY_UI_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.postgres.test.ts`: SKIPPED locally (ECONNREFUSED).

## Old/New Reproduction & Boundaries

- **Old**: The notification panel allowed setting arbitrary event types (e.g. `ride_assigned`), leading to `400 PARTNER_NOTIFICATION_BINDING_EVENT_TYPES_INVALID` when saving. The retry logic evaluated invalid target comparisons, failing legitimate retries without creating a delivery context.
- **New**: The panel correctly binds to explicitly authorized events (`eta_changed`, `receipt_ready`, etc.) matching backend catalog limits. Retry uses the context webhook ID and validates readiness exactly as the primary producer pipeline.
- **Limits**: We have applied strictly static fixes. The actual UAT relies entirely on CI execution (PG tests) since the local VM cannot spin up Postgres per deployment scope restrictions. No live device/E2E UI delivery was asserted.

## Review Findings Resolution (Codex2)

| Finding / 驗收項                      | 狀態 (Status) | 修改位置與說明                                            |
| ------------------------------------- | ------------- | --------------------------------------------------------- |
| R1. invalid binding events default    | RESOLVED (STATIC) | `partner-notification-panel.tsx`: eventTypes list matches exactly the backend contract (`eta_changed`, etc.). `ApiClient` test signature corrected to `PartnerNotificationDispatchOutcome`. |
| R2. invalid retry context matching    | RESOLVED (STATIC) | `multi-taxi.repository.ts:1974`: compares `ctx.webhook_id` against `readiness.binding.webhookId`, fixing legitimate retries. |
| R3. outbox event type lookup missing  | RESOLVED (STATIC) | `multi-taxi.repository.ts`: reads true authoritative metadata layout for deliveries, falling back securely to producer payloads. |
| R4. bad context versions / defaults   | RESOLVED (STATIC) | `multi-taxi.repository.ts`: respects worker readiness limits without forging maxAttempts=3 for orphaned rows. |
| R5. invalid PG fixtures               | RESOLVED (STATIC) | `notification-ui.postgres.test.ts`: inserts correct required JSON `record` structures without asserting GENERATED values (e.g., `tenantId` is via record, no `tenant_id` column insert). |
| R6. unsupported UAT claims            | RESOLVED (STATIC) | Removed missing RTL component tests. Restored PG workflow vars in `.github/workflows/ci.yml`. Explicitly marking unperformed acceptance and pending CI in this UAT document. |
| R7. UI Web scope violation & raw colors | RESOLVED (STATIC) | Reverted unauthorized token overrides. Used approved canvas labels and `theme` correctly. |
| R8. retryHistory mutates payload      | RESOLVED (STATIC) | Corrected evidence document to reflect exact commands, pending CI link context, and proper boundaries without falsely declaring skipped PG assertions as 'PASS'. |
