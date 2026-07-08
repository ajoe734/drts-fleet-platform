# MAP-FE-ADM-001 Admin Publish Proof

**Task:** `FLEETS-CLOSEOUT-003`
**Source branch:** `codex2/fleets-closeout-003`
**Proof date:** `2026-07-08`

## Scope

This packet consolidates the repo-backed proof for the Platform Admin geofence
governance lifecycle that the closeout brief requires:

- service-area draft -> review -> publish
- stop-policy draft -> review -> publish -> retire
- invalid geometry rejection before persistence
- active version / effective-window proof
- evaluator refresh after publish
- downstream Callcenter no-pickup blocking after publish

## Canonical proof points

### Service-area publish lifecycle

Source: `apps/api/tests/unit/service-area.service.test.ts`

- `publishes service-area drafts and feeds the evaluator immediately`
- created draft:
  - `areaCode`: `KHH_CORE`
  - `status`: `draft`
  - `version`: `1`
- review transition:
  - `submitServiceAreaForReview(...)` returns `status: review`
- publish transition:
  - `publishServiceArea(...)` returns `status: active`
  - evaluator result at `2026-07-01T00:00:00.000Z` becomes:
    - `decision: serviceable`
    - `serviceAreaCodes: ["KHH_CORE"]`
    - `geometryVersionRefs: ["service_area:KHH_CORE@1"]`
- audit receipt includes:
  - `actionName: service_area.boundary.published`
  - `actorId: platform-admin-geo-001`
  - `actorType: platform_admin`
  - `requestId: req-service-area-admin-001`
  - `newValuesSummary.geometryVersionRef: service_area:KHH_CORE@1`
- observability snapshot after publish:
  - `governance.geometryMutationCount: 2`
  - `governance.serviceAreaPublishedCount: 1`

### Effective-date and active-version proof

Source: `apps/api/tests/unit/service-area.service.test.ts`

- `keeps future-effective published service areas out of evaluator until active`
- published version:
  - `areaCode`: `CYI_CORE`
  - `geometryVersionRefs: ["service_area:CYI_CORE@1"]`
  - `effectiveFrom: 2026-08-01T00:00:00.000Z`
- evaluator remains blocked before the window:
  - request at `2026-07-31T23:59:59.000Z` => `decision: not_serviceable`
- evaluator refreshes at the effective boundary:
  - request at `2026-08-01T00:00:00.000Z` => `decision: serviceable`

### Version-overlap rejection

Source: `apps/api/tests/unit/service-area.service.test.ts`

- `rejects overlapping active versions for the same service-area code`
- first active version:
  - `areaCode`: `VERSIONED_CORE`
  - window: `2026-01-01T00:00:00.000Z` -> `2026-12-31T00:00:00.000Z`
- overlapping publish candidate:
  - same `areaCode`: `VERSIONED_CORE`
  - window: `2026-06-01T00:00:00.000Z` -> `2026-07-01T00:00:00.000Z`
- publish is rejected with `ApiRequestError`, proving only one overlapping active
  version window is allowed.

### Stop-policy draft / review / publish / retire lifecycle

Source: `apps/api/tests/unit/service-area.service.test.ts`

- `publishes and retires stop policies without losing service-area coverage`
- policy draft:
  - `policyCode`: `CITY_HALL_PICKUP_BLOCK`
  - `direction`: `pickup`
  - `effect`: `deny`
  - `reasonCode`: `PICKUP_NOT_ALLOWED`
  - `effectiveFrom: 2026-06-01T00:00:00.000Z`
- review proof:
  - `submitStopPolicyForReview(...)` returns:
    - `status: review`
    - `version: 1`
    - `effectiveFrom: 2026-06-01T00:00:00.000Z`
    - `effectiveUntil: null`
  - `exportGeoJson()` exposes the reviewed record with:
    - `policyCode: CITY_HALL_PICKUP_BLOCK`
    - `status: review`
    - `version: 1`
    - `geometryVersionRef: stop_policy:CITY_HALL_PICKUP_BLOCK@1`
