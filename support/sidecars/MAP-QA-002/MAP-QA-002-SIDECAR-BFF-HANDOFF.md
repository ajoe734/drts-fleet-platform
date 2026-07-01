# MAP-QA-002 · Sidecar · BFF & Frontend Handoff Packet

- **Sidecar task:** `MAP-QA-002-SIDECAR-BFF-HANDOFF`
- **Parent task:** `MAP-QA-002` — Cross-surface map/geofence E2E suite (owner `Codex2`, reviewer `Gemini`, status `in_progress`)
- **Helper kind:** `bff_handoff_packet` · `task_class: sidecar` · `mutates_canonical: false`
- **Owner:** `Claude` · **Reviewer:** `Codex2`
- **Dependency:** `MAP-FE-OPS-001` — Ops real map board (status `done`, merged to `dev`)
- **Branch:** `claude/map-qa-002-sidecar-bff-handoff` · base `dev`
- **Anchor commit (worktree HEAD == origin/dev):** `f452f019f9d887850c907a28a60ce627b930049b`
- **Scope note:** Support-only. This packet organizes the Ops BFF query surface, the operator journey, and frontend/test-hook handoff materials so the parent QA owner can evidence the **Ops real map** scenario (`E2E-MAP-006`, Gate C: *Ops safe to operate*). **No canonical truth is edited.**

> ⚠️ Machine-truth sourcing note: the canonical repo root filesystem is checked out to a different branch, so its `apps/ops-console-web/**` files predate `MAP-FE-OPS-001`. All anchors below were verified against **this worktree** (`.artifacts/worktrees/auto/claude-map-qa-002-sidecar-bff-handoff`, `HEAD=f452f019f` = `origin/dev`), which includes the merged `MAP-FE-OPS-001` surface. Cite the worktree/`dev` state, not the canonical-root working copy.

---

## 1. Scope & lane discipline

| Field | Value |
| --- | --- |
| Support artifact | `support/sidecars/MAP-QA-002/MAP-QA-002-SIDECAR-BFF-HANDOFF.md` (this file, sole artifact) |
| Canonical edits | none |
| Owner ≠ reviewer | owner `Claude`, reviewer `Codex2` — separation preserved (parent owner is `Codex2`; parent reviewer is `Gemini`) |
| Closeout integration | `not_applicable` (sidecar §11.6, `commit_required=false`) |

This is a *parallel support slice*. The parent owner (`Codex2`) decides whether to absorb any of these findings into the mainline `MAP-QA-002-FINAL-EVIDENCE.md`.

---

## 2. Dependency status (`MAP-FE-OPS-001`)

`MAP-FE-OPS-001` (Ops real map board) is **`done`** and merged to `dev`:

- `commit_hash`: `e7785a51431ab2adba4d1b063127271f44d67f12`
- `commit_subject`: `MAP-FE-OPS-001: owner closeout after review approval (#1018)`
- `push_ref`: `origin/dev`
- owner `Codex` / reviewer `Codex2`

`git log -- apps/ops-console-web/app/dispatch/ops-map-board.ts` confirms `e7785a514` is the last commit touching the Ops map board module — i.e. the real-map surface (`OpsMapRouteSegment`, `routeSegments`, tile viewport) landed there. **This sidecar's dependency is satisfied**, so the Ops surface is testable today.

Parent `MAP-QA-002` remains `in_progress` (readiness=**fail**, 34 failures) because **six other** dependencies are still open per its `next` field: `MAP-FE-CALL-001`=review, `MAP-FE-TEN-001`=in_progress, `MAP-FE-CON-001`=review, `MAP-FE-ADM-001`=in_progress, `MAP-MOB-DRV-001`=review, `MAP-QA-001`=review. The Ops row (`E2E-MAP-006`) is the one this packet unblocks for evidencing.

---

## 3. Ops BFF surface map (machine-truth anchors)

