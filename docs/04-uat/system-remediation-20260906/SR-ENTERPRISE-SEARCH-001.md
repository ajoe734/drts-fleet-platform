# SR-ENTERPRISE-SEARCH-001 — authenticated enterprise booking search

## Current candidate and acceptance status

The recovery starts from published source `7f782ee6465e225055ad244c5931958c93142cf3`, whose ancestry includes the enterprise UI implementation `af0bfedef50e308bc10cd1591620958778f9d83e` and corrected DB fixtures `924c9e42be67f7b855bdb491d6776f2738c78279`. Historical PR #1961 and its refs remain preserved. The replacement delivery branch is `codex/sr-enterprise-search-ci-registration-20260911`; its final immutable candidate is recorded in the PR and canonical handoff after commit.

**The complete required gate `enterprise_search_actual_query_totals_and_ui` is still mandatory.** The prior 20/20 remote result is only 19 unit checks plus one real-Postgres direct-controller test. It is not real HTTP or browser evidence. This recovery implements the previously missing full browser runner instead of treating the limitation as a reason to reduce acceptance. Actual remote results must be attached to the new candidate; historical success cannot be reused for it.

## Product changes

- Combined passenger/status/calendar-date filters and server pagination retain the reviewed `SR-BOOKING-VERIFY` authoritative query contract and filtered totals. Clear and filter changes reset page; an AbortController cancels obsolete queries.
- `/bookings` reads the existing `drts_tenant_session` cookie and validates it through the real `/api/auth/session` endpoint, following the existing tenant-console session contract. It passes only the verified tenant ID to the client component; access tokens remain server-side.
- Booking **GET** requests through the existing enterprise BFF revalidate that cookie, use its real Bearer token and verified tenant selector, and remove bootstrap/spoofed identity headers. Missing/expired sessions fail closed, wrong-realm/missing-tenant sessions are rejected, and a different browser-supplied tenant selector returns 403. The previous fixed fixture tenant and configured fallback actor cannot authorize reads.
- The allowlisted proxy paths and existing POST/PUT/PATCH/cancellation behavior are retained; this task does not claim to repair authentication for those mutation routes or introduce a new login provider.
- Loading, filtered-empty and actual-empty states remain distinct. API failures have a retry action, and the calendar filter labels its product timezone. No fixture booking data supplies the history list.

The server verifier also preserves internal-key and Cloud Run service-identity forwarding for its upstream session verification. Unavailable verification returns a failure rather than using fixture identity.

## CI blocker actually reproduced and fixed

At source `7f782ee6`, `python3 tools/ci/check_test_coverage.py` exited 1 because `tools/ci/test_enterprise_search_acceptance_workflow.py` had no CI execution path. Supervisor authorized the exact two shared CI files. Commit `9bd428ade` adds one invocation to each workflow's existing scope-contract step; the same checker then exited 0 with all 69 tracked test files reachable. The checker and its requirements were unchanged.

The earlier passenger-filter failure was different: seed booking/order IDs contained `search`, legitimately matching the backend's multi-field search and returning 5 rather than 4. Published fix `924c9e42b` changes only those fixture IDs. Actual remote run [34561207686](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34561207686) passed 20/20, zero skips, with runtime/workflow `924c9e42be67f7b855bdb491d6776f2738c78279`. That result remains historical data-layer evidence.

## Real browser acceptance execution

`.github/workflows/enterprise-search-acceptance.yml` retains the data-layer job and adds a separate `browser-acceptance` job on a GitHub-hosted runner:

1. Validate a full immutable candidate SHA and verify the exact checkout; record workflow SHA separately.
2. Install frozen-lockfile dependencies and Chromium; build the actual API, UI token package and enterprise production Next application.
3. Migrate a dedicated PostgreSQL/PostGIS service, then start the real full AppModule using only the checked-out compiled runtime.
4. Create durable tenant-admin users and actual JWT sessions through canonical services. Create 25 tenant-A bookings, 3 tenant-B bookings and an empty third tenant. Retain actual booking/order/tenant IDs and SQL count readback. Sessions include a genuinely expired JWT and a valid non-tenant JWT for negative cases.
5. Start the production Next application and drive actual Chromium through its page and session-authenticated BFF into the real HTTP API/database.
6. Require every actual build/start/test/gate step to succeed and at least all 7 scenarios to pass without skips, unexpected failures, flaky results or runner errors. Always retain execution/failure reports, actual request queries and totals, SQL seed/readback evidence and screenshots. Private session material is excluded from uploaded artifact paths and browser traces are disabled.

