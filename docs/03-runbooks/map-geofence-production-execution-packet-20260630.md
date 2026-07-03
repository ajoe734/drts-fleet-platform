# Map/Geofence Production Execution Packet

Date: 2026-06-30

Status: supervisor-ready execution packet

Wave ID: `map-geofence-production-20260630`

Primary anchors:

- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `packages/contracts/src/index.ts`
- `apps/api/src/modules/service-area/`
- `infra/migrations/V0047__service_area_geofence_authority.sql`
- `apps/ops-console-web/app/callcenter/page.tsx`
- `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`
- `apps/platform-admin-web/`
- `apps/driver-app/`

## Purpose

Turn the map/geofence gap inventory into executable production work for the
fleet. The goal is not to "add a map" as a visual feature. The goal is to make
pickup/dropoff coordinates, service-area decisions, stop policies, and map
rendering production-safe across order creation, dispatch, governance, and
driver execution.

This wave closes the operational hole identified on 2026-06-30:

- Callcenter agents cannot pin pickup/dropoff points on a map.
- Ops dispatch has a projection board, not an actual geographic map.
- Platform Admin / Phase 2 governance cannot author service-area or no-stop
  geofences.
- Driver App has GPS heartbeat but no true trip map/navigation surface.
- Tenant, concierge, partner, and passenger entry surfaces do not share one
  coordinate and serviceability model.

## Non-Negotiables

1. Backend authority first: frontend serviceability previews are helpful, but
   order creation must be protected by backend evaluation.
2. No fake production maps: CSS/SVG projection may remain as degraded fallback,
   but it cannot satisfy the production map requirement.
3. Coordinates need provenance: a lat/lng without source, confidence, actor,
   and timestamp is not acceptable for audited production flows.
4. Provider outage is a first-class state: no surface may silently create a
   normal dispatchable coordinate-less booking when geo service is unavailable.
5. Geometry is governance data: service areas, no-pickup/no-dropoff zones,
   manual-review zones, and Phase 2 operating areas must be versioned and
   audited.
6. E2E evidence is required: a task is not complete until its affected
   production path is covered by deterministic mocked-provider tests and, where
   applicable, a guarded stage smoke path.

## Provider And Rollout Policy

| Area                       | Decision                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Production provider family | Google Maps Platform                                                                                  |
| Web map                    | Google Maps JavaScript API behind the shared map adapter                                              |
| Native map                 | `react-native-maps` with Google provider configuration behind the shared adapter                      |
| Geocode authority          | Backend proxy to Google Geocoding API                                                                 |
| ETA / route authority      | Backend proxy to Google Routes API                                                                    |
| CI / local provider        | Deterministic mock provider                                                                           |
| Coordinate-less booking    | Not allowed for formal bookings; callcenter may recover only with `manual_geocode` pinned coordinates |

All map/geofence rollout flags start disabled by default:
`geoProviderEnabled`, `addressMapPickerEnabled`, `serviceAreaGateEnforced`,
`opsRealMapEnabled`, `platformGeometryEditorEnabled`, and
`driverTripMapEnabled`.

Operational rules:

- Server geocode and route credentials stay server-side only.
- Browser keys must be restricted by HTTP referrer and scoped to map rendering
  / Places UI only.
- Android keys must be restricted by package name plus SHA fingerprint; iOS keys
  must be restricted by bundle identifier.
- Local development, CI, Playwright, and smoke paths default to the deterministic
  mock provider and must spend zero live-provider quota.
- Staging / production `MAP_PROVIDER_BACKEND=google` must fail closed unless
  both server credentials are present and quota/alert metadata is configured.
- `scripts/check-map-provider-config.sh` is the shared preflight for local, CI,
  and deploy rails.
- Provider health and quota readiness are surfaced through `/health`,
  `/api/health`, and `GET /api/geo/health`.

## Execution Model

This packet is intentionally split into layers so the fleet can parallelize
without creating incompatible map implementations.

| Layer | Scope                                                      | Rule                                                                               |
| ----- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| L0    | Provider, infra, rollout decisions                         | Must land before provider-specific UI work ships.                                  |
| L1    | Contracts, API, service-area authority                     | Must land before any surface claims production serviceability.                     |
| L2    | Shared map/picker/editor primitives                        | Must be reused by web surfaces unless a task documents a surface-specific blocker. |
| L3    | Callcenter, tenant, concierge, ops, admin, driver surfaces | May run in parallel after L1/L2 interfaces stabilize.                              |
| L4    | E2E, observability, release gates                          | Runs throughout and owns final production-readiness proof.                         |

Dispatch command:

```bash
AI_NAME=Codex python3 scripts/dispatch-map-geofence-production-wave.py
```

The script registers the task family in `ai-status.json` using the existing
`scripts/ai-status.sh assign` flow.

## Production Done Definition

Every implementation task must satisfy all applicable items below before review
approval:

1. The task's declared package typecheck/build/test commands pass.
2. API and contract changes include unit or contract tests for positive,
   negative, and degraded behavior.
3. UI changes include deterministic mocked-provider tests. They must not depend
   on a live map provider in CI.
4. Serviceability-affecting changes prove backend enforcement, not only
   frontend display.
5. Audit/provenance fields are persisted or explicitly recorded as a dependency
   if the task cannot own persistence.
6. Evidence is summarized in the task handoff with commands, route URLs, and
   screenshots/log snippets where relevant.

Recommended command baseline by scope:

