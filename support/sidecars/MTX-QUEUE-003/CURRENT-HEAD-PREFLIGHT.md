# MTX-QUEUE-003 Current-Head Preflight

Date: 2026-07-24
Task ID: `MTX-QUEUE-003`
Fleet: C
Owner: Gemini branch consolidation
Reviewer: Codex

## Authority

- Authoritative requirement head:
  `8f0a8cf3bfcfb11a6afece2ccf28bf592d56941f` (PR #1131)
- Requirement:
  `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md`
  v1.2
- Execution packet:
  `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/10_full_17_screen_fleets_execution_tasks_20260724.md`
- Canonical design:
  `docs/05-ui/drts-design-canvas/ops-mtx-queue.jsx`
- Screen IDs: `MTX-QUEUE-UI-01..03`

The requirement and design files are read-only inputs for this branch.

## Branch Reconciliation

| Ref                           | Head at preflight                          | Classification                    |
| ----------------------------- | ------------------------------------------ | --------------------------------- |
| `origin/dev`                  | `2711c366f2e103ae9556d5afaf4558dfd9b0bb4c` | current landed execution baseline |
| `origin/gemini/mtx-queue-003` | `ae2f94e3d3c6f21d526b5b728a81b059b295a91c` | selected implementation candidate |
| `origin/codex/mtx-queue-003`  | `018a75408e4182554c0e7e8114f3483cd04c1966` | overlapping reviewer candidate    |

Both candidates share implementation history through `50b742e868596fb689356dc755eae6887e212e8f`.
The Gemini branch has six production-fallback/mock-server fixes after that
point. The Codex-only commit aligns the reviewer Playwright base URL and
prebuild flow; the selected Gemini branch already covers those outcomes via
`getTargetBaseUrl()` and `scripts/run-map-geofence-ops-ui-dev.mjs`. No third
implementation branch is created.

## Current-Head Acceptance Classification

| Acceptance item                               | Initial state     | Current action                                                                                                                                                                           |
| --------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `/dispatch` list/detail queue labels | `verified`        | retain and regression-test                                                                                                                                                               |
| Existing statutory refusal copy               | `verified`        | retain and regression-test                                                                                                                                                               |
| No override or force check-in on refusal      | `verified`        | retain and extend DOM scan                                                                                                                                                               |
| `MTX-QUEUE-UI-01` queue overview route        | `missing`         | implement `/dispatch/queue`                                                                                                                                                              |
| Required overview columns and filters         | `missing`         | implement from server queue read model only                                                                                                                                              |
| `MTX-QUEUE-UI-02` queue entry detail          | `missing`         | implement `/dispatch/queue/{queueEntryId}`                                                                                                                                               |
| `MTX-QUEUE-UI-03` dedicated legal denial      | `partial`         | implement server-denied physical-rank/taxi-stand state                                                                                                                                   |
| Ordinary taxi isolation                       | `partial`         | add view-model and negative E2E coverage                                                                                                                                                 |
| Safe next actions from `availableActions`     | `partial`         | allowlist enabled read-navigation descriptors only                                                                                                                                       |
| Queue list/detail read API on current `dev`   | `partial`         | UI consumes `GET /api/dispatch/queue[/{id}]`; current backend exposes only check-in/check-out commands, so runtime integration remains open until the dependency supplies the read model |
| Queue mutation                                | `blocked_command` | no mutation control is added by this task                                                                                                                                                |

## Server Authority Boundary

1. The UI does not calculate queue eligibility.
2. Legal denial renders only when the server read model returns
   `eligibility.decision = denied` for `multi_taxi_direct` plus
   `physical_rank` or `taxi_stand`.
3. A conflicting combination without a server denial is fail-closed: the UI
   shows a decision conflict and suppresses queue mutation controls.
4. `ordinary_taxi` physical-rank and taxi-stand entries are not converted into
   multi-taxi denials.
5. Unknown, disabled, override, approval, and force-check-in descriptors are
   not rendered as controls.

## Owned Write Set

```text
apps/ops-console-web/app/dispatch/queue/
apps/ops-console-web/app/dispatch/page.tsx
apps/ops-console-web/lib/queue-operations.ts
apps/ops-console-web/lib/queue-semantics.ts
apps/ops-console-web/lib/translations.ts
apps/ops-console-web/tests/unit/queue-operations.test.ts
apps/ops-console-web/tests/unit/queue-semantics.test.ts
tests/e2e/ops-queue-semantics.spec.ts
playwright.ops-queue-semantics.config.ts
scripts/serve-map-geofence-ops-mock-api.mjs
support/sidecars/MTX-QUEUE-003/
```
