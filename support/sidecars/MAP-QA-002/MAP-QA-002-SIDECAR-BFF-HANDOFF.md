# MAP-QA-002 BFF And Frontend Handoff Packet

- Sidecar Task: `MAP-QA-002-SIDECAR-BFF-HANDOFF`
- Parent Task: `MAP-QA-002`
- Helper Kind: `bff_handoff_packet`
- Sidecar Owner / Reviewer: `Codex` / `Codex2`
- Parent Owner / Reviewer: `Codex2` / `Codex`
- Date: `2026-06-30`
- Status: `READY FOR REVIEW`
- Class: support / sidecar only; no canonical-truth mutation

## Purpose

This packet turns the current `MAP-QA-002` repo state into a practical handoff
for the parent owner. It does not restate the whole map/geofence wave. It
focuses on three questions:

1. Which frontend/BFF seams already exist for the seven `E2E-MAP-*` scenarios?
2. Which operator journeys are actually wired in this branch, versus only
   described in the runbook?
3. Which repo-vs-doc drifts will affect `MAP-QA-002` automation planning?

## Shared-Truth Baseline

- `MAP-QA-002` is currently `todo`, owned by `Codex2`, reviewed by `Codex`,
  and its acceptance still expects all seven scenarios plus explicit manual
  evidence for mobile-only gaps.
- The runbook defines `E2E-MAP-001` through `E2E-MAP-007` in
  `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:841-860`.
- The map/geofence endpoint reference is the delta doc at
  `docs/04-api/map-geofence-openapi-delta-20260630.md:1-251`, not the older
  platform-wide OpenAPI bundle.
- Current phase machine-truth snapshot that matters to `MAP-QA-002`:

| Task | Status | Why it matters to `MAP-QA-002` |
| --- | --- | --- |
| `MAP-FE-CALL-001` | `review` | Callcenter flow is the primary entry for `E2E-MAP-001/002/003/005`. |
| `MAP-FE-TEN-001` | `backlog` | Tenant parity for `E2E-MAP-004` is not closed yet. |
| `MAP-FE-CON-001` | `backlog` | Concierge parity for `E2E-MAP-004` is not closed yet. |
| `MAP-FE-ADM-001` | `todo` | Governance UI for `E2E-MAP-002/003` is still pending. |
| `MAP-MOB-DRV-001` | `backlog` | Driver map/navigation proof for `E2E-MAP-007` is still pending. |
| `MAP-QA-001` | `review` | Test harness support exists in planning, but current repo state is narrower than the runbook claims. |
| `MAP-QA-002` | `todo` | Parent execution task has not started yet. |

Machine-truth caveat:

- The runbook and `MAP-QA-002.depends_on` both reference `MAP-FE-OPS-001`, but
  `scripts/ai-status.sh show MAP-FE-OPS-001` currently returns `Task not found`.
  The repo does contain the Ops dispatch map implementation, so parent QA work
  should treat the Ops map as a repo-state dependency, not as a queryable task
  row.

## BFF Query Inventory

