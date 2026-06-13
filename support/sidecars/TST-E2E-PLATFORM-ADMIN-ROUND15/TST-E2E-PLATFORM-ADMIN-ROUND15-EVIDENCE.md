# TST-E2E-PLATFORM-ADMIN-ROUND15 Evidence

**Date:** 2026-06-13  
**Owner:** Codex  
**Source revision:** `origin/dev@92641cefa22bbd28692d6a3e71f20d620ec11866`  
**Worktree:** `/tmp/drts-e2e-round13.6Cx5jT`  
**Status:** `PASS - external dev Platform Admin deep-route parity`

## Round Question

Before executing this round, the remaining verification questions were:

- Which Platform Admin routes are defined but not reached by the first 3,000
  selected dev-runtime matrix cases?
- Which platform-governance pages are realistic direct-entry routes for
  platform admins but still lacked external dev browser evidence?
- Which detail routes can be verified positively, and which are only provable
  as unavailable or blocked states because external dev data is not seeded?

The highest-risk gap selected for this round was Platform Admin, because it owns
cross-tenant governance, partner entry governance, fleet compliance, pricing,
payments, adapter readiness, health, audit evidence, feature flags, and public
information publishing.

## Matrix Coverage Gap Addressed

Round 14 found the 3,000-case matrix selected only `2/18` Platform Admin route
keys:

- Covered by the matrix: `home`, `tenants`
- Not reached by the matrix: `tenant-governance`, `partners`,
  `fleet-partners`, `fleet`, `vehicle-eligibility`, `service-products`,
  `pricing`, `payments`, `reimbursements`, `adapter-registry`, `health`,
  `notices`, `audit`, `feature-flags`, `users`, `switchboard`

This round adds a dedicated Platform Admin browser parity suite for those deep
routes plus the currently resolvable detail/blocked-state routes.

## External Dev Target

| App            | URL                                                           |
| -------------- | ------------------------------------------------------------- |
| Platform Admin | `https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app` |

## Findings And Fixes

### Finding 1 - hard-coded positive partner detail was not valid on dev

Initial test assumption:

- `/partners/ctbc-elite` would render a positive partner-entry detail.

External dev result:

- `/partners/ctbc-elite` rendered a safe blocked state:
  `Partner entry 目前不可用` and `找不到指定的 partner entry。`

Fix:

- The suite now verifies this route as `partner-detail-unavailable`, a stale or
  unknown partner deep-link blocked state.
- This is intentionally not claimed as positive partner detail coverage.

### Finding 2 - Platform Admin needed an external-dev suite separate from local assistant tests

Existing Platform Admin browser tests focus on local assistant overlay behavior
with assistant-on/off builds. They do not provide a simple external-dev route
parity gate for all platform-governance pages.

Fix:

- Added `playwright.platform-admin-parity.config.ts`.
- Added `pnpm test:e2e:platform-admin-parity`.
- Added `tests/e2e/platform-admin-parity.spec.ts`.

## Commands And Results

```bash
PLATFORM_ADMIN_BASE_URL=https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app pnpm test:e2e:platform-admin-parity
```

Initial result: `FAIL`

Failure summary:

- The suite expected positive `credential / eligibility / branding / ctbc`
  markers on `/partners/ctbc-elite`.
- External dev returned the unavailable partner-entry blocked state instead.

```bash
PLATFORM_ADMIN_BASE_URL=https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app pnpm test:e2e:platform-admin-parity
```

Final result after correcting the partner detail expectation:
`PASS - 1 passed (16.4s)`

Verified routes:

- `/`
- `/tenants`
- `/tenant-governance`
- `/partners`
- `/partners/ctbc-elite` as unavailable blocked state
- `/fleet-partners`
- `/fleet-partners/fleet-partner-demo-001`
- `/fleet`
- `/vehicle-eligibility`
- `/service-products`
- `/pricing`
- `/payments`
- `/payments/reimbursements`
- `/payments/reimbursements/rb_2026_05_001`
- `/adapter-registry`
- `/health`
- `/notices`
- `/audit`
- `/feature-flags`
- `/users`
- `/switchboard`

Screenshot artifacts produced under `test-results/platform-admin-parity/`:

- `platform-admin-home.png`
- `platform-admin-tenants.png`
- `platform-admin-tenant-governance.png`
- `platform-admin-partners.png`
- `platform-admin-partner-detail-unavailable.png`
- `platform-admin-fleet-partners.png`
- `platform-admin-fleet-partner-detail.png`
- `platform-admin-fleet.png`
- `platform-admin-vehicle-eligibility.png`
- `platform-admin-service-products.png`
- `platform-admin-pricing.png`
- `platform-admin-payments.png`
- `platform-admin-reimbursements.png`
- `platform-admin-reimbursement-detail.png`
- `platform-admin-adapter-registry.png`
- `platform-admin-health.png`
- `platform-admin-notices.png`
- `platform-admin-audit.png`
- `platform-admin-feature-flags.png`
- `platform-admin-users.png`
- `platform-admin-switchboard.png`

## Files Added Or Updated

- `playwright.platform-admin-parity.config.ts`
- `package.json`
- `tests/e2e/platform-admin-parity.spec.ts`
- `tests/e2e/README.md`
- `support/sidecars/TST-E2E-PLATFORM-ADMIN-ROUND15/TST-E2E-PLATFORM-ADMIN-ROUND15-EVIDENCE.md`

## Remaining Non-Claims

- This does not complete all 3,000 requested verification rounds.
- This does not close Enterprise Dispatch, Fleet Partner Portal, or Tenant
  Console deep-route gaps.
- This does not prove a positive partner-entry detail on external dev because
  `/partners/ctbc-elite` currently returns the unavailable state.
- This does not prove positive tenant detail because no external dev tenant
  detail route was resolved from seeded data in this round.
- This is not live issuer eligibility proof for `E2E-007`.
- This is not pilot cutover evidence for `E2E-008`.
- This is not production launch proof for `E2E-009`.
- This does not uplift `E2E-010` strict verification-body blockers.
