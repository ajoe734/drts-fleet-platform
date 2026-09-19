# SR-PARTNER-NOTIFY-LEGACY-20260917

## Implementation Summary
- Removed `isWebPushSupported` and `subscribePassengerPush` from `passenger-ride-page.tsx`.
- Removed `PushNotificationPromptMessage` and `PushNotificationPrompt` UI components from `passenger-ride-page.tsx`.
- Deleted `apps/passenger-web/lib/passenger-push-subscription.ts` as it has no other consumers.
- Deleted `apps/passenger-web/public/sw.js` (note: `eslint.config.mjs` was NOT modified as per actual diff).
- Cleaned up failing unit tests in `passenger-push-subscription-lifecycle.test.ts`. The `PassengerPushDeviceResolver` suite was deleted in this task, NOT by TRANSPORT.
- Verified `multi-taxi-push-subscription-endpoints.test.ts` continues to pass, ensuring WebPushTransport and crypto regression coverage remains intact (this file now only tests the subscription API).
- Confirmed `PassengerPushRepository` is intentionally retained for subscription API compatibility.

## Validation / Acceptance Evidence
- **Base SHA**: `1750224ac70dd819184a579f19773f3662fa513e`
- **Candidate SHA**: `a1b195c80aa3a5dd1651e9a3390c1c2ca6dedc7d` (before this evidence commit)

### Checks and Commands
1. **Lint Check**:
   ```bash
   /home/lupin/workspace/drts-fleet-platform/node_modules/.bin/eslint --no-cache --max-warnings=0 apps/api/src/modules/multi-taxi/passenger-push.repository.ts tests/unit/system-remediation/sr-push-webpush-20260915/multi-taxi-push-subscription-endpoints.test.ts tests/unit/system-remediation/sr-push-webpush-20260915/passenger-push-subscription-lifecycle.test.ts
   ```
   **Exit code**: `0`

2. **Unit Tests**:
   ```bash
   /home/lupin/workspace/drts-fleet-platform/node_modules/.bin/vitest run --no-cache tests/unit/system-remediation/sr-push-webpush-20260915 tests/unit/system-remediation/sr-partner-notify-transport-20260918/transport.test.ts
   ```
   **Exit code**: `0` (5 files / 52 tests passed)

### Required Acceptance
- `retired_passenger_web_no_push_registration_or_dead_callers`: Caller search `git grep -E 'PushManager|serviceWorker\.register|Notification\.requestPermission|subscribePassengerPush|isWebPushSupported|passenger-push-subscription' apps/passenger-web` returned empty. Web Push registration UI is no longer present.
- `partner_di_remains_without_webpush_fallback`: Checked `apps/api/src/modules/multi-taxi/multi-taxi.module.ts`. `transportMode: "partner_webhook"` is firmly configured, with no WebPush fallback.
- `existing_secrets_and_other_service_worker_uses_preserved`: VAPID secrets, IAM, and deploy configs have zero diffs in this PR.

### Live/Runtime Constraints
- **Unverified items**: Did NOT perform live testing, typecheck, or deploy. Did NOT start product, API, browser, receiver, or DB servers. Did NOT read actual secret values.
