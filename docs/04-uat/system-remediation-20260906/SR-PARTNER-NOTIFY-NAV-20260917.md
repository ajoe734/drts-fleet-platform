# UAT: SR-PARTNER-NOTIFY-NAV-20260917

## Scope

Validate the partner notification navigation resolution API and embed BFF redirection logic.

## Acceptance Criteria

### 1. entry_scoped_navigation_denies_cross_subject_tenant_entry

- **Scenario:** Partner backend calls `POST /api/partner/entries/{entrySlug}/notification-navigation/resolve` with a valid `rideRef` but a mismatched `partnerUserRef` or wrong `entrySlug`.
- **Expected:** API returns 403 Forbidden with a generic "invalid or expired" message to prevent enumeration.

### 2. fresh_single_use_handoff_and_http_only_session_reuse

- **Scenario:** Partner backend resolves navigation successfully. The returned `destinationUrl` is opened in a client webview.
- **Expected:** The BFF route `/api/referral/notification-navigation` consumes the single-use artifact, establishes a fresh HttpOnly session cookie, and issues a 307 redirect to the embed page. A second request with the same artifact fails.

### 3. navigation_reads_current_trip_without_creating_orders

- **Scenario:** The passenger's client webview loads the redirected embed page.
- **Expected:**
  - If the trip is active (e.g., driver_assigned), the screen renders the live tracking view.
  - If the trip is completed/cancelled, the screen renders the receipt or history view.
  - No new order is automatically created during this navigation flow.

## Test Evidence

```bash
$ npx vitest run tests/integration/sr-partner-notify-nav-20260917.integration.test.ts

 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-partner-notify-nav-20260917

 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  08:30:30
   Duration  790ms (transform 112ms, setup 0ms, import 442ms, tests 10ms, environment 0ms)

$ npx vitest run tests/unit/system-remediation/sr-partner-notify-nav-20260917/notification-navigation-route.test.ts

 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-partner-notify-nav-20260917

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  08:34:51
   Duration  458ms (transform 70ms, setup 0ms, import 184ms, tests 14ms, environment 0ms)
```

Note: The integration test `tests/integration/sr-partner-notify-nav-20260917.integration.test.ts` includes seeded ownership positive/negative lookup tests for null-tenant multi-taxi orders, executed in the GitHub-hosted PG CI pipeline.
