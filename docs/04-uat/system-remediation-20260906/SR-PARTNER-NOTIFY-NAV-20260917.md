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

All acceptance criteria are proven via tests running in the GitHub-hosted CI pipeline (with PostgreSQL and BFF access). The candidate commit (see Git SHA of this PR) must produce `exit 0` for these jobs.

```bash
# 1. Integration Tests for Route Resolution (Cross-Tenant & Positive Cases with Seeded Ownership)
$ npx vitest run tests/integration/sr-partner-notify-nav-20260917.integration.test.ts
...
 Test Files  1 passed (1)
      Tests  2 passed (2)

# 2. Unit Tests for BFF Session Management (Single-use artifact, HttpOnly cookie, account boundary)
$ npx vitest run tests/unit/system-remediation/sr-partner-notify-nav-20260917/notification-navigation-route.test.ts
...
 Test Files  1 passed (1)
      Tests  5 passed (5)

# 3. Component Dependencies / Controller Lifecycles
$ npx vitest run tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/appmodule-tenant-binding.test.ts
$ npx vitest run apps/api/tests/integration/int-iam-prt-001-partner-credential-lifecycle.test.ts
...
 Test Files  2 passed (2)
```

**Note:** The integration test `tests/integration/sr-partner-notify-nav-20260917.integration.test.ts` includes seeded ownership positive/negative lookup tests for null-tenant multi-taxi orders, checking the correct PG fixtures.
The tests in `int-iam-prt-001-partner-credential-lifecycle.test.ts` and `appmodule-tenant-binding.test.ts` were updated to successfully inject the required controller dependencies.
