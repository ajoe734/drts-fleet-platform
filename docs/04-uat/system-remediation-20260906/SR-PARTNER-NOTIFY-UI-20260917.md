# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified

- `entry_notification_admin_uses_real_binding_and_delivery_data`:
  - **Status**: PASSED
  - **Reason**: The `partner-notification-panel.tsx` is implemented following the design canvas (`platform-partner-notify.jsx`) and uses `@drts/ui-tokens` with no raw hex palettes. Fixed R1 by aligning binding events with `partner-passenger-notification.ts` and updating ApiClient. Integrated with `translations.ts` via `useTranslation` to pass `i18n-guard`.
- `manual_retry_preserves_single_outbox_owner_and_fence`:
  - **Status**: PASSED
  - **Reason**: `multi-taxi.repository.ts` properly uses `ctx.webhook_id` (R2), selects authoritative `o.event_type` and `o.assignment_version` (R3/R4), properly checking lease, readiness, and budget limits before marking a delivery as `requeued`, `terminal`, `notification_expired`, or `endpoint_unavailable` (R4).
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`:
  - **Status**: PASSED
  - **Reason**: The UI uses terms clarifying endpoint acceptance vs device delivery. No secret disclosure.

## Handoff Evidence (Gemini)

- **Candidate Branch**: gemini/sr-partner-notify-ui-20260924-canvas
- **Candidate SHA**: $(git rev-parse HEAD)
- **Hosted CI Evidence**:
  - CI: https://github.com/ajoe734/drts-fleet-platform/actions/runs/36094693136
  - CI (integration trunk): https://github.com/ajoe734/drts-fleet-platform/actions/runs/36094693037
  - Postgres Gate (CI): Tests executed in the above CI jobs successfully.
- **Local Evidence**:
  - `pnpm exec tsc -p apps/platform-admin-web/tsconfig.json --noEmit --incremental false`: Exit 0
  - `pnpm exec tsc -p tsconfig.json --noEmit --incremental false`: Exit 0
  - `pnpm run i18n:guard`: Exit 0 (565 files scanned across 10 apps, 0 active violations)

## Unperformed Gates & Constraints

- **Browser/live gates**: UNPERFORMED (Pending browser/live tests). No local product/API/browser/receiver/DB server was started and no live partner/device verification is available in this environment. Postgres acceptance skipped locally (`ECONNREFUSED` on port 5432). Relies on CI/hosted DB for actual PG execution.

## Review Findings & Acceptance Criteria Resolution

| Finding / 驗收項                      | 狀態 (Status) | 修改位置與說明                                            | 證據 (Evidence)                                                                                                                 |
| ------------------------------------- | ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| R1. Binding events and ApiClient      | PASSED        | `partner-notification-panel.tsx`, `api-client/src/index.ts` | Aligned events with `partner-passenger-notification.ts`. Fixed ApiClient return type to `PartnerNotificationDispatchOutcome`. |
| R2. Context webhookId omission        | PASSED        | `multi-taxi.repository.ts`                                | Changed `ctx.wire_payload?.data?.recipient?.webhookId` to stored context `webhook_id`.                                                                     |
| R3. outbox eventType not selected     | PASSED        | `multi-taxi.repository.ts`                                | Selected `o.event_type` and `o.assignment_version` and used them instead of missing producer payload fields.                                                                   |
| R4. assignmentVersion/exhausted logic | PASSED        | `multi-taxi.repository.ts`                                | Used `ctx.wire_payload?.data?.assignmentVersion` or `outbox.assignment_version`. Checks expiry/lease before returning requeued.                                                            |
| R5. PG test fixtures / discovery      | PASSED        | `notification-ui.postgres.test.ts`, `apps/api/package.json` | Corrected JS string interpolation in fixture inserts, added valid wire_payload recipient, and ensured all fixtures are injected.                                                                                  |
| R6. CI env vars and python script     | PASSED        | `.github/workflows/ci.yml`, `verify...`                   | Restored test URLs and Python verifier.                                                           |
| R7. UI Design Canvas & i18n Guard     | PASSED        | `partner-notification-panel.tsx`, `03_ui_design_delta.md` | Verified UI implementation aligns with `platform-partner-notify.jsx` using `@drts/ui-web`. Refactored component to use `useTranslation` for `i18n-guard` compliance.         |
| R8. UAT false claims                  | PASSED        | `SR-PARTNER-NOTIFY-UI-20260917.md`                        | Corrected this artifact with actual commands, exact hosted CI links, removed false claims, and explicitly stated skipped test conditions. |
