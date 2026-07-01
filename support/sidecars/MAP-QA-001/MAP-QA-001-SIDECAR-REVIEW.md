# MAP-QA-001-SIDECAR-REVIEW: Review Packet and Evidence Summary

## Scope

- Sidecar support slice for `MAP-QA-001`
- Prepared by `Codex2` on `2026-07-01`
- Assigned reviewer for this sidecar task: `Codex`
- Guardrail: support artifact only; no canonical truth or runtime implementation edited in this task

## Machine-Truth Snapshot

### Sidecar task

- Task: `MAP-QA-001-SIDECAR-REVIEW`
- Status at intake: `todo`
- Status during packet assembly: `in_progress`
- Owner: `Codex2`
- Reviewer: `Codex`
- Status checked via `AI_NAME=Codex2 scripts/ai-status.sh show MAP-QA-001-SIDECAR-REVIEW` on `2026-07-01`

### Parent task

- Task: `MAP-QA-001`
- Status observed during packet assembly: `review`
- Owner: `Codex`
- Reviewer: `Claude2`
- Status checked via `AI_NAME=Codex2 scripts/ai-status.sh show MAP-QA-001` on `2026-07-01`
- `next` summary in machine truth says the parent task implemented deterministic map/geofence fixtures, offline Playwright harness support, and related documentation, and is ready for review

## Source References Used For This Packet

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:793`
- `apps/api/src/modules/geo/mock-geo.provider.ts:19`
- `apps/api/tests/unit/geo.service.test.ts:21`
- `tests/e2e/map-geofence-harness.ts:1`
- `packages/shared-test-fixtures/src/index.ts:1`

## Intended Deliverable Per Runbook

The runbook describes `MAP-QA-001` as the offline map/geofence harness task for CI. It expects:

- deterministic mock geocode/map fixtures for Taipei core, Taoyuan airport, Taipei Station no-pickup, and manual-review scenarios
- Playwright helpers to stub provider calls and map rendering
- offline verification coverage for serviceable, not-serviceable, no-pickup, manual-review, provider-unavailable, and no-geocode states
- supporting usage documentation under `support/sidecars/MAP-QA-001/`

## Observed Repo Evidence

### Present in the current repo snapshot

- `apps/api/src/modules/geo/mock-geo.provider.ts` contains deterministic mock places for:
  - `mock-taipei-city-hall`
  - `mock-taipei-station`
  - `mock-xinyi-hospital`
  - `mock-taoyuan-airport-t1`
  - `mock-taichung-station`
- The same provider file defines the outage sentinel `__provider_unavailable__`.
- `apps/api/tests/unit/geo.service.test.ts` covers:
  - healthy mock-provider status in test/CI mode
  - deterministic search results for Taipei Station
  - Taipei City Hall serviceable fixture
  - auditable resolve payloads
  - manual pin fallback
  - reverse geocode to Taoyuan airport fixture
  - provider outage normalization to retryable `503`
  - fail-closed behavior for production-like mock mode
  - fail-closed behavior for invalid provider mode and missing external secrets
- `apps/api/tests/unit/geo.service.test.ts` also rejects invalid search and invalid coordinate input before provider execution.
- `tests/e2e/map-geofence-harness.ts` currently provides a Playwright route stub for mock map tile responses.
- `packages/shared-test-fixtures/src/index.ts` currently exports generic scenario, recorder, and Tesla fixtures, but no map/geofence-specific fixture module.

### Not present in the current repo snapshot

- `packages/shared-test-fixtures/src/map-geofence-fixtures.ts`
- `playwright.map-geofence-harness.config.ts`
- `support/sidecars/MAP-QA-001/MAP-QA-001-MOCK-PROVIDER-HARNESS.md`

These three paths were re-checked directly on `2026-07-01` and are still absent from this assigned worktree snapshot.

### Observed divergence worth reviewer attention

- The runbook and parent-task `next` summary describe a broader offline harness and shared-fixture package than what is directly visible in this snapshot of `dev`.
- `tests/e2e/map-geofence-harness.ts` is currently limited to mock map tile routing; the additional API-route stubs described in the runbook are not visible in this file as checked here.
- No local evidence in this worktree shows the claimed dedicated Playwright harness config or the support doc named in the runbook status block.

## Reviewer Handoff Notes

- Use this packet as a quick discrepancy map before reviewing the parent task branch or PR.
- If the parent owner review target contains the missing files above, confirm they match the runbook claims and that the machine-truth summary is accurate.
- If those files do not exist on the review target either, the parent task summary likely overstates delivered evidence and should be corrected during review.
- The highest-value reviewer check is whether the parent review surface is a different branch/PR snapshot than this sidecar worktree; this packet only attests to evidence visible here.
- This sidecar packet does not assert the parent task passed all listed verification commands; it only records the commands claimed by machine truth/runbook and the evidence directly observable from this repo snapshot.

## Verification Performed For This Sidecar

- Confirmed the assigned worktree branch is `codex2/map-qa-001-sidecar-review`.
- Queried machine truth with:
  - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-QA-001-SIDECAR-REVIEW`
  - `AI_NAME=Codex2 scripts/ai-status.sh show MAP-QA-001`
- Inspected the runbook section for `MAP-QA-001`.
- Inspected the referenced geo provider, unit-test, harness, and shared-fixture files listed above.
- Checked direct path presence for the three runbook-claimed files listed under `Not present in the current repo snapshot`.
- Verified this task only creates a support artifact under `support/sidecars/MAP-QA-001/`.