| Scope touched     | Required commands                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contracts         | `pnpm --filter @drts/contracts typecheck`, `pnpm --filter @drts/contracts test`                                                                        |
| API               | `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api test`, `pnpm --filter @drts/api lint`                                                    |
| API client        | `pnpm --filter @drts/api-client typecheck`                                                                                                             |
| Shared web UI     | `pnpm --filter @drts/ui-web typecheck`, `pnpm --filter @drts/ui-web test`, `pnpm --filter @drts/ui-web lint`                                           |
| Ops Console       | `pnpm --filter @drts/ops-console-web typecheck`, `pnpm --filter @drts/ops-console-web test`, `pnpm --filter @drts/ops-console-web lint`                |
| Platform Admin    | `pnpm --filter @drts/platform-admin-web typecheck`, `pnpm --filter @drts/platform-admin-web test`, `pnpm --filter @drts/platform-admin-web lint`       |
| Tenant Console    | `pnpm --filter @drts/tenant-console-web typecheck`, `pnpm --filter @drts/tenant-console-web test`, `pnpm --filter @drts/tenant-console-web lint`       |
| Tenant Portal     | `pnpm --filter @drts/tenant-portal-web typecheck`, `pnpm --filter @drts/tenant-portal-web test`, `pnpm --filter @drts/tenant-portal-web lint`          |
| Concierge Portal  | `pnpm --filter @drts/concierge-portal-web typecheck`, `pnpm --filter @drts/concierge-portal-web test`, `pnpm --filter @drts/concierge-portal-web lint` |
| Partner Booking   | `pnpm --filter @drts/partner-booking-web typecheck`, `pnpm --filter @drts/partner-booking-web test`, `pnpm --filter @drts/partner-booking-web lint`    |
| Driver App        | `pnpm --filter @drts/driver-app typecheck`, `pnpm --filter @drts/driver-app test`, `pnpm --filter @drts/driver-app lint`                               |
| Cross-surface E2E | `pnpm test:e2e`, plus targeted configs when added by this wave                                                                                         |

## Task Catalog

| ID                | Owner -> Reviewer     | Layer | Depends on                               | Primary artifacts                              |
| ----------------- | --------------------- | ----- | ---------------------------------------- | ---------------------------------------------- |
| `MAP-PROD-000`    | `Claude` -> `Codex`   | L0    | None                                     | provider decision record, rollout flags        |
| `MAP-INFRA-001`   | `Codex` -> `Codex2`   | L0    | `MAP-PROD-000`                           | env schema, provider config, quota/health docs |
| `MAP-BE-001`      | `Codex` -> `Claude2`  | L1    | `MAP-PROD-000`                           | `packages/contracts`, migration plan           |
| `MAP-BE-002`      | `Claude2` -> `Codex`  | L1    | `MAP-BE-001`, `MAP-INFRA-001`            | `apps/api/src/modules/geo`                     |
| `MAP-BE-003`      | `Codex2` -> `Codex`   | L1    | `MAP-BE-001`, `MAP-BE-002`               | `packages/api-client`, API docs                |
| `MAP-BE-004`      | `Codex` -> `Codex2`   | L1    | `MAP-BE-001`, `MAP-BE-003`               | booking creation services                      |
| `MAP-BE-005`      | `Codex` -> `Claude2`  | L1    | `MAP-BE-004`                             | order/booking persistence and audit            |
| `MAP-BE-006`      | `Codex` -> `Codex2`   | L1    | `MAP-BE-001`                             | service-area admin APIs                        |
| `MAP-UI-001`      | `Codex` -> `Claude2`  | L2    | `MAP-BE-003`                             | shared `AddressMapPicker`                      |
| `MAP-UI-002`      | `Codex2` -> `Claude2` | L2    | `MAP-BE-006`                             | shared/admin `GeometryEditor`                  |
| `MAP-FE-CALL-001` | `Codex` -> `Claude2`  | L3    | `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005` | Callcenter phone booking                       |
| `MAP-FE-TEN-001`  | `Claude2` -> `Codex2` | L3    | `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005` | Tenant Portal and Tenant Console               |
| `MAP-FE-CON-001`  | `Codex2` -> `Claude`  | L3    | `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005` | Concierge and partner entry                    |
| `MAP-FE-OPS-001`  | `Codex` -> `Codex2`   | L3    | `MAP-BE-003`, `MAP-BE-005`, `MAP-UI-001` | Ops real map board                             |
| `MAP-FE-ADM-001`  | `Claude` -> `Codex`   | L3    | `MAP-BE-006`, `MAP-UI-002`               | Platform Admin service-area governance         |
| `MAP-MOB-DRV-001` | `Codex2` -> `Claude2` | L3    | `MAP-BE-003`, `MAP-BE-005`               | Driver trip map/navigation                     |
| `MAP-QA-001`      | `Codex` -> `Claude2`  | L4    | `MAP-BE-002`, `MAP-UI-001`               | mocked provider fixtures and E2E harness       |
| `MAP-QA-002`      | `Copilot` -> `Codex`  | L4    | all L3 tasks                             | cross-surface E2E suite                        |
| `MAP-OBS-001`     | `Gemini` -> `Claude`  | L4    | `MAP-BE-002`, `MAP-BE-005`, `MAP-BE-006` | metrics, audit events, dashboards              |
| `MAP-REL-001`     | `Claude` -> `Codex`   | L4    | `MAP-QA-002`, `MAP-OBS-001`              | release gates and rollout closeout             |

## Detailed Task Briefs

### `MAP-PROD-000` - Provider And Rollout Decision

Goal: decide the production map/geocode strategy before teams wire
provider-specific assumptions into UI or API code.

Work:

- Select the default web/native map and geocode provider strategy.
- Compare Taiwan address quality, mobile SDK support, browser SDK support,
  pricing, quota, licensing, data retention, key restrictions, and navigation
  handoff behavior.
