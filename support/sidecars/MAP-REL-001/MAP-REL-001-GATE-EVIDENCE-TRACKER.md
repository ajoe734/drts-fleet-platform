# MAP-REL-001 Gate Evidence Tracker

**Sidecar task:** `MAP-REL-001-SIDECAR-GATE-AUDIT`

**Parent task:** `MAP-REL-001` - Map/geofence production release gates

**Parent owner/reviewer:** `Codex2` / `Codex`

**Sidecar owner/reviewer:** `Codex` / `Codex2`
**Scope boundary:** support artifact only. This tracker does not claim production readiness; it defines the evidence required before `MAP-REL-001` can make that claim.

## 1. Current Release Verdict

Do **not** claim map/geofence production readiness yet.

As of this tracker, the fleet has a good task breakdown and several base tasks are done, but the release gates are not yet evidenced end-to-end:

- Gate A is blocked by open/review callcenter, picker, backend snapshot, and QA evidence.
- Gate B is blocked by GeometryEditor review/hardening/integration plus Platform Admin governance UI.
- Gate C is partially implemented through `MAP-FE-OPS-001`, but final cross-surface Ops proof still waits on QA.
- Gate D is blocked by driver app navigation work.
- Gate E is blocked by full provider-outage E2E across entry surfaces and observability evidence.

`MAP-REL-001` can close only after `MAP-QA-002` and `MAP-OBS-001` produce final evidence, not merely because tasks exist on the board.

## 2. Machine-Truth Snapshot

Current status summary captured during this sidecar pass:

| Status    | MAP tasks                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `done`    | `MAP-PROD-000`, `MAP-INFRA-001`, `MAP-BE-004`, `MAP-BE-006`, `MAP-FE-OPS-001`, `MAP-PROD-000-SIDECAR-ACCEPTANCE`, `MAP-UI-002-SIDECAR-REVIEW` |
| `review`  | `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-005`, `MAP-UI-001`, `MAP-UI-002`, `MAP-FE-CALL-001`, `MAP-QA-001`, `MAP-UI-002-HARDEN-001`  |
| `todo`    | `MAP-FE-ADM-001`, `MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001`                                                                                  |
| `backlog` | `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-MOB-DRV-001`, `MAP-UI-002-INTEGRATE-001`                                                             |

Important interpretation:

- `done` means branch/task-level acceptance evidence exists, not necessarily dev deploy or production readiness.
- `review` means the owner has handed off work, but release should not count it as accepted.
- `todo` / `backlog` are hard release blockers for any gate depending on those surfaces.

## 3. Release Gate Matrix

| Gate                                | Required production proof                                                                                                                                                                            | Current blocking tasks                                                                                              | Evidence `MAP-REL-001` must collect                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate A: Callcenter safe to dispatch | Serviceable phone booking persists pickup/dropoff coordinates, provenance, and immutable service-area snapshot; no-pickup/not-serviceable/manual-review cases cannot enter normal dispatch silently. | `MAP-BE-001`, `MAP-BE-002`, `MAP-BE-003`, `MAP-BE-005`, `MAP-UI-001`, `MAP-FE-CALL-001`, `MAP-QA-001`, `MAP-QA-002` | Passing callcenter E2E for serviceable creation, blocked no-pickup/not-serviceable, manual-review route, provider degraded/manual fallback, persisted spatial snapshot, and Ops visibility.                           |
| Gate B: Governance safe to publish  | Platform Admin can publish/retire no-pickup or service-area policy without SQL; evaluator uses published version; audit records actor, version, effect, direction, and effective date.               | `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`, `MAP-FE-ADM-001`, `MAP-QA-002`, `MAP-OBS-001`    | Integrated GeometryEditor validation evidence, admin publish/retire Playwright or API+UI evidence, service-area evaluator assertion, audit assertion, and blocked callcenter pickup after publish.                    |
| Gate C: Ops safe to operate         | Ops real map shows orders, pickup/dropoff pins, candidate supply, stale/no-location states, service-area/stop-policy overlays, and safe projection fallback on provider outage.                      | `MAP-BE-003`, `MAP-BE-005`, `MAP-QA-001`, `MAP-QA-002`                                                              | Ops map E2E with map-ready hooks, pins, overlay toggles, stale/no-location badges, queue focus/pan/zoom, and provider fallback.                                                                                       |
| Gate D: Driver safe to navigate     | Driver trip map shows pickup/dropoff pins; external navigation opens correct coordinates; heartbeat remains active; route authority copy is correct.                                                 | `MAP-MOB-DRV-001`, `MAP-BE-003`, `MAP-BE-005`, `MAP-QA-002`                                                         | Driver unit/simulator evidence plus Android/iOS UAT or documented simulator fallback for map render, deep link, heartbeat, offline/degraded behavior, and route-authority copy.                                       |
| Gate E: Degraded safe               | Provider outage or no-geocode state does not silently create normal coordinate-less dispatchable orders on any entry surface.                                                                        | `MAP-QA-001`, `MAP-QA-002`, `MAP-OBS-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-FE-CALL-001`                    | Offline mock-provider outage tests for callcenter, tenant, concierge/partner; backend error/manual-review assertions; observability evidence distinguishing provider outage from address ambiguity and policy denial. |

