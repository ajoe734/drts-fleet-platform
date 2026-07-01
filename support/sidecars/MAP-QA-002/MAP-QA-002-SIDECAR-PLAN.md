# MAP-QA-002 Sidecar Plan: Cross-Surface Map/Geofence E2E Coverage

**Sidecar task:** `MAP-QA-002-SIDECAR-PLAN`
**Parent task:** `MAP-QA-002` - Cross-surface map/geofence E2E suite
**Parent owner/reviewer:** `Codex2` / `Codex`
**Sidecar owner/reviewer:** `Codex` / `Codex2`
**Scope boundary:** support artifact only. This plan does not claim the final E2E suite is complete; it defines the coverage contract that `MAP-QA-002` must satisfy before `MAP-REL-001` can claim production readiness.

## 1. Production E2E Entry Criteria

`MAP-QA-002` should not be finalized until these prerequisites are true in machine truth:

| Gate                 | Required state before final E2E closure                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend authority    | `MAP-BE-001` through `MAP-BE-006` are merged or otherwise reachable from the tested branch/environment.                                                                                          |
| UI picker foundation | `MAP-UI-001` is merged and its package-level tests run in CI/offline mode.                                                                                                                       |
| Geometry foundation  | `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, and `MAP-UI-002-INTEGRATE-001` are complete; invalid coordinates and self-intersecting polygons cannot reach `canSubmit: true` in the integrated surface. |
| Surface coverage     | `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-FE-OPS-001`, `MAP-FE-ADM-001`, and `MAP-MOB-DRV-001` are complete enough to expose stable test hooks or explicit UAT evidence.       |
| Harness              | `MAP-QA-001` mock provider fixtures and Playwright helpers are available; CI must not call a live map/geocode provider.                                                                          |

If any prerequisite is missing, `MAP-QA-002` can add tests/skips/docs, but final release evidence must remain incomplete.

## 2. Scenario Coverage Matrix

| Scenario                                                                               | Release gates / prerequisites                                                                            | Production proof                                                                                                       | Owning surface tasks                                                                                                                | Automation target                                                 | Fixture / data contract                                                                                                               | Evidence required                                                                                                                    |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `E2E-MAP-001` Callcenter pins serviceable pickup/dropoff and creates phone order       | Gate A primary; Gate C Ops-visibility leg; requires backend authority and `MAP-FE-CALL-001` stable hooks | Created order contains pickup/dropoff coordinates, provenance, service-area decision snapshot, and appears on Ops map. | `MAP-FE-CALL-001`, `MAP-FE-CALL-001-SIDECAR-GATEA`, `MAP-BE-004`, `MAP-BE-005`, `MAP-FE-OPS-001`, `MAP-QA-001`                      | Playwright via Ops Console callcenter + dispatch route.           | Serviceable Taipei core pickup/dropoff, deterministic geocode candidate IDs, `taxi_realtime` serviceable decision.                    | Command output, order payload assertion, snapshot assertion, Ops map pin/status screenshot or DOM hook.                              |
| `E2E-MAP-002` Admin publishes no-pickup zone then Callcenter attempts pickup inside it | Gate B primary; Gate A blocked-booking leg; requires GeometryEditor hardening/integration                | Backend blocks creation; operator sees no-pickup reason; audit records policy publish actor/version/effective date.    | `MAP-FE-ADM-001`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`, `MAP-BE-006`, `MAP-FE-CALL-001`, `MAP-BE-004`, `MAP-OBS-001` | Playwright admin publish flow + callcenter blocked booking.       | Taipei Station no-pickup polygon/zone, published policy version, blocked pickup candidate.                                            | Admin publish command/screenshot, audit assertion, callcenter blocked reason assertion, API evaluator assertion.                     |
| `E2E-MAP-003` Manual-review zone                                                       | Gate A primary; Gate E manual-fallback safety leg                                                        | Order routes to manual review and cannot enter normal dispatch silently.                                               | `MAP-FE-CALL-001`, `MAP-FE-CALL-001-SIDECAR-GATEA`, `MAP-BE-004`, `MAP-BE-005`, `MAP-QA-001`                                        | Playwright callcenter/manual-review flow plus API assertion.      | Xinyi/manual-review fixture with stable reason code and service-area decision payload.                                                | UI manual-review banner, order status/manual-review marker, persisted snapshot, no normal dispatch job assertion.                    |
| `E2E-MAP-004` Tenant/concierge consistency                                             | Gate E cross-surface safety; requires non-callcenter entry surfaces to expose picker/degraded hooks      | Same address/policy decision appears across non-callcenter entry surfaces.                                             | `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-BE-004`, `MAP-BE-005`, `MAP-UI-001`                                                        | Playwright tenant + concierge/partner surface specs.              | Shared address fixture set: serviceable, no-pickup/not-serviceable, provider-unavailable.                                             | Tenant and concierge assertions use same reason code, same provenance shape, and backend gate cannot be bypassed by UI differences.  |
| `E2E-MAP-005` Provider outage degraded mode                                            | Gate E primary; Gate A/C safety legs for callcenter and ops fallback                                     | UI degrades visibly and backend prevents normal coordinate-less dispatch.                                              | `MAP-INFRA-001`, `MAP-UI-001`, `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-BE-004`, `MAP-QA-001`, `MAP-OBS-001`     | Playwright with mock provider unavailable route stubs.            | `GEO_PROVIDER_UNAVAILABLE` / no-geocode fixture; manual fallback requires explicit manual-review policy.                              | Degraded banner, no silent normal order, backend error/manual-review code, no live-provider network calls.                           |
| `E2E-MAP-006` Ops real map board                                                       | Gate C primary; Gate E provider-fallback leg                                                             | Queue item focuses actual map; stale/no-location candidate supply visible; overlays can be toggled.                    | `MAP-FE-OPS-001`, `MAP-BE-003`, `MAP-BE-005`, `MAP-QA-001`                                                                          | Playwright Ops dispatch route.                                    | Orders with pickup/dropoff pins, driver/candidate supply with fresh/stale/no-location records, service-area and stop-policy overlays. | DOM hooks for map readiness, pin count, stale/no-location badges, overlay chips, provider fallback state.                            |
| `E2E-MAP-007` Driver trip map and navigation                                           | Gate D primary; Gate E mobile degraded leg; requires driver UAT sidecar evidence                         | Driver sees pickup/dropoff pins and launches external navigation with correct coordinates; heartbeat remains active.   | `MAP-MOB-DRV-001`, `MAP-MOB-DRV-001-SIDECAR-UAT`, `MAP-BE-003`, `MAP-BE-005`                                                        | Mobile unit/simulator test where available; UAT packet otherwise. | Trip assignment fixture with pickup/dropoff coordinates and route authority copy.                                                     | Android/iOS or documented simulator evidence, deep-link URL assertion, heartbeat assertion, screenshots/video for mobile-only steps. |

