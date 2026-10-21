# CI-FULL-UNIT-BUDGET-AND-COVERAGE-FLOW-20261015

Owner: Claude2 · Reviewer: Claude · 2026-10-16 UTC

## Finding and repair boundary

**CI-BUDGET-F1** (`.github/workflows/ci-integ.yml`, `unit` job): the API
image build and `pnpm run test:unit` shared one 20-minute job. Measured
evidence (`Clamd`/`DesignPlanning` attempt-2 runs, job `116695930193` /
`116696088136`, source `11ed91ba151b04519670d11316d5f30f1fdc0d74`): the image
build step alone took 224-283s, and `test:unit` was still running (status
`cancelled`, not failed) at 849-944s elapsed when the job's 20-minute cap hit.
The suite never got a chance to pass or fail on its own merits.

**CI-BUDGET-F2** (`.github/workflows/ci.yml`, `product_smoke_acceptance`
job): lint, typecheck, native-passenger checks, root `test:unit`, and the
apps/api package suite ran serially inside one 25-minute job. Measured
evidence (run `38813607025` attempt 1, same source): root `test:unit`
completed successfully at 1085.17s elapsed (`741 passed | 8 skipped (749)`
files, `10066 passed | 47 skipped` tests -- confirms file-level skips are a
legitimate existing outcome, not a defect). The "API unit tests" step did not
start until 1431s elapsed, 69s of nominal budget before the 25-minute cap,
and was cancelled 86s later having completed only 85 of apps/api's 179 test
files (`"The job has exceeded the maximum execution time of 25m0s"`).

