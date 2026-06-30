# Map/Geofence Production Gap Closure Matrix

Date: 2026-06-30

Status: execution-ready closure matrix; not production-ready

Primary references:

- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `scripts/verify-map-geofence-production-readiness.mjs`

## Executive Answer

The current production system should be treated as missing a complete map/geofence
stack.

This is not only a UI gap. Without a governed map stack, the fleet cannot prove:

- where a rider is allowed to board or alight;
- whether a pickup/dropoff is inside the active service area;
- which no-pickup, no-dropoff, or manual-review policy caused a decision;
- whether a phone agent, tenant admin, concierge agent, passenger, dispatcher,
  or driver is looking at the same coordinate authority;
- whether production can keep working safely when the map/geocode provider is
  degraded.

Current direct answers:

| Question                                                         | Current answer                                                                                                                                                             | Production action                                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Does the Driver App have a real integrated map?                  | Not production-ready. It has GPS heartbeat and trip location context, but the real trip map/navigation work is still `MAP-MOB-DRV-001` backlog.                            | Build native trip map, pickup/dropoff pins, external navigation handoff, degraded fallback, and mobile UAT.     |
| Does Phase 2 / Platform Admin have a map for geofence setup?     | Backend lifecycle APIs and geometry primitives exist or are in review, but the admin map editor/publish UI is still open.                                                  | Complete `MAP-UI-002` plus `MAP-FE-ADM-001`; prove admin can publish no-pickup zones without SQL.               |
| Does phone callcenter have a map to mark pickup/dropoff?         | A Callcenter map pair picker implementation is in review, but it is not production-ready until backend authority, audit snapshot, and E2E evidence pass.                   | Complete `MAP-FE-CALL-001`, then prove Gate A with `E2E-MAP-001` to `E2E-MAP-003` and provider outage coverage. |
| How do we know service range and forbidden pickup/dropoff zones? | The source of truth must be backend service-area/stop-policy authority, not map visuals. Backend pieces are partly done/review; admin UI and release evidence remain open. | Gate B must prove published geometry changes backend evaluation and audit logs.                                 |

## Production Principle

Map tiles and markers are context, not authority.

Production authority must be:

- provider-neutral geocode and coordinate provenance;
- backend service-area and stop-policy evaluation;
- immutable order spatial audit snapshots;
- versioned, reviewed, and audited geometry publication;
- deterministic E2E and observability evidence.

No surface may claim production readiness if it can create a normal dispatchable
booking without coordinates, provenance, serviceability decision, and degraded
mode handling.

## Live Board Snapshot

Snapshot source: `scripts/ai-status.sh list` on 2026-06-30.

