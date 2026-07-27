# E2E-MTX-001 Current-Head Preflight

## Control

| Field                                 | Value                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Task ID                               | `E2E-MTX-001`                                                                                                                                  |
| Fleet                                 | `H`                                                                                                                                            |
| Owner                                 | `Codex`                                                                                                                                        |
| Reviewer                              | `Claude`                                                                                                                                       |
| Inspection date                       | `2026-07-27`                                                                                                                                   |
| Worktree branch                       | `codex/e2e-mtx-001`                                                                                                                            |
| Evidence-producing runtime head       | `525e1488d15efa398728636205ba938820b85505`                                                                                                     |
| Durable hermetic evidence directory   | `support/sidecars/E2E-MTX-001/hermetic/20260727T013549Z/`                                                                                      |
| Execution packet                      | `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`                                                  |
| Source DoD                            | `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/source_specs/01_system_development_team_spec_20260720.md#33-definition-of-done--system` |
| Prior Fleet H sidecar reused as input | `support/sidecars/E2E-MTX-UI-FULL-001/`                                                                                                        |

This sidecar distinguishes the runtime head that produced the hermetic evidence
from later follow-up commits on the reviewed branch head
`e99c647b125beeda0357c265f4ff739666a86232`. Reviewer verification should anchor
PASS(22) provenance on the runtime head above plus the committed log bundle
under `support/sidecars/E2E-MTX-001/hermetic/20260727T013549Z/`.

## Task interpretation

This task is the Fleet H single evidence matrix for:

1. the `# 33. Definition of Done — System` P-5 and S-3 items;
2. the Fleet H automated matrix scenario IDs listed in
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
- Those matrix IDs are planned scenario names only; they are not runnable repo
  test filenames today. Runnable coverage is instead provided by the actual
  `tests/e2e/E2E-*.sh` scripts and Playwright specs cited in
  `EVIDENCE-MATRIX.md`.

## Current-head classification before edits

| Acceptance slice                              | Status                  | Basis                                                                                                                                                                       |
| --------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single matrix mapping Fleet H evidence inputs | `missing`               | No `support/sidecars/E2E-MTX-001/` sidecar existed on entry.                                                                                                                |
| §33 DoD item inventory                        | `implemented_elsewhere` | Canonical items exist in source spec §33, but were not yet mapped into a Fleet H matrix.                                                                                    |
| Fleet acceptance evidence reuse               | `partial`               | Multiple fleet sidecars exist, but no single current-head aggregator tied them to the release matrix.                                                                       |
| Shared hermetic runner                        | `implemented`           | `tests/e2e/run-e2e-hermetic.sh` exists.                                                                                                                                     |
| All hermetic suites green on current head     | `partial_current_head`  | On entry, this worktree had harness diagnostics and isolated DB hardening work in progress, but no uninterrupted full-suite green summary committed under the task sidecar. |
| Final unresolved-blocker list                 | `missing`               | No `E2E-MTX-001` blocker summary existed.                                                                                                                                   |

## Post-edit verification snapshot

| Acceptance slice                              | Status                  | Basis                                                                                                                                                                  |
| --------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single matrix mapping Fleet H evidence inputs | `verified_current_head` | This task now provides the missing Fleet H aggregator sidecar.                                                                                                         |
| §33 DoD item inventory                        | `verified_current_head` | The matrix maps all 20 §33 items verbatim to scenario IDs and evidence references, and now discloses which scenario IDs are planned-only.                              |
| Fleet acceptance evidence reuse               | `verified_current_head` | The matrix now ties Fleets A-H evidence into one release packet.                                                                                                       |
| Shared hermetic runner                        | `verified_current_head` | `tests/e2e/run-e2e-hermetic.sh` now uses the shared `maybe_timeout` helper for API builds and no longer leaves the unused `run_logged` path behind.                    |
| All hermetic suites green on current head     | `partial_current_head`  | Full-suite green evidence is committed for runtime head `525e1488d15efa398728636205ba938820b85505`; the later reviewed branch head `e99c647b125beeda0357c265f4ff739666a86232` was not rerun after its harness cleanup and disclosure edits. |
| Final unresolved-blocker list                 | `verified_current_head` | This sidecar and `EVIDENCE-MATRIX.md` now record the unresolved blockers explicitly.                                                                                   |

## Commands executed on 2026-07-27

```bash
AI_NAME=Codex scripts/ai-status.sh start E2E-MTX-001 \
  "triaging review findings and repairing evidence provenance for Fleet H matrix"
HERMETIC_LOG_DIR=support/sidecars/E2E-MTX-001/hermetic/20260727T013549Z \
  ./tests/e2e/run-e2e-hermetic.sh
```

## Current-head verification result

### Shared harness provenance repair

- `tests/e2e/run-e2e-hermetic.sh`: `UPDATED_CURRENT_HEAD`
- Changes made in this task:
  - reused the top-level `maybe_timeout` helper for the API build path instead
    of redefining it inside `bash -lc`;
  - preserved the `timeout` fallback behavior when GNU `timeout` is absent;
  - removed the dead `run_logged` helper after the harness standardized on
    `run_logged_timeout`.

### Durable hermetic rerun

- `HERMETIC_LOG_DIR=support/sidecars/E2E-MTX-001/hermetic/20260727T013549Z ./tests/e2e/run-e2e-hermetic.sh`:
  `PASS`
- Observed behavior:
  - the worktree repaired local `node_modules` isolation before the run;
  - the harness built `@drts/api`, then completed `E2E-001` through `E2E-022`;
  - the final summary was
    `[hermetic] PASS (22): 001 002 003 004 005 006 007 008 009 010 011 012 013 014 015 016 017 018 019 020 021 022`
    with `FAIL (0): none`;
  - task-local durable artifacts now include 66 committed files:
    one `db:migrate`, one `db:seed`, and one suite log for each of `E2E-001`
    through `E2E-022`.

## Honest release posture at current head

1. The repository already contains substantial Fleet B/C/D/E/F/G evidence that
   can be mapped into a single current-head matrix.
2. This task now adds the missing single Fleet H matrix plus committed durable
   PASS(22) evidence.
3. The Fleet H global hermetic rerun is green on evidence-producing runtime
   head `525e1488d15efa398728636205ba938820b85505`, and the proof is no longer
   left under `/tmp`.
4. The later reviewed branch head `e99c647b125beeda0357c265f4ff739666a86232`
   includes shared-harness cleanup and sidecar disclosure edits, but no new
   full-suite rerun is claimed for that head.
5. S-3 still carries existing external evidence blockers and one direct
   current-head failure from `S3-VERIFY-001`.

## Final unresolved blockers as of 2026-07-27

1. `S3-VERIFY-001` still reports honest `blocked_ext` evidence gaps for Android
   and iOS offline replay.
2. `S3-VERIFY-001` still reports honest `blocked_ext` evidence gap for
   production alert p95.
3. `S3-VERIFY-001` still reports `failed_current_head` on forbidden-vocabulary
   scan.
