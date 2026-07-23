# P5-RATE-001 Current-Head Preflight

Date: 2026-07-23
Owner: Codex
Reviewer: Gemini
Task: Fleet D rating, gating, atomic assignment, and redispatch
Inspected commit: `b084729263a90856bc674772443d9b0c17a49009`

## Scope check

- Worktree/branch matched dispatch: `codex/p5-rate-001`
- Machine-truth status was `backlog` on entry and moved to `in_progress`
- `support/sidecars/P5-RATE-001/` did not exist on entry, so this packet is created as task evidence

## Current-head findings before edits

- Canonical rating persistence already exists in [apps/api/src/modules/multi-taxi/multi-taxi.repository.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/multi-taxi/multi-taxi.repository.ts:281), including transactional `ops.passenger_trip_ratings` upsert idempotence and `ops.driver_rating_summaries` recomputation with `new_driver` when count is zero.
- Multi-taxi assignment already executes inside a repository transaction in [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:3096), and persists order, assignment, snapshot, and outbox together through `persistOrderWorkflow(...)`.
- Passenger disclosure, canonical driver rating state, and active public driver-registration gates already exist in [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:5646).
- Snapshot/outbox creation for P5 authority already exists in [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:5726), including assignment versioning and `assignment_replaced` events for later assignments.
- Snapshot supersede semantics already exist in repository coverage at [apps/api/tests/unit/owned-mobility.repository.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/unit/owned-mobility.repository.test.ts:50), asserting only older assignment versions are superseded before insertion.
- The Platform Admin P5 surface currently exposes only `disclosure`, `queue`, and `fares` views in [apps/platform-admin-web/app/platform-admin/p5/p5-admin-console.tsx](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/platform-admin-web/app/platform-admin/p5/p5-admin-console.tsx:24), which matches the UI requirement that rating moderation is deferred.
- The canonical UI requirement explicitly defers rating moderation and forbids adding section-6 deferred features before design-ready closeout in [docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md:399).

## Classification of acceptance items

1. `0 ratings renders new_driver`: `verified`
   Evidence:
   [apps/api/src/modules/multi-taxi/multi-taxi.repository.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/multi-taxi/multi-taxi.repository.ts:339)
   and
   [apps/api/tests/unit/owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/unit/owned-mobility.service.test.ts:4486)

2. `duplicate rating idempotent`: `verified`
   Evidence:
   [apps/api/src/modules/multi-taxi/multi-taxi.repository.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/multi-taxi/multi-taxi.repository.ts:294)
   and
   [apps/api/tests/unit/multi-taxi.service.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/unit/multi-taxi.service.test.ts:384)

3. `incomplete disclosure cannot assign`: `verified`
   Evidence:
   [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:5667)
   and
   [apps/api/tests/unit/owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/unit/owned-mobility.service.test.ts:4498)

4. `scarcity cannot bypass legal gate`: `verified`
   Evidence:
   [apps/api/tests/unit/owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/unit/owned-mobility.service.test.ts:1282)
   and the hard-reason contract in
   [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:3096)

5. `assignment rollback leaves no partial snapshot/token/outbox`: `verified`
   Evidence:
   [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:3096)
   and
   [apps/api/tests/unit/owned-mobility.service.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/unit/owned-mobility.service.test.ts:4590)
   with repository supersede semantics also covered in
   [apps/api/tests/unit/owned-mobility.repository.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/unit/owned-mobility.repository.test.ts:50)

6. `stale redispatch cannot replace newer assignment`: `implemented`
   Evidence:
   [apps/api/src/modules/owned-mobility/owned-mobility.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:5726)
   and
   [apps/api/tests/unit/owned-mobility.repository.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/unit/owned-mobility.repository.test.ts:132)
   The versioned snapshot supersede SQL is present, but this preflight did not find a service-level stale-event regression test named for this acceptance.

7. `moderation UI per doc08 §8 no aggregate editing`: `verified`
   Evidence:
   [docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md:403)
   and
   [apps/platform-admin-web/app/platform-admin/p5/p5-admin-console.tsx](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/platform-admin-web/app/platform-admin/p5/p5-admin-console.tsx:24)

8. `unit+integration+e2e green + reviewer PASS`: `partial`
   Evidence gathered on current head:
   - `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/multi-taxi.service.test.ts apps/api/tests/unit/owned-mobility.service.test.ts apps/api/tests/unit/owned-mobility.repository.test.ts`
     Result: `128` files / `858` tests passed on current head because the workspace Vitest command expanded to the full API suite.
   - `pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility.service.test.ts`
     Result: `82` tests passed after adding direct Fleet-D coverage for incomplete disclosure rejection and transactional assignment residue.
   - `pnpm --filter @drts/platform-admin-web test`
     Result: no test files present; command exited `0`.
   - `pnpm --filter @drts/platform-admin-web typecheck`
     Result: passed.
   - `apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts`
     already provides current-head runtime-profile integration coverage, including persisted readback after restart at
     [apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts:247)
   Residual gap:
   this preflight did not locate a P5/Fleet-D-specific browser or shell e2e scenario under `tests/e2e/`.

## Reuse decision

- Reused the existing current-head implementation for rating authority, eligibility hard-gates, atomic assignment persistence, snapshot/outbox creation, and redispatch versioning.
- No product code rewrite was justified by the preflight evidence.
- The task delta in this turn is evidence capture only: the task-specific preflight packet was missing and is now supplied.

## Remaining delta / reviewer focus

- Added direct task-scoped coverage on 2026-07-23:
  - [tests/unit/platform-admin-p5-ui.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/tests/unit/platform-admin-p5-ui.test.ts:1)
    now asserts the P5 surface remains limited to `disclosure` / `queue` /
    `fares` and does not expose rating aggregate editing.
  - [apps/api/tests/unit/owned-mobility.repository.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/tests/unit/owned-mobility.repository.test.ts:1)
    now has a named stale-redispatch regression asserting persisted snapshot
    writes keep the `assignment_version < $5` guard and conflict idempotence.
  - [tests/e2e/platform-admin-p5-surfaces.spec.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/tests/e2e/platform-admin-p5-surfaces.spec.ts:1)
    was added as a route-level smoke for `/platform-admin/p5/disclosure`,
    `/platform-admin/p5/corrections`, and `/platform-admin/p5/fares`.

## Verification update: 2026-07-23

- `pnpm exec vitest run tests/unit/platform-admin-p5-ui.test.ts`
  Result: `1` file / `4` tests passed.
- `pnpm --filter @drts/api exec vitest run tests/unit/owned-mobility.repository.test.ts`
  Result: `1` file / `3` tests passed.
- `pnpm --filter @drts/platform-admin-web typecheck`
  Result: passed.
- `pnpm test:e2e -- --project=platform-admin-assistant-off tests/e2e/platform-admin-p5-surfaces.spec.ts`
  Result: blocked before the new spec executed because the default Playwright
  `webServer` could not start the current-head API. Exact compile failures were
  emitted from
  [apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-p5-rate-001/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:51)
  against the current `@drts/contracts` surface, including missing exports
  `VehiclePassengerDisclosureProfile` and
  `DriverPublicRegistrationCredential`, plus stale `licenseType`,
  `doorCount`, and `color` property references. This is an existing current-head
  compile blocker outside the P5-RATE-001 diff.

## Reviewer focus

- The task-owned acceptance evidence is now stronger for UI deferral and stale
  redispatch safety.
- Reviewer handoff still depends on either:
  1. fixing the unrelated current-head API compile blocker so the new e2e spec
     can run, or
  2. explicitly accepting the current evidence set with the e2e blocker recorded
     as external to this task.