- Define feature flags: `geoProviderEnabled`, `addressMapPickerEnabled`,
  `serviceAreaGateEnforced`, `opsRealMapEnabled`,
  `platformGeometryEditorEnabled`, and `driverTripMapEnabled`.
- Decide coordinate-less booking policy for provider outage, no geocode match,
  and manual override.

Acceptance:

- Provider decision is recorded with fallback/degraded behavior.
- Public browser keys and server-side secrets are separated.
- No UI task is allowed to ship a hard-coded provider without this decision.

Verification:

- Decision packet references the gap inventory and lists the selected default
  provider plus a mock provider for CI.

### `MAP-INFRA-001` - Provider Configuration, Health, And Quota

Goal: make the selected provider operationally safe before production traffic.

Work:

- Add environment variable documentation for browser key, server key, provider
  mode, allowed origins, quota limits, and stage/prod separation.
- Add provider health checks or synthetic checks where supported.
- Define alert thresholds for geocode latency, error rate, quota exhaustion, and
  provider outage.
- Document CSP/key restriction requirements for web surfaces and app config for
  mobile.

Acceptance:

- Local/test mode can run with mock provider only.
- Stage/prod mode fails closed when required provider secrets are missing.
- Quota and provider outage are observable before users hit silent failures.

Verification:

- Env documentation and health-check tests are included.

Implementation status as of 2026-06-30:

- Added provider runtime health contract at `GET /api/geo/health`.
- Added provider config fail-closed checks for production-like mock mode,
  disabled mode, and external mode missing `MAP_PROVIDER_SERVER_KEY`.
- Added `.env.example` map-provider variables for mode, secrets, browser
  origins, mobile bundle/package restrictions, quota budgets, and alert
  thresholds.
- Added `scripts/verify-map-provider-env.mjs` as a deploy/preflight gate.
- Added `docs/03-runbooks/map-provider-operational-runbook-20260630.md`.
- Added `infra/alerts/map-geofence-alerts.yaml` with provider health, quota,
  and booking-surface outage alert targets.

### `MAP-BE-001` - Geo Contracts And Coordinate Provenance

Goal: make coordinates auditable and provider-neutral in contracts.

Work:

- Extend address/geo contracts with geocode candidate, resolved address,
  reverse geocode, coordinate provenance, accuracy, and selected actor fields.
- Keep existing `AddressPayload.lat` and `AddressPayload.lng` compatible.
- Add service-area evaluation envelope fields needed by frontends and orders.
- Add validation helpers or schemas for lat/lng bounds and provenance.

Acceptance:

- Existing booking commands remain source-compatible.
- New payloads can represent provider candidate, manual pin, saved address,
  reverse-geocode, and external platform coordinates.
- Tests cover valid coordinates, invalid coordinates, missing provenance, and
  legacy text-only compatibility.

Verification:

- `pnpm --filter @drts/contracts typecheck`
- `pnpm --filter @drts/contracts test`

### `MAP-BE-002` - GeoModule Provider Gateway

Goal: provide one API authority for search, resolve, and reverse geocode.

Work:

- Add `apps/api/src/modules/geo`.
- Implement provider-neutral `GeoProvider` interface with a deterministic mock
  provider for CI.
- Add `GET /api/geo/search`, `POST /api/geo/resolve`, and
  `POST /api/geo/reverse`.
- Normalize provider responses into the contract shape from `MAP-BE-001`.
- Add cache hooks or explicit non-cache decision for provider responses.

Acceptance:

- API never leaks provider-specific response shape to callers.
- Mock provider can return deterministic Taipei/Taoyuan fixtures for tests.
- Provider errors return stable domain errors that UI can render.

Verification:

- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api test`
- `pnpm --filter @drts/api lint`

### `MAP-BE-003` - API Client And OpenAPI Coverage

Goal: make geo/service-area APIs consumable without surface-specific fetch code.

Work:

- Add api-client methods for geo search/resolve/reverse.
- Add api-client methods for service-area definitions/evaluate.
- Document endpoint envelopes and error codes in
  `docs/04-api/map-geofence-openapi-delta-20260630.md`.
- Ensure callcenter, ops, admin, tenant, concierge, partner, and driver code can
  import typed methods from the shared client.

Acceptance:

- No new surface uses ad hoc `fetch` for geo/service-area endpoints unless a
  package boundary forces it and is documented.
- Client tests cover serviceable, manual review, not serviceable, provider
  unavailable, and invalid coordinate responses.

Verification:

- `pnpm --filter @drts/api-client typecheck`
- API package tests from `MAP-BE-002` still pass.

### `MAP-BE-004` - Booking Creation Service-Area Gate

Status: `review` as of 2026-06-30. Owner `Codex`, reviewer `Codex2`.
Implemented for passenger, callcenter, and tenant owned-mobility creation paths.

Goal: make backend order creation enforce serviceability before dispatch.

Work:

- Integrate `ServiceAreaService` into owned/callcenter booking creation.
- Integrate the same decision model into tenant, concierge, partner, and other
  booking creation paths where backend ownership exists.
- Return explicit error/result codes for not serviceable and manual-review
  requirements.
- Preserve a compatibility path for text-only legacy commands only when policy
  allows manual review.

Acceptance:

- A dispatchable booking cannot bypass backend service-area evaluation when
  coordinates are present.
- A no-pickup stop policy blocks pickup even if the dropoff is serviceable.
- Manual-review zones produce a manual-review state rather than silently normal
  dispatch.

Verification:

- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api test`
- Unit tests cover callcenter, tenant, concierge/partner where present.

