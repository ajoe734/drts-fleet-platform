# SR-HOST-FE-001 — Host 唯讀工作入口與自車下鑽

Owner: Claude. Reviewer: Gemini. Date: 2026-09-10.

## 0. History

`d782bc2a2348a814171f7ecf092e6c8ab72f61c1` (owner Codex2) recorded a design
blocker: the canvas had no Host entry or owned-vehicle screens, so no
implementation could proceed without inventing its own design. That blocker
was resolved by `SR-HOST-FE-001-CANVAS` — canonical canvas artifacts
`docs/05-ui/drts-design-canvas/fleet-host.jsx` + `host-screen-contract.md`,
merged to `dev` at `25a63d999e2527081ec8fe62c1245cdc40703d51` (PR #1903, CI
success). This entry records the resumed full frontend implementation.

## 1. Base / candidate SHA

- Dispatch base (per task brief): `25a63d999e2527081ec8fe62c1245cdc40703d51`.
- `git fetch origin` + `git merge --ff-only origin/dev` twice during this
  session (no local commits existed yet, so both were clean fast-forwards,
  not a merge commit):
  `25a63d999` → `56c9d00fb32505884f2b6a1b1af8f729aa2338d9` →
  `f17f2a3081679c7330032272560bf484bdef90fb`. Neither intervening commit
  (`SR-LEAVE-FE-001`, `SR-IDENTITY-002-PRINCIPAL-UPSERT-CONFLICT`,
  `SR-ACADEMY-FE-001`) touches `apps/fleet-partner-portal-web/app/host/`,
  `components/host/`, or any file this task writes.
- Implementation base SHA used for the candidate: `f17f2a3081679c7330032272560bf484bdef90fb`
  (current `origin/dev` HEAD at handoff time).
- Candidate SHA: recorded via `CANDIDATE_SHA=$(git rev-parse HEAD)` at
  handoff (see task-board `handoff` event for the exact value; this file is
  written before that commit, so it cannot self-reference its own hash).
- Task branch: `claude/sr-host-fe-001`.

## 2. Dependency verification reproduced on current SHA

- `SR-CONTRACT-001`: canonical `done`, merged — `HostVehicleSummary`,
  `HostVehicleEarningsSummary`, `HostVehicleMaintenanceItem`,
  `HostVehicleTripItem`, `HostVehicleCaseItem`,
  `SYSTEM_REMEDIATION_ERROR_CODES` Family 3, and the typed client methods
  (`listHostVehicles`, `getHostVehicleEarnings`,
  `listHostVehicleMaintenance`, `listHostVehicleTrips`,
  `listHostVehicleCases`) are present at `packages/contracts/src/
  system-remediation.ts` and `packages/api-client/src/system-remediation.ts`
  / `packages/api-client/src/index.ts` (verified by direct read + grep on
  this branch).
