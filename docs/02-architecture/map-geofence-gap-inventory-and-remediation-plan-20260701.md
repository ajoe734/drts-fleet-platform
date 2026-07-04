# Map Geofence Gap Inventory And Remediation Plan - 2026-07-01 Delta

This file is a focused continuation of
`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`.
It records the planning resolution that unblocks `MAP-FE-ADM-001` at the
product/contract layer without pretending the visual-design gap is already
closed.

## Baseline

- Canonical baseline gap inventory:
  `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- Backend lifecycle authority:
  `apps/api/src/modules/service-area/service-area.controller.ts`
- Shared geometry primitive baseline:
  `support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md`

## Planning resolution for `MAP-FE-ADM-001`

The blocker is no longer "missing product / contract semantics." The accepted
repo state is now:

1. The Platform Admin taxi-governance route family is
   `/service-area-governance`, with:
   - overview
   - service-area detail
   - stop-policy detail
2. Taxi service-area governance uses only the accepted service-area geometry
   contract:
   - polygon
   - circle
3. Route-corridor authoring remains explicitly outside `MAP-FE-ADM-001` and
   stays with Phase 2 sandbox route governance.
4. The preview contract available today is operator-entered
   `POST /service-area/evaluate`. A bulk "affected sample stops/orders before
   publish" preview has no accepted backend contract yet and is therefore a
   follow-up, not a reason to keep the parent in a vague planning block.
5. The missing artifact was a canonical non-visual UI packet. That artifact now
   exists at:
   `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`

## Remaining blocker classification

`MAP-FE-ADM-001` still cannot claim implementation-ready visual authority until
the canonical Platform Admin canvas publishes `/service-area-governance`
screens. That is a **visual-publication blocker**, not a product/contract
blocker.

Required follow-up outside this delta:

1. Publish the new route family into:
   - `docs/05-ui/drts-design-canvas/Platform Admin.html`
   - `docs/05-ui/drts-design-canvas/platform-screens-*.jsx`
2. Resume `MAP-FE-ADM-001` against the new screen-requirements packet plus the
   existing backend contracts and integrated `GeometryEditor`.

## Parent-task next step

The parent task should replace "missing product / contract decision" with this
explicit next step:

1. Treat service-area governance semantics as resolved by accepted docs and
   contracts.
2. Wait specifically for canonical Platform Admin canvas publication for the
   `/service-area-governance` route family.
3. Once the canvas lands, implement the parent task using:
   - polygon/circle-only geometry editing
   - service-area/stop-policy lifecycle actions
   - operator-entered sample evaluator preview
   - audit receipt surfacing from mutation responses

## Scope cut recorded here

The following are not part of `MAP-FE-ADM-001` unless separately assigned:

1. Batch impact preview across existing orders or saved stop samples.
2. Phase 2 sandbox route or approved operating-area authoring.
3. Any new backend contract beyond the existing `/service-area/admin/*`,
   `/service-area/definitions`, `/service-area/admin/geojson`, and
   `/service-area/evaluate` surfaces.

## 2026-07-04 Release Closeout Snapshot

This delta now also acts as the release-closeout superseder for
`MAP-REL-001`. It records which `MAP-GAP-*` items are closed by repo-backed
evidence, which remain release-blocked, and who owns the remaining work so no
gap is left unassigned.

Open release blockers are now backed by formal task-board owners again:
`MAP-FE-ADM-001` and `MAP-MOB-DRV-001` were restored to machine truth on
`2026-07-04`, so Gate B and Gate D are no longer tracked only in prose.

### Gap Ownership And Closeout State

| Gap ID        | Closeout state on 2026-07-04 | Owner task(s)                                               | Evidence                                                                                                                                                                                                                                                                   |
| ------------- | ---------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAP-GAP-001` | `closed-repo-backed`         | `MAP-INFRA-001`, `MAP-BE-002`, `MAP-REL-001`                | Provider/runtime prerequisites now align in repo-backed evidence: `apps/api/src/modules/geo/google-geo.provider.ts`, `apps/api/src/modules/geo/geo.module.ts`, `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md`.                                                |
| `MAP-GAP-002` | `closed-repo-backed`         | `MAP-BE-002`, `MAP-OBS-001`                                 | `docs/04-api/map-geofence-openapi-delta-20260630.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`.                                                                                                                                                        |
| `MAP-GAP-003` | `closed-repo-backed`         | `MAP-FE-CALL-001`, `MAP-QA-002`, `MAP-REL-001`              | Cross-surface callcenter evidence is now closed repo-backed: `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md`.                                                                                     |
| `MAP-GAP-004` | `closed-repo-backed`         | `MAP-BE-004`, `MAP-BE-005`, `MAP-QA-002`                    | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`.                                                                                                                                                  |
| `MAP-GAP-005` | `open`                       | `MAP-FE-ADM-001`, `MAP-REL-001`                             | Canonical `/service-area-governance` publication remains a visual-publication blocker: `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`, `support/unblock/MAP-FE-ADM-001/MAP-FE-ADM-001-UNBLOCK-PLANNING-DECISION.md`.                  |
| `MAP-GAP-006` | `closed-repo-backed`         | `MAP-FE-OPS-001`, `MAP-QA-002`, `MAP-REL-001`               | Ops spatial readiness hooks are now closed repo-backed: `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md`.                                                                                          |
| `MAP-GAP-007` | `open`                       | `MAP-MOB-DRV-001`, `MAP-REL-001`                            | Driver code proof exists, but device/simulator UAT is still missing: `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`.                                                                                                                                 |
| `MAP-GAP-008` | `closed-repo-backed`         | `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-QA-002`            | Tenant/concierge/partner flows share the repo-backed QA matrix in `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`.                                                                                                                                              |
| `MAP-GAP-009` | `closed-repo-backed`         | `MAP-BE-001`, `MAP-BE-005`, `MAP-QA-002`                    | Coordinate provenance and spatial audit proof are carried by `MAP-QA-002` plus `MAP-OBS-001` final evidence.                                                                                                                                                               |
| `MAP-GAP-010` | `closed-repo-backed`         | `MAP-INFRA-001`, `MAP-OBS-001`, `MAP-QA-002`, `MAP-REL-001` | Degraded-mode behavior and provider prerequisites are now aligned repo-backed: `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md`.  |
| `MAP-GAP-011` | `open`                       | `MAP-BE-006`, `MAP-FE-ADM-001`, `MAP-REL-001`               | Backend lifecycle exists, but the governing Platform Admin publish UI and final evidence do not: `support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md`.                                                                                                       |
| `MAP-GAP-012` | `closed-repo-backed`         | `MAP-BE-005`, `MAP-OBS-001`                                 | Spatial audit evidence is recorded in `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`.                                                                                                                                                                        |
| `MAP-GAP-013` | `open`                       | `MAP-QA-002`, `MAP-MOB-DRV-001`, `MAP-REL-001`              | Driver device UAT and staged smoke remain open even though repo-local QA passed: `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`.                                                         |

### Gate Snapshot

| Gate                                | 2026-07-04 release verdict | Why                                                                                                                                               |
| ----------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate A: Callcenter safe to dispatch | `PASS`                     | Repo-backed QA/OBS proof plus external-provider runtime/prereq evidence are now aligned.                                                         |
| Gate B: Governance safe to publish  | `FAIL`                     | `MAP-FE-ADM-001` publish UI/final evidence is still missing, so GeometryEditor baseline alone cannot satisfy governance release pass.             |
| Gate C: Ops safe to operate         | `PASS`                     | Repo-backed ops readiness hooks plus provider runtime/prereq evidence are now aligned.                                                            |
| Gate D: Driver safe to navigate     | `FAIL`                     | `MAP-MOB-DRV-001` still calls out missing device/simulator UAT and does not claim production Gate D pass.                                         |
| Gate E: Degraded safe               | `PASS`                     | Repo-backed degraded behavior plus provider runtime/prereq evidence are now aligned.                                                              |

### Release Blockers Carried Forward

1. `MAP-FE-ADM-001` was restored to machine truth on `2026-07-04` and remains the canonical owner for Governance gate closure.
2. `MAP-MOB-DRV-001` was restored to machine truth on `2026-07-04` and remains the canonical owner for driver device/simulator UAT.
3. `MAP-REL-001` now carries only the Gate B / Gate D synthesis, evidence refresh, and reviewer handoff for the remaining release blockers.
