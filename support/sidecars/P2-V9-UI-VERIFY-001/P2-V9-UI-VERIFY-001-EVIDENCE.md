# P2-V9-UI-VERIFY-001 Evidence

- Task: `P2-V9-UI-VERIFY-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Date: `2026-06-29`
- Planning ref: `docs/02-architecture/phase2_tesla_fsd_sandbox_v9_ui_execution_wave_20260628.md`

## Scope notes

- The brief references `docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/`, but that archive path is not present in this worktree. Verification used the live canvas root `docs/05-ui/drts-design-canvas/` plus the per-surface parity / screen-requirements docs already checked into `docs/05-ui/`.
- The final Playwright rerun used the task-local verify proxy `tests/e2e/utils/v9-verify-api-proxy.mjs` for missing Ops / Tenant fallback backend routes while preserving passthrough to the shared dev API for the other verified surfaces.
- The owner follow-up for reviewer reproducibility raised `tests/e2e/v9-ui-verify.spec.ts` suite timeout from `300000` to `420000` ms so the documented command can finish the 33-route smoke in a clean worktree without extra CLI flags.
- This packet does not claim unsupported visual parity where the repo only contains screen-requirements notes and no canonical canvas screen.

## Acceptance checklist

- [x] implemented routes smoke-tested
- [x] screenshots or route evidence captured
- [x] v9 component checklist completed
- [x] typecheck/build evidence summarized
- [x] backend/API gaps listed separately in `support/sidecars/P2-V9-UI-VERIFY-001/P2-V9-UI-VERIFY-001-BACKEND-GAPS.md`
- [x] no unsupported completion claim

## Review-approved snapshot

- `2026-06-29T08:20:26Z`: reviewer `Codex2` approved `origin/codex/p2-v9-ui-verify-001` at `a788bff49`.
- Reviewer reproduction on the approved SHA: `pnpm install --frozen-lockfile`, `pnpm exec playwright test -c playwright.v9-ui-verify.config.ts` -> PASS (`1 passed`, `6.5m`), `pnpm --filter @drts/driver-app exec vitest run tests/unit/safety-operator-screen.test.ts` -> PASS.
- Owner closeout rerun on the evidence-only final state: `pnpm exec playwright test -c playwright.v9-ui-verify.config.ts` -> PASS (`1 passed`, test file `5.0m`, total `6.3m`), `pnpm --filter @drts/driver-app exec vitest run tests/unit/safety-operator-screen.test.ts` -> PASS.
- Closeout boundary: this packet supports branch-level finalization only. It does not claim `merged_to_dev` or `dev_deployed`.

## v9 component checklist

| Surface                     | Runtime scope verified                                                                                                                                                                                                                                                                                                                                                          | Design authority used                                                                                                      | Evidence                                                    | Result                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| ROC base console            | `/overview`, `/liveboard`, `/trips`, `/vehicles`, `/vehicles/[vehicleId]`, `/provider`, `/handover`                                                                                                                                                                                                                                                                             | `docs/05-ui/drts-design-canvas/` ROC canvas bundle + ROC runtime                                                           | Playwright screenshots `01`-`07`                            | Smoke pass                                                                                                                       |
| ROC response lanes          | `/takeover`, `/alerts`, `/incidents`, `/evidence`, `/reports`                                                                                                                                                                                                                                                                                                                   | `docs/05-ui/roc-console-takeover-alerts-incidents-evidence-reports-screen-requirements-20260626.md`                        | Playwright screenshots `08`-`12`                            | Smoke pass; requirements-only, no canonical visual parity claim                                                                  |
| Driver Safety Operator      | `apps/driver-app/app/safety-operator.tsx`                                                                                                                                                                                                                                                                                                                                       | `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md`                                                    | `apps/driver-app/tests/unit/safety-operator-screen.test.ts` | Unit smoke pass; requirements-only, no canonical visual parity claim                                                             |
| Platform Sandbox Governance | `/sandbox`, `/sandbox/[experimentId]`, `/sandbox/suspend`                                                                                                                                                                                                                                                                                                                       | `docs/05-ui/platform-admin-sandbox-governance-v9-parity-20260628.md`, `docs/05-ui/drts-design-canvas/platform-sandbox.jsx` | Playwright screenshots `13`-`15`                            | Route smoke pass; populated experiment/tab verification blocked by backend data gap                                              |
| Platform Compliance         | `/platform-admin/compliance`, `/platform-admin/investigations`, `/platform-admin/investigations/[caseId]`, `/platform-admin/investigations/[caseId]/timeline`, `/platform-admin/compliance/trips/[tripId]`, `/platform-admin/evidence/legal-holds`, `/platform-admin/evidence/exports`, `/platform-admin/evidence/manifests/[manifestId]`, `/platform-admin/regulatory-reports` | `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`                                             | Playwright screenshots `16`-`24`                            | Smoke pass; requirements-only, no canonical visual parity claim                                                                  |
| Ops fallback                | `/av-fallback`, `/av-fallback/passenger-recovery/[orderId]`, `/av-fallback/sandbox-exceptions`                                                                                                                                                                                                                                                                                  | `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`                                                                        | Playwright screenshots `25`-`27`                            | Smoke pass via verify-local proxy/stub; shared dev API still returns `404` for `/api/roc/alerts` and `/api/roc/trips`            |
| Tenant fallback runtime     | `/bookings/av-fallback`, `/bookings/[bookingId]/av-fallback`                                                                                                                                                                                                                                                                                                                    | No canonical tenant fallback canvas found under `docs/05-ui/drts-design-canvas/`; runtime route files only                 | Playwright screenshots `28`-`29`                            | Smoke pass via verify-local booking/projection stub; no unsupported tenant visual-parity claim beyond runtime route verification |
| Referral fallback runtime   | `/embed/[entrySlug]?state=handoff&screen=vehicle_change_in_progress`, `human_fallback_assigned`, `service_continuing`, `eta_updated`                                                                                                                                                                                                                                          | `docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx`                                                               | Playwright screenshots `30`-`33`                            | Smoke pass against current embedded fallback runtime; shared dev content currently resolves generic `fallback_to_web` copy, so screen-specific handoff parity is not claimed |

## Screenshot inventory

- ROC: `support/sidecars/P2-V9-UI-VERIFY-001/screenshots/01-roc-overview.png` through `12-roc-reports.png`
- Platform admin sandbox + compliance: `13-platform-sandbox-list.png` through `24-platform-regulatory-reports.png`
- Ops fallback: `25-ops-av-fallback-list.png` through `27-ops-sandbox-exceptions.png`
- Tenant fallback runtime: `28-tenant-av-fallback-list.png`, `29-tenant-av-fallback-detail.png`
- Referral fallback runtime: `30-referral-fallback-vehicle-change.png` through `33-referral-fallback-eta-updated.png`

## Verification commands

| Command                                                                                                                                      | Outcome                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `pnpm exec playwright test -c playwright.v9-ui-verify.config.ts`                                                                             | PASS (`1 passed`, test file `5.0m`, total `6.3m`); reproducible after raising suite timeout to `420000` ms |
| `pnpm --filter @drts/driver-app exec vitest run tests/unit/safety-operator-screen.test.ts`                                                   | PASS                    |
| `python3` GET `https://drts-dev-api-waji3fer3a-uc.a.run.app/api/roc/alerts`                                                                  | `404`                   |
| `python3` GET `https://drts-dev-api-waji3fer3a-uc.a.run.app/api/roc/trips`                                                                   | `404`                   |
| `python3` GET `https://drts-dev-api-waji3fer3a-uc.a.run.app/api/admin/sandbox-governance/experiments`                                        | `404`                   |
| `python3` GET `https://drts-dev-api-waji3fer3a-uc.a.run.app/api/tenant/bookings/booking-000032/sandbox-fulfillment` with tenant demo headers | `404`                   |