- publish proof:
  - `publishStopPolicy(...)` returns `status: active`
  - evaluator result at `2026-07-01T00:00:00.000Z` becomes:
    - `decision: not_serviceable`
    - `reasonCodes: ["PICKUP_NOT_ALLOWED"]`
    - `geometryVersionRefs` contains `stop_policy:CITY_HALL_PICKUP_BLOCK@1`
- retire proof:
  - `retireStopPolicy(...)` returns `status: retired`
  - retirement payload sets
    `effectiveUntil: 2026-07-15T00:00:00.000Z`
  - `exportGeoJson()` after retire exposes:
    - `status: retired`
    - `version: 1`
    - `effectiveFrom: 2026-06-01T00:00:00.000Z`
    - `effectiveUntil: 2026-07-15T00:00:00.000Z`
    - `geometryVersionRef: stop_policy:CITY_HALL_PICKUP_BLOCK@1`
  - post-retire evaluator result for the same coordinates returns
    `decision: serviceable`
- audit receipts include:
  - `actionName: service_area.stop_policy.submitted_for_review`
  - `actionName: service_area.stop_policy.published`
  - `actionName: service_area.stop_policy.retired`
  - `actorId: platform-admin-geo-001`
  - `actorType: platform_admin`
  - `requestId: req-service-area-admin-001`
  - review `newValuesSummary` includes
    `policyCode: CITY_HALL_PICKUP_BLOCK`, `status: review`, `version: 1`
  - publish `newValuesSummary` includes
    `policyCode: CITY_HALL_PICKUP_BLOCK`,
    `geometryVersionRef: stop_policy:CITY_HALL_PICKUP_BLOCK@1`,
    `status: active`, `version: 1`
  - retire `newValuesSummary` includes
    `policyCode: CITY_HALL_PICKUP_BLOCK`,
    `effectiveUntil: 2026-07-15T00:00:00.000Z`,
    `status: retired`, `version: 1`
- observability snapshot after retire:
  - `governance.geometryMutationCount: 3`
  - `governance.stopPolicyPublishedCount: 1`
  - `governance.stopPolicyRetiredCount: 1`

### Invalid geometry rejection

Source: `apps/api/tests/unit/service-area.service.test.ts`

- `rejects self-intersecting service-area geometry before persistence`
- invalid candidate:
  - `areaCode`: `BAD_BOWTIE`
  - shape: self-intersecting polygon
- `createServiceArea(...)` rejects with `ApiRequestError`
- `repository.persistServiceArea` is not called, proving invalid geometry is
  rejected before persistence or audit mutation.

### Downstream Callcenter blocked after publish

Sources:

- `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`
- `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`

Repo-backed downstream proof:

- Playwright spec `callcenter blocks no-pickup curb selections and shows the
policy reason` passed.
- The service-area governance vitest proves the upstream admin publish path for
  the deny stop policy and the downstream evaluator result
  `reasonCodes: ["PICKUP_NOT_ALLOWED"]`.
- Together they satisfy the closeout requirement that a published no-pickup
  policy blocks Callcenter order creation with an explicit reason.

## Artifact map

| Required proof                                              | Artifact                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Admin publish lifecycle + active version IDs                | `apps/api/tests/unit/service-area.service.test.ts`                                                |
| Evaluator refresh at publish / effective window             | `apps/api/tests/unit/service-area.service.test.ts`                                                |
| Stop-policy review / publish / retire export + audit window | `apps/api/tests/unit/service-area.service.test.ts`                                                |
| Invalid geometry rejection                                  | `apps/api/tests/unit/service-area.service.test.ts`                                                |
| Callcenter blocked downstream                               | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json` |
| Consolidated QA row reference                               | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE-PROMOTION-MATRIX-20260706.md`              |