| Area | Current repo entry point | Current BFF / API seam | Repo fact | Handoff implication |
| --- | --- | --- | --- | --- |
| Geo gateway | none wired from checked-in map surfaces | OpenAPI delta defines `GET /api/geo/health`, `GET /api/geo/search`, `POST /api/geo/resolve`, `POST /api/geo/reverse` in `docs/04-api/map-geofence-openapi-delta-20260630.md:47-132` | `packages/api-client/src/index.ts` currently has no `searchGeo` / `resolveGeo` / `reverseGeo` methods, even though the gap plan and delta doc say they should exist | `MAP-QA-002` cannot assume a reusable client abstraction for geo operations in this branch |
| Service-area authority | backend only | `GET /api/service-area/definitions`, `GET /api/service-area/admin/geojson`, `POST /api/service-area/evaluate`, plus admin lifecycle endpoints in `apps/api/src/modules/service-area/service-area.controller.ts:29-240` | Backend controller is present, but no checked-in `apps/platform-admin-web/app/service-area*` route exists | Governance scenarios can target backend APIs, but not a landed Platform Admin page yet |
| Callcenter order creation | `apps/ops-console-web/app/callcenter/page.tsx` | `getOpsClient().createCallCenterOrder()` -> `POST /api/call-center/orders` via `packages/api-client/src/index.ts:843-850` and `apps/ops-console-web/lib/api-client.ts:12-47` | The form submits address text only: `pickup: { address }`, `dropoff: { address }` at `apps/ops-console-web/app/callcenter/page.tsx:2136-2161` | `E2E-MAP-001/002/003/005` still lack a checked-in callcenter pin/coordinate flow |
| Tenant booking entry | `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx` | Policy preview uses `/api/bookings/policy-preview`; submit uses `/api/bookings/create`, whose route handler POSTs `/api/tenant/bookings` at `apps/tenant-console-web/app/api/bookings/create/route.ts:40-103` | The tenant form already carries `pickupLat`, `pickupLng`, `dropoffLat`, `dropoffLng` into `CreateTenantBookingCommand` at `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form-utils.ts:348-413` | Tenant is the closest repo-ready coordinate-bearing web entry, but it still uses manual coordinate fields rather than geo search/resolve |
| Concierge entry | `apps/concierge-portal-web/app/bookings/new/page.tsx` | Direct `createConciergeClient()` API calls with limited ops scopes at `apps/concierge-portal-web/lib/api-client.ts:16-35` | Concierge creates callcenter orders with address text only at `apps/concierge-portal-web/app/bookings/new/page.tsx:330-380`; the form has no lat/lng or map pin UI at `apps/concierge-portal-web/app/bookings/new/page.tsx:465-486` | `E2E-MAP-004` still needs a real concierge map/parity slice |
| Ops map board | `apps/ops-console-web/app/dispatch/page.tsx` | Ops client routes through `/control-plane-proxy` when present at `apps/ops-console-web/lib/api-client.ts:12-47`; dispatch reads use `listDispatchJobs()` / `listDispatchCandidates()` at `packages/api-client/src/index.ts:1072-1087` | The `/dispatch` page exposes governed spatial hooks such as `data-ops-map-provider-status`, `data-ops-map-service-areas`, and `data-ops-map-policy-codes` at `apps/ops-console-web/app/dispatch/page.tsx:1784-1888` | `E2E-MAP-006` already has a concrete frontend anchor |
| Driver trip map | `apps/driver-app/app/trip.tsx` | Driver task data flows exist, but the trip screen is still a local stylized surface | The map card is a drawn placeholder, not a provider-backed map, at `apps/driver-app/app/trip.tsx:1829-1899`; no trip-flow `Linking.openURL` navigation handoff exists in `apps/driver-app/app` or `apps/driver-app/lib` | `E2E-MAP-007` remains mobile/UAT territory until the real navigation handoff lands |

## Scenario-To-Surface Handoff Matrix

| Scenario | Primary UI / operator journey | Current repo-ready anchor | Blocking gap for parent QA |
| --- | --- | --- | --- |
| `E2E-MAP-001` | Callcenter pins serviceable pickup/dropoff and creates phone order | Backend order creation seam exists; tenant form proves coordinate-bearing create payload shape | Checked-in callcenter page still submits text-only addresses, so there is no landed callcenter pin flow to automate yet |
| `E2E-MAP-002` | Admin publishes no-pickup zone, then Callcenter retries inside the zone | Backend service-area admin lifecycle endpoints exist in the API controller | Platform Admin governance route is not landed, and callcenter still lacks coordinate pinning |
| `E2E-MAP-003` | Manual-review zone | Backend evaluator and service-area authority exist; tenant payload can carry coordinates | Same missing admin UI plus missing cross-surface map entry parity |
| `E2E-MAP-004` | Tenant / concierge consistency | Tenant new-booking flow already supports manual coordinates and a real submit path | Concierge still uses address text only, so the two entry surfaces are not yet map-parity equivalents |
| `E2E-MAP-005` | Provider outage degraded mode | OpenAPI delta defines `GEO_PROVIDER_UNAVAILABLE` behavior for search/resolve/reverse | No checked-in geo BFF consumer, and current harness does not stub provider failure paths |
| `E2E-MAP-006` | Ops map board | `/dispatch` real map board plus parity spec already assert spatial readiness hooks | This is the best first automation foothold for `MAP-QA-002` |
| `E2E-MAP-007` | Driver trip map and external navigation | Driver trip page shows pickup/dropoff presentation and workflow status | No real map SDK or external navigation handoff exists in the checked-in trip flow |

