# MAP-QA-002 BFF And Frontend Handoff Packet

- Sidecar Task: `MAP-QA-002-SIDECAR-BFF-HANDOFF`
- Parent Task: `MAP-QA-002`
- Helper Kind: `bff_handoff_packet`
- Sidecar Owner / Reviewer: `Codex` / `Codex2`
- Parent Owner / Reviewer: `Codex2` / `Codex`
- Date: `2026-07-01`
- Status: `FINALIZED`
- Class: support / sidecar only; no canonical-truth mutation

## Purpose

This packet refreshes the earlier 2026-06-30 draft against 2026-07-01 machine
truth and the current `origin/dev` checkout. It focuses on three practical
questions for the parent owner:

1. Which `E2E-MAP-*` scenarios have a checked-in frontend/BFF anchor right now?
2. Which dependencies are only machine-truth status changes and not yet a
   landed operator journey in this checkout?
3. Which repo-vs-acceptance gaps still need explicit QA planning before
   `MAP-QA-002` can claim all seven scenarios?

## Owner Closeout Note

- Machine truth already recorded this sidecar as `review_approved` before owner
  closeout.
- This final pass does not change the approved packet scope; it only records
  the finalized support-artifact state for branch closeout.
- Integration scope remains branch-only for this helper packet. The parent
  owner decides whether and how to absorb these notes into canonical QA work.

## Shared-Truth Baseline

- `MAP-QA-002` is now `in_progress`, owned by `Codex2`, reviewed by `Codex`.
  Its acceptance expects all seven `E2E-MAP-*` scenarios, real evidence, and
  results from both `playwright.map-geofence-harness` and
  `playwright.map-geofence-ui`.
- The scenario definitions still live in
  `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:849-855`.
- The key update since the prior draft is that `MAP-FE-OPS-001` now exists in
  machine truth and is `done`; the old “task not found” caveat is no longer
  true.

Important split:

- The table below distinguishes machine-truth task state from what is actually
  checked in on this branch. Parent QA should gate on landed repo surface, not
  status label alone.

| Task | Machine-truth status | Checked-in repo fact | QA reading |
| --- | --- | --- | --- |
| `MAP-FE-CALL-001` | `review` | `apps/ops-console-web/app/callcenter/page.tsx:2136-2144` still constructs `pickup: { address }` and `dropoff: { address }` only | `E2E-MAP-001/002/003/005` do not yet have a landed callcenter pin flow in this checkout |
| `MAP-FE-TEN-001` | `backlog` | Tenant create payload carries `pickup.lat/lng` and `dropoff.lat/lng` at `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form-utils.ts:348-369`, but the UI still exposes raw coordinate text fields at `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx:1605-1687` | Tenant is the best coordinate-bearing web anchor, but not the finished map UX |
| `MAP-FE-CON-001` | `backlog` | Concierge still submits address text only at `apps/concierge-portal-web/app/bookings/new/page.tsx:348-356`, with textarea-only pickup/dropoff inputs at `apps/concierge-portal-web/app/bookings/new/page.tsx:465-485` | `E2E-MAP-004` parity is still blocked on concierge |
| `MAP-FE-OPS-001` | `done` | `/dispatch` exposes governed spatial readiness hooks at `apps/ops-console-web/app/dispatch/page.tsx:1786-1895`, and parity coverage exists at `tests/e2e/ops-console-parity.spec.ts:300-367` | `E2E-MAP-006` is the only scenario with a strong repo-ready frontend anchor on `origin/dev` |
| `MAP-FE-ADM-001` | `in_progress` | Backend service-area admin APIs exist, but this checkout still has no `apps/platform-admin-web/app/service-area*` or `app/geofence*` route; the only checked-in geometry surface is the sandbox map component at `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx:13-18` | `E2E-MAP-002/003` can assert backend authority, but not a landed admin operator journey |
| `MAP-MOB-DRV-001` | `review` | Driver trip still renders a stylized map card at `apps/driver-app/app/trip.tsx:1829-1899`; route detail is text-summary based in `apps/driver-app/components/route-display.tsx:12-22` and `apps/driver-app/components/route-display.tsx:53-82` | `E2E-MAP-007` remains manual/UAT territory in this checkout |
| `MAP-QA-001` | `review` | `tests/e2e/map-geofence-harness.ts:1-13` only installs mock tile routes, and no `playwright.map-geofence*` config files are checked in | Parent QA still has harness/config work before it can satisfy its own acceptance language |

## Current BFF / Frontend Surface Inventory

