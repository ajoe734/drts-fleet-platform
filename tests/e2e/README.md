# DRTS Platform — Cross-Surface E2E Suite

This directory holds the stateful cross-surface scenarios that stitch together
tenant, ops, driver, billing, and tenant-boundary evidence.

Use it together with:

- `docs/04-uat/fbp-014a-e2e-matrix.md` for the detailed scenario design
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` for release-gate interpretation
- `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` for the latest live staging rerun

## Gate Role

The E2E suite is not "all of release" by itself.

It serves three purposes:

1. prove cross-surface ID continuity for named workflow families
2. make cross-tenant safety reviewable
3. keep external-adapter and manual-only flows explicit instead of silently passing them

## Scenario Map

| Scenario                                        | Workflow families                                         | Gate role                                                                                                                                                                                                                    | Current read                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-001-enterprise-dispatch.sh`                | `WF-ORD-001`, `WF-DSP-001`, `WF-DRV-001`, `WF-FIN-001`    | owned booking -> dispatch -> driver -> billing/audit continuity                                                                                                                                                              | live staging evidence contributes to all four families via `FBP-014B`; final family reads remain `WF-ORD-001` / `WF-DSP-001` = `PASS (live staging evidence)`, `WF-DRV-001` / `WF-FIN-001` = `PASS (static evidence)` per the release matrix                                                                                        |
| `E2E-002-forwarded-order.sh`                    | `WF-FWD-001`                                              | route-locked forwarded-task visibility and no-owned-assignment guard                                                                                                                                                         | `EXTERNAL-GATED`; live adapter proof remains external                                                                                                                                                                                                                                                                               |
| `E2E-003-phone-recording-filing.sh`             | `WF-COM-001`, `WF-FIN-001`                                | call session -> phone order -> recording callback -> export -> filing                                                                                                                                                        | `PASS (sandbox evidence)` for repo-local automation; live CTI/provider activation and staging job ownership still remain explicit external/deferred gates                                                                                                                                                                           |
| `E2E-004-tenant-attribution.sh`                 | `WF-TEN-001`, `WF-ORD-001`                                | tenant creation, new-tenant booking, attribution, no cross-tenant leak                                                                                                                                                       | `PASS (live staging evidence)` via `FBP-014B`                                                                                                                                                                                                                                                                                       |
| `E2E-010-governance-aware-billing-reporting.sh` | `WF-FIN-GOV-001` (depends on `WF-TGV-001` + `WF-FIN-001`) | governed booking → quota → approval snapshot → approve → dispatch+driver completion → invoice/report (line bound to governed orderId) → settlement/platform-earnings → audited download (FG-08) → cross-tenant scope (FG-09) | `SHELL` driving FG-01..FG-09; hard-fails on cost-center drop, missing audit chain, missing invoice line for the governed orderId, or cross-tenant invoice scope widening. Verification-body enrichment fields may still record `NOT_POPULATED` in default mode until a governed staging rerun can pass `STRICT_VERIFICATION_BODY=1` |
| `E2E-013-service-product-eligibility.sh`        | service-product eligibility                               | service product registry -> vehicle eligibility matrix -> airport-transfer booking -> dispatch candidates -> ineligible and eligible assignment                                                                              | `PASS (external dev default gate)` with matrix restore. `STRICT_SERVICE_PRODUCT_ERROR=1` still fails on dev because manual ineligible assignment returns generic `VEHICLE_NOT_DISPATCHABLE` instead of service-product-specific code.                                                                                               |

## Important Boundaries

- `E2E-001` and `E2E-004` are the release-grade live staging anchors.
- `E2E-002` is allowed to skip when no forwarded-task seed or adapter data is available.
- `E2E-003-phone-recording-filing.sh` proves the repo-local phone-order/recording/export/filing chain in sandbox mode, but does not claim live CTI provider media, staging scheduler activation, or external retention execution.
- `E2E-010-governance-aware-billing-reporting.sh` is a SHELL: the uplift to `PASS (live staging evidence)` remains blocked until a governed staging rerun produces reviewer-readable invoice/report artifacts and a green `STRICT_VERIFICATION_BODY=1` result. Default-mode runs still record each verification-body field as a literal value or `NOT_POPULATED`; the script hard-fails on the contract regressions named in `FIN-GOV-SPEC-001`: cost-center attribution dropped from the booking read-back; driver lifecycle cannot reach completion after dispatch+assign accepted; invoice does not include the just-completed governed `orderId`; no `generate_tenant_invoice` audit entry for that invoice (FG-08); or a cross-tenant fetch of the invoice returns 2xx instead of 4xx (FG-09).
- `E2E-013-service-product-eligibility.sh` proves external-dev service-product filtering by candidate exclusion and assignment rejection, but the strict service-product-specific error-code gate remains open until dev returns `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT` for manual ineligible assignment.
- The retired `apps/tenant-portal-web` shell is never a production verification target.