The new server entry point refuses to run outside GitHub Actions. No API, product, browser or database server was started on the development VM during preparation.

### Browser scenario matrix

| Scenario | Evidence required |
| --- | --- |
| Combined filters, timezone boundaries, clear and page reset | Actual request query, HTTP 200, server total and visible row count agree; date instants match Asia/Taipei calendar boundaries |
| Three pages | Visible IDs across all pages match exactly the 25 persisted tenant-A bookings, with no duplication or tenant-B leakage |
| Empty states | No-match filter and genuinely empty authenticated tenant show distinct states; clear retrieves real rows again |
| Tenant isolation | Valid tenant-B session sees its own 3 IDs; attempted tenant-A selector returns 403 |
| Authentication negatives | Missing and truly expired sessions return 401; wrong realm is rejected; no booking rows render |
| Invalid date/stale response | Reversed calendar range blocks query rendering; delayed obsolete real request cannot replace newer filtered results |
| Loading/error/retry | A delayed real request exposes loading; deliberately invalid query receives the real API's 400; retry retrieves authoritative data |

The two transport fault cases delay dispatch or modify an actual query to exercise the real backend's error response. They do not replace responses, repositories, auth or booking data with mocked answers. Browser testing remains Chromium emulation; no physical-device or production-traffic claim is made.

## Local verification during preparation

All checks run inside the new isolated worktree; none starts a server.

| Command | Result |
| --- | --- |
| `python3 tools/ci/check_test_coverage.py` | Before CI registration: exit 1; after: exit 0, 69 test files |
| `python3 -m unittest tools/ci/test_enterprise_search_acceptance_workflow.py tools/ci/test_check_test_coverage.py tools/ci/test_workflow_timeouts.py` | 23 passed; browser gate is executed against pass/partial/skipped/failure cases, and each failed workflow step prevents a passed manifest |
| `pnpm --filter @drts/enterprise-dispatch-web exec vitest run tests/unit/control-plane-proxy.test.ts` | 11 passed, including expired/wrong-realm/missing-session/cross-tenant negatives |
| `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/` | 19 passed |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck` | exit 0 |
| `pnpm exec tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck --types node tests/e2e/system-remediation/sr-enterprise-search-001/enterprise-search-browser.spec.ts` | exit 0; typecheck only, no browser launch |
| Scoped enterprise ESLint | exit 0 |
| `node --check tests/e2e/system-remediation/sr-enterprise-search-001/enterprise-search-browser-server.mjs` | exit 0; syntax only |

Actual `pnpm --filter @drts/ui-tokens build`, `pnpm --filter @drts/api build` (including contracts and control-plane-auth), and `pnpm --filter @drts/enterprise-dispatch-web build` all exited 0. The real production Next bundle compiled successfully; no server was started. Final diff/commit validation is recorded at delivery. Same-candidate remote browser execution, independent Claude2 review and CI/merge remain required before completion. No gate is accepted solely by this report.

## First full remote execution and follow-up

Candidate `7e5bb2473aa8aa8ba051ffa63449aba825e942fd` is preserved in [PR #1970](https://github.com/ajoe734/drts-fleet-platform/pull/1970). Run [34565741104](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34565741104) passed the separate data job but failed before browser execution: the real JWT service rejected the harness-only `-1s` duration. The runner now issues a supported `0s` token and explicitly checks that real JWT verification rejects it. The original failed run and downloaded raw artifacts remain available under `.local/blocked-recovery-20260911/enterprise-search-run-34565741104/`; they do not count as browser acceptance.

The first matching CI also identified untranslated pagination/retry copy and root strict type errors in the browser fixture map. The follow-up moves copy into both translation catalogs and uses explicit `a`/`b`/`empty` fixture keys. `pnpm run i18n:guard`, `pnpm run typecheck:root`, scoped lint and the 12 workflow checks then passed. The follow-up candidate still requires its own complete remote browser result.