| Area | Current entry point | BFF / API seam visible in this checkout | Repo fact | Handoff implication |
| --- | --- | --- | --- | --- |
| Geo gateway | none wired from checked-in map surfaces | OpenAPI delta still defines `/api/geo/*`, but `packages/api-client/src/index.ts:841-1092` only exposes call-center, tenant, and dispatch methods in this range; no `searchGeo` / `resolveGeo` / `reverseGeo` helpers are present | QA cannot assume a reusable `@drts/api-client` helper layer for geo operations |
| Service-area authority | backend-first | `apps/api/src/modules/service-area/service-area.controller.ts:29-258` exposes definitions, GeoJSON export, evaluation, and admin lifecycle endpoints | Backend authority is real and testable even though admin UI is not landed |
| Callcenter order creation | `apps/ops-console-web/app/callcenter/page.tsx` | `createCallCenterOrder()` posts `/api/call-center/orders` via `packages/api-client/src/index.ts:843-850` | Current page still sends address-only pickup/dropoff fields at `apps/ops-console-web/app/callcenter/page.tsx:2136-2144` | Callcenter map scenarios stay blocked until the review branch lands |
| Tenant booking entry | `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx` | Tenant booking flow can carry coordinates into `CreateTenantBookingCommand` at `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form-utils.ts:348-369` | Operators/users still type raw lat/lng into text inputs at `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx:1605-1687` | Useful as a payload-shape anchor, not as a finished map journey |
| Concierge entry | `apps/concierge-portal-web/app/bookings/new/page.tsx` | Direct `createConciergeClient()` calls create callcenter orders | Submission remains address-only at `apps/concierge-portal-web/app/bookings/new/page.tsx:348-356` and the UI offers no coordinate/map inputs at `apps/concierge-portal-web/app/bookings/new/page.tsx:465-485` | Concierge parity is still a real frontend blocker, not a QA-only problem |
| Ops map board | `apps/ops-console-web/app/dispatch/page.tsx` | Dispatch reads use `listDispatchJobs()` / `listDispatchCandidates()` at `packages/api-client/src/index.ts:1072-1087` | Spatial board exposes provider/overlay/filter hooks at `apps/ops-console-web/app/dispatch/page.tsx:1789-1895`, with a checked-in parity test at `tests/e2e/ops-console-parity.spec.ts:300-367` | This is the cleanest first automation foothold for `MAP-QA-002` |
| Driver trip map | `apps/driver-app/app/trip.tsx` | Driver task lifecycle exists, but the trip surface is still presentation-first | The visible “map” is a local styled card at `apps/driver-app/app/trip.tsx:1829-1899`, and route detail stays summary-only at `apps/driver-app/components/route-display.tsx:126-156` | Driver navigation evidence still depends on `MAP-MOB-DRV-001` landing or separate UAT proof |
| QA harness | `tests/e2e/map-geofence-harness.ts` | Shared helper currently only exports `installMockMapTileRoutes()` at `tests/e2e/map-geofence-harness.ts:5-13` | The only checked-in consumer is the ops parity spec at `tests/e2e/ops-console-parity.spec.ts:303`; there are still no `playwright.map-geofence-harness` or `playwright.map-geofence-ui` config files | Acceptance wording outpaces the repo and must be planned explicitly |

## Scenario-To-Surface Handoff Matrix

| Scenario | Primary journey | Current checked-in anchor | Blocking gap for parent QA |
| --- | --- | --- | --- |
| `E2E-MAP-001` | Callcenter pins serviceable pickup/dropoff and creates a dispatchable phone order | Backend order creation seam exists, and tenant payload shape proves coordinate-bearing booking commands | The landed callcenter page is still address-only, so the intended operator journey is not yet automatable on this branch |
| `E2E-MAP-002` | Admin publishes no-pickup zone, then Callcenter retries inside the zone | Backend service-area publish/evaluate APIs exist in `apps/api/src/modules/service-area/service-area.controller.ts:58-258` | No landed Platform Admin service-area route, and callcenter still lacks pinned coordinates |
| `E2E-MAP-003` | Manual-review zone | Backend evaluator plus tenant coordinate-bearing payload shape exist | Same missing admin journey plus same missing callcenter/concierge parity surfaces |
| `E2E-MAP-004` | Tenant / concierge consistency | Tenant already carries coordinates in the submit command | Concierge remains address-text only, so parity across non-callcenter entry surfaces is not closed |
| `E2E-MAP-005` | Provider outage degraded mode | Backend geo/service-area semantics are documented; ops map path already has mock-tile test coverage | No checked-in geo client helpers, no provider-outage harness/config layer, and callcenter still lacks the intended map input |
| `E2E-MAP-006` | Ops real map board | Real `/dispatch` spatial board plus parity assertions already exist in `tests/e2e/ops-console-parity.spec.ts:300-367` | Still needs parent-owned evidence packaging, but not a new frontend seam |
| `E2E-MAP-007` | Driver trip map and external navigation | Driver trip page shows pickup/dropoff context and workflow status | This checkout still lacks a real map SDK / trip navigation handoff in the trip flow, so the scenario remains manual/UAT-oriented |