The Ops "BFF" is the Next.js server component `DispatchPage` in `apps/ops-console-web/app/dispatch/page.tsx`. It authenticates via `getServerOpsClient()` and fan-out-queries the control-plane API, then assembles the spatial board in-process.

### 3.1 Auth / client
- `apps/ops-console-web/lib/api-client.server.ts` → `getServerOpsClient()` mints control-plane request auth (`issueControlPlaneRequestAuth`, `actorType: "ops_user"`) and returns an `@drts/api-client` `ApiClient`. Base URL from `DRTS_API_URL` (default `http://localhost:3001`); Cloud Run metadata identity token injected when `DRTS_API_AUTH_AUDIENCE` / `*.a.run.app`.

### 3.2 Queries issued by the BFF (`page.tsx`)
| API path | Loader | Anchor |
| --- | --- | --- |
| `/api/orders` | `loadListRuntime<OwnedOrderRecord>` | page.tsx:456 (loader), consumed ~2597 |
| `/api/dispatch/tasks` | `loadListRuntime<DispatchJobRecord>` | ~2598 |
| `/api/driver/tasks` | `loadListRuntime<DriverTaskRecord>` | ~2599 |
| `/api/drivers` | `loadListRuntime<DriverRegistryRecord>` | ~2600 |
| `/api/forwarder/orders` | `loadListRuntime<ForwardedOrderRecord>` | ~2601 |
| `/api/forwarder/adapters/health` | `loadListRuntime<AdapterHealthRecord>` | ~2604 |
| `/api/forwarder/reconciliation-issues` | `loadListRuntime<ForwarderReconciliationIssue>` | ~2608 |
| `/api/ops/partner/eligibility/reviews` | `loadListRuntime<PartnerEligibilityReviewQueueItem>` | ~2612 |
| `/api/identity/context` | `client.get<IdentityContext>` | 2615 |
| `/api/health` | `loadHealthPayload()` | 499–502 |
| `/api/dispatch/tasks/{dispatchJobId}/candidates` | `loadListRuntime<DispatchCandidate>` **per visible job** | 2681–2688 |

### 3.3 Spatial assembly
- `buildOpsMapBoardModel({ orders, orderJobMap, candidatesByJobId, visibleLimit })` — `apps/ops-console-web/app/dispatch/ops-map-board.ts:154`. Returns `OpsMapBoardModel` (`ops-map-board.ts:60`): `providerStatus` (`ready`|`degraded_projection`|`no_spatial_data`), `fallbackReason` (`none`|`missing_coordinates`|`no_visible_points`), `points`, `routeSegments`, `overlays`, and the count fields (`ordersWithPickupCoordinates`, `ordersMissingPickupCoordinates`, `candidateSupplyPoints`, `staleCandidatePoints`, `noLocationCandidateCount`).
- Point kinds: `OpsMapPoint.kind` = `pickup`|`dropoff`|`candidate` (`ops-map-board.ts:16`).
- Route segments: `OpsMapRouteSegment` (`ops-map-board.ts:36`) built only when both `pickup` and `dropoff` have finite coords (`ops-map-board.ts:196`) — straight pickup→dropoff segment.
- Overlays: `buildOpsMapOverlaySummary()` (`ops-map-board.ts:273` region) derives `serviceAreaCodes` / `policyCodes` / `geometryVersionRefs` / `reasonCodes` / `decisions` from each order's `spatialAudit` snapshot.
- Candidate freshness: `getCandidateLocationState()` (`apps/ops-console-web/app/dispatch/location-state.ts:22`) → `fresh` | `stale` | `low_accuracy` | `missing`.
- Tile viewport: `buildOpsMapTileViewport()` / `resolveOpsMapTileUrlTemplate()` (`ops-map-board.ts`), Web-Mercator; mock tiles `"/mock-map-tiles/{z}/{x}/{y}.svg"` for local/test/mock runtimes only.
- Spatial contract source: `OwnedOrderSpatialAuditSnapshot` — `packages/contracts/src/index.ts:586` (with `OwnedOrderSpatialAuditDecision`@566, `ServiceAreaEvaluationResult` via `serviceAreaEvaluation`@597).
- Board wiring: `buildOpsMapBoardModel` is called with `visibleOwnedByBoard` at `page.tsx:2798` and `2814`; `visibleLimit = Math.min(records.length, 10)`.