- `SR-HOST-FE-001-CANVAS`: canonical `done`, merged (`25a63d999`, PR #1903).
  Canvas + contract doc reviewed in full.
- `SR-HOST-BE-001` (backend, **not** a declared dependency of this task, but
  load-bearing for live data): re-checked via
  `ai-status.sh show SR-HOST-BE-001` immediately before writing this file —
  still `status: in_progress`, `candidate_branch: gemini/sr-host-be-001`,
  `candidate_sha: 81e45bb82d9fdfbfdbef0106ae7e7c81604f8674`,
  `ci_status: failure`. `git merge-base --is-ancestor 81e45bb82 HEAD` is
  false; `apps/api/src/modules/host-view/` does not exist on this branch.
  The `/api/host/*` routes therefore do not exist on `dev` yet — this is
  expected, current, machine-verified state, not a stale 9/6 audit
  observation.

## 3. What was implemented (real API-backed, no fixtures)

All server loaders call the authoritative typed client
(`packages/api-client/src/system-remediation.ts` methods against
`/api/host/*`, per `packages/api-client/src/index.ts:4656-4731`). No design
fixture, canned percentage, or fabricated signature/delivery is used
anywhere in `app/host/` or `components/host/`.

- `apps/fleet-partner-portal-web/app/host/lib/host-auth.server.ts` — Host
  (individual_owner)-scoped server client, distinct from the fleet-admin
  `getServerFleetPartnerClient` (`lib/api-client.server.ts`, out of write
  scope, not modified). Headers: `x-actor-type: partner_user`,
  `x-realm: partner`, `x-partner-id` (resolved from inbound
  `x-host-partner-id` header, else `DRTS_HOST_PARTNER_ID` env, else throws),
  `x-scopes: owned:read,reports:read,maintenance:read` — matches
  `feature-contracts.md` §4's documented identity/authorization path
  (`core.partners.partner_type = 'individual_owner'`, realm `partner`,
  scopes `owned:read`/`reports:read`/`maintenance:read`, resource
  constraint `vehicle.owner_partner_id === identity.partnerId`).
- `apps/fleet-partner-portal-web/app/host/lib/host-data.server.ts` — loaders
  for the vehicle list, per-vehicle detail (resolved by scanning the
  caller's own owned-vehicle list, since the typed client has no
  `getHostVehicle(id)` method — see file header comment for the full
  reasoning), earnings, maintenance, trips, cases. Every loader returns a
  discriminated `{ok:true, ...}` / `{ok:false, accessState, error}` result;
  `accessState` is one of `unauthorized` / `forbidden` / `vehicle_not_found`
  / `fetch_failed`, classified in `host-format.ts` from the API's Family 3
  error codes (`HOST_UNAUTHORIZED`/`HOST_FORBIDDEN`/`HOST_VEHICLE_NOT_FOUND`)
  or HTTP status, falling back to `fetch_failed` for the network-level
  failure expected while `SR-HOST-BE-001`'s backend module is unmerged.
- Pages: `app/host/page.tsx` (redirect to the list), `app/host/vehicles/
  page.tsx` (owned-vehicle list, real pagination via `?page=`),
  `app/host/vehicles/[vehicleId]/page.tsx` (tabbed detail: earnings /
  maintenance / trips / cases via `?tab=`, each independently paginated /
  month-scoped).
- Components: `components/host/host-vehicle-table.tsx`,
  `host-vehicle-summary-card.tsx`, `host-earnings-panel.tsx`,
  `host-maintenance-table.tsx`, `host-trips-table.tsx`,
  `host-cases-table.tsx`, `host-page-footer.tsx`, `host-access-state.tsx` —
  all built from `@drts/ui-web` canvas primitives (`CanvasCard`,
  `CanvasTable`, `CanvasPill`, `CanvasBanner`, `CanvasDL`,
  `CanvasEmptyState`, `CanvasPageHeader`), matching
  `docs/05-ui/drts-design-canvas/fleet-host.jsx` field-for-field (columns,
  DL keys, tone maps, bilingual copy). No management/mutation control is
  rendered anywhere (`ActionButton`/write affordances are never imported).

## 4. Acceptance criteria mapping

- **角色入口不露管理員控件，篩選与下鑽保留自車scope**: `host-auth.server.ts`
  requests only `owned:read`/`reports:read`/`maintenance:read`; no
  fleet-admin nav/action is rendered in `app/host/*`. The per-vehicle detail
  route is resolved through the caller's own owned-vehicle list (never an
  unscoped lookup), so drill-down cannot cross into another owner's
  vehicle.
