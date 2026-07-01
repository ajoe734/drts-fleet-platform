# MAP-BE-002 Sidecar Review Packet

## Scope

- Task: `MAP-BE-002-SIDECAR-REVIEW`
- Parent task: `MAP-BE-002`
- Owner: `Codex`
- Assigned reviewer: `Codex2`
- Slice type: support-only review packet
- Guardrail: no canonical truth or runtime implementation changes are included in this sidecar

## Purpose

This packet prepares a concise reviewer handoff for `MAP-BE-002`, which is
currently in `review` machine-truth state. It consolidates the parent task's
recorded acceptance target, owner-reported evidence, relevant planning context,
and a focused checklist the reviewer can use to validate the implementation on
the parent branch without mutating canonical truth from this sidecar slice.

## Canonical Inputs Used

1. `AI_NAME=Codex2 scripts/ai-status.sh show MAP-BE-002`
2. `AI_NAME=Codex2 scripts/ai-status.sh show MAP-BE-002-SIDECAR-REVIEW`
3. `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
4. `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Note: `AI_NAME=Codex2 scripts/ai-status.sh show MAP-INFRA-001` returned
`Task not found: MAP-INFRA-001` in the current machine-truth task board, so the
dependency is referenced here from the planning docs rather than from a live
task slice.

## Parent Task Snapshot

- Parent task status: `review`
- Parent owner: `Codex`
- Parent reviewer: `Claude2`
- Parent goal: provide one API authority for provider-neutral search, resolve,
  and reverse geocode flows
- Parent artifact areas:
  - `apps/api/src/modules/geo/`
  - `apps/api/tests/unit/`
  - `packages/contracts/src/index.ts`

### Acceptance Targets From The Execution Packet

- `GET /api/geo/search` exists
- `POST /api/geo/resolve` exists
- `POST /api/geo/reverse` exists
- provider responses are normalized to contract shape from `MAP-BE-001`
- deterministic mock fixtures support CI use
- provider errors are stable domain errors
- verification commands:
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api test`
  - `pnpm --filter @drts/api lint`

## Owner-Reported Evidence From Machine Truth

The parent task's current `next` field records the following completed scope:

- provider-neutral `GeoModule` gateway
- `GeoProvider` interface
- deterministic `MockGeoProvider` fixtures
- `GET /api/geo/search`
- `POST /api/geo/resolve`
- `POST /api/geo/reverse`
- input validation
- provider error normalization
- address provenance support
- controller envelope tests

Recorded verification evidence from the parent task status:

- `prettier --check` passed for contracts/app/module/geo files
- `pnpm --filter @drts/api typecheck` passed
- `pnpm --filter @drts/api lint` passed
- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/geo.service.test.ts` passed with `86 files / 678 tests`
- `pnpm --filter @drts/contracts typecheck` passed
- `pnpm --filter @drts/contracts lint` passed
- `pnpm exec vitest run tests/unit/contracts-geo-provenance.test.ts` passed with `1 file / 3 tests`

## Dependency And Context Notes

- Planning docs state `MAP-INFRA-001` provides the provider operational
  foundation: `GET /api/geo/health`, fail-closed configuration checks,
  environment documentation, preflight verification, runbook material, and
  initial alert rules.
- The gap inventory states `MAP-BE-002` added the API geo gateway with
  deterministic mock-provider behavior.
- Because `MAP-INFRA-001` is not currently retrievable as a live task slice from
  `ai-status`, reviewer validation should treat the dependency as planning
  context rather than a directly verifiable task-state prerequisite from this
  sidecar.

## Reviewer Checklist

Use this packet to review the parent implementation on the parent branch, not
this sidecar branch.

1. Confirm the parent branch exposes exactly three geo endpoints:
   `search`, `resolve`, and `reverse`.
2. Confirm controller/service outputs do not leak provider-native response
   shapes to callers.
3. Confirm the mock provider is deterministic and test fixtures remain stable
   for CI and E2E callers.
4. Confirm normalized error handling distinguishes invalid input from provider
   failures in a UI-consumable way.
5. Confirm provenance fields from `MAP-BE-001` are preserved in normalized
   results and tests.
6. Re-run or spot-check the owner-reported verification commands if review
   policy requires independent confirmation.

## Suggested Review Focus

- `apps/api/src/modules/geo/`: interface boundaries, response normalization,
  validation, and error mapping
- `apps/api/tests/unit/`: deterministic fixture coverage and envelope tests
- `packages/contracts/src/index.ts`: compatibility with provenance-aware geo
  contract shapes

## Handoff

Prepared for reviewer `Codex`.

This sidecar creates only the support artifact required by
`MAP-BE-002-SIDECAR-REVIEW`. No canonical implementation files were modified in
this branch. After reviewer acknowledgement, the parent owner remains
responsible for deciding whether any of this packet needs to be absorbed into
mainline review or closeout records.
