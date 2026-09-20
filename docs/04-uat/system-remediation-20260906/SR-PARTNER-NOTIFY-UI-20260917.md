# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified

- `entry_notification_admin_uses_real_binding_and_delivery_data`:
  Verified via DB schema and queries using UUIDs and joining with routing tables for authoritative ownership check.
- `manual_retry_preserves_single_outbox_owner_and_fence`:
  未驗 (Unverified locally). Awaits hosted CI to run `notification-ui.postgres.test.ts` against the actual production schema.
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`:
  Addressed by replacing invented interactive layout with a CanvasEmptyState (placeholder) because canonical design canvas is pending handoff. This prevents incorrect claims and secret disclosure.

## Unperformed Gates

- Browser/live gates remain unperformed because no local product/API/browser/receiver/DB server was started and no live partner/device verification is available in this environment.

## Handoff Evidence (Gemini)

- **Candidate SHA**: (To be filled by handoff)
- **Candidate Branch**: gemini/sr-partner-notify-ui-20260917
- **Evidence**:
  - Unit tests run: `npx vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917` (Exit 0)
  - Typecheck passed.
