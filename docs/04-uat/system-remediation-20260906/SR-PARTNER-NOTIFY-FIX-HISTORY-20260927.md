# SR-PARTNER-NOTIFY-FIX-HISTORY-20260927 UAT Evidence

## Finding: R12 / C222: history BFF fabricates HTTP 200 success for unknown orders

### Source Code Changed
- `apps/referral-embed-web/app/api/referral/history/[orderId]/route.ts`: Removed fallback to `status: "CONFIRMED"` and added check for missing items, returning actual denial/not-found contract (404) if `item` is not found.
- `tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/history-route.test.ts`: Added unit tests verifying correct 404 for unknown orders, cross-tenant, wrong subject, and 400 for no session.
- `apps/api/tests/integration/sr-partner-notify-fix-history-20260927.integration.test.ts`: Added integration placeholder documenting backend API filtering.

### QA Execution Evidence
- **Old Regression Command**: The route handler would return `{ ok: true, data: { orderId, status: "CONFIRMED" } }` for an unknown or unauthorized `orderId`, fabricating success instead of relying on the backend authorization filtering.
- **New Regression Command**: 
  - Ran unit tests with: `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/history-route.test.ts`
  - Tests verify that if the backend API returns an empty list (because it is already authorization-filtered for cross-tenant, wrong subject, same tenant different entry), the BFF correctly returns `404 Trip not found or access denied`.
  - Result: 6/6 tests passed successfully.
