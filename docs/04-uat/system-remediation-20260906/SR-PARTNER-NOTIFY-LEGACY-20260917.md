# SR-PARTNER-NOTIFY-LEGACY-20260917

## Implementation Summary
- Removed `isWebPushSupported` and `subscribePassengerPush` from `passenger-ride-page.tsx`.
- Removed `PushNotificationPromptMessage` and `PushNotificationPrompt` UI components from `passenger-ride-page.tsx`.
- Deleted `apps/passenger-web/lib/passenger-push-subscription.ts` as it has no other consumers.
- Deleted `apps/passenger-web/public/sw.js` and removed it from `eslint.config.mjs`.
- Cleaned up failing unit tests in `passenger-push-subscription-lifecycle.test.ts` (removed the `PassengerPushDeviceResolver` suite, which was deleted by the TRANSPORT task).
- Verified `multi-taxi-push-subscription-endpoints.test.ts` continues to pass, ensuring WebPushTransport and crypto regression coverage remains intact.
- Confirmed `PassengerPushRepository` is intentionally retained for subscription API compatibility.
- Did not delete VAPID secrets or rewrite completed APIs as per instructions.

## Validation
- `vitest run tests/unit/system-remediation/sr-push-webpush-20260915/` passes successfully.
- Web Push registration UI is no longer present on the passenger ride page.
- `passenger-push-subscription.ts` and `sw.js` are removed, leaving no dead code.

## Eligible Agents Update
- Updated `eligible_agents` to `["Gemini", "Codex"]` immediately before handoff as requested.