## Repo-Vs-Acceptance Drift To Keep Visible

### 1. Dependency status is ahead of landed frontend surface

- `MAP-FE-CALL-001` and `MAP-MOB-DRV-001` are both `review`, and
  `MAP-FE-ADM-001` is `in_progress`, but this checkout still shows the old
  callcenter, driver, and admin operator surfaces.

Practical meaning:

- Parent QA should not treat dependency status alone as evidence that the
  scenario is ready on `origin/dev`.

### 2. Geo/service-area API client helpers are still absent

- `packages/api-client/src/index.ts:841-1092` includes call-center, tenant, and
  dispatch helpers, but no `searchGeo`, `resolveGeo`, `reverseGeo`,
  `getServiceAreaDefinitions`, or `evaluateServiceArea` helpers.
- Backend service-area endpoints are already real at
  `apps/api/src/modules/service-area/service-area.controller.ts:29-258`.

Practical meaning:

- Parent QA should plan either raw route stubs / direct fetches or a new helper
  layer before writing broader map/geofence automation.

### 3. `MAP-QA-002` acceptance names configs/results that do not yet exist

- Parent acceptance explicitly asks for `playwright.map-geofence-harness` and
  `playwright.map-geofence-ui` results.
- This checkout contains `tests/e2e/map-geofence-harness.ts` and
  `tests/e2e/ops-console-parity.spec.ts`, but no files matching
  `playwright.map-geofence*`.

Practical meaning:

- The parent task still needs harness/config assembly work even before the
  scenario matrix is complete.

### 4. Platform Admin geometry work is present only as a sandbox building block

- `apps/platform-admin-web/components/sandbox/sandbox-geometry-map.tsx:13-18`
  confirms that a geometry display/editor component exists for sandbox
  governance.
- No checked-in `apps/platform-admin-web/app/service-area*` or `app/geofence*`
  route exists in this checkout.

Practical meaning:

- `E2E-MAP-002` and `E2E-MAP-003` can currently prove backend authority, but
  not the intended admin operator journey.

## Recommended Assembly Order For `MAP-QA-002`

1. Start with `E2E-MAP-006`, because it already has both a landed surface and a
   checked-in parity test anchor.
2. Treat tenant as the first payload-shape scaffold for coordinate-bearing
   booking flows, but not as proof that the shared map picker journey is done.
3. Keep `E2E-MAP-001`, `E2E-MAP-002`, `E2E-MAP-003`, and `E2E-MAP-005`
   explicitly blocked on landed callcenter/admin/harness work instead of
   backfilling them with backend-only claims.
4. Keep `E2E-MAP-004` blocked on real tenant/concierge parity; the tenant
   surface alone is not enough.
5. Keep `E2E-MAP-007` manual/UAT until the trip flow itself can launch real
   navigation; the current trip card is not equivalent evidence.

## Reviewer Checklist For `Codex2`

1. The packet stays support-only and does not change canonical truth, runtime
   behavior, or task-board ownership.
2. The old `MAP-FE-OPS-001` “task not found” claim is removed and replaced with
   the current `done` state.
3. The packet cleanly separates machine-truth task status from the actually
   landed `origin/dev` operator journeys.
4. The packet makes the remaining drifts explicit: missing geo/service-area
   helpers, thin harness/config coverage, absent admin route, and not-yet-landed
   callcenter/driver journeys.

## Handoff Command

```bash
AI_NAME=Codex scripts/ai-status.sh handoff MAP-QA-002-SIDECAR-BFF-HANDOFF Codex2 \
  "Refreshed MAP-QA-002 BFF/frontend handoff packet at support/sidecars/MAP-QA-002/MAP-QA-002-SIDECAR-BFF-HANDOFF.md for 2026-07-01 machine truth. It now records MAP-FE-OPS-001 as done, separates dependency status from landed repo surfaces, maps E2E-MAP-001..007 to the current checkout, and calls out the remaining geo-helper / harness-config / admin-route gaps. Support artifact only; no canonical truth changes."
```

## Change Log

- 2026-06-30 - Codex created the initial packet from the first map/geofence
  execution wave draft.
- 2026-07-01 - Codex refreshed the packet against current machine truth and the
  `origin/dev` checkout, replacing stale `MAP-FE-OPS-001` and dependency-readiness
  assumptions with current repo evidence.
- 2026-07-01 - Codex finalized the approved packet for owner closeout without
  changing the reviewed support scope.