Review handoff evidence:

- `ServiceAreaModule` is wired into owned mobility booking creation.
- Coordinate-bearing passenger, callcenter, and tenant orders evaluate
  `ServiceAreaService` before normal dispatch eligibility.
- `not_serviceable` / no-pickup decisions return stable `400` error details
  before persistence.
- `manual_review` zones and text-only legacy coordinate gaps enter explicit
  service-area compliance gates and cannot silently dispatch.
- Re-handoff note: a prior review inspected an empty/incorrect branch. The
  current implementation is in the local worktree on
  `phase2-tesla-sandbox-docs-20260625`; final `done` still requires normal
  commit/push metadata.
- Passed `pnpm exec prettier --check packages/contracts/src/index.ts apps/api/src/modules/owned-mobility/owned-mobility.module.ts apps/api/src/modules/owned-mobility/owned-mobility.service.ts apps/api/tests/unit/owned-mobility.service.test.ts`.
- Passed `pnpm --filter @drts/contracts typecheck`.
- Passed `pnpm --filter @drts/contracts lint`.
- Passed `pnpm --filter @drts/api typecheck`.
- Passed `pnpm --filter @drts/api lint`.
- Passed `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/owned-mobility.service.test.ts apps/api/tests/unit/service-area.service.test.ts`
  with `86` files and `688` tests after the MAP-BE-006/visibility re-handoff
  rerun.

### `MAP-BE-005` - Persist Evaluation Snapshot And Spatial Audit

Status: `review` as of 2026-06-30. Owner `Codex`, reviewer `Claude2`.
Implemented as an immutable `OwnedOrderRecord.spatialAudit` JSON snapshot so no
schema migration is required for the current `phase1_owned_orders.record`
persistence path.

Goal: make every spatial decision explainable after the order is created.

Work:

- Persist pickup/dropoff coordinate provenance on created orders/bookings.
- Persist service-area evaluation snapshot with decision, policy codes, area
  codes, evaluated time, product type, and geometry version refs.
- Emit audit events for geocode resolution, pin confirmation, service-area
  evaluation, and manual override.
- Backfill or clearly mark existing text-only orders as legacy/no-coordinate.

Acceptance:

- Support, compliance, and dispatch can inspect why a booking was allowed,
  blocked, or routed to manual review.
- Audit entries include actor/surface where available.
- Tests prove snapshots are immutable for created orders.

Verification:

- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api test`
- Migration verification when schema changes are included.

Review handoff evidence:

- Added `OwnedOrderSpatialAuditSnapshot` contracts with stop-level coordinate
  provenance, actor/surface, service-area decision, area/policy/version refs,
  missing coordinate markers, and audit event refs.
- Passenger, callcenter, and tenant/partner booking creation now persist
  immutable spatial snapshots when `ServiceAreaService` is available.
- Service-area compliance gates prefer the persisted snapshot after creation,
  so support/compliance sees the decision made at intake rather than a later
  re-evaluation against changed geometry.
- Text-only legacy orders are explicitly represented as `legacy_text`
  coordinate provenance with missing pickup/dropoff coordinate markers.
- Phone order recording linkage now merges `recording_bound` without dropping
  existing service-area compliance flags.
- Emitted `order.spatial_audit.snapshot_created` audit events with actor,
  surface, decision, version refs, and provenance completeness.
- Passed `pnpm exec prettier --check packages/contracts/src/index.ts apps/api/src/modules/owned-mobility/owned-mobility.service.ts apps/api/tests/unit/owned-mobility.service.test.ts`.
- Passed `pnpm --filter @drts/contracts typecheck`.
- Passed `pnpm --filter @drts/contracts lint`.
- Passed `pnpm --filter @drts/contracts test` (`No test files found`, allowed
  by `--passWithNoTests`).
- Passed `pnpm --filter @drts/api typecheck`.
- Passed `pnpm --filter @drts/api lint`.
- Passed `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/owned-mobility.service.test.ts apps/api/tests/unit/service-area.service.test.ts`
  with `86` files and `684` tests.

### `MAP-BE-006` - Service-Area Management APIs

Goal: expose safe CRUD/lifecycle APIs for service areas and stop policies.

Work:

- Add admin APIs for service-area boundaries and stop policies.
- Support draft, review, publish, retire, effective dates, and version refs.
- Support geometry payload persistence/export and validation.
- Keep normal taxi service-area authority separate from Phase 2 sandbox
  operating-domain authority while reusing geometry primitives.

Acceptance:

- Admin can manage active service areas and stop policies without SQL.
- Published geometry is used by `ServiceAreaService`.
- All mutations are audited and reject invalid or self-intersecting geometry
  where validation is available.

Status as of 2026-06-30:

- Re-handoff to `Codex2` from the current worktree.
- Added command/response contracts for service-area boundary and stop-policy
  create/update/submit-review/publish/retire flows.
- Added admin controller endpoints under `/service-area/admin`.
- Added `GET /service-area/admin/geojson` plus typed
  `getServiceAreaGeoJson()` / admin lifecycle client methods so map clients can
  consume governed geometry without ad hoc fetch code.
- Added repository persistence for boundary and stop-policy geometry payloads
  through PostGIS conversion.
- Added lifecycle validation for draft/review/active/retired, effective-window
  overlap prevention, immutable active/retired update rules, and
  self-intersection rejection.
- Added mutation audit events and immediate in-memory evaluator refresh for
  published service-area and stop-policy records.
- Added `V0048__service_area_review_lifecycle.sql` so persisted records can use
  the `review` status.
- Re-review fix in implementation branch `codex/map-be-006` worktree
  `/tmp/codex-map-be-006`: Phase 2 sandbox-governance now also exposes
  draft/submit-review/publish/retire APIs for ODD operating-area boundaries,
  approved routes, and explicit `pickup-dropoff-zones` stop-policy aliases.
- Added sandbox GeoJSON exports for operating areas, routes, and pickup/dropoff
  zones so Platform Admin / Phase 2 map clients can render governed layers
  without scraping bulk upsert payloads.
- Tightened sandbox evaluator feed so only lifecycle `active` geometry reaches
  in-memory and PostGIS point/route validation; draft/review/retired geometry is
  visible to map clients but excluded from dispatch decisions.
- Reopen gap resolved in the current worktree: Phase 2 sandbox-governance
  experiment, jurisdiction, and approval-document lifecycle mutations now emit
  `sandbox-governance` audit records for create/update/upload, publish,
  rollback, archive, and experiment authorization suspend/resume paths.
- Sandbox-governance lifecycle controller methods now pass the resolved request
  identity plus `x-request-id` into audit writes, while retaining existing
  controller test call order.
- Added regression coverage that asserts the sandbox governance lifecycle audit
  action set and verifies `moduleName`, `resourceType`, `resourceId`,
  `requestId`, actor, tenant, and lifecycle summary fields for an experiment
  mutation.
- Re-handoff note: a prior review inspected an empty/incorrect branch. The
  current normal taxi service-area implementation is in this local worktree;
  final `done` still requires normal commit/push metadata.

Verification:

- Current worktree verification:
  `pnpm exec prettier --check docs/04-api/map-geofence-openapi-delta-20260630.md packages/contracts/src/index.ts packages/api-client/src/index.ts apps/api/src/modules/service-area/service-area.controller.ts apps/api/src/modules/service-area/service-area.service.ts apps/api/tests/unit/service-area.service.test.ts`,
  `pnpm --filter @drts/api exec vitest run tests/unit/service-area.service.test.ts tests/unit/owned-mobility.service.test.ts`,
  `pnpm --filter @drts/contracts typecheck`,
  `pnpm --filter @drts/api-client typecheck`,
  `pnpm --filter @drts/api typecheck`, and
  `pnpm --filter @drts/api lint`.
- Re-review fix verification in `/tmp/codex-map-be-006`:
  `pnpm --filter @drts/contracts typecheck`,
  `pnpm --filter @drts/api typecheck`, `pnpm --filter @drts/api lint`, and
  `pnpm --filter @drts/api test` (`107` files / `752` tests).
- Reopen gap verification in the current worktree:
  `pnpm exec prettier --write apps/api/src/modules/sandbox-governance/sandbox-governance.service.ts apps/api/src/modules/sandbox-governance/sandbox-governance.controller.ts apps/api/tests/unit/sandbox-governance.service.test.ts apps/api/tests/integration/sandbox-governance.controller.test.ts`,
  `pnpm --filter @drts/api exec vitest run tests/unit/sandbox-governance.service.test.ts tests/integration/sandbox-governance.controller.test.ts`,
  `pnpm --filter @drts/contracts typecheck`,
  `pnpm --filter @drts/api typecheck`, and
  `pnpm --filter @drts/api lint`.
- Passed `pnpm exec prettier --check packages/contracts/src/index.ts apps/api/src/modules/service-area/service-area.controller.ts apps/api/src/modules/service-area/service-area.service.ts apps/api/src/modules/service-area/service-area.repository.ts apps/api/src/modules/service-area/service-area.module.ts apps/api/tests/unit/service-area.service.test.ts`.
- Passed `pnpm --filter @drts/contracts typecheck`.
- Passed `pnpm --filter @drts/contracts lint`.
- Passed `pnpm --filter @drts/contracts test` (`No test files found`, allowed
  by `--passWithNoTests`).
- Passed `pnpm --filter @drts/api typecheck`.
- Passed `pnpm --filter @drts/api lint`.
- Passed `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/service-area.service.test.ts apps/api/tests/unit/owned-mobility.service.test.ts`
  with `86` files and `688` tests.
- Geometry/lifecycle unit coverage includes publish/retire/effective dating,
  evaluator refresh, stop-policy retire behavior, invalid geometry rejection,
  and controller mutation envelopes.

### `MAP-UI-001` - Shared AddressMapPicker

Goal: prevent each web surface from inventing different map/address semantics.

Work:

- Build a reusable web `AddressMapPicker` with search, candidates, pinned
  marker, draggable/adjustable pin, confidence display, and serviceability
  preview.
- Support provider-unavailable, no-match, manual coordinate entry, and
  manual-review states.
- Emit the contract payload from `MAP-BE-001`.
- Add keyboard and screen-reader affordances for degraded/manual mode.

Acceptance:

- Picker can produce pickup and dropoff payloads with lat/lng/provenance.
- Picker can call service-area evaluation after required points exist.
- CI uses a mock provider, not a live provider.

Verification:

- `pnpm --filter @drts/ui-web typecheck`
- `pnpm --filter @drts/ui-web test`
- `pnpm --filter @drts/ui-web lint`

Implementation status as of 2026-06-30:

- Added provider-neutral `AddressMapPicker` and `AddressMapPairPicker`
  primitives under `@drts/ui-web/client`.
- Added helpers for provider candidate -> `AddressPayload`, manual coordinate
  fallback -> `AddressPayload`, and pickup/dropoff -> service-area preview
  command.
- Added static component and helper tests for candidate payloads, manual
  fallback, provider outage visibility, and service-area evaluation readiness.
- Added `docs/05-ui/drts-design-canvas/address-map-picker-screen-requirements-20260630.md`
  because the current design canvas does not yet define a final map picker
  screen. Surface tasks must not claim final visual sign-off from this primitive
  alone.

### `MAP-UI-002` - GeometryEditor Primitive

Goal: give Platform Admin and Phase 2 governance a safe geometry authoring
foundation.

Work:

- Build a geometry editor primitive for polygon, circle, route corridor, and
  GeoJSON import/export.
- Include vertex edit, radius edit, undo/discard, preview, and validation
  states.
- Emit backend-ready geometry payloads and visible validation errors.
- Keep rendering provider-specific code behind a small adapter boundary.

Acceptance:

- Editor can create and edit service-area boundary and stop-policy geometry.
- Invalid geometry cannot be submitted as publish-ready.
- Editor supports review/diff display hooks for admin workflow.

Verification:

- Shared UI/admin package checks for touched package.
- Component tests cover create/edit/import/export/degraded map state.

### `MAP-FE-CALL-001` - Callcenter P0 Map Booking

Goal: make phone booking safe for exact pickup/dropoff and serviceability.

Work:

- Replace pickup/dropoff text-only fields with `AddressMapPicker`.
- Show serviceable/manual-review/not-serviceable status before submit.
- Submit lat/lng/provenance in `CreateCallCenterOrderCommand`.
- Block normal dispatch for out-of-service or no-pickup zones.
- Allow text-only fallback only through explicit manual-review policy.

Acceptance:

- Phone agent cannot unknowingly create a coordinate-less dispatchable booking.
- Successful phone order persists coordinates and evaluation snapshot.
- Out-of-area and no-pickup examples are blocked with operator-readable reason.

Verification:

- `pnpm --filter @drts/ops-console-web typecheck`
- `pnpm --filter @drts/ops-console-web test`
- `pnpm --filter @drts/ops-console-web lint`
- `pnpm exec playwright test tests/e2e/ops-console-parity.spec.ts -c playwright.ops-console-parity.config.ts -g "callcenter phone booking is gated by the map pair picker"`

Implementation status as of 2026-06-30:

- `apps/ops-console-web/app/callcenter/page.tsx` now uses
  `AddressMapPairPicker` for pickup/dropoff instead of text-only dispatchable
  address submit.
- `apps/ops-console-web/app/callcenter/map-booking.ts` centralizes the
  callcenter map submit gate and `CreateCallCenterOrderCommand` construction.
- The UI blocks coordinate-less or provenance-less phone booking submit,
  previews serviceable/manual-review/not-serviceable decisions, and leaves
  provider outage/manual fallback visible to the agent.
- Unit coverage exists in
  `apps/ops-console-web/tests/unit/callcenter-map-booking.test.ts`; an initial
  Playwright smoke now verifies the map pair picker and disabled
  coordinate-missing gate.
- Gate A is not fully closed yet: a later QA slice must prove serviceable order
  creation, no-pickup/not-serviceable block, manual-review routing,
  provider-degraded fallback, and persisted spatial audit snapshot against a
  running backend authority stack.

### `MAP-FE-TEN-001` - Tenant Address And Booking Map Alignment

Goal: make tenant-created addresses/bookings use the same coordinate authority.

Work:

- Upgrade Tenant Portal address book from manual lat/lng to map picker plus
  advanced manual fallback.
- Upgrade Tenant Console booking form so saved address and manual address flows
  show/confirm pins.
- Display shared reason codes for not-serviceable/manual-review stops.
- Preserve tenant-safe copy and permissions.

Acceptance:

- Tenant saved addresses have coordinates or an explicit missing-coordinate
  warning.
- Tenant bookings submit consistent address payloads.
- Tenant cannot bypass backend serviceability gate through UI-only state.

Verification:

- `pnpm --filter @drts/tenant-portal-web typecheck`
- `pnpm --filter @drts/tenant-console-web typecheck`
- Relevant test/lint commands for touched packages.

### `MAP-FE-CON-001` - Concierge And Partner Entry Map Alignment

Goal: align assisted and partner entry surfaces with the same coordinate model.

Work:

- Integrate `AddressMapPicker` into Concierge booking.
- Audit partner booking and related entry surfaces for text-only address paths.
- Add serviceability preview and backend gate error rendering.
- Ensure partner/concierge copy does not expose internal policy jargon.

Acceptance:

- Concierge booking submits coordinates when dispatchable.
- Partner/assisted entry shows consistent serviceability reason codes.
- Provider outage creates manual-review/degraded state, not silent normal order.

Verification:

- `pnpm --filter @drts/concierge-portal-web typecheck`
- `pnpm --filter @drts/partner-booking-web typecheck`
- Relevant test/lint commands for touched packages.

### `MAP-FE-OPS-001` - Ops Real Map Board

Goal: replace the projection-only dispatch board with a real operational map.

Work:

- Add a provider-backed `OpsMapBoard` for orders, pickup/dropoff pins, driver
  supply, candidate supply, stale/no-location states, and route lines where
  available.
- Add service-area and stop-policy overlays.
- Link queue/list rows to map focus.
- Keep the existing projection board as degraded fallback when provider is
  unavailable.

Acceptance:

- Dispatcher can inspect actual geography, not just normalized point positions.
- Stale and no-location candidates are visually distinct.
- Restricted zones and service areas are visible and filterable.

Verification:

- `pnpm --filter @drts/ops-console-web typecheck`
- `pnpm --filter @drts/ops-console-web test`
- `pnpm --filter @drts/ops-console-web lint`
- Playwright route evidence for map and fallback state.

Implementation status as of 2026-06-30:

- Added `apps/ops-console-web/app/dispatch/ops-map-board.ts` as the shared
  Ops map board model for pickup/dropoff/candidate points, stale/no-location
  counts, provider readiness, degraded fallback reason, service-area overlays,
  stop-policy overlays, and projection bounds.
- Connected the real `/dispatch` route in
  `apps/ops-console-web/app/dispatch/page.tsx` to render a server-side tile map
  surface with `data-ops-map-*` hooks, map status badge, service-area /
  stop-policy / reason / geometry chips, Web Mercator pin projection, pan/zoom
  query controls, map overlay filters, legend, and `no_spatial_data` fallback
  when the local API is unavailable.
- Removed the unused legacy `dispatch-workflow.tsx` projection component so the
  app does not carry two dispatch map implementations or raw-color legacy CSS
  against the UI token contract.
- Added `apps/ops-console-web/tests/unit/ops-map-board.test.ts` for governed
  points, degraded missing-coordinate state, no-spatial-data fallback, and
  overlay de-duplication.
- Added Playwright coverage in `tests/e2e/ops-console-parity.spec.ts` to assert
  the `/dispatch` map readiness hooks render on the actual route.

Verified:

- `pnpm --filter @drts/ops-console-web typecheck`
- `pnpm --filter @drts/ops-console-web test`
- `pnpm --filter @drts/ops-console-web lint`
- `pnpm exec eslint tests/e2e/ops-console-parity.spec.ts --max-warnings=0`
- `pnpm exec playwright test -c playwright.ops-console-parity.config.ts -g "dispatch map board exposes governed spatial readiness hooks"`

Residual follow-up:

- This is the first production slice and uses a provider-neutral tile URL
  template (`MAP_PROVIDER_TILE_URL_TEMPLATE`) instead of a vendor SDK dependency.
  If the tile template is missing, the map renders a safe tile-fallback state
  while preserving governed pins and backend dispatch authority. Full vendor SDK
  gestures and geometry polygons can follow once provider strategy and browser
  origin policy are locked.

### `MAP-FE-ADM-001` - Platform Admin Geofence Governance

Goal: let admins author, review, publish, and retire geofences safely.

Work:

- Add Platform Admin route for service-area boundaries and stop policies.
- Use `GeometryEditor` for polygons/circles/route corridors.
- Add draft/review/publish/retire/effective-date workflow.
- Add preview of affected sample stops/orders before publish.
- Keep Phase 2 sandbox operating areas/routes modeled separately from normal
  taxi service areas.

Acceptance:

- Admin can publish a no-pickup zone without SQL.
- Published zone affects backend service-area evaluation.
- Audit records actor, version, effect, direction, and effective date.

Verification:

- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/platform-admin-web test`
- `pnpm --filter @drts/platform-admin-web lint`
- Playwright admin publish/retire flow.