## Repo-Vs-Plan Drift To Keep Visible

### 1. `MAP-012` is still visible as a gap in code

- The gap inventory still lists `MAP-012` as “Add API client methods” for
  `searchGeo`, `resolveGeo`, `reverseGeo`, `getServiceAreaDefinitions`, and
  `evaluateServiceArea` in
  `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:278-289`.
- The OpenAPI delta says those methods are exposed from
  `packages/api-client/src/index.ts` in
  `docs/04-api/map-geofence-openapi-delta-20260630.md:226-250`.
- The current branch does not contain those method names or endpoint strings in
  `packages/api-client/src/index.ts`.

Practical meaning:

- Parent QA should not write its first automation assuming these helper methods
  are already callable from `@drts/api-client`.

### 2. `MAP-QA-001` harness is thinner than the runbook says

- The runbook says `tests/e2e/map-geofence-harness.ts` stubs `/api/geo/*`,
  `/api/service-area/evaluate`, Next control-plane routes, and mock tiles in
  `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:817-823`.
- The current file `tests/e2e/map-geofence-harness.ts:1-13` only installs a
  mock tile route for `**/mock-map-tiles/**`.
- No `playwright.map-geofence-harness.config.ts` file exists in this branch.

Practical meaning:

- Parent QA can reuse the mock tile helper for `E2E-MAP-006`, but any geo or
  service-area stubbing still has to be added before broader automation can
  claim harness coverage.

### 3. Platform Admin governance UI is not yet a wired route

- The only checked-in map/governance UI artifact under `apps/platform-admin-web`
  is `components/sandbox/sandbox-geometry-map.tsx:13-18`, a reusable geometry
  display component.
- There is no checked-in page route for service-area or stop-policy governance.

Practical meaning:

- `E2E-MAP-002` and `E2E-MAP-003` can currently prove backend authority, but
  not a landed admin operator journey.

## Recommended Assembly Order For `MAP-QA-002`

1. Start from `E2E-MAP-006` because the Ops map surface and parity assertions
   already exist in `tests/e2e/ops-console-parity.spec.ts:300-358`.
2. Treat tenant as the first realistic coordinate-bearing web entry, because
   the tenant booking command already carries lat/lng fields even though the
   geo BFF is still missing.
3. Keep callcenter, concierge, and admin scenarios explicitly blocked on their
   frontend slices instead of hiding the gap behind raw backend-only claims.
4. If parent QA needs automation before those UI slices land, stub raw
   `/api/geo/*` and `/api/service-area/evaluate` routes directly in tests rather
   than pretending the documented API-client helpers or harness are already in
   place.
5. Keep `E2E-MAP-007` marked as manual/UAT until driver navigation handoff is
   real; the current trip page is not a substitute for external navigation
   proof.

## Reviewer Checklist For `Codex2`

1. The packet stays support-only and does not change canonical truth, runtime
   behavior, or task-board ownership.
2. The scenario matrix reflects the current repo state, not the more ambitious
   runbook wording.
3. The packet makes the three drift items explicit:
   missing geo/service-area API-client methods, thin QA harness, and absent
   Platform Admin governance route.
4. The packet does not over-claim callcenter, concierge, or driver map
   readiness.

## Handoff Command

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MAP-QA-002-SIDECAR-BFF-HANDOFF Codex2 \
  "Prepared MAP-QA-002 BFF/frontend handoff packet at support/sidecars/MAP-QA-002/MAP-QA-002-SIDECAR-BFF-HANDOFF.md. It maps E2E-MAP-001..007 to current repo surfaces, identifies repo-vs-doc drift in geo API-client methods and QA harness scope, records the missing Platform Admin governance route, and calls out that the Ops map board is the only concrete frontend-ready automation foothold. Support artifact only; no canonical truth changes."
```