## 3. Test File / Config Expectations

Recommended final layout for `MAP-QA-002`:

| Area                            | Expected artifact                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared harness                  | `tests/e2e/map-geofence-harness.ts` with route stubs for `/api/geo/*`, `/api/service-area/evaluate`, control-plane proxy, and mock tile requests.           |
| Fixture package                 | `packages/shared-test-fixtures/src/map-geofence-fixtures.ts` exports stable fixture keys, candidates, expected service decisions, and response builders.    |
| Cross-surface Playwright config | `playwright.map-geofence-harness.config.ts` or a dedicated `playwright.map-geofence-e2e.config.ts` that runs offline without live provider secrets.         |
| Callcenter/Ops spec             | `tests/e2e/map-geofence-callcenter-ops.spec.ts` or equivalent specs covering `E2E-MAP-001`, `E2E-MAP-003`, `E2E-MAP-005`, and the Ops leg of `E2E-MAP-006`. |
| Admin governance spec           | `tests/e2e/map-geofence-admin-governance.spec.ts` covering `E2E-MAP-002` once `MAP-FE-ADM-001` lands.                                                       |
| Tenant/concierge spec           | `tests/e2e/map-geofence-entry-surfaces.spec.ts` covering `E2E-MAP-004` across tenant and concierge/partner surfaces.                                        |
| Driver evidence packet          | `support/sidecars/MAP-QA-002/driver-navigation-uat.md` or equivalent if repo-local mobile automation cannot cover `E2E-MAP-007`.                            |
| Final report                    | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` linking commands, screenshots, UAT evidence, skipped external gates, and release gate mapping.   |

## 4. Required Assertions By Release Gate

### Gate A: Callcenter safe to dispatch

`MAP-QA-002` must prove:

- A serviceable phone booking cannot be created without confirmed pickup/dropoff coordinates unless explicit manual-review policy is selected.
- Serviceable booking persists coordinate provenance and immutable service-area snapshot.
- No-pickup/not-serviceable pickup is blocked with operator-readable reason.
- Manual-review zone creates manual-review state and not normal dispatch.

Blocking failure examples:

- Text-only address creates a normal dispatchable order.
- UI says serviceable but backend snapshot is missing.
- Backend blocks but UI hides the reason from operator.

### Gate B: Governance safe to publish

`MAP-QA-002` must prove:

- Admin can publish a no-pickup policy through UI/API without SQL.
- Published policy version affects service-area evaluation used by booking creation.
- Audit includes actor, version/effect/direction, and effective date.
- `MAP-UI-002-HARDEN-001` evidence exists before using `GeometryEditor` for publish-ready tests.

Blocking failure examples:

- Admin UI can submit invalid geometry as publish-ready.
- Published policy appears in admin UI but evaluator still uses old geometry.
- Audit misses actor/version/effective date.

### Gate C: Ops safe to operate

`MAP-QA-002` must prove:

- Ops map shows real order pins, driver/candidate supply, stale supply, no-location supply, service-area overlay, and stop-policy overlay.
- Queue item focus/pan/zoom or equivalent DOM hook targets the correct geography.
- Provider outage preserves safe projection/fallback state instead of hiding spatial risk.

Blocking failure examples:

- Map renders decorative/projection-only cards with no governed coordinates.
- Stale/no-location candidates look identical to fresh supply.
- Overlay toggles do not reflect service-area/stop-policy state.

### Gate D: Driver safe to navigate

`MAP-QA-002` must prove:

- Driver trip map renders pickup/dropoff pins from assigned trip coordinates.
- Navigation handoff opens Apple/Google/installed navigation URL with correct coordinates.
- GPS heartbeat continues with map screen active.
- DRTS-owned vs forwarded route authority copy is visible where applicable.

Blocking failure examples:

- Navigation deep link uses display address text instead of coordinates.
- Heartbeat pauses or crashes when map SDK screen opens.
- Driver app implies local route edit authority for forwarded orders.

### Gate E: Degraded safe

`MAP-QA-002` must prove:

- Mock provider outage is deterministic and offline.
- No surface silently creates a normal coordinate-less dispatch order during provider outage.
- Manual fallback is visibly degraded, auditable, and routed to manual review or blocked according to policy.

Blocking failure examples:

- CI hits a live map/geocode provider.
- Provider outage only hides the map while submit remains normal.
- Reason codes differ across callcenter/tenant/concierge surfaces.

## 5. Worker Handoff Checklist

Each implementation worker should leave these hooks/evidence for `MAP-QA-002`:

| Worker task       | Required handoff to QA                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MAP-FE-CALL-001` | Stable `data-*` hooks for pickup/dropoff picker, serviceability banner, submit button disabled/enabled reason, created order ID, and blocked/manual-review reason. |
| `MAP-FE-TEN-001`  | Stable hooks for saved-address pin confirmation, tenant booking serviceability preview, manual fallback warning, and backend gate error rendering.                 |
| `MAP-FE-CON-001`  | Stable hooks for concierge/partner picker, degraded provider state, customer-safe reason copy, and no silent normal order on outage.                               |
| `MAP-FE-ADM-001`  | Stable hooks for draft geometry, validation state, review summary, publish/retire/effective-date controls, affected sample preview, and audit version display.     |
| `MAP-FE-OPS-001`  | Stable hooks for map-ready state, order pins, candidate freshness/no-location badges, overlays, queue focus, and provider fallback.                                |
| `MAP-MOB-DRV-001` | Unit/simulator evidence for navigation URL generation plus UAT evidence for real map rendering and heartbeat coexistence.                                          |
| `MAP-OBS-001`     | Queryable audit/metric evidence for geocode resolution, pin confirmation, service-area evaluation, policy publish/retire, and manual override.                     |