Original receipt:
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T2342-remaining-original-frontier-root/two-original-helper-and-Bank-existing-unit-budget-complete-CI-repair-readonly-diagnosis.json`.

## Repair

Both jobs split into: a cheap setup/fast-check stage, N independent
parallel shard jobs (each with its own hosted Postgres service where the
original step needed one), and a thin aggregate job that keeps the
original required-check name. Native `vitest --shard=i/N` divides the file
set Vitest discovers; a new tool,
`tools/ci/verify_unit_partition_coverage.py`, independently discovers the
same file set from the same include globs and the same three `test:unit`
excludes, then checks that the union of what every shard actually reported
covers that set exactly once (no gap, no duplicate, no stale/malformed
report) before merging the shards into one combined report with every
original per-suite name/status/failure/skip count untouched. Every existing
postgres-gate verifier (`verify_partner_notification_postgres_gate.py`,
`verify_passenger_app_postgres_gate.py`,
`verify_passenger_push_channel_postgres_gate.py`) and the inline voice
checkpoint gate script then run exactly as before, against that one merged
report -- none of those scripts changed.

### ci-integ.yml (`unit` job → `unit-image` + `unit-shard` × 4 + `unit`)

| Job | What it does | Timeout | Basis |
| --- | --- | --- | --- |
| `unit-image` | Builds `drts-api:test` once (unchanged build step), `docker save`s it, uploads it | 15m | measured build 224-283s + install/checkout; ~3x margin |
| `unit-shard` (matrix 1-4) | Loads the saved image, migrates, runs 1/4 of `test:unit` with `--shard` | 20m | 1085s baseline root-suite duration ÷ 4 ≈ 271s tests + image load + migrate + install overhead; ~3x margin |
| `unit` (aggregate) | Verifies shard partition coverage, merges reports | 10m | pure JSON processing, no product build |

The job named `unit` is still the one `ci-integ`'s final aggregate step
depends on by name (`needs: [..., unit, ...]`); it just no longer runs the
tests itself. `DRTS_REQUIRE_API_TEST_IMAGE` stays confined to `unit-shard`
only (verified by `test_workflow_unit_partitioning.py`).

### ci.yml (`product_smoke_acceptance` job → 4 jobs)

| Job | What it does | Timeout | Basis |
| --- | --- | --- | --- |
| `product_fast_checks` | Install, lint, cross-app-import guard, passenger-client portability, typecheck, native passenger typecheck+test | 20m | sum of measured lint (49s) + typecheck (108s+) + native checks; ~3x margin |
| `product_root_unit` (matrix 1-4) | Migrates, runs 1/4 of root `test:unit` with `--shard` | 20m | same 1085s÷4 basis as ci-integ's shard |
| `product_api_unit` (matrix 1-2) | Own fresh Postgres per shard; migrates; runs 1/2 of the apps/api suite serialized (`--no-file-parallelism --maxConcurrency=1`) within its shard's own DB | 15m | **weak extrapolation, flagged below** |
| `product_smoke_acceptance` (aggregate) | Verifies both suites' shard partition coverage, merges reports, runs the unchanged postgres-gate verifiers and the voice checkpoint gate | 15m | pure JSON processing + existing Python checks, no product build |

`product_smoke_acceptance` is still the job name `smoke-acceptance` depends
on (`needs: [scope, product_smoke_acceptance]`); it just aggregates instead
of running tests. `DRTS_DEV_MFA_WAIVED` stays confined to `product_api_unit`
only, absent from `product_root_unit`'s no-waiver identity tests (verified
by `test_workflow_unit_partitioning.py`).

**Flagged limit on `product_api_unit`'s timeout/shard count**: the apps/api
suite's full duration was never observed in the diagnosis evidence -- the
cancelled run completed only 85 of 179 files in 86s before the job timeout
hit. The 2-shard split and 15-minute timeout are a linear extrapolation from
that partial data (≈1s/file × 179 files ÷ 2 shards ≈ 90s of test time, with a
large margin for the extrapolation's own uncertainty), not a measured
baseline. The first hosted CI run on this candidate is the first real
measurement; if a shard runs close to its 15-minute budget, the shard count
or timeout should be revisited before this is treated as settled.

## Evidence ledger

Baseline product/config SHA: `11ed91ba151b04519670d11316d5f30f1fdc0d74`.
Final candidate identity is the full SHA/branch/PR recorded by the same
handoff as this document.

| Finding / required acceptance | Source and change | Before → after | Command / evidence | Outstanding limits |
| --- | --- | --- | --- | --- |
| CI-BUDGET-F1 / `ci_full-unit_integration-budget-and-image-companion` | `.github/workflows/ci-integ.yml`: `unit` → `unit-image` + `unit-shard`×4 + `unit` | Before: image build + full `test:unit` serial in one 20m job, cancelled at 849-944s mid-suite. After: image built once (15m budget), 4 independent shards (20m each) each load the saved image and run ~1/4 of the suite against their own migrated Postgres. | `python3 tools/ci/verify_unit_partition_coverage.py --root . --include ... --exclude ... --shard-report <4 files> --merged-output unit-test-results.json`; see "Local checks" below for the tool's own test/smoke evidence. | Cannot start Docker/Postgres on this VM (restricted); the real `docker save`/`load` round-trip and the real 4-way `--shard` split were not executed end-to-end here. First hosted `ci-integ` run on this candidate is the first real measurement. |
| CI-BUDGET-F2 / `ci_full-unit_regular-root-api-independent-budgets` | `.github/workflows/ci.yml`: `product_smoke_acceptance` → `product_fast_checks` + `product_root_unit`×4 + `product_api_unit`×2 + `product_smoke_acceptance` | Before: root `test:unit` (1085s) left the API step only 69s of nominal 25m budget; API cancelled at 86s/179 files only 85 complete. After: root unit shards (20m each) and API unit shards (15m each, own DB per shard, serialized within each shard) run in independent parallel jobs, no longer sharing one job's clock. `DRTS_DEV_MFA_WAIVED` stays confined to the API job only. | Same verifier tool, run twice: root shards (`--root . --include tests/.../**/*.test.ts ×8 --exclude ×3`) and API shards (`--root apps/api --include "**/*.test.ts"`). | API shard count/timeout is an extrapolation from partial data (see flagged limit above), not a measured full-suite baseline. First hosted `ci.yml` run on this candidate is the first real measurement of actual per-shard wall time. |
| `ci_full-unit_complete-coverage-and-fail-closed-gates` | New `tools/ci/verify_unit_partition_coverage.py`; existing `verify_partner_notification_postgres_gate.py` / `verify_passenger_app_postgres_gate.py` / `verify_passenger_push_channel_postgres_gate.py` / voice-checkpoint inline script unchanged, now fed the merged report | Before: single-job report, no partition risk. After: same single merged report shape, but now assembled from shards with an explicit coverage check in front of it (missing/duplicate/malformed shard report, or any shard job not `success`, fails the aggregate before the merge even runs). | `python3 -m unittest tools/ci/test_unit_partition_coverage.py` (22 tests, synthetic fixtures: exact coverage, missing file, duplicate file, malformed JSON, missing file on disk, non-manifest suite, merge preserves names/status/failure/skip counts) → OK. `python3 -m unittest tools/ci/test_workflow_unit_partitioning.py` (14 tests: shard counts match aggregate's `--shard-report` count, required job names unchanged, env-var scoping) → OK. `python3 tools/ci/check_test_coverage.py` → 101 test files (was 99) all yield tests CI runs. `python3 -m unittest tools/ci/test_workflow_timeouts.py` → OK, unmodified (every new job already declares `timeout-minutes`). | These are tooling-only tests against synthetic fixtures, per §0.7; they do not replace the real hosted shard execution, which only runs in CI. |
| `ci_full-unit_exact-candidate-validation` | This document; `handoff` supplies the actual candidate SHA/branch | Before/after tooling commands above all re-run and read on this worktree. | Full existing `tools/ci` test suite re-run from repo root (`python3 -m unittest tools/ci/test_*.py` per file, matching how `ci.yml`/`ci-integ.yml` actually invoke them) → all pass; no regression in pre-existing checks (classify_change_scope, commit_trailers, dependency_security, canonical_consistency, postgres gates, etc.). Both workflow YAML files parse without error. | Independent reviewer re-check, hosted CI on both workflows for the real candidate SHA, and protected merge are pending this handoff; `done` is derived from that evidence, not asserted here. |

No product development/preview/browser/DB/Docker/Compose server was started
on this VM. The manifest-discovery and partition-coverage logic above was
exercised with synthetic fixtures and a local CLI smoke test (success case
and a deliberately-missing-shard failure case), not against a real
Postgres-backed hosted run.

## Local checks and reproducibility

Node `22.23.2`, pnpm `10.33.0`, Vitest `4.1.4`, Python `3.12`.

- `python3 -m unittest tools/ci/test_unit_partition_coverage.py -v` → 22 tests, OK.
- `python3 -m unittest tools/ci/test_workflow_unit_partitioning.py -v` → 14 tests, OK.
- CLI smoke test (synthetic 2-file fixture tree + 2 synthetic shard reports): success case produces the expected merged report; a shard report covering only 1 of 2 manifest files produces `ERROR: missing from every shard report: tests/unit/b.test.ts` and exits 1.
- `python3 tools/ci/check_test_coverage.py` → `all 101 test files yield tests CI runs.`
- `python3 -m unittest tools/ci/test_workflow_timeouts.py tools/ci/test_classify_change_scope.py tools/ci/test_check_commit_trailers.py tools/ci/test_check_test_coverage.py tools/ci/test_dependency_security.py tools/ci/test_passenger_app_postgres_gate.py tools/ci/test_partner_notification_postgres_gate.py` → all OK, run from repo root the same way the two workflows invoke them.
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-integ.yml')); yaml.safe_load(open('.github/workflows/ci.yml'))"` → both parse without error (sanity check only; neither workflow's own tooling takes a new YAML-library dependency -- `verify_unit_partition_coverage.py` and `test_workflow_unit_partitioning.py` both parse the workflow text directly, matching `test_workflow_timeouts.py`'s existing convention).

## Final candidate

Final commit identity, pushed branch, and PR reference are recorded by the
`handoff` that accompanies this document.