| Area                       | Task(s)                                                           | Current board state                                                                                                               | Production meaning                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider/rollout           | `MAP-PROD-000`, `MAP-INFRA-001`                                   | Provider sidecar exists; infra implementation exists; release still needs final evidence.                                         | Provider strategy, keys, quotas, and fail-closed behavior must be locked before launch.                                                            |
| Contracts/API foundation   | `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-005`            | In review.                                                                                                                        | Good progress, but not accepted production foundation yet.                                                                                         |
| Booking service-area gate  | `MAP-BE-004`                                                      | Archived as `done` in `ai-task-archive.jsonl` with PR #1013 merged to `origin/dev` as `deb5e1d366f1789c29bd26818b14ffcb801a43a3`. | Dependency is machine-safe through `archived_task_ids`; final release still needs cross-surface E2E proof that the gate works in production flows. |
| Service-area lifecycle API | `MAP-BE-006`                                                      | Done.                                                                                                                             | Backend governance API is available as a foundation; UI and E2E still required.                                                                    |
| Shared address picker      | `MAP-UI-001`                                                      | In review.                                                                                                                        | Web surfaces have a common picker foundation, but cannot claim final surface readiness yet.                                                        |
| Geometry editor            | `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001` | In review.                                                                                                                        | Needed before Platform Admin can author/publish zones safely.                                                                                      |
| Callcenter map booking     | `MAP-FE-CALL-001`                                                 | In review.                                                                                                                        | Highest-priority user-facing gap; still blocked by full backend/E2E evidence.                                                                      |
| Tenant address/booking     | `MAP-FE-TEN-001`                                                  | Backlog.                                                                                                                          | Tenant-created bookings remain coordinate-inconsistent until this lands.                                                                           |
| Concierge/partner entry    | `MAP-FE-CON-001`                                                  | Backlog.                                                                                                                          | Assisted and partner bookings remain text-only or inconsistent until this lands.                                                                   |
| Ops real map board         | `MAP-FE-OPS-001`                                                  | Done.                                                                                                                             | Useful dispatch map slice exists, but final release still needs cross-surface E2E proof.                                                           |
| Platform Admin geofence UI | `MAP-FE-ADM-001`                                                  | Todo.                                                                                                                             | Admins still cannot safely draw/publish service areas or no-stop zones in the product UI.                                                          |
| Driver map/navigation      | `MAP-MOB-DRV-001`                                                 | Backlog.                                                                                                                          | Driver app still lacks production trip map/navigation handoff.                                                                                     |
| Mock provider harness      | `MAP-QA-001`                                                      | In review.                                                                                                                        | Required for deterministic CI and cross-surface tests.                                                                                             |
| Final E2E                  | `MAP-QA-002`                                                      | Todo.                                                                                                                             | No production-ready claim until `E2E-MAP-001` to `E2E-MAP-007` pass or are explicitly UAT-gated.                                                   |
| Observability              | `MAP-OBS-001`                                                     | Todo; support evidence sidecars exist, and the final evidence template is pending re-review.                                      | Metrics, audit, dashboards, and alert evidence still need real implementation.                                                                     |
| Release closeout           | `MAP-REL-001`                                                     | Todo; readiness verifier and final release evidence template sidecars are done, but they are not production evidence.             | Release gate evidence and rollout/rollback closeout remain blocking.                                                                               |

## Gap-To-Task Closure Matrix

