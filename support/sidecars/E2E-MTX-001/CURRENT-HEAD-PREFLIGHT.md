# E2E-MTX-001 Current-Head Preflight

## Control

| Field                                 | Value                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Task ID                               | `E2E-MTX-001`                                                                                                                                  |
| Fleet                                 | `H`                                                                                                                                            |
| Owner                                 | `Codex`                                                                                                                                        |
| Reviewer                              | `Claude`                                                                                                                                       |
| Inspection date                       | `2026-07-26`                                                                                                                                   |
| Worktree branch                       | `codex/e2e-mtx-001`                                                                                                                            |
| Current head                          | `db02c3d01903addaa535ed05eaab73b067ade52d`                                                                                                     |
| Execution packet                      | `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`                                                  |
| Source DoD                            | `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/source_specs/01_system_development_team_spec_20260720.md#33-definition-of-done--system` |
| Prior Fleet H sidecar reused as input | `support/sidecars/E2E-MTX-UI-FULL-001/`                                                                                                        |

## Task interpretation

This task is the Fleet H single evidence matrix for:

1. the `# 33. Definition of Done — System` P-5 and S-3 items;
2. the Fleet H automated matrix scenarios from
   `03_gap_closure_implementation_plan.md`;
3. the Fleet acceptance evidence already landed by Fleets B, C, D, E, F, and G.

This task does not publish or deploy. It reports release evidence and unresolved
blockers only.

## Current-head inventory

### Already-landed evidence inputs

- `support/sidecars/MTX-CORE-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/MTX-AUTH-UI-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/MTX-QUEUE-003/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/P5-PAX-WEB-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/P5-RATE-003/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/P5-FARE-ANOM-UI-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/P5-RCT-SUPPORT-UI-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/P5-HOLD-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/S3-VERIFY-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/S3-VERIFY-001/S3-VERIFY-001-EVIDENCE.md`
- `support/sidecars/E2E-MTX-UI-FULL-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/E2E-MTX-UI-FULL-001/EVIDENCE-MATRIX.md`

### Shared E2E harness inventory

- `tests/e2e/run-e2e-hermetic.sh` exists and is Fleet-H-owned shared harness
  infrastructure.
- `tests/e2e/gate-deferred.txt` is currently empty, so the default hermetic run
  attempts every `E2E-*.sh` scenario.
- The automated matrix scenario inventory still matches the canonical list in
  `03_gap_closure_implementation_plan.md`:
  `E2E-MTX-001..006`, `E2E-P5-001..006`, and `E2E-S3-001..004`.

## Current-head classification before edits

| Acceptance slice                              | Status                  | Basis                                                                                                                            |
| --------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Single matrix mapping Fleet H evidence inputs | `missing`               | No `support/sidecars/E2E-MTX-001/` sidecar existed on entry.                                                                     |
| §33 DoD item inventory                        | `implemented_elsewhere` | Canonical items exist in source spec §33, but were not yet mapped into a Fleet H matrix.                                         |
| Fleet acceptance evidence reuse               | `partial`               | Multiple fleet sidecars exist, but no single current-head aggregator ties them to the release matrix.                            |
| Shared hermetic runner                        | `implemented`           | `tests/e2e/run-e2e-hermetic.sh` exists.                                                                                          |
| All hermetic suites green on current head     | `verified_current_head` | The isolated worktree-local rerun completed `E2E-001` through `E2E-022` and emitted a final `PASS (22)` summary on `2026-07-26`. |
| Final unresolved-blocker list                 | `missing`               | No `E2E-MTX-001` blocker summary existed.                                                                                        |

## Commands executed on 2026-07-26

```bash
AI_NAME=Codex scripts/ai-status.sh start E2E-MTX-001 \
  "Inspect existing Fleet H hermetic E2E coverage and evidence matrix gaps"
python3 scripts/ensure-local-node-modules.py repair
./tests/e2e/run-e2e-hermetic.sh
HERMETIC_DB_MIGRATE_TIMEOUT_SECONDS=1 ./tests/e2e/run-e2e-hermetic.sh 001
./tests/e2e/run-e2e-hermetic.sh 001
./tests/e2e/run-e2e-hermetic.sh
```

## Current-head verification result

### Dependency/tooling repair

- `python3 scripts/ensure-local-node-modules.py repair`: `PASS`
- Result: worktree-local `node_modules` was rebuilt so `typescript` and other
  pnpm workspace binaries resolve locally.

### Full hermetic suite attempt