## Browser / Dev Runtime E2E

The shell scenarios above are not the full browser-E2E inventory. The current
repo also includes deployed-dev and surface-specific Playwright suites:

| Suite                        | Command                                     | Primary runtime                                                         | Gate role                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dev runtime matrix           | `pnpm test:e2e:dev-runtime-matrix`          | External dev by default                                                 | 3,000 route/actor/locale/device/query cases plus a generation guard across API, Bank Console, Partner Booking, Enterprise Dispatch, Platform Admin, Ops Console, Fleet Partner Portal, and Tenant Console |
| Bank Console auth boundary   | `pnpm test:e2e:bank-console-auth`           | Local by default; external dev with `DRTS_DEV_BANK_CONSOLE_BASE_URL`    | Signed-out deep links stay behind `/login` and do not expose protected booking/card/benefit data                                                                                                          |
| Bank Console depth           | `pnpm test:e2e:bank-console-depth`          | Local by default; external dev with `DRTS_DEV_BANK_CONSOLE_BASE_URL`    | Multi-bank, locale, role, account-chrome, and signed-out scoping checks                                                                                                                                   |
| Ops Console parity           | `pnpm test:e2e:ops-console-parity`          | External dev with `OPS_CONSOLE_BASE_URL`; local via explicit env        | Deep ops routes that the 3,000-case matrix may not reach: dispatch, call center, complaints, incidents, reports, revenue, attendance, maintenance, registry, contracts, and feature flags                 |
| Platform Admin parity        | `pnpm test:e2e:platform-admin-parity`       | External dev with `PLATFORM_ADMIN_BASE_URL`; local via explicit env     | Deep platform-governance routes that the 3,000-case matrix may not reach: partner, fleet, pricing, payment, adapter, health, audit, flag, and public-info workflows                                       |
| Partner Booking surfaces     | `pnpm test:e2e:partner-booking-surfaces`    | Local by default; external dev with `DRTS_DEV_PARTNER_BOOKING_BASE_URL` | Card website vs bank-app embed identity states, consent/fallback, insurance/travel site funnels, and non-card embed blocking                                                                              |
| Enterprise Dispatch surfaces | `pnpm test:e2e:enterprise-dispatch`         | Local by default; external dev with `ENTERPRISE_DISPATCH_BASE_URL`      | Website booking routes, support-safe gate states, and compact embed identity states                                                                                                                       |
| Fleet Partner Portal parity  | `pnpm test:e2e:fleet-partner-portal-parity` | External dev by default; override with `FLEET_PARTNER_PORTAL_BASE_URL`  | Deep fleet partner routes: drivers, vehicles, trips, revenue, statements, documents, training, cases, quality, locale chrome, and revenue-label safety                                                    |
| Tenant Console parity        | `pnpm test:e2e:tenant-console-parity`       | External dev by default; override with `TENANT_CONSOLE_BASE_URL`        | Deep tenant routes: booking creation, directory, governance, users, notifications, finance, integration, system routes, locale shell, and management-surface separation                                   |

Canonical external dev URLs used by the matrix:

| App                  | Dev URL                                                             |
| -------------------- | ------------------------------------------------------------------- |
| API                  | `https://drts-dev-api-waji3fer3a-uc.a.run.app`                      |
| Bank Console         | `https://drts-dev-bank-console-web-waji3fer3a-uc.a.run.app`         |
| Partner Booking      | `https://drts-dev-partner-booking-web-waji3fer3a-uc.a.run.app`      |
| Enterprise Dispatch  | `https://drts-dev-enterprise-dispatch-web-waji3fer3a-uc.a.run.app`  |
| Platform Admin       | `https://drts-dev-platform-admin-web-waji3fer3a-uc.a.run.app`       |
| Ops Console          | `https://drts-dev-ops-console-web-waji3fer3a-uc.a.run.app`          |
| Fleet Partner Portal | `https://drts-dev-fleet-partner-portal-web-waji3fer3a-uc.a.run.app` |
| Tenant Console       | `https://drts-dev-tenant-console-web-waji3fer3a-uc.a.run.app`       |

Latest external-dev evidence: `support/sidecars/TST-E2E-DEV-RUNTIME-ROUND13/TST-E2E-DEV-RUNTIME-ROUND13-EVIDENCE.md`.

## Running

```bash
./tests/e2e/run-e2e.sh
./tests/e2e/run-e2e.sh --suite 001,004
./tests/e2e/run-e2e.sh --suite 009
./tests/e2e/run-e2e.sh --dry-run
```

Use a bare origin in `E2E_API_URL` and provide `E2E_AUTH_BEARER_TOKEN` when
staging ingress requires identity.