| Gap ID        | Production gap                                               | Owning tasks                                                                 | Current state                                                            | Closure requirement                                                                                                                                                           |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAP-GAP-001` | No shared map provider abstraction across web/native.        | `MAP-PROD-000`, `MAP-INFRA-001`, `MAP-UI-001`, `MAP-MOB-DRV-001`             | Provider/infra support exists; native driver work backlog.               | Provider decision, web adapter, native adapter, mock provider, keys/quotas/CSP/mobile restrictions, and outage behavior must be evidenced.                                    |
| `MAP-GAP-002` | No geocode/reverse-geocode authority.                        | `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-QA-001`                       | API/client/harness in review.                                            | `search/resolve/reverse` endpoints, typed client, deterministic fixtures, normalized errors, and provider-unavailable behavior pass tests.                                    |
| `MAP-GAP-003` | Callcenter cannot production-safely pin pickup/dropoff.      | `MAP-UI-001`, `MAP-FE-CALL-001`, `MAP-BE-004`, `MAP-BE-005`, `MAP-QA-002`    | Frontend in review; backend gate archived done; final E2E todo.          | Agent pins pickup/dropoff, submits coordinates/provenance, backend evaluates serviceability, snapshot persists, and blocked/manual-review/provider-degraded paths are proven. |
| `MAP-GAP-004` | Service-area evaluator not fully enforced at order creation. | `MAP-BE-004`, `MAP-BE-005`, `MAP-QA-002`                                     | Backend gate archived done; audit persistence in review; final E2E todo. | No dispatchable coordinate-bearing booking bypasses backend evaluation; text-only fallback is manual-review or blocked by policy.                                             |
| `MAP-GAP-005` | Platform Admin has no geofence editor.                       | `MAP-BE-006`, `MAP-UI-002`, `MAP-FE-ADM-001`, `MAP-QA-002`                   | Backend done; editor in review; admin UI todo.                           | Admin can draw/import/edit/review/publish/retire service areas and stop policies without SQL.                                                                                 |
| `MAP-GAP-006` | Ops map was projection-only.                                 | `MAP-FE-OPS-001`, `MAP-QA-002`                                               | Ops map slice done.                                                      | E2E proves real map shows orders, pickup/dropoff pins, supply, stale/no-location states, overlays, and provider fallback.                                                     |
| `MAP-GAP-007` | Driver app lacks true map/navigation.                        | `MAP-MOB-DRV-001`, `MAP-QA-002`                                              | Backlog.                                                                 | Driver sees pickup/dropoff pins, launches external navigation with correct coordinates, and heartbeat still works under map SDK.                                              |
| `MAP-GAP-008` | Tenant/concierge/partner flows are coordinate-inconsistent.  | `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-UI-001`, `MAP-BE-004`, `MAP-BE-005` | Backlog.                                                                 | All entry surfaces use shared picker semantics and backend serviceability errors; saved addresses show coordinate/provenance state.                                           |
| `MAP-GAP-009` | Coordinate provenance metadata incomplete.                   | `MAP-BE-001`, `MAP-UI-001`, `MAP-BE-005`, `MAP-OBS-001`                      | Contracts/UI/audit in review; observability todo.                        | Coordinates carry source, provider/place ID when available, confidence/accuracy, actor, timestamp, manual override reason, and audit events.                                  |
| `MAP-GAP-010` | Provider degradation policy incomplete.                      | `MAP-PROD-000`, `MAP-INFRA-001`, `MAP-UI-001`, `MAP-QA-002`, `MAP-OBS-001`   | Support exists; final implementation/evidence open.                      | Provider outage is visible, alerting works, manual fallback is explicit, and no surface silently creates a normal coordinate-less dispatch order.                             |
| `MAP-GAP-011` | Geometry publication workflow incomplete.                    | `MAP-BE-006`, `MAP-UI-002`, `MAP-FE-ADM-001`, `MAP-OBS-001`, `MAP-QA-002`    | Backend done; UI/E2E/OBS open.                                           | Draft -> review -> active -> retired lifecycle, effective dating, preview, audit, evaluator refresh, and rollback are proven.                                                 |
| `MAP-GAP-012` | Spatial audit trail not production-proven.                   | `MAP-BE-005`, `MAP-OBS-001`, `MAP-QA-002`                                    | Persistence in review; observability and final E2E todo.                 | Support/compliance can inspect the creation-time serviceability decision and policy/version refs for every order.                                                             |
| `MAP-GAP-013` | No final UAT/E2E evidence for map flows.                     | `MAP-QA-001`, `MAP-QA-002`, `MAP-REL-001`                                    | Harness in review; final E2E/release todo.                               | `E2E-MAP-001` to `E2E-MAP-007`, mobile UAT, stage smoke, command logs, screenshots, and readiness verifier pass.                                                              |

## Surface Execution Tasks

Fleet work packets now available in this branch:

| Surface / gate                        | Work packet                                                                 | Use for                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Callcenter / Gate A                   | `support/sidecars/MAP-FE-CALL-001/MAP-FE-CALL-001-GATE-A-EVIDENCE.md`       | Parent review and `MAP-QA-002` serviceable, blocked, manual-review, provider-degraded, snapshot, and Ops-visibility evidence. |
| Platform Admin / Gate B               | `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-GATE-B-GOVERNANCE.md`       | Admin geofence governance implementation, publish/retire UI, evaluator proof, audit evidence, and `E2E-MAP-002`.              |
| Tenant / Concierge / Partner / Gate E | `support/sidecars/MAP-FE-ENTRY-SURFACES/MAP-FE-ENTRY-GATE-E-CONSISTENCY.md` | Tenant/concierge/partner shared picker alignment, degraded/provider-outage anti-bypass, and `E2E-MAP-004` / `E2E-MAP-005`.    |
| Driver / Gate D                       | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT.md`            | Driver trip map/navigation implementation, heartbeat coexistence, degraded fallback, and `E2E-MAP-007` mobile UAT.            |

### Callcenter Phone Booking

Production owner tasks: `MAP-FE-CALL-001`, `MAP-BE-004`, `MAP-BE-005`,
`MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001`.

Required implementation:

- Replace text-only pickup/dropoff as the dispatchable path with
  `AddressMapPairPicker`.
