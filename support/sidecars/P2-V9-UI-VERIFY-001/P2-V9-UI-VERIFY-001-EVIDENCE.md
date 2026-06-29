# P2-V9-UI-VERIFY-001 Evidence

- Task: `P2-V9-UI-VERIFY-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Date: `2026-06-29`
- Planning ref: `docs/02-architecture/phase2_tesla_fsd_sandbox_v9_ui_execution_wave_20260628.md`

## Scope notes

- The brief references `docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/`, but that archive path is not present in this worktree. Verification used the live canvas root `docs/05-ui/drts-design-canvas/` plus the per-surface parity / screen-requirements docs already checked into `docs/05-ui/`.
- This packet does not claim unsupported visual parity where the repo only contains screen-requirements notes and no canonical canvas screen.

## Acceptance checklist

- [x] implemented routes smoke-tested
- [x] screenshots or route evidence captured
- [x] v9 component checklist completed
- [x] typecheck/build evidence summarized
- [x] backend/API gaps listed separately in `support/sidecars/P2-V9-UI-VERIFY-001/P2-V9-UI-VERIFY-001-BACKEND-GAPS.md`
- [x] no unsupported completion claim

## v9 component checklist

| Surface | Runtime scope verified | Design authority used | Evidence | Result |
| --- | --- | --- | --- | --- |
| ROC base console | `/overview`, `/liveboard`, `/trips`, `/vehicles`, `/vehicles/[vehicleId]`, `/provider`, `/handover` | `docs/05-ui/drts-design-canvas/` ROC canvas bundle + ROC runtime | Playwright screenshots `01`-`07` | Smoke pass |
| ROC response lanes | `/takeover`, `/alerts`, `/incidents`, `/evidence`, `/reports` | `docs/05-ui/roc-console-takeover-alerts-incidents-evidence-reports-screen-requirements-20260626.md` | Playwright screenshots `08`-`12` | Smoke pass; requirements-only, no canonical visual parity claim |
| Driver Safety Operator | `apps/driver-app/app/safety-operator.tsx` | `docs/05-ui/driver-app-safety-operator-screen-requirements-20260626.md` | `apps/driver-app/tests/unit/safety-operator-screen.test.ts` | Unit smoke pass; requirements-only, no canonical visual parity claim |
| Platform Sandbox Governance | `/sandbox`, `/sandbox/[experimentId]`, `/sandbox/suspend` | `docs/05-ui/platform-admin-sandbox-governance-v9-parity-20260628.md`, `docs/05-ui/drts-design-canvas/platform-sandbox.jsx` | Playwright screenshots `13`-`15` | Route smoke pass; populated experiment/tab verification blocked by backend data gap |
| Platform Compliance | `/platform-admin/compliance`, `/platform-admin/investigations`, `/platform-admin/investigations/[caseId]`, `/platform-admin/investigations/[caseId]/timeline`, `/platform-admin/compliance/trips/[tripId]`, `/platform-admin/evidence/legal-holds`, `/platform-admin/evidence/exports`, `/platform-admin/evidence/manifests/[manifestId]`, `/platform-admin/regulatory-reports` | `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md` | Playwright screenshots `16`-`24` | Smoke pass; requirements-only, no canonical visual parity claim |
| Ops fallback | `/av-fallback`, `/av-fallback/passenger-recovery/[orderId]`, `/av-fallback/sandbox-exceptions` | `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx` | Local HTTP + server-stack evidence | Blocked by backend 404s; see gap inventory |
| Tenant fallback runtime | `/bookings/av-fallback`, `/bookings/[bookingId]/av-fallback` | No canonical tenant fallback canvas found under `docs/05-ui/drts-design-canvas/`; runtime route files only | Playwright screenshot `28`, local route evidence | List route smoke pass in degraded state; detail route unresolved due missing visible rows / projections |
| Referral fallback runtime | `/embed/[entrySlug]?state=handoff&screen=vehicle_change_in_progress|human_fallback_assigned|service_continuing|eta_updated` | `docs/05-ui/drts-design-canvas/passenger-embed-screens.jsx` | Playwright screenshots `30`-`33` | Smoke pass |

## Screenshot inventory

- ROC: `support/sidecars/P2-V9-UI-VERIFY-001/screenshots/01-roc-overview.png` through `12-roc-reports.png`
- Platform admin sandbox + compliance: `13-platform-sandbox-list.png` through `24-platform-regulatory-reports.png`
- Tenant fallback list: `28-tenant-av-fallback-list.png`
- Referral fallback states: `30-referral-fallback-vehicle-change.png` through `33-referral-fallback-eta-updated.png`

## Verification commands

| Command | Outcome |
| --- | --- |
| `DRTS_V9_VERIFY_SKIP_WEBSERVER=true pnpm exec playwright test -c playwright.v9-ui-verify.config.ts` | PASS (`1 passed`, 3.4m) |
| `pnpm --filter @drts/driver-app exec vitest run tests/unit/safety-operator-screen.test.ts` | PASS |
| `python3` GET `http://127.0.0.1:3002/sandbox` | `200` |
| `python3` GET `http://127.0.0.1:3004/bookings/av-fallback` | `200` |
| `python3` GET `http://127.0.0.1:3014/embed/referral-demo-community?state=handoff&screen=vehicle_change_in_progress&entryHost=community-app.example.test` | `200` |
| `python3` GET `http://127.0.0.1:3003/av-fallback` | `500` (documented gap) |

## Typecheck / build evidence

### Typecheck

| Surface | Command | Outcome |
| --- | --- | --- |
| ROC | `pnpm --filter @drts/roc-console-web typecheck` | PASS |
| Platform Admin | `pnpm --filter @drts/platform-admin-web typecheck` | PASS |
| Tenant Console | `pnpm --filter @drts/tenant-console-web typecheck` | PASS |
| Referral Embed | `pnpm --filter @drts/referral-embed-web typecheck` | PASS |
| Ops Console | `pnpm --filter @drts/ops-console-web typecheck` | FAIL at `apps/ops-console-web/app/dashboard/page.tsx(922,5)` (`phase2SandboxKpiDashboard` not in `OperationalObservabilitySnapshot`) |

### Production-oriented builds

| Surface | Command | Outcome |
| --- | --- | --- |
| ROC | `pnpm --filter @drts/roc-console-web exec next build --webpack` | PASS |
| Platform Admin | `pnpm --filter @drts/platform-admin-web exec next build --webpack` | PASS |
| Referral Embed | `pnpm --filter @drts/referral-embed-web exec next build --webpack` | PASS |

Notes:

- Tenant Console production build was not re-run in this task; route evidence is from local runtime smoke at `127.0.0.1:3004`.
- Ops Console production build was not re-run because the verification lane was already blocked by backend 404s on `/api/roc/alerts` and `/api/roc/trips`, and its typecheck currently fails on an unrelated dashboard snapshot typing error.