- **長清單/無車/無權/無收益與資料失敗可理解**: real `?page=`-driven
  pagination bound to the API's `ApiListData.pageInfo` (`host-page-footer
  .tsx`); a legitimate empty list (`result.items.length === 0` with
  `ok: true`) renders a dedicated "尚無車輛" `CanvasEmptyState`, distinct
  from `unauthorized`/`forbidden`/`vehicle_not_found`/`fetch_failed`
  (`host-access-state.tsx`); earnings render three distinct, tested states
  (`reported` / `zero` / `no_record`) per `host-format.test.ts` and
  `host-data.server.test.ts`.
- **證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列**:
  see §1, §5, §6 below.
- **先 commit＋普通 push，再 handoff**: this file is written and committed
  before the `handoff` task-board call; `CANDIDATE_SHA`/`CANDIDATE_BRANCH`
  are captured from `git rev-parse HEAD` / `git branch --show-current` at
  that time, not asserted here.

## 5. Deliberate deviations from the static canvas (documented, not silent)

The canvas (`fleet-host.jsx`) is a static gallery and its own comments
(host-screen-contract.md §4) mark several affordances as intentionally
non-functional "pre-rendered variant selectors" pending a backend query-param
decision. Building the real product on top of the *current* typed client
(which only exposes `page`/`pageSize` + earnings `month`) means:

- **Vehicle-list status tabs (全部/使用中/維修中/停用) are not rendered.**
  The typed client has no status query parameter; rendering a tab that looks
  interactive but silently does nothing would misrepresent product capability
  more than omitting it. A working filter can be added once `SR-HOST-BE-001`
  defines the parameter.
- **Trips tab's static "期別" filter button is not rendered** for the same
  reason (no date-range query param on `listHostVehicleTrips`).
- **Earnings month navigation is real and functional** (`← 上月` / `下月 →`
  links), because `getHostVehicleEarnings(vehicleId, {month})` *is* a real,
  supported parameter on the typed client — this is not a static affordance
  here.
- **No `switching` stale-data guard prop.** The canvas's `switching` boolean
  is a demonstration device for a static gallery. In the real Next.js app,
  every `app/host/vehicles/[vehicleId]` navigation is a fresh
  `dynamic = "force-dynamic"` server render keyed by the route's
  `vehicleId` param — there is no client-side cache to go stale, so "no
  stale vehicle data after selection changes" is a structural guarantee
  rather than a client state flag.
- **Cases tab gained a pagination footer** the canvas didn't show (the
  canvas's fixture only had 2 rows); included for consistency since
  `listHostVehicleCases` returns the same paginated `ApiListData` shape as
  every other list endpoint.
- Host pages render inside the existing root `FleetPortalShell` (admin
  `fleetNav` sidebar/topbar) because `app/layout.tsx` is a single shared
  layout outside this task's write scope, and is explicitly called out in
  the task brief as owned by `SR-WIRE-001` ("Shared layout/navigation
  remains owned by SR-WIRE-001"). This task's own page content renders no
  admin control and requests only the Host scopes; a fully role-restricted
  outer shell (hiding the admin nav for a Host identity) is `SR-WIRE-001`'s
  integration work, not reproduced here.

## 6. Commands actually run (this session, on `f17f2a3081679c7330032272560bf484bdef90fb`)

```
$ git fetch origin                                            # exit 0
$ git merge --ff-only origin/dev                               # exit 0 (x2, clean fast-forwards)
$ pnpm --filter @drts/fleet-partner-portal-web typecheck        # exit 0
$ cd apps/fleet-partner-portal-web && pnpm exec eslint app/host components/host --max-warnings=0
                                                                 # exit 0, no output
$ git diff --check                                              # exit 0, no output
$ pnpm exec vitest run tests/unit/system-remediation/sr-host-fe-001/
                                                                 # exit 0 — 3 files, 32 tests passed
```

## 7. Explicitly NOT done — do not equate with product-complete

- **No live backend to verify against.** `SR-HOST-BE-001` is not merged; no
  real `veh_*` vehicle id, earnings period, maintenance/trip/case resource
  id was ever fetched from a running server in this session. All 32 unit
  tests exercise the loaders' classification/mapping logic against mocked
  client responses (including synthetic Family 3 error shapes), not a real
  HTTP round trip.
- **No browser/device verification.** Per the VM restriction, no `pnpm dev`,
  Playwright, or Docker Compose was started. The UI has not been visually
  rendered or screenshotted.
- **No IAM policy catalog change.** `packages/contracts/src/
  iam-policy-catalog.ts` currently scopes `owned:read`/`maintenance:read` to
  `allowedRealms: ["system","ops","driver"]` (no `partner`) — the catalog
  entry allowing the Host `partner`-realm identity these scopes is backend/
  IAM policy work, out of this task's write scope, and not yet landed
  anywhere reachable from this branch. `host-auth.server.ts` requests the
  headers the documented contract specifies; whether the backend's IAM
  layer currently honors them for realm `partner` is unverified here.
- **`getHostVehicle(id)` does not exist on the typed client.** The detail
  page's vehicle-summary lookup is a client-side scan of the (paginated,
  `pageSize: 200`) owned-vehicle list. This is a deliberate, documented
  interpretation (§3), not a confirmed backend design — if an individual
  owner's fleet in practice exceeds the 200-vehicle lookup page size, this
  would need a dedicated lookup endpoint; noted as a follow-up, not
  fabricated as solved.
- **No end-to-end contract test against a running `apps/api` instance.**
  `tests/unit/system-remediation/sr-host-fe-001/` covers the frontend loader
  layer only; a contract/integration test against the real `/api/host/*`
  routes is blocked on `SR-HOST-BE-001` merging.