- Search, select, pin, and manually adjust pickup/dropoff.
- Submit address, `lat`, `lng`, provenance, confidence/source, actor, and time.
- Preview serviceability before submit, but enforce it in backend creation.
- Provider outage can allow explicit manual-review fallback only; it must not
  create normal dispatchable coordinate-less orders.

Required E2E:

- `E2E-MAP-001`: serviceable phone order creates order with coordinates and
  spatial snapshot.
- `E2E-MAP-002`: published no-pickup zone blocks phone booking.
- `E2E-MAP-003`: manual-review zone routes order away from normal dispatch.
- `E2E-MAP-005`: provider outage produces degraded/manual-review state.

### Platform Admin / Phase 2 Geofence Governance

Production owner tasks: `MAP-BE-006`, `MAP-UI-002`, `MAP-FE-ADM-001`,
`MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001`.

Required implementation:

- Add Platform Admin route for service-area boundaries and stop policies.
- Use the shared `GeometryEditor` for polygons, circles, route corridors, and
  GeoJSON import/export.
- Support draft, review, publish, retire, effective date, and version refs.
- Keep normal taxi service areas separate from Phase 2 sandbox operating domain,
  while reusing geometry primitives.
- Preview affected sample stops/orders before publish.
- Audit every mutation with actor, request ID, version, effect, direction, and
  effective window.

Required E2E:

- Gate B: admin publishes a no-pickup zone without SQL.
- Backend evaluator uses the newly published version.
- Callcenter or tenant booking inside the zone is blocked or manual-reviewed by
  backend authority.
- Audit and observability evidence links policy publication to booking decision.

### Driver App

Production owner tasks: `MAP-MOB-DRV-001`, `MAP-QA-002`, `MAP-REL-001`.

Required implementation:

- Add native map SDK behind an adapter.
- Show current driver location, pickup pin, dropoff pin, route preview where
  available, and clear route authority copy.
- Add external navigation handoff using coordinates.
- Keep GPS heartbeat behavior intact.
- Provide offline/degraded fallback with coordinates, address, call ops, and
  external navigation options where possible.

Required UAT:

- Android and iOS or documented simulator fallback.
- Location permission, map render, pickup/dropoff pin correctness, navigation
  launch, and heartbeat coexistence.

### Tenant, Concierge, Partner, Passenger Entry

Production owner tasks: `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-UI-001`,
`MAP-BE-004`, `MAP-BE-005`, `MAP-QA-002`.

Required implementation:

- Tenant Portal address book uses map picker as the primary coordinate path.
- Tenant Console booking confirms saved-address pins and uses picker for manual
  addresses.
- Concierge and partner booking use the same coordinate/provenance semantics.
- All surfaces render stable backend reason codes for not-serviceable,
  no-pickup/no-dropoff, manual-review, provider unavailable, and no geocode
  match.

Required E2E:

- `E2E-MAP-004`: same fixture address receives the same serviceability decision
  across tenant and concierge/partner entry.
- Saved addresses without coordinates are visibly degraded and cannot silently
  bypass the backend gate.

### Ops Dispatch

Production owner tasks: `MAP-FE-OPS-001`, `MAP-QA-002`, `MAP-REL-001`.

Required implementation:

- Real map board shows orders, pickup/dropoff pins, driver/candidate supply,
  stale/no-location states, service-area overlays, and stop-policy overlays.
- Queue rows focus the map to the selected order.
- Projection fallback remains available on provider outage.

Required E2E:

- `E2E-MAP-006`: Ops map shows created map-governed order, candidates,
  stale/no-location state, overlays, and fallback state.

## Release Gates