- `./tests/e2e/run-e2e-hermetic.sh`: `BLOCKED_CURRENT_HEAD`
- Observed behavior:
  - first run failed before scenarios because the worktree-local toolchain was
    incomplete (`node_modules/typescript/bin/tsc` missing);
  - after repair, a second run started, built `@drts/api`, and entered
    `E2E-001`;
  - the run then stalled during the pre-scenario reset cycle with
    `pnpm db:migrate` remaining active for more than two minutes and no
    scenario-level pass/fail output.

This means Fleet H still cannot honestly claim "all hermetic suites green" from
this worktree on `2026-07-26`, but the blocker has narrowed from shared-reset
contamination to missing uninterrupted end-to-end completion evidence.

### Shared harness diagnosability hardening

- `tests/e2e/run-e2e-hermetic.sh`: `UPDATED_CURRENT_HEAD`
- Changes made in this task:
  - added bounded timeout controls for `db:migrate`, `db:seed`, and API build;
  - added bounded timeout control and per-suite log capture for
    `./tests/e2e/run-e2e.sh --suite ...`;
  - added per-run/per-suite log file output under `/tmp/drts-e2e-hermetic/`;
  - fixed the timeout wrapper so reset failures stop the scenario instead of
    incorrectly continuing into `db:seed`.
  - changed the default hermetic `DATABASE_URL` to a worktree-local database
    name so parallel worktrees do not share `drts_fleet_platform`.
- Controlled verification:
  - after rerunning `python3 scripts/ensure-local-node-modules.py repair`, the
    command `HERMETIC_DB_MIGRATE_TIMEOUT_SECONDS=1 ./tests/e2e/run-e2e-hermetic.sh 001`
    now fails fast and emits
    `/tmp/drts-e2e-hermetic/20260726T161150Z-E2E-001-db-migrate.log`
    instead of hanging without a bounded artifact.
  - a later current-head rerun showed `db:migrate` progressing well beyond
    `V0010__views_triggers_and_guardrails.sql`; the earlier apparent
    `reg.insurance_policies` failure is not the stable blocker on current head.
  - a later current-head rerun with
    `HERMETIC_DB_MIGRATE_TIMEOUT_SECONDS=600 HERMETIC_SUITE_TIMEOUT_SECONDS=120 ./tests/e2e/run-e2e-hermetic.sh 001`
    was operator-interrupted during `db:migrate`, so it is diagnostic only and
    not acceptance evidence.
  - after switching the harness default to a worktree-local database, the
    command `./tests/e2e/run-e2e-hermetic.sh 001` passed and wrote
    `/tmp/drts-e2e-hermetic/20260726T181059Z-E2E-001-suite.log`.
  - a later full-suite rerun with `./tests/e2e/run-e2e-hermetic.sh` on the
    same isolated database produced suite logs through `E2E-007` and entered
    `E2E-008`; it was operator-interrupted during `E2E-008` reset, so it is
    still diagnostic rather than acceptance-grade evidence.
  - the latest full-suite rerun with `./tests/e2e/run-e2e-hermetic.sh`
    completed `E2E-001` through `E2E-022` and emitted the summary
    `[hermetic] PASS (22): 001 002 003 004 005 006 007 008 009 010 011 012 013 014 015 016 017 018 019 020 021 022`
    with `FAIL (0): none`; task-local artifacts include
    `/tmp/drts-e2e-hermetic/20260726T183257Z-E2E-001-suite.log`,
    `/tmp/drts-e2e-hermetic/20260726T183257Z-E2E-008-suite.log`, and
    `/tmp/drts-e2e-hermetic/20260726T183257Z-E2E-022-suite.log`.

## Honest release posture at current head

1. The repository already contains substantial Fleet B/C/D/E/F/G evidence that
   can be mapped into a single current-head matrix.
2. The single matrix itself was missing and is created by this task.
3. The Fleet H global hermetic rerun is green at current head. The harness now
   uses a worktree-local database, produces bounded reset and suite
   diagnostics, and emitted an uninterrupted 22-scenario green summary on
   `2026-07-26`.
4. S-3 still carries existing external evidence blockers and one direct
   current-head failure from `S3-VERIFY-001`.

## Final unresolved blockers as of 2026-07-26

1. `S3-VERIFY-001` still reports honest `blocked_ext` evidence gaps for Android
   and iOS offline replay.
2. `S3-VERIFY-001` still reports honest `blocked_ext` evidence gap for
   production alert p95.
3. `S3-VERIFY-001` still reports `failed_current_head` on forbidden-vocabulary
   scan.
