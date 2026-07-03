# MAP-BE-002 Sidecar Acceptance Packet

- Task: `MAP-BE-002-SIDECAR-ACCEPTANCE`
- Parent task: `MAP-BE-002`
- Owner: `Codex2`
- Reviewer: `Claude2`
- Scope: support artifact only; no canonical truth edits
- Prepared at: `2026-07-03`

## Purpose

This packet replaces the previously rejected handoff by creating the missing artifact and grounding the acceptance summary in repository-visible evidence. It does not change `apps/api` runtime code, contracts, or task-board truth.

## Dependency Map

| Dependency | Status | Why it matters to MAP-BE-002 | Evidence |
| --- | --- | --- | --- |
| `MAP-BE-001` | satisfied by parent task dependency chain | MAP-BE-002 builds on the map/geofence backend baseline that already introduced the broader map slice context. | `ai-status` entry for `MAP-BE-002` lists `MAP-BE-001` in `depends_on`. |
| `MAP-INFRA-001` | prerequisite context, not a live task-board slice in current machine truth | Geo provider runtime health, secret gating, quota policy, and fail-closed external-provider posture are encoded in the geo provider config and must remain paired with a future external adapter implementation. | `ai-status` for `MAP-BE-002` lists `MAP-INFRA-001`; `scripts/ai-status.sh show MAP-INFRA-001` returns `Task not found`; [apps/api/src/modules/geo/geo-provider-config.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/apps/api/src/modules/geo/geo-provider-config.service.ts:1) documents fail-closed external mode and explicit `MAP-INFRA-001` pairing text. |

## Acceptance Checklist

### 1. `search/resolve/reverse endpoints exist`

- [apps/api/src/modules/geo/geo.controller.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/apps/api/src/modules/geo/geo.controller.ts:1) exposes:
  - `GET /geo/search`
  - `POST /geo/resolve`
  - `POST /geo/reverse`
  - `GET /geo/health`
- [apps/api/src/modules/geo/geo.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/apps/api/src/modules/geo/geo.service.ts:1) implements `searchFromHttpQuery`, `search`, `resolve`, and `reverse`.
- [packages/contracts/src/index.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/packages/contracts/src/index.ts:96) defines the shared geo request/response and provenance contract types used by those endpoints.

### 2. `mock provider deterministic`

- [apps/api/src/modules/geo/mock-geo.provider.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/apps/api/src/modules/geo/mock-geo.provider.ts:1) contains a fixed `MOCK_PLACES` fixture set with stable candidate IDs, provider IDs, coordinates, and service-area metadata.
- The provider ranks and slices results from that static fixture list, making search behavior predictable for CI and acceptance checks.
- [apps/api/tests/unit/geo.service.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/apps/api/tests/unit/geo.service.test.ts:1) asserts deterministic outcomes for:
  - Taipei Station search
  - Taipei City Hall serviceable fixture lookup
  - provider-candidate resolve
  - manual pin fallback
  - reverse geocode to Taoyuan Airport fixture

### 3. `provider errors normalized`

- [apps/api/src/modules/geo/geo.provider.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/apps/api/src/modules/geo/geo.provider.ts:1) defines `GeoProviderError` as the provider-facing error shape.
- [apps/api/src/modules/geo/geo.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/apps/api/src/modules/geo/geo.service.ts:1) maps provider failures through `withProviderErrorMapping()` into stable `ApiRequestError` responses and uses `assertProviderUsable()` for fail-closed config errors.
- [apps/api/src/modules/geo/mock-geo.provider.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/apps/api/src/modules/geo/mock-geo.provider.ts:1) emits stable provider error codes including `GEO_PROVIDER_UNAVAILABLE` and `GEO_CANDIDATE_NOT_FOUND`.
- [apps/api/tests/unit/geo.service.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-002-sidecar-acceptance/apps/api/tests/unit/geo.service.test.ts:1) verifies:
  - provider outage becomes retryable `ApiRequestError` with `GEO_PROVIDER_UNAVAILABLE`
  - production-like mock mode fails closed
  - invalid provider mode fails closed
  - external mode without required secrets returns `GEO_PROVIDER_NOT_CONFIGURED`
  - invalid input is rejected before provider execution

### 4. `api typecheck test lint pass`

- Parent machine truth for `MAP-BE-002` records prior reviewer evidence that `typecheck`, `lint`, and the API test suite passed on the parent task branch before `review_approved`.
- This sidecar slice does not alter canonical runtime code; it only adds a support markdown artifact.
- Fresh verification run for this packet:
  - targeted unit test: `pnpm --filter api exec vitest run tests/unit/geo.service.test.ts`

## Reviewer Notes

- The previous handoff was rejected because this file did not exist. That defect is now corrected.
- This packet intentionally cites repository-visible code and tests only. It does not restate branch-only claims that are not verifiable from the current worktree.
- `MAP-INFRA-001` should be treated here as dependency context rather than an active child slice on the current task board.

## Handoff Summary

`MAP-BE-002-SIDECAR-ACCEPTANCE.md` now exists and maps the parent task's four acceptance bullets to concrete evidence under `apps/api/src/modules/geo`, `apps/api/tests/unit`, and `packages/contracts/src/index.ts`, with the dependency posture for `MAP-BE-001` and `MAP-INFRA-001` frozen for review.
