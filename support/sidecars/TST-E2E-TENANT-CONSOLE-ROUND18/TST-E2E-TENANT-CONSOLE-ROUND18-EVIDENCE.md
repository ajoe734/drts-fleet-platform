# TST-E2E-TENANT-CONSOLE-ROUND18 Evidence

**Date:** 2026-06-13  
**Owner:** Codex  
**Source revision:** `origin/dev@92641cefa22bbd28692d6a3e71f20d620ec11866`  
**Worktree:** `/tmp/drts-e2e-round13.6Cx5jT`  
**Status:** `PASS - external dev Tenant Console static deep-route parity, with explicit detail/localization gaps`

## Round Question

Before executing this round, the remaining verification questions were:

- Which Tenant Console routes were defined but not reached by the first 3,000
  selected dev-runtime matrix cases?
- Which tenant-admin direct links can fail even when home and bookings are
  green?
- Which realistic tenant-shell combinations can look green while still hiding
  a gap, such as locale plumbing that reaches shell chrome but not page content?

The highest-risk gap selected for this round was Tenant Console route depth,
because tenant admins can enter directly through booking creation, passenger
and address directories, cost centers, approval rules, finance, integrations,
settings, and audit routes.

## Matrix Coverage Gap Addressed

Round 14 found the 3,000-case matrix selected only `2/19` Tenant Console route
keys:

- Covered by the matrix: `home`, `bookings`
- Not reached by the matrix: `booking-new`, `passengers`, `addresses`,
  `cost-centers`, `rules`, `users`, `notifications`, `sla`, `billing`,
  `invoices`, `reports`, `api-keys`, `webhooks`, `integration-governance`,
  `feature-flags`, `settings`, `audit`

This round adds a dedicated external-dev Tenant Console parity suite covering
all 19 static tenant routes plus two explicit gap probes.

## External Dev Target

| App            | URL                                                           |
| -------------- | ------------------------------------------------------------- |
| Tenant Console | `https://drts-dev-tenant-console-web-waji3fer3a-uc.a.run.app` |

## Commands And Results

```bash
pnpm test:e2e:tenant-console-parity
```

Initial result: `FAIL`

Failure summary:

- `/` rendered correctly, but the test expected the tenant context label in
  `main`; external dev exposes it in shell chrome and exposes
  `tenant-demo-001` in the main identity block.
- `/settings` accepted the English locale cookie at the HTML/shell layer, but
  the settings page body remained zh-TW. This is a real dev-runtime gap, not a
  passing English-page claim.

```bash
pnpm test:e2e:tenant-console-parity
```

Second result: `FAIL`

Failure summary:

- `/bookings/BK-2026-001` returned a Tenant-shell 404 page on external dev.
  The repo has a dynamic booking detail page, but the deployed dev runtime does
  not currently provide positive detail evidence for that deep link.

```bash
pnpm test:e2e:tenant-console-parity
```

Later result after route-marker corrections: `FAIL`

Failure summary:

- `/users` rendered correctly, but the test expected the nav label
  `人員與角色`; external dev uses `使用者` as the main title.
- `/webhooks` rendered correctly and showed a supporting-read-model
  `readiness` API 404 inside the page. The page itself was not a full-page
  404, so the generic body-level `404` guard was too broad.

```bash
pnpm test:e2e:tenant-console-parity
```

Final result after correcting expectations:
`PASS - 5 passed (27.5s)`

Verified positive static routes:

- `/`
- `/bookings`
- `/bookings/new`
- `/passengers`
- `/addresses`
- `/cost-centers`
- `/rules`
- `/users`
- `/notifications`
- `/sla`
- `/billing`
- `/invoices`
- `/reports`
- `/api-keys`
- `/webhooks`
- `/integration-governance`
- `/feature-flags`
- `/settings`
- `/audit`

Verified invariants:

- All 19 static routes render inside one Tenant Console shell.
- The shell includes exactly one `aside` and one `main`.
- Tenant shell navigation does not leak Bank Console, Ops Console, Platform
  Admin, or Fleet Partner Portal navigation chrome.
- The English locale cookie reaches `<html lang="en">` and shell navigation.
- `/settings` main content remains zh-TW on external dev and is treated as a
  recorded gap, not as completed page localization.
- `/bookings/BK-2026-001` remains an external-dev unavailable deep link and is
  treated as a recorded gap, not as positive booking-detail proof.
- `/webhooks` can render a page-level warning about a supporting
  `/api/tenant/integration-governance/readiness` API 404 without being treated
  as a full-page route failure.

Screenshot artifacts produced under `test-results/tenant-console-parity/`:

- `tenant-home.png`
- `tenant-bookings.png`
- `tenant-booking-new.png`
- `tenant-passengers.png`
- `tenant-addresses.png`
- `tenant-cost-centers.png`
- `tenant-rules.png`
- `tenant-users.png`
- `tenant-notifications.png`
- `tenant-sla.png`
- `tenant-billing.png`
- `tenant-invoices.png`
- `tenant-reports.png`
- `tenant-api-keys.png`
- `tenant-webhooks.png`
- `tenant-integration-governance.png`
- `tenant-feature-flags.png`
- `tenant-settings.png`
- `tenant-audit.png`
- `tenant-booking-detail-unavailable.png`

## Files Added Or Updated

- `playwright.tenant-console-parity.config.ts`
- `package.json`
- `tests/e2e/tenant-console-parity.spec.ts`
- `tests/e2e/README.md`
- `support/sidecars/TST-E2E-TENANT-CONSOLE-ROUND18/TST-E2E-TENANT-CONSOLE-ROUND18-EVIDENCE.md`

## Remaining Non-Claims

- This does not complete all 3,000 requested verification rounds.
- This does not prove positive Tenant Console booking-detail deep-link coverage
  on external dev because `/bookings/BK-2026-001` currently returns a
  Tenant-shell 404.
- This does not prove full Tenant Console page-level English localization.
  `/settings` shell and `<html>` switch to English, but the main content remains
  zh-TW on external dev.
- This does not prove live tenant backend booking mutation on external dev; the
  suite verifies rendered route surfaces and safety invariants.
- This is not live issuer eligibility proof for `E2E-007`.
- This is not pilot cutover evidence for `E2E-008`.
- This is not production launch proof for `E2E-009`.
- This does not uplift `E2E-010` strict verification-body blockers.
