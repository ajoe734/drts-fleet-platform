# TST-E2E-OPS-CONSOLE-ROUND14 Evidence

**Date:** 2026-06-13  
**Owner:** Codex  
**Source revision:** `origin/dev@92641cefa22bbd28692d6a3e71f20d620ec11866`  
**Worktree:** `/tmp/drts-e2e-round13.6Cx5jT`  
**Status:** `PASS - external dev Ops Console deep-route parity`

## Round Question

Before executing this round, the remaining verification questions were:

- Which routes are defined in the 3,000-case dev runtime matrix but not reached
  by the first 3,000 selected cases?
- Which realistic operator deep links can fail even when the matrix is green?
- Which route details should be tested by following runtime data instead of
  hard-coded demo IDs?

The highest-risk gap selected for this round was Ops Console. The 3,000-case
matrix included the Ops Console surface, but the selected cases only reached
`home` and `dashboard`, leaving dispatch, support, incident, registry, and
detail routes unproven.

## Matrix Coverage Gap Found

Command:

```bash
pnpm exec playwright test -c playwright.dev-runtime-matrix.config.ts --list > /tmp/drts-round14-matrix-list.txt
```

Route coverage derived by comparing `tests/e2e/dev-runtime-matrix.spec.ts`
route definitions with the listed 3,000 selected cases:

| Surface                    | Covered | Missing route keys                                                                                                                                                                                                                                                                               |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `api`                      | `1/1`   | none                                                                                                                                                                                                                                                                                             |
| `bank-console-web`         | `8/8`   | none                                                                                                                                                                                                                                                                                             |
| `partner-booking-web`      | `8/8`   | none                                                                                                                                                                                                                                                                                             |
| `enterprise-dispatch-web`  | `3/13`  | `booking-review`, `booking-submitted`, `booking-detail`, `trip`, `receipt`, `help`, `auth-required`, `quota-blocked`, `embed`, `embed-unsupported`                                                                                                                                               |
| `platform-admin-web`       | `2/18`  | `tenant-governance`, `partners`, `fleet-partners`, `fleet`, `vehicle-eligibility`, `service-products`, `pricing`, `payments`, `reimbursements`, `adapter-registry`, `health`, `notices`, `audit`, `feature-flags`, `users`, `switchboard`                                                        |
| `ops-console-web`          | `2/21`  | `dispatch`, `dispatch-detail`, `callcenter`, `complaints`, `complaint-detail`, `incidents`, `incident-detail`, `approval-requests`, `reports`, `revenue`, `attendance`, `maintenance`, `drivers`, `driver-detail`, `vehicles`, `vehicle-detail`, `contracts`, `contract-detail`, `feature-flags` |
| `fleet-partner-portal-web` | `2/11`  | `drivers`, `vehicles`, `trips`, `revenue`, `statements`, `documents`, `training`, `cases`, `quality`                                                                                                                                                                                             |
| `tenant-console-web`       | `2/19`  | `booking-new`, `passengers`, `addresses`, `cost-centers`, `rules`, `users`, `notifications`, `sla`, `billing`, `invoices`, `reports`, `api-keys`, `webhooks`, `integration-governance`, `feature-flags`, `settings`, `audit`                                                                     |

## External Dev Target

| App         | URL                                                        |
| ----------- | ---------------------------------------------------------- |
| Ops Console | `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app` |

## Findings And Fixes

### Finding 1 - hard-coded driver detail ID was stale

The old parity spec assumed `/drivers/DRV-001`, but deployed dev data exposes
lowercase runtime IDs such as `drv-demo-001`.

Evidence:

```bash
curl -sSL -D /tmp/round14-invalid-driver.headers \
  https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app/drivers/DRV-001 \
  -o /tmp/round14-invalid-driver.html
```

Result: `HTTP/2 404`

Fix:

- Detail routes now resolve from deployed runtime data instead of hard-coded
  uppercase smoke IDs.
- Driver detail fallback resolves visible IDs matching `drv-demo-*`.
- Vehicle detail fallback resolves visible IDs matching `veh-demo-*`.
- Contract detail fallback resolves visible IDs matching `contract-demo-*`.

### Finding 2 - some registry detail actions are intentionally not links

The deployed dev registry pages can show disabled detail actions, for example
vehicle rows with `vehicle_detail_pending`. In that state there is no
`<a href="/vehicles/...">` in the list, but the detail route may still render
when opened directly with the visible runtime ID.

Fix:

- `tests/e2e/ops-console-parity.spec.ts` now uses a two-step resolver:
  first try the actual list link for user-click parity, then fall back to the
  visible row ID for deep-link runtime parity.
- Link lookup now times out after five seconds instead of consuming the full
  test timeout.

## Commands And Results

```bash
OPS_CONSOLE_BASE_URL=https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app pnpm test:e2e:ops-console-parity
```

Initial result after switching to list-derived links: `FAIL`

Failure summary:

- The test waited for `a[href^="/drivers/"]` on `/drivers`.
- `/drivers` rendered 3 driver rows, but the action column contained `—`, so
  no driver detail link existed in the list.
- Visible runtime IDs included `drv-demo-001`, `drv-demo-002`, and
  `drv-demo-003`.

```bash
OPS_CONSOLE_BASE_URL=https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app pnpm test:e2e:ops-console-parity
```

Final result after fallback resolver and formatting: `PASS - 1 passed (33.9s)`

Verified routes:

- `/dashboard`
- `/dispatch`
- `/dispatch/OPS-SMOKE-DISPATCH`
- `/callcenter`
- `/complaints`
- `/complaints/CMP-0908`
- `/incidents`
- `/incidents/OPS-SMOKE-INCIDENT`
- `/approval-requests`
- `/reports`
- `/revenue`
- `/attendance`
- `/maintenance`
- `/drivers`
- `/drivers/<runtime drv-demo-*>`
- `/vehicles`
- `/vehicles/<runtime veh-demo-*>`
- `/contracts`
- `/contracts/<runtime contract-demo-*>`
- `/feature-flags`

Screenshot artifacts produced under `test-results/ops-console-parity/`:

- `ops-dashboard.png`
- `ops-dispatch-list.png`
- `ops-dispatch-detail.png`
- `ops-callcenter.png`
- `ops-complaints-list.png`
- `ops-complaints-detail.png`
- `ops-incidents-list.png`
- `ops-incidents-detail.png`
- `ops-approval-requests.png`
- `ops-reports.png`
- `ops-revenue.png`
- `ops-attendance.png`
- `ops-maintenance.png`
- `ops-drivers-list.png`
- `ops-drivers-detail.png`
- `ops-vehicles-list.png`
- `ops-vehicles-detail.png`
- `ops-contracts-list.png`
- `ops-contracts-detail.png`
- `ops-feature-flags.png`

## Files Added Or Updated

- `playwright.ops-console-parity.config.ts`
- `package.json`
- `tests/e2e/ops-console-parity.spec.ts`
- `tests/e2e/README.md`
- `support/sidecars/TST-E2E-OPS-CONSOLE-ROUND14/TST-E2E-OPS-CONSOLE-ROUND14-EVIDENCE.md`

## Remaining Non-Claims

- This does not complete all 3,000 requested verification rounds.
- This does not close Enterprise Dispatch, Platform Admin, Fleet Partner Portal,
  or Tenant Console deep-route gaps.
- This is not live issuer eligibility proof for `E2E-007`.
- This is not pilot cutover evidence for `E2E-008`.
- This is not production launch proof for `E2E-009`.
- This does not uplift `E2E-010` strict verification-body blockers.