---

## 4. BFF query gaps (hand these to parent owner)

These are **observations for QA/evidence framing**, not defects to fix in this sidecar. Each is a real constraint the E2E-MAP-006 evidence and the operator narrative should acknowledge.

1. **Candidate location is an N+1 fan-out.** The BFF issues one `/api/dispatch/tasks/{dispatchJobId}/candidates` call per *visible* dispatch job (`page.tsx:2681–2688`, `Promise.all` over `visibleDispatchJobIds`). There is no batch/bulk candidate-location endpoint. Under a large board this multiplies API round-trips and can stale the map. → E2E should note map freshness is bounded by this fan-out; consider asserting behavior at small board sizes only.
2. **Map is capped at 10 orders.** `visibleLimit = Math.min(..., 10)` (`page.tsx:2802`, `2818`). Pins/routes reflect only the first 10 filtered orders, not the full board. → Evidence for "dispatcher sees actual geography" is correct *for the visible slice*; document that overflow orders are not spatially rendered.
3. **Overlays are audit-derived codes, not geometry.** `serviceAreaCodes` / `policyCodes` / `geometryVersionRefs` come from per-order `spatialAudit` (`ops-map-board.ts:273`), and `routeSegments` are straight pickup→dropoff lines (`ops-map-board.ts:196`), **not** provider-routed polylines or actual service-area polygons. → "service zones filterable" (dep acceptance) is satisfied via codes+filters; do not claim rendered polygon geometry.
4. **Provider status is inferred locally, not from a provider-health signal.** `providerStatus` is computed from data completeness (`points.length` / missing coords / no-location candidates → `ready`|`degraded_projection`|`no_spatial_data`). Tile availability is env-driven (`resolveOpsMapTileUrlTemplate`). → This is **distinct** from `E2E-MAP-005` (provider *outage* degraded), which is a separate scenario. Ops "degraded_projection" here means *incomplete governed coordinates*, not a provider outage. Keep the two evidence rows separate.
5. **No routing-provider ETA/route line.** `etaMinutes` originate only from `DispatchJobRecord.latestEtaMinutes` / `DispatchCandidate.etaMinutes`; there is no routed-distance/route-geometry call in the BFF. → Any "route line" evidence is the straight-segment approximation from gap #3.

---

## 5. Operator journey — `E2E-MAP-006` (Ops real map, Gate C)

Maps the dependency acceptance bullets (`MAP-FE-OPS-001`) to the runtime path a dispatcher takes:

| Step | Operator action | Runtime / anchor | Dep acceptance |
| --- | --- | --- | --- |
| 1 | Open `/dispatch` | server component `DispatchPage` (`page.tsx:2548`) fans out §3.2 queries | — |
| 2 | See real geography with pins | spatial board renders `data-ops-map-provider-status`, `-service-areas`, `-policy-codes` (page.tsx:1789–1793); pins `data-ops-map-point-kind` (1976) | "dispatcher sees actual geography" |
| 3 | Distinguish stale / no-location supply | `data-ops-map-freshness` (1973) from `getCandidateLocationState`; `staleCandidatePoints` / `noLocationCandidateCount` counts | "stale/no-location distinct" |
| 4 | Filter by service zone / stop policy | `data-ops-map-service-area-filter` (1871) / `-policy-filter` (1872); `orderMatchesMapFilters` (page.tsx ~2804) | "service zones filterable" |
| 5 | Pan / zoom to a queue item | `buildOpsMapHref` (mapZoom/mapLat/mapLng query params), `shiftOpsMapCenter`; `data-ops-map-zoom` (1922), `-center-lat/-lng` (1914/1915) | queue item pan/zoom |
| 6 | Follow a job's route | `renderOpsMapRouteLine` (page.tsx:1642), `data-ops-map-route-line` (1676), `data-ops-map-route-count` (1792), `data-ops-map-route-layer` (1946) | route line |
| 7 | Provider degraded / no data → projection fallback | `data-ops-map-fallback-reason` (1789); `data-ops-map-render-mode` = `tile`\|`tile_fallback` (1916); original projection board retained | "projection fallback works" |

