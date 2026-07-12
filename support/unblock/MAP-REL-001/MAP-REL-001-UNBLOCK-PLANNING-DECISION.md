# MAP-REL-001 Unblock Planning Decision

## Scope

- Task: `MAP-REL-001-UNBLOCK-PLANNING-DECISION`
- Parent: `MAP-REL-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Decision date: `2026-07-04`

## Diagnosis

`MAP-REL-001` was auto-routed as though production release closeout still
needed a product or contract decision. The actual repo state is narrower:

1. The release-gate semantics already exist in the canonical execution packet:
   Gate A through Gate E are defined in
   `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`.
2. The provider fail-closed contract already exists in
   `docs/04-api/map-geofence-openapi-delta-20260630.md`, including the
   `MAP_PROVIDER_MODE` rules for `mock`, `external`, and `disabled`.
3. Upstream repo-backed evidence already exists for two of the parent's
   dependencies:
   - `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` is `PASS`
   - `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` is `PASS`
4. The remaining Gate D dependency is not a missing semantic decision. It is a
   remaining release-evidence gap: `support/sidecars/MAP-MOB-DRV-001/`
   `MAP-MOB-DRV-001-FINAL-EVIDENCE.md` still says simulator/device UAT proof is
   required before production readiness can be claimed.
5. Current parent machine truth points at `support/sidecars/MAP-REL-001/*` and
   release-verifier scripts that do not exist on this branch. That is metadata
   or scaffold drift, not a new product/contract gap.
6. Current repo code also exposes execution blockers that match the parent
   `next` field rather than a planning gap:
   - `apps/api/src/modules/geo/geo.module.ts` binds `GEO_PROVIDER` to
     `MockGeoProvider`
   - `apps/api/src/modules/geo/geo-provider-config.service.ts` marks
     `external_adapter` as fail because no external provider adapter exists yet
   - `.github/workflows/deploy-staging.yml` and `.github/workflows/deploy-prod.yml`
     still use `MAP_PROVIDER_BACKEND`, while the runtime health contract is
     keyed off `MAP_PROVIDER_MODE`

This unblock task therefore needed to do two things:

1. Record that no new product or contract interpretation is needed for
   `MAP-REL-001`.
2. Route the parent back to concrete release-evidence and execution closeout
   work.

## Canonical sources consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md`:

1. `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
2. `docs/04-api/map-geofence-openapi-delta-20260630.md`
3. `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
4. `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`
5. `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
6. `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`
7. `apps/api/src/modules/geo/geo.module.ts`
8. `apps/api/src/modules/geo/geo-provider-config.service.ts`
9. `.github/workflows/deploy-staging.yml`
10. `.github/workflows/deploy-prod.yml`
11. `ai-status.json` task slice for `MAP-REL-001`

## Decision

`MAP-REL-001` is unblocked on the product/contract interpretation.

The binding decisions are:

1. Gate A through Gate E semantics are already accepted and do not need to be
   reopened.
2. The geo-provider safety contract is already accepted and is expressed in
   terms of `MAP_PROVIDER_MODE`, not a new release-planning choice.
3. `MAP-QA-002` and `MAP-OBS-001` already provide repo-backed final evidence
   inputs that the parent should consume.
4. The remaining gaps are release closeout work:
   - Gate D device/simulator evidence
   - release-evidence packet and verifier scaffold alignment
   - provider runtime and deploy-rail wiring alignment
5. Missing `MAP-REL-001` sidecar or verifier paths are a documentation or
   scaffold problem. They must not be re-labeled as missing product semantics.

## Scope cut and routing

This unblock does **not** claim that `MAP-REL-001` is production-ready today.

Out of scope for this helper task:

1. Creating the final `MAP-REL-001` production evidence packet itself.
2. Implementing a non-mock external geo provider adapter.
3. Producing device/simulator Gate D UAT artifacts.
4. Repairing deploy workflow environment variables or release-verifier scripts.

Remaining routed work for the parent task:

1. Restore or create the canonical `MAP-REL-001` final-evidence / verifier
   scaffold that machine truth expects, or realign parent artifact references
   to the actual canonical files on branch.
2. Consume the accepted QA and OBS evidence packets already present in repo.
3. Resolve the remaining execution blockers before claiming production
   readiness.

## Parent unblocked next step

The parent task should replace any vague "missing product / contract decision"
wording with this concrete next step:

1. Keep Gate A through Gate E semantics fixed to the accepted 2026-06-30
   execution packet and the accepted `MAP_PROVIDER_MODE` fail-closed contract.
2. Resume `MAP-REL-001` as release closeout work, not planning work:
   - consume `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`
   - consume `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
   - keep `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`
     classified as Gate D partial until simulator/device UAT evidence exists
3. Backfill the missing `support/sidecars/MAP-REL-001/*` release-evidence or
   verifier scaffold, or update the parent task metadata so it points at real
   canonical artifacts on branch before claiming readiness.
4. Then clear the concrete repo blockers already named by the parent task:
   - provider runtime wiring away from hard-bound `MockGeoProvider`
   - deploy and runtime alignment on `MAP_PROVIDER_MODE`
   - remaining Gate D release evidence

Recommended parent status after this helper closes: `todo` for the parent owner
to resume with the concrete release-closeout work above.

## Acceptance mapping

| Acceptance item                                                                             | Result                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only: accepted release-gate and provider-safety semantics already exist in canonical planning artifacts.                |
| Record the decision                                                                         | Recorded here: no new product or contract decision is needed for `MAP-REL-001`.                                                             |
| scope cut                                                                                   | Recorded in `Scope cut and routing`: this helper does not create final release evidence, provider adapter code, or Gate D device UAT proof. |
| or explicit follow-up needed by the parent task                                             | Recorded in `Parent unblocked next step`: release-evidence scaffold repair/alignment plus concrete execution blockers.                      |
| Produce task-scoped commit/push/PR evidence for any canonical change                        | To be attached on this task branch with the owner commit/push/PR evidence for this artifact and the planning-delta update.                  |
| Update the parent task with the concrete unblocked next step                                | The concrete next step is recorded above and should resume the parent as release-closeout work rather than planning work.                   |

## Verification basis

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `docs/04-api/map-geofence-openapi-delta-20260630.md`
- `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
- `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`
- `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`
- `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`
- `apps/api/src/modules/geo/geo.module.ts`
- `apps/api/src/modules/geo/geo-provider-config.service.ts`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-prod.yml`