### `MAP-MOB-DRV-001` - Driver Trip Map And Navigation

Goal: give drivers a real map/navigation handoff without making the driver app
the service-area authority.

Work:

- Add native map SDK behind a driver map adapter.
- Show current driver location, pickup pin, dropoff pin, and route preview where
  available.
- Add external navigation handoff for Apple Maps/Google Maps/installed
  navigation using coordinates.
- Preserve GPS heartbeat and offline/degraded trip states.
- Add route-authority copy for DRTS-owned vs forwarded orders.

Acceptance:

- Driver can see actual pickup/dropoff points on trip screen.
- External navigation opens with correct coordinates.
- Heartbeat continues to run with map SDK installed.

Verification:

- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/driver-app test`
- `pnpm --filter @drts/driver-app lint`
- Mobile UAT evidence for Android/iOS or documented simulator fallback.

### `MAP-QA-001` - Mock Provider And E2E Harness

Goal: make map flows testable in CI without external map calls.

Work:

- Add deterministic mock geocode/map fixtures for Taipei core, Taoyuan airport,
  Taipei Station no-pickup, and manual-review zone.
- Provide helpers for Playwright to stub provider calls and map tile rendering.
- Add data reset/seed guidance for service-area tests.

Acceptance:

- CI can run map/address picker tests offline.
- Test fixtures cover serviceable, not-serviceable, no-pickup, manual-review,
  provider-unavailable, and no-geocode states.

Verification:

- Targeted e2e harness tests pass locally.
- Mock fixtures are documented for all surface teams.

Implementation status as of 2026-06-30:

- `packages/shared-test-fixtures/src/map-geofence-fixtures.ts` defines stable
  map/geofence fixture keys, search queries, candidate IDs, expected service
  decisions, reason codes, and response builders.
- `tests/e2e/map-geofence-harness.ts` provides Playwright route stubs for
  `/api/geo/*`, `/api/service-area/evaluate`, Next
  `/control-plane-proxy/*`, and mock map tile requests.
- `playwright.map-geofence-harness.config.ts` runs the harness without starting
  a dev server or live map provider.
- Backend mock geo provider now includes `mock-taipei-city-hall`, giving
  `E2E-MAP-001` a clean `taxi_realtime` serviceable success fixture that does
  not hit the Taipei Station no-pickup or Xinyi manual-review policies.
- Usage and fixture matrix are documented in
  `support/sidecars/MAP-QA-001/MAP-QA-001-MOCK-PROVIDER-HARNESS.md`.

Verification completed:

- `pnpm --filter @drts/shared-test-fixtures typecheck`
- `pnpm --filter @drts/shared-test-fixtures test`
- `pnpm --filter @drts/shared-test-fixtures lint`
- `pnpm --filter @drts/api exec vitest run tests/unit/geo.service.test.ts`
- `pnpm --filter @drts/api typecheck`
- `pnpm exec playwright test -c playwright.map-geofence-harness.config.ts`
- Narrow TypeScript check for the new Playwright harness/config files.

### `MAP-QA-002` - Cross-Surface E2E Suite

Goal: prove the system works end-to-end after all surfaces land.

Required E2E scenarios:

| Scenario      | Flow                                                                  | Production proof                                                                 |
| ------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `E2E-MAP-001` | Callcenter pins serviceable pickup/dropoff and creates phone order    | Order has coordinates, provenance, and service-area snapshot; Ops map shows it.  |
| `E2E-MAP-002` | Admin publishes no-pickup zone then Callcenter tries pickup inside it | Backend blocks creation; operator sees reason; audit records published policy.   |
| `E2E-MAP-003` | Manual-review zone                                                    | Order routes to manual review and cannot enter normal dispatch silently.         |
| `E2E-MAP-004` | Tenant/concierge consistency                                          | Same address/policy decision appears across non-callcenter entry surfaces.       |
| `E2E-MAP-005` | Provider outage                                                       | UI degrades and backend prevents normal coordinate-less dispatch.                |
| `E2E-MAP-006` | Ops map board                                                         | Queue item focuses real map; stale/no-location candidates are visible.           |
| `E2E-MAP-007` | Driver navigation                                                     | Driver opens trip map and launches external navigation with correct coordinates. |

Acceptance:

- Each scenario is automated where repo-local tooling supports it.
- Manual/mobile-only steps have explicit UAT evidence and cannot be silently
  marked automated.
- Final report links commands, screenshots, and remaining external-gated items.

Verification:

- `pnpm test:e2e`
- Targeted Playwright configs added by the wave.
- Driver mobile UAT evidence where automation is not available.

### `MAP-OBS-001` - Spatial Observability And Audit

Goal: make production map/geofence behavior supportable after launch.

Work:

- Add metrics for geocode success rate, provider latency, provider errors,
  coordinate-less booking attempts, service-area decision mix, and policy block
  rate.
- Add audit events: `geo.address.resolved`, `geo.pin.confirmed`,
  `service_area.evaluated`, `service_area.policy.published`,
  `service_area.policy.retired`, and `geo.manual_override.created`.
- Add dashboards/runbook notes for provider outage and serviceability spikes.

Acceptance:

- Ops/support can distinguish map provider outage from user address ambiguity
  and from service-area policy denial.
- Audit trail covers geometry mutations and order creation decisions.

Verification:

- API tests cover audit event emission.
- Runbook documents alert interpretation and first response.

### `MAP-REL-001` - Release Gates And Rollout Closeout

Goal: decide when the map/geofence stack is safe for production.

Work:

- Own final release checklist and gate evidence.
- Confirm feature-flag rollout order and rollback steps.
- Confirm PostGIS/provider prerequisites for stage/prod.
- Collect final E2E, UAT, audit, and observability evidence.
- Update gap inventory with closed/open status and any external-gated remainder.

Acceptance:

- Gate A: Callcenter safe to dispatch.
- Gate B: Governance safe to publish.
- Gate C: Ops safe to operate.
- Gate D: Driver safe to navigate.
- Gate E: Provider outage/degraded mode safe.
- No `MAP-GAP-*` item remains unowned.

Verification:

- Evidence packet references passing commands and staged smoke outcome.
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
  is updated or superseded with closeout state.

## Dependency Graph

```text
MAP-PROD-000
  -> MAP-INFRA-001
  -> MAP-BE-001
      -> MAP-BE-002 -> MAP-BE-003
      -> MAP-BE-006
      -> MAP-BE-004 -> MAP-BE-005
  -> MAP-UI-001
  -> MAP-UI-002

MAP-UI-001 + MAP-BE-004 + MAP-BE-005
  -> MAP-FE-CALL-001
  -> MAP-FE-TEN-001
  -> MAP-FE-CON-001

MAP-BE-003 + MAP-BE-005
  -> MAP-FE-OPS-001
  -> MAP-MOB-DRV-001

MAP-BE-006 + MAP-UI-002
  -> MAP-FE-ADM-001

All implementation tasks
  -> MAP-QA-002 -> MAP-REL-001
```

## Release Gates

| Gate                                | Required proof                                                                                                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate A: Callcenter safe to dispatch | Serviceable phone booking persists coordinates and service-area snapshot; out-of-area/no-pickup booking is blocked or manual-review by policy. |
| Gate B: Governance safe to publish  | Platform Admin publishes no-pickup zone; backend evaluator uses published version; audit logs actor/version/effective date.                    |
| Gate C: Ops safe to operate         | Ops real map shows orders, candidates, stale/no-location supply, and policy overlays; projection fallback works on provider outage.            |
| Gate D: Driver safe to navigate     | Driver map loads with pickup/dropoff pins; navigation handoff opens correct coordinates; heartbeat still works.                                |
| Gate E: Degraded safe               | Mock provider outage proves no surface silently creates a normal coordinate-less dispatch order.                                               |

## Dispatch Notes

- Run `python3 scripts/dispatch-map-geofence-production-wave.py` only when the
  supervisor board should receive the tasks.
- The script is idempotent for ownership/title/metadata updates, but it should
  not be used to overwrite in-progress human changes without checking
  `ai-status.json`.
- Workers should read this packet and the gap inventory before editing code.
- UI workers must not satisfy map scope with static screenshots, decorative
  cards, or projection-only mockups.
- Backend workers must not rely on frontend validation as the enforcement layer.