## 6. Final Command Contract

The final `MAP-QA-002` evidence packet should record the exact commands that pass. Minimum expected commands:

```bash
pnpm --filter @drts/shared-test-fixtures typecheck
pnpm --filter @drts/shared-test-fixtures test
pnpm --filter @drts/shared-test-fixtures lint
pnpm exec playwright test -c playwright.map-geofence-harness.config.ts
pnpm exec playwright test -c playwright.ops-console-parity.config.ts -g "dispatch map"
pnpm test:e2e
```

If `pnpm test:e2e` is too broad or environment-gated, the final packet must state the exact substituted targeted configs and why they prove the same release gates.

Driver mobile evidence cannot be silently counted as automated Playwright proof unless repo-local tooling actually launches and validates the mobile app. Otherwise, the final packet must include UAT links/screenshots/video paths and mark the item as mobile UAT evidence.

## 7. Current Risks To Track

- `MAP-UI-002-HARDEN-001` and `MAP-UI-002-INTEGRATE-001` are explicit dependency gates for Platform Admin governance; QA should not accept admin publish E2E until the final integrated GeometryEditor surface includes both the primitive and hardening evidence.
- `MAP-QA-001` is still review-gated at the time this sidecar was created; the final suite must verify the mock provider/harness files are actually present in the tested branch.
- Tenant, concierge/partner, admin, and driver surface tasks are not complete yet, so `MAP-QA-002` should produce staged test skeletons only until those surfaces expose stable hooks.
- `MAP-REL-001` must not claim `dev_deployed` or production-ready status from this plan alone; release readiness requires final command/UAT evidence.

## 8. Reviewer Handoff

Reviewer should confirm:

- all seven runbook scenarios are represented
- each scenario maps to owning implementation tasks and release gates
- automation vs UAT expectations are explicit
- the new `MAP-UI-002-HARDEN-001` and `MAP-UI-002-INTEGRATE-001` gates are visible to QA
- this packet avoids claiming final E2E completion before the implementation tasks land

Suggested approval wording:

```text
MAP-QA-002 sidecar plan approved: the packet maps E2E-MAP-001 through E2E-MAP-007 to owning surface tasks, fixtures, automation/UAT evidence, release gates, and blocking failure conditions. It correctly keeps final E2E completion gated on MAP-QA-001, surface task completion, MAP-UI-002-HARDEN-001, and MAP-UI-002-INTEGRATE-001.
```
