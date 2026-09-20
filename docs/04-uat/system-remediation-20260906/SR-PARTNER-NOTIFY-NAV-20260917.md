# UAT: SR-PARTNER-NOTIFY-NAV-20260917

## Scope
Validate the partner notification navigation resolution API and embed BFF redirection logic.

## Acceptance Criteria

### 1. entry_scoped_navigation_denies_cross_subject_tenant_entry
- **Scenario:** Partner backend calls `POST /api/partner/entries/{entrySlug}/notification-navigation/resolve` with a valid `rideRef` but a mismatched `partnerUserRef` or wrong `entrySlug`.
- **Expected:** API returns 403 Forbidden with a generic "invalid or expired" message to prevent enumeration.

### 2. fresh_single_use_handoff_and_http_only_session_reuse
- **Scenario:** Partner backend resolves navigation successfully. The returned `destinationUrl` is opened in a client webview.
- **Expected:** The BFF route `/api/referral/notification-navigation` consumes the single-use artifact, establishes a fresh HttpOnly session cookie, and issues a 302 redirect to the embed page. A second request with the same artifact fails.

### 3. navigation_reads_current_trip_without_creating_orders
- **Scenario:** The passenger's client webview loads the redirected embed page.
- **Expected:**
  - If the trip is active (e.g., driver_assigned), the screen renders the live tracking view.
  - If the trip is completed/cancelled, the screen renders the receipt or history view.
  - No new order is automatically created during this navigation flow.

## Test Evidence
```bash
$ CANDIDATE_SHA=$(git rev-parse HEAD)
$ echo $CANDIDATE_SHA
23c36751c23168dd85085e01c709d10213bcbc13

$ pnpm --filter @drts/api typecheck
Done in 2.1s

$ pnpm vitest run tests/unit/system-remediation/sr-partner-notify-nav-20260917/partner-notification-navigation.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ pnpm vitest run tests/integration/sr-partner-notify-nav-20260917.integration.test.ts
 Test Files  1 passed (1)
      Tests  1 passed (1)
```
