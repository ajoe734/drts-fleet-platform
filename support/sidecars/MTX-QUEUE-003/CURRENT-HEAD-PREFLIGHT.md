# MTX-QUEUE-003 Current-Head Preflight and Integration Evidence

Date: 2026-07-24
Task ID: `MTX-QUEUE-003`
Fleet: C
Owner: Fleet C implementation, Codex clean integration
Reviewer: Codex

## Authority

- Merged requirements baseline:
  `c5df24a41ba8ed9c790649719dd731b560cde6fd` (PR #1131)
- Clean integration baseline:
  `4dae436063d9e23d2ec8c0d99db96e2f37df4762` (latest `origin/dev` at
  integration)
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

| Ref                         | Head at integration                        | Classification                              |
| --------------------------- | ------------------------------------------ | ------------------------------------------- |
| `origin/dev`                | `4dae436063d9e23d2ec8c0d99db96e2f37df4762` | landed #1131/#1133/#1137 baseline           |
| `gemini/mtx-queue-003`      | `6b6e2c6f488f6ad8679232ba20c0bb852c2d6520` | selected implementation plus queue read API |
| `codex/mtx-queue-003-final` | current task commit                        | clean latest-dev integration                |

Both implementation candidates shared history through
`50b742e868596fb689356dc755eae6887e212e8f`. The Gemini branch was retained as
the selected superset; no third implementation branch was created.

The selected implementation was squashed onto the latest merged baseline.
Generated `next-env.d.ts` changes and unrelated global Playwright configuration
changes were excluded from the clean integration.

## Current-Head Acceptance Classification

| Acceptance item                               | Final state       | Evidence                                                        |
| --------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| Existing `/dispatch` list/detail queue labels | `verified`        | retained and regression-tested                                  |
| Existing statutory refusal copy               | `verified`        | retained and regression-tested                                  |
| No override or force check-in on refusal      | `verified`        | API and DOM scans reject override/approval/force actions        |
| `MTX-QUEUE-UI-01` queue overview route        | `implemented`     | `/dispatch/queue`                                               |
| Required overview columns and filters         | `implemented`     | server queue read model only                                    |
| `MTX-QUEUE-UI-02` queue entry detail          | `implemented`     | `/dispatch/queue/{queueEntryId}`                                |
| `MTX-QUEUE-UI-03` dedicated legal denial      | `implemented`     | server-denied physical-rank/taxi-stand states                   |
| Ordinary taxi isolation                       | `verified`        | ordinary physical-rank remains eligible in API integration test |
| Safe next actions from `availableActions`     | `verified`        | low-risk read navigation descriptors only                       |
| Queue list/detail read API                    | `implemented`     | canonical authenticated list/detail endpoints below             |
| Queue mutation                                | `blocked_command` | no mutation control was added by this task                      |

## Canonical Read API

### Endpoints

- `GET /api/dispatch/queue`
  returns `ApiSuccessEnvelope<{ items, pageInfo }>` with
  `DispatchQueueEntryReadRecord[]`.
- `GET /api/dispatch/queue/:queueEntryId`
  returns `ApiSuccessEnvelope<DispatchQueueEntryReadRecord>`.
- Unknown detail IDs return `404 QUEUE_ENTRY_NOT_FOUND`.

Both endpoints require authenticated `dispatch:read` access under the Ops
queue-read policy. Anonymous requests return `401`; tenant realm requests
return `403`. JWT and bootstrap-header identities are evaluated against the
same realm and scope policy.

### Server-Owned Projection

- Queue identity, status, position, runtime profile, queue mode, authorization,
  and timestamps come from existing queue entries reconstructed from persisted
  `queue.entry.created` and `queue.entry.closed` dispatch traces.
- Driver, vehicle plate, and operating area come from the regulatory registry's
  vehicle, driver, and supply-pair records.
- Eligibility reuses the same `assertQueueEligibility` authority used by queue
  check-in: profile queue policy plus registry vehicle dispatchability.
- Missing context, missing vehicles, unavailable registry authority, prohibited
  queue modes, absent multi-taxi authorization context, and non-dispatchable
  vehicles all return `eligibility.decision = denied`.
- `ordinary_taxi` physical-rank and taxi-stand entries retain their independent
  policy and are not converted into multi-taxi statutory denials.
- `availableActions` contains only low-risk read navigation. No fixture,
  client-side eligibility inference, override, approval, queue mutation, or
  force check-in path was added.

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

## Verification Evidence

- Rebase baseline:
  `origin/dev@53ab9718dff55e81ae6cd02853e3fcf535285007`; no conflicts.
- `pnpm test` from `apps/api`: `129` files, `870` tests passed after rebase.
- API/auth targeted suite covered service projection, controller envelopes,
  bootstrap/JWT policy, and HTTP list/detail integration.
- `pnpm --filter @drts/api build`: passed.
- `pnpm --filter @drts/api-client typecheck`: passed.
- Queue contract/client test: `1` file, `2` tests passed.
- Ops queue view-model regression: `2` files, `10` tests passed.
- Task Playwright flow: `9 passed`, covering overview, detail, statutory denial,
  ordinary-taxi isolation, and absence of bypass controls.
- Runtime screenshots are archived under `screenshots/` for
  `MTX-QUEUE-UI-01..03`.
- Targeted ESLint and `git diff --check`: passed.
- No deployment or publication was performed.

## Owned Write Set

```text
apps/api/src/common/auth/auth.policy.ts
apps/api/src/common/auth/bootstrap-auth.guard.ts
apps/api/src/modules/owned-mobility/owned-mobility.controller.ts
apps/api/src/modules/owned-mobility/owned-mobility.service.ts
apps/api/tests/integration/int-mtx-queue-read-api.test.ts
apps/api/tests/unit/auth-bootstrap.test.ts
apps/api/tests/unit/owned-mobility.controller.test.ts
apps/api/tests/unit/owned-mobility.service.test.ts
apps/ops-console-web/app/dispatch/queue/
apps/ops-console-web/app/dispatch/page.tsx
apps/ops-console-web/lib/queue-operations.ts
apps/ops-console-web/lib/queue-semantics.ts
apps/ops-console-web/lib/translations.ts
apps/ops-console-web/tests/unit/queue-operations.test.ts
apps/ops-console-web/tests/unit/queue-semantics.test.ts
packages/api-client/src/index.ts
packages/contracts/src/index.ts
playwright.ops-queue-semantics.config.ts
scripts/run-map-geofence-ops-ui-dev.mjs
scripts/serve-map-geofence-ops-mock-api.mjs
support/sidecars/MTX-QUEUE-003/
tests/e2e/ops-queue-semantics.spec.ts
tests/unit/api-client-dispatch-queue.test.ts
```