| Gate                                | Production-ready proof                                                                                                                                                                    | Blocking tasks                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Gate A: Callcenter safe to dispatch | Serviceable phone booking persists coordinates/provenance/snapshot; blocked and manual-review cases are backend-enforced; provider outage does not create a normal coordinate-less order. | `MAP-FE-CALL-001`, `MAP-BE-004`, `MAP-BE-005`, `MAP-QA-002`, `MAP-OBS-001`  |
| Gate B: Governance safe to publish  | Admin publishes/retire geofence in UI; evaluator refreshes active version; audit includes actor/version/effective dates; downstream booking decision changes.                             | `MAP-UI-002`, `MAP-FE-ADM-001`, `MAP-QA-002`, `MAP-OBS-001`                 |
| Gate C: Ops safe to operate         | Ops sees governed orders/supply/policies on a real map and safe fallback on provider outage.                                                                                              | `MAP-FE-OPS-001`, `MAP-QA-002`                                              |
| Gate D: Driver safe to navigate     | Driver map loads with correct pins; navigation opens correct coordinates; heartbeat still works.                                                                                          | `MAP-MOB-DRV-001`, `MAP-QA-002`                                             |
| Gate E: Degraded safe               | Provider unavailable, no geocode, ambiguous address, manual override, and policy denial are distinguishable in UI, backend result, metrics, and audit.                                    | `MAP-PROD-000`, `MAP-INFRA-001`, `MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001` |

## E2E Evidence Required

| Scenario      | Must prove                                                            | Automation expectation                                      |
| ------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `E2E-MAP-001` | Callcenter creates serviceable pinned phone order and Ops can see it. | Playwright with mock provider and backend authority stack.  |
| `E2E-MAP-002` | Admin-published no-pickup zone blocks booking.                        | Playwright admin + callcenter flow.                         |
| `E2E-MAP-003` | Manual-review zone cannot silently enter normal dispatch.             | Playwright and API assertion.                               |
| `E2E-MAP-004` | Tenant/concierge/partner entry surfaces produce consistent decisions. | Playwright across affected web apps.                        |
| `E2E-MAP-005` | Provider outage/degraded mode is safe.                                | Mock provider outage plus backend assertion.                |
| `E2E-MAP-006` | Ops map board shows governed geography and fallback.                  | Playwright dispatch route.                                  |
| `E2E-MAP-007` | Driver map/navigation works with heartbeat.                           | Mobile UAT or simulator evidence plus unit/deep-link tests. |

## Observability Required

`MAP-OBS-001` must provide real evidence for:

- geocode search/resolve/reverse success rate;
- provider latency, error rate, and quota exhaustion;
- coordinate-less booking attempts by surface;
- service-area decision mix: `serviceable`, `manual_review`,
  `not_serviceable`;
- policy block/manual-review rates by area/policy version;
- audit events for address resolution, pin confirmation, manual override,
  service-area evaluation, policy publish/retire, and order snapshot creation;
- runbook steps that distinguish provider outage, address ambiguity, policy
  denial, coordinate-less attempt, manual override, and geometry mutation.

## Release Blockers To Clear Next

1. Finish review for `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-005`,
   `MAP-UI-001`, `MAP-UI-002`, `MAP-FE-CALL-001`, `MAP-QA-001`, and current
   `MAP-UI-002-*` integration/hardening slices.
2. Start and finish the backlog/todo surface tasks: `MAP-FE-TEN-001`,
   `MAP-FE-CON-001`, `MAP-FE-ADM-001`, and `MAP-MOB-DRV-001`.
3. Implement real `MAP-OBS-001` metrics/audit/dashboard/runbook evidence.
4. Implement `MAP-QA-002` cross-surface E2E suite and attach final artifacts.
5. Run `scripts/verify-map-geofence-production-readiness.mjs` only as the final
   guardrail after real evidence exists. The verifier is not evidence by itself.
6. Complete `MAP-REL-001` with rollout flags, rollback steps, PostGIS/provider
   prerequisites, stage smoke, and final gate closeout.

## Do-Not-Claim Rules

Do not claim the map/geofence stack is production-ready until all are true:

- no required `MAP-*` implementation task is in backlog, todo, in-progress, or
  review;
- every `MAP-GAP-001` to `MAP-GAP-013` row has a linked passing task and
  artifact;
- every Gate A to E row has explicit `PASS` evidence, command logs, branch/SHA,
  and artifact links;
- every `E2E-MAP-001` to `E2E-MAP-007` scenario has automation or documented
  external-gated UAT evidence;
- observability evidence proves metrics, audit events, alerts, and runbooks;
- provider keys, quotas, origin restrictions, PostGIS, mock-provider CI, stage
  smoke, and rollback are documented and verified.