## 4. Required Final Evidence Packet

`MAP-REL-001` should produce or reference a final evidence packet under `support/sidecars/MAP-REL-001/` with these sections:

1. Gate summary: A-E marked `pass`, `fail`, or `external-gated`; no ambiguous "mostly done" status.
2. Command log: exact commands, branch/SHA, and pass/fail output for QA, API, UI, and fixture checks.
3. E2E matrix: direct link to `MAP-QA-002` final evidence for `E2E-MAP-001` through `E2E-MAP-007`.
4. Observability matrix: direct link to `MAP-OBS-001` metrics/audit evidence.
5. Rollout flags: current values and rollout order for map provider, address picker, service-area gate, ops map, platform geometry editor, and driver trip map.
6. Rollback plan: flag rollback, provider outage fallback, PostGIS/service-area migration rollback, and user/operator communication.
7. Environment prerequisites: PostGIS availability, provider keys/allowed origins/CSP/mobile config, quota alerting, mock-provider CI mode.
8. Gap closeout: every `MAP-GAP-*` from the inventory is either closed by a task/evidence link or marked external-gated with owner.

## 5. Minimum Command Expectations

Final `MAP-REL-001` evidence should include the exact tested branch/SHA and at least these command families:

```bash
pnpm --filter @drts/contracts typecheck
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api lint
pnpm --filter @drts/api test
pnpm --filter @drts/api-client typecheck
pnpm --filter @drts/ui-web typecheck
pnpm --filter @drts/ui-web lint
pnpm --filter @drts/ui-web test
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/ops-console-web lint
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/platform-admin-web lint
pnpm exec playwright test -c playwright.map-geofence-harness.config.ts
pnpm test:e2e
```

If a broad command is replaced with narrower targeted commands, the final evidence packet must explain why the targeted set still proves every release gate.

## 6. Mobile/UAT Evidence Expectations

Driver map/navigation should not be falsely counted as web Playwright coverage unless repo-local tooling actually validates the mobile app.

Acceptable evidence:

- unit/simulator test for external navigation URL generation
- Android or iOS simulator screenshot/video showing trip map pins
- heartbeat assertion while the map screen is active
- offline/degraded fallback screenshot
- route-authority copy screenshot for DRTS-owned versus forwarded orders

If physical-device evidence is unavailable, `MAP-REL-001` must mark Gate D as `external-gated` or `simulator-only`, not `pass`.

## 7. Rollout / Rollback Checklist

Before production rollout:

- Confirm map/geocode provider selection and allowed origins/CSP/mobile config from `MAP-PROD-000` / `MAP-INFRA-001`.
- Confirm PostGIS and service-area migrations are available in target environments.
- Confirm CI uses mock provider and never consumes live map quota.
- Confirm provider outage alerting and service-area decision metrics from `MAP-OBS-001`.
- Confirm feature flags are staged in safe order:
  1. provider health/mock mode
  2. address picker read-only preview
  3. service-area gate enforcement
  4. callcenter pinned booking
  5. ops real map
  6. platform geometry governance
  7. tenant/concierge/partner entry surfaces
  8. driver trip map/navigation
- Confirm rollback path:
  - disable provider-backed map rendering
  - keep mock/provider-degraded fallback visible
  - keep backend service-area authority fail-closed where required
  - route coordinate-less/manual fallback to explicit manual review, not normal dispatch

## 8. Do-Not-Claim Rules

`MAP-REL-001` must not say any of the following unless backed by final evidence:

- "Production ready"
- "All gates pass"
- "Deployed to dev/stage/prod"
- "E2E complete"
- "Driver navigation validated"
- "Provider outage safe"

Safe interim wording:

- "Release gates are defined and tracked."
- "Gate X has branch-level evidence but is awaiting review/merge/deploy."
- "Gate Y is external-gated pending mobile UAT."

## 9. Parent Handoff

Recommended note for `MAP-REL-001` owner:

```text
Use support/sidecars/MAP-REL-001/MAP-REL-001-GATE-EVIDENCE-TRACKER.md as the release closeout checklist. Do not close MAP-REL-001 until every Gate A-E row has final evidence from MAP-QA-002 and MAP-OBS-001, plus rollout/rollback/PostGIS/provider prerequisite evidence. Current status remains not production-ready because multiple required tasks are review/todo/backlog.
```
