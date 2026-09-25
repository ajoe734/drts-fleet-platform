# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified

- `entry_notification_admin_uses_real_binding_and_delivery_data`:
  - **Status**: PASSED STATIC (Awaiting CI/Live)
  - **Reason**: The `partner-notification-panel.tsx` is implemented following the design canvas (`platform-partner-notify.jsx`) and uses `@drts/ui-tokens` with no raw hex palettes. Fixed R1 by aligning binding events with `partner-passenger-notification.ts` and updating ApiClient.
- `manual_retry_preserves_single_outbox_owner_and_fence`:
  - **Status**: PASSED STATIC (Awaiting CI PG)
  - **Reason**: `multi-taxi.repository.ts` properly uses `ctx.webhook_id` (R2), selects authoritative `o.event_type` and `o.assignment_version` (R3/R4), properly checking lease, readiness, and budget limits before marking a delivery as `requeued`, `terminal`, `notification_expired`, or `endpoint_unavailable` (R4).
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`:
  - **Status**: PASSED STATIC (Awaiting Live)
  - **Reason**: The UI uses terms clarifying endpoint acceptance vs device delivery. No secret disclosure.

## Unperformed Gates

- **Browser/live gates**: UNPERFORMED. No local product/API/browser/receiver/DB server was started and no live partner/device verification is available in this environment.
- **Postgres acceptance**: SKIPPED locally (`ECONNREFUSED` on port 5432). Relies on CI/hosted DB for actual PG execution.

## Handoff Evidence (Gemini)

- **Candidate Branch**: gemini/sr-partner-notify-ui-20260924-canvas
- **Candidate SHA**: (pending commit)
- **Evidence**:
  - Postgres gate: `RUN_UI_PG_GATE=true PARTNER_NOTIFY_UI_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.postgres.test.ts` (SKIPPED/FAILED locally due to no DB connection, awaiting CI)
  - `pnpm exec tsc -p apps/platform-admin-web/tsconfig.json --noEmit --incremental false`: Exit 0
  - `pnpm exec tsc -p tsconfig.json --noEmit --incremental false`: Exit 0

## Review Findings & Acceptance Criteria Resolution

| Finding / 驗收項                      | 狀態 (Status)        | 修改位置與說明                                            | 證據 (Evidence)                                                                                                                 |
| ------------------------------------- | -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| R1. Binding events and ApiClient      | PASSED STATIC        | `partner-notification-panel.tsx`, `api-client/src/index.ts` | Aligned events with `partner-passenger-notification.ts`. Fixed ApiClient return type to `PartnerNotificationDispatchOutcome`. |
| R2. Context webhookId omission        | PASSED STATIC        | `multi-taxi.repository.ts`                                | Changed `ctx.wire_payload?.data?.recipient?.webhookId` to stored context `webhook_id`.                                                                     |
| R3. outbox eventType not selected     | PASSED STATIC        | `multi-taxi.repository.ts`                                | Selected `o.event_type` and `o.assignment_version` and used them instead of missing producer payload fields.                                                                   |
| R4. assignmentVersion/exhausted logic | PASSED STATIC        | `multi-taxi.repository.ts`                                | Used `ctx.wire_payload?.data?.assignmentVersion` or `outbox.assignment_version`. Checks expiry/lease before returning requeued.                                                            |
| R5. PG test fixtures / discovery      | PASSED STATIC        | `notification-ui.postgres.test.ts`, `apps/api/package.json` | Corrected JS string interpolation in fixture inserts (`'{"tenantId": "${tenantId}"}'::jsonb`), added valid wire_payload recipient, and ensured all fixtures are injected.                                                                                  |
| R6. CI env vars and python script     | PASSED STATIC        | `.github/workflows/ci.yml`, `verify...`                   | Restored `PARTNER_NOTIFY_SEQ_TEST_DATABASE_URL` and `PARTNER_NOTIFY_TRANSPORT_TEST_DATABASE_URL` and Python verifier. Added `PARTNER_NOTIFY_UI_TEST_DATABASE_URL`.                                                           |
| R7. UI Design Canvas                  | PASSED STATIC        | `partner-notification-panel.tsx`, `03_ui_design_delta.md` | Verified UI implementation aligns with `platform-partner-notify.jsx` using `@drts/ui-web` primitives and tokens instead of raw palettes. Updated design delta doc.         |
| R8. UAT false claims                  | PASSED STATIC        | `SR-PARTNER-NOTIFY-UI-20260917.md`                        | Corrected this artifact with actual commands, removed false React Testing Library claims, and explicitly stated skipped test conditions. |
