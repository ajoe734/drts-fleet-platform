# SR-HOST-FE-001 — Host 唯讀工作入口與自車下鑽

Owner: Gemini. Reviewer: Gemini2. Date: 2026-09-10.
Prior Owner: Claude. Prior Reviewer: Gemini2.

## 0. History and Lifecycle

1. `d782bc2a2348a814171f7ecf092e6c8ab72f61c1` (owner Codex2) recorded a design
   blocker: canvas lacked Host entry and owned-vehicle screens.
2. Resolved by `SR-HOST-FE-001-CANVAS`: canonical canvas artifacts
   `docs/05-ui/drts-design-canvas/fleet-host.jsx` + `host-screen-contract.md`
   merged to `dev` at `25a63d999e2527081ec8fe62c1245cdc40703d51` (PR #1903, CI success).
3. Resumed implementation candidate `fcb5c4b8423f7d135cff134c23f731a0669f3a6d`
   merged into `origin/dev` at `529e3a5d37fb20d4d340b062cc64f6ac84fc53c1` (PR #1908).
4. Task was audited under `.local/worker-recovery-20260910/host-acceptance-audit/independent-review.md`
   noting that prior acceptance cited mocked loader unit tests while backend `SR-HOST-BE-001`
   has since merged to `origin/dev` (`5ef25bb1ad766b5957d2bffe9087e3b804c731cf`).
5. Official parent reviewer disposition (`SR-HOST-FE-001-PARENT-REVIEW-DISPOSITION-20260910`,
   recorded by Gemini2 in `.local/worker-recovery-20260910/host-acceptance-audit/parent-reviewer-disposition.md`)
   reopened `SR-HOST-FE-001` to coordinate genuine remote HTTP/SQL/browser acceptance evidence.
6. Reassigned to Gemini (owner) and Gemini2 (reviewer) per availability-first supervisor scheduling.

## 1. Base and Branch Identification

- Base SHA: `8f2a6be908269d77fefd4e5d6541f480ff62657e` (`origin/dev` HEAD at resumption).
- Merged feature code: already present in trunk at `529e3a5d37fb20d4d340b062cc64f6ac84fc53c1` (PR #1908).
- Worktree CWD: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-host-fe-001`
- Task Branch: `gemini/sr-host-fe-001`

## 2. Dependency Verification on Current SHA

- `SR-CONTRACT-001`: canonical `done`, merged — `HostVehicleSummary`,
  `HostVehicleEarningsSummary`, `HostVehicleMaintenanceItem`,
  `HostVehicleTripItem`, `HostVehicleCaseItem`,
  `SYSTEM_REMEDIATION_ERROR_CODES` Family 3, and typed client methods
  (`listHostVehicles`, `getHostVehicleEarnings`, `listHostVehicleMaintenance`,
  `listHostVehicleTrips`, `listHostVehicleCases`) verified at `packages/contracts/src/system-remediation.ts`
  and `packages/api-client/src/system-remediation.ts` / `packages/api-client/src/index.ts`.
- `SR-HOST-FE-001-CANVAS`: canonical `done`, merged (`25a63d999`, PR #1903).
- `SR-HOST-BE-001`: canonical `done`, merged to `origin/dev` at
  `5ef25bb1ad766b5957d2bffe9087e3b804c731cf`. `apps/api/src/modules/host-view/`
  exists with real `DatabaseService`-backed repository (`host-view.repository.ts`)
  querying SQL tables for vehicle projection rows.
- `SR-HOST-FE-001-ACCEPTANCE-RUNNER`: companion acceptance workflow task
  (owned by Claude2) supplying automated workflow and e2e test harness
  for GitHub-hosted remote verification.

## 3. Architecture and Implementation Summary

All server loaders call the authoritative typed client
(`packages/api-client/src/system-remediation.ts` against `/api/host/*`).
No design fixtures, canned percentages, or fabricated delivery are used in
`app/host/` or `components/host/`.

- `apps/fleet-partner-portal-web/app/host/lib/host-auth.server.ts` — Host
  (individual_owner)-scoped server client, distinct from the fleet-admin
  `getServerFleetPartnerClient`. Headers: `x-actor-type: partner_user`,
  `x-realm: partner`, `x-partner-id` (resolved from inbound `x-host-partner-id`
  header, else `DRTS_HOST_PARTNER_ID` env), `x-scopes: owned:read,reports:read,maintenance:read` —
  strictly read-only permissions matching `feature-contracts.md` §4.
- `apps/fleet-partner-portal-web/app/host/lib/host-data.server.ts` — loaders
  for vehicle list, per-vehicle detail (resolved by scanning the caller's own
  owned-vehicle list to ensure anti-enumeration), earnings, maintenance,
  trips, cases. Every loader returns a discriminated `{ok:true, ...}` /
  `{ok:false, accessState, error}` result; `accessState` is classified as
  `unauthorized`, `forbidden`, `vehicle_not_found`, or `fetch_failed`.
- `apps/fleet-partner-portal-web/app/host/translations.ts` — page-scoped bilingual
  translations using `trHost`, keeping inline copy compliant with `i18n:guard`.
- Pages: `app/host/page.tsx` (redirect), `app/host/vehicles/page.tsx`
  (owned-vehicle list, pagination via `?page=`), `app/host/vehicles/[vehicleId]/page.tsx`
  (tabbed detail: earnings / maintenance / trips / cases via `?tab=`).
- Components: `components/host/host-vehicle-table.tsx`, `host-vehicle-summary-card.tsx`,
  `host-earnings-panel.tsx`, `host-maintenance-table.tsx`, `host-trips-table.tsx`,
  `host-cases-table.tsx`, `host-page-footer.tsx`, `host-access-state.tsx` —
  all built from `@drts/ui-web` realm primitives matching `fleet-host.jsx` design canvas.
  No management/mutation controls rendered.

## 4. Acceptance Criteria & Gate Mapping

- **角色入口不露管理員控件，篩選与下鑽保留自車scope**:
  `host-auth.server.ts` requests strictly `owned:read`, `reports:read`, `maintenance:read`.
  No fleet-admin actions or write controls are imported or rendered.
  `loadHostVehicleDetail` resolves requested `vehicleId` through the caller's own owned list,
  returning `vehicle_not_found` for any out-of-scope vehicle id.
- **長清單/無車/無權/無收益與資料失敗可理解**:
  `?page=` pagination bound to API `pageInfo`; legitimate empty list (`items.length === 0`)
  renders "尚無車輛" `CanvasEmptyState`; `unauthorized`/`forbidden`/`vehicle_not_found`/`fetch_failed`
  render distinct `HostAccessStateCard` banners; earnings render `reported` / `zero` / `no_record`
  variants correctly.
- **證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列**:
  See §1, §6, and §7.
- **先 commit＋普通 push，再 handoff**:
  Task branch `gemini/sr-host-fe-001` pushed to remote; candidate SHA locked before handoff;
  no direct `done` call.

## 5. Deliberate Design Choices & Documented Boundaries

- **Detail Lookup Page Size Boundary**:
  `loadHostVehicleDetail` in `host-data.server.ts` uses `VEHICLE_LOOKUP_PAGE_SIZE = 200`
  to locate the summary vehicle from `listHostVehicles`. Because the backend typed client
  does not provide a dedicated `getHostVehicle(vehicleId)` endpoint, individual owners
  with fleets larger than 200 vehicles will experience `vehicle_not_found` for vehicles #201+.
  This is a documented frontend boundary, not hidden or stubbed.
- **Canvas Variant Affordances**:
  Static pre-rendered status filters (全部/使用中/維修中/停用) and static "期別" buttons
  from the static canvas gallery are omitted because the current typed API client does not
  yet accept these filter parameters.
- **Global Layout & Navigation**:
  Outer navigation and shell routing are owned by `SR-WIRE-001`. Host pages are mounted
  at `/host/*` and do not modify the central layout outside their write scope.

## 6. Verification Commands Executed (Base SHA 8f2a6be90)

```bash
$ git diff --check
# exit 0 (no output, diff format clean)

$ pnpm --filter @drts/fleet-partner-portal-web typecheck
# exit 0
# Generating route types...
# ✓ Types generated successfully

$ pnpm exec vitest run tests/unit/system-remediation/sr-host-fe-001/
# exit 0
#  Test Files  3 passed (3)
#       Tests  32 passed (32)
#    Duration  796ms

$ pnpm --filter @drts/fleet-partner-portal-web exec eslint app/host components/host --max-warnings=0
# exit 0 (no warnings or errors)

$ pnpm run i18n:guard
# exit 0
# i18n-guard: OK (549 files scanned across 10 apps, 55 exemption(s) from i18n-guard-baseline.json)
```

## 7. Operational Boundaries & Remote Evidence Linkage

- **Remote Backend Status**: Backend `SR-HOST-BE-001` is merged into `origin/dev`
  (`5ef25bb1ad766b5957d2bffe9087e3b804c731cf`) with SQL repository tables.
- **VM Restrictions**: Under local VM operating constraints, workers are prohibited
  from starting background dev servers (`pnpm dev`), databases, or Playwright browsers.
- **Remote Acceptance Harness**: Companion task `SR-HOST-FE-001-ACCEPTANCE-RUNNER`
  runs real Postgres migrations, isolated Host Nest API composition, and Playwright
  Chromium on GitHub Actions hosted infrastructure to provide automated remote
  HTTP/SQL and browser evidence.
- **Wiring Boundary**: Full `AppModule` registration and shared shell integration
  remain under the scope of `SR-WIRE-001`.
