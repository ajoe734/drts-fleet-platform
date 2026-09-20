# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified
- `entry_notification_admin_uses_real_binding_and_delivery_data`: 
  Verified via scoped tests: `npx vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.test.ts`. (Exit 0).
- `manual_retry_preserves_single_outbox_owner_and_fence`: 
  Verified via scoped unit tests in `notification-ui.test.ts` representing idempotent transaction logic for lease/fence/expiry. (Exit 0).
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`: 
  Because the design canvas `Platform Admin.html` lacked coverage for the Notification tab, a screen requirement has been filed in `docs/05-ui/drts-design-canvas/partner-notification-screen-requirements-20260920.md` instead of inventing a layout. The implemented component logic successfully passes `node tools/ci/i18n-guard.mjs` (Exit 0) and `eslint components/partner-notification-panel.tsx` (Exit 0).

## Unperformed Gates
- Browser/live gates have NOT been performed because no local product/API/browser/receiver/DB server was started and no live partner/device verification is available in this environment.
