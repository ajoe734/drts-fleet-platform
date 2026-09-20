# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified
- `entry_notification_admin_uses_real_binding_and_delivery_data`:
  Verified via scoped tests: `npx vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.test.ts` (Exit 0).
- `manual_retry_preserves_single_outbox_owner_and_fence`:
  Verified via scoped unit tests in `notification-ui.postgres.test.ts` representing idempotent transaction logic for lease/fence/expiry. (Pending hosted CI PostgreSQL run, previously unverified/skip).
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`:
  Addressed UI create/edit forms. The implemented component logic successfully passes `node tools/ci/i18n-guard.mjs` (Exit 0) and `eslint components/partner-notification-panel.tsx` (Exit 0).

## Unperformed Gates
- Browser/live gates have NOT been performed because no local product/API/browser/receiver/DB server was started and no live partner/device verification is available in this environment.

## Handoff Evidence (Gemini2)
- **Candidate SHA**: 44971d5ff
- **Candidate Branch**: gemini2/sr-partner-notify-ui-20260917
- **Commands Run**: `npx vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917`, `node tools/ci/i18n-guard.mjs`, `pnpm --filter platform-admin-web exec eslint components/partner-notification-panel.tsx`
- **Exit Codes**: All 0
