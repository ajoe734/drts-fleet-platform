# Map Geofence Fleets Execution Tasks - 2026-07-01 Delta

This task list is a focused execution addendum for the Platform Admin geofence
governance slice. It complements, rather than replaces,
`docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`.

## Source chain

- Baseline execution packet:
  `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- Gap-resolution delta:
  `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
- Non-visual screen packet:
  `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`

## Focused task status

| Task             | Status meaning on 2026-07-01                                                    | Notes                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAP-BE-006`     | backend authority baseline present                                              | Service-area admin contracts already define create/update/submit-review/publish/retire plus GeoJSON export and evaluator entrypoints.                                                                               |
| `MAP-UI-002`     | shared primitive baseline present                                               | `GeometryEditor` is the accepted primitive baseline, but it does not decide Platform Admin screen composition by itself.                                                                                            |
| `MAP-FE-ADM-001` | blocked on missing canonical visual publication only                            | Product/contract semantics are resolved; parent must not stay blocked on vague planning language.                                                                                                                   |
| `MAP-REL-001`    | blocked on release-evidence assembly and metadata repair, not product semantics | Gate A through Gate E semantics are already fixed. QA and OBS evidence packets exist, Driver remains Gate D partial, and the parent's referenced `MAP-REL-001` sidecar/verifier scaffold is missing on this branch. |

## `MAP-FE-ADM-001` execution note

Concrete next step for the parent task:

1. Do not reopen route naming, lifecycle semantics, geometry-type scope, or the
   existence of service-area admin endpoints.
2. Wait specifically for canonical Platform Admin canvas publication covering:
   - `/service-area-governance`
   - `/service-area-governance/service-areas/[serviceAreaId]`
   - `/service-area-governance/stop-policies/[stopPolicyId]`
3. After that publication lands on `dev`, resume implementation against the new
   screen-requirements packet and existing backend contracts.

## `MAP-REL-001` execution note

Concrete next step for the parent task:

1. Do not reopen Gate A through Gate E definitions, service-area governance
   semantics, or the accepted `MAP_PROVIDER_MODE` fail-closed contract.
2. Resume the parent as release closeout work:
   - consume `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`
   - consume `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
   - keep `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`
     classified as Gate D partial until simulator/device UAT proof exists
3. Backfill the missing `support/sidecars/MAP-REL-001/*` release-evidence /
   verifier scaffold, or realign parent task metadata to the canonical files
   that actually exist on branch.
4. After the scaffold exists, clear the already-known execution blockers:
   - provider runtime wiring away from hard-bound `MockGeoProvider`
   - deploy/runtime environment alignment on `MAP_PROVIDER_MODE`
   - remaining Gate D release evidence

## Scope cut carried into execution

`MAP-FE-ADM-001` should implement only:

- taxi service-area boundaries
- taxi stop policies
- lifecycle actions: draft, review, publish, retire
- operator-entered sample evaluator preview
- audit receipt visibility

The parent should not absorb these adjacent asks unless a follow-up task is
explicitly opened:

- batch impact-preview across existing orders/stops
- route-corridor authoring
- Phase 2 sandbox geometry governance

## Reviewer cue

If `MAP-FE-ADM-001` is still described as blocked on "missing product / contract
decision" after this delta lands, that wording is stale. The remaining blocker
should name the missing Platform Admin canvas publication directly.

If `MAP-REL-001` is still described as blocked on a "missing product / contract
decision" after this delta lands, that wording is also stale. The remaining
blocker should name release-evidence scaffold alignment and execution closeout
directly.
