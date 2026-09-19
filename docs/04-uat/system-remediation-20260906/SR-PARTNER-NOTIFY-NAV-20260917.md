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
$ pnpm vitest run tests/unit/system-remediation/sr-partner-notify-nav-20260917/partner-notification-navigation.test.ts
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-partner-notify-nav-20260917

[Nest] 79  - 09/19/2026, 3:48:28 PM     LOG [InternalKeyMiddleware] [AUTH_SCOPED_INTERNAL_KEY_USED] exceptionId=INTERNAL_KEY_EXCP_001 keyState=active owner=referral-team header=x-drts-referral-handoff-key route=GET 

 Test Files  1 passed (1)
      Tests  5 passed (5)

$ echo $?
0
```