## Typecheck / build evidence

### Typecheck

| Surface        | Command                                            | Outcome                                                                                                                              |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| ROC            | `pnpm --filter @drts/roc-console-web typecheck`    | PASS                                                                                                                                 |
| Platform Admin | `pnpm --filter @drts/platform-admin-web typecheck` | PASS                                                                                                                                 |
| Tenant Console | `pnpm --filter @drts/tenant-console-web typecheck` | PASS                                                                                                                                 |
| Referral Embed | `pnpm --filter @drts/referral-embed-web typecheck` | PASS                                                                                                                                 |
| Ops Console    | `pnpm --filter @drts/ops-console-web typecheck`    | FAIL at `apps/ops-console-web/app/dashboard/page.tsx(922,5)` (`phase2SandboxKpiDashboard` not in `OperationalObservabilitySnapshot`) |

### Production-oriented builds

| Surface        | Command                                                            | Outcome |
| -------------- | ------------------------------------------------------------------ | ------- |
| ROC            | `pnpm --filter @drts/roc-console-web exec next build --webpack`    | PASS    |
| Platform Admin | `pnpm --filter @drts/platform-admin-web exec next build --webpack` | PASS    |
| Referral Embed | `pnpm --filter @drts/referral-embed-web exec next build --webpack` | PASS    |

Notes:

- Tenant Console production build was not re-run in this task; tenant fallback route evidence is from the Playwright local webServer stack at `127.0.0.1:3004` backed by the verify-local proxy stub.
- Ops Console production build was not re-run because the shared dev API still lacks `/api/roc/alerts` and `/api/roc/trips`, and Ops Console typecheck still fails on the unrelated dashboard snapshot typing error above.
- Referral Embed screenshots reflect the current shared dev runtime behavior, which resolves `fallback_to_web` copy instead of the screen-specific handoff state copy requested by the query params.