---

## 6. Frontend / test-hook handoff materials

### 6.1 Stable DOM test hooks (`page.tsx`) — QA selector contract
`data-ops-map-provider-status`, `-fallback-reason`, `-service-areas`, `-policy-codes`, `-route-count` (board root, 1789–1793); `-service-area-filter`, `-policy-filter` (1871–1872); `-overlay-count` (1848); `-center-lat`, `-center-lng`, `-render-mode`, `-tile-template`, `-zoom` (1914–1922); `-route-layer` (1946); `-route-line`, `-job-id`, `-order-id` on route segments (1674–1676); `-point-kind`, `-freshness`, `-job-id`, `-order-id` on pins (1973–1976).

### 6.2 Existing automated coverage (repo-local, runnable today)
- **Unit:** `apps/ops-console-web/tests/unit/ops-map-board.test.ts` — `describe("ops map board model")`, **10 tests** incl. governed points + service-area overlays (L131), degraded on missing coords (L175), `no_spatial_data` (L202), overlay dedup (L221), Web-Mercator viewport + pin projection (L253), deterministic mock tiles only for local/test/mock (L283).
- **E2E:** `tests/e2e/ops-console-parity.spec.ts` — `test("dispatch map board exposes governed spatial readiness hooks")` (L300): asserts `data-ops-map-provider-status`/`-fallback-reason`/`-service-areas`/`-policy-codes`, service-area filter, `route-count > 0` ⇒ `render-mode` + `tile-template=configured` + route-line + first pin kind/order-id.
- **Harness:** `tests/e2e/map-geofence-harness.ts` — `installMockMapTileRoutes()` serves a deterministic SVG for `**/mock-map-tiles/**` so tile rendering is hermetic in CI.
- **i18n:** `apps/ops-console-web/lib/translations.ts:1792+` — `dispatch.workflow.map.*` (title, subtitle, ordersWithCoords, supplyPoints, staleSupply, noLocationSupply, projectionNote, tileFallback, viewport, zoomIn, legend.route, overlay.stopPolicies).

### 6.3 Suggested evidence commands for the parent owner (Ops row)
- `pnpm --filter @drts/ops-console-web test -- ops-map-board` (unit)
- Playwright `ops-console-parity.spec.ts` "dispatch map board …" with `installMockMapTileRoutes` (E2E, hermetic tiles)

---

## 7. Gap against parent acceptance

`MAP-QA-002` acceptance requires `MAP-QA-002-FINAL-EVIDENCE.md` populated with real artifacts, all seven E2E scenarios evidenced, row-level artifact path/link evidence, and no placeholder tokens. As of anchor `f452f019f`, **`support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` does not exist** (`git ls-files support/sidecars/MAP-QA-002/` returns no FINAL-EVIDENCE file). This sidecar supplies the **Ops (`E2E-MAP-006`) row inputs** — hooks, tests, journey, gaps — for the parent owner to assemble that file; it does not create the final-evidence document itself (that is parent-owned canonical QA truth).

---

## 8. Handoff

- **State:** support artifact complete; handing to reviewer `Codex2`.
- **For the reviewer:** verify anchors resolve on `dev`/worktree `f452f019f` (not canonical root), confirm no canonical files were edited, and confirm the BFF-gap framing (§4) does not overstate rendered geometry.
- **On approval:** owner `Claude` closes out with `INTEGRATION_STATUS=not_applicable` (sidecar §11.6). Parent owner `Codex2` decides absorption into `MAP-QA-002-FINAL-EVIDENCE.md`.
