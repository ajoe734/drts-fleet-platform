# Tenant Binding Acceptance Runner — SR-QA-WEBHOOK-001-ACCEPTANCE-RUNNER

- **Task ID**: `SR-QA-WEBHOOK-001-ACCEPTANCE-RUNNER`
- **Owner**: `Claude2`
- **Reviewer**: `Codex2`
- **Wave / Phase**: `system-remediation-20260906`
- **Parent Task**: `SR-QA-WEBHOOK-001-FIX-TENANT-BINDING` (status `acceptance`, locked candidate
  `10123f6af00a5342f2634a01f4d9a0e7190c2173`, merged as `ec9a6ac1119a0062bdd1a22e702c5610cc278bf8`
  via PR [#1841](https://github.com/ajoe734/drts-fleet-platform/pull/1841))

## 1. Why this workflow exists

SR-QA-WEBHOOK-001-FIX-TENANT-BINDING's acceptance criteria require
`full_appmodule_two_tenant_jwt_http_sql_candidate_evidence`: the full AppModule,
two real tenant JWTs, a real HTTP server, and real PostgreSQL readback. The
harness that proves this already exists at
`tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/appmodule-tenant-binding.test.ts`
and ships two tests:

1. AppModule composition / DI wiring (always runs, no database required).
2. `C111: Full AppModule with two real tenant JWTs rejects cross-tenant GET,
   rejects mutations, and preserves same-tenant lifecycle` — gated by
   `it.runIf(Boolean(process.env.DRTS_TENANT_BINDING_DATABASE_URL))`.

`ci-integ.yml`'s `unit` job runs this file but never sets
`DRTS_TENANT_BINDING_DATABASE_URL`, so test 2 self-skips there by design (CI
run [34308180838](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34308180838/job/102329482734):
5 scoped unit tests passed, AppModule job showed 2 tests / 1 HTTP-SQL skipped).
Worker VMs in this project are additionally prohibited from starting HTTP
servers or Docker Compose, so no worker session can produce this evidence
locally either. `.github/workflows/tenant-binding-acceptance.yml` is the
permitted environment: a dedicated, manually-dispatched, GitHub-hosted job
with a real ephemeral PostgreSQL service, so test 2 runs for real instead of
skipping.

## 2. What the workflow does

`.github/workflows/tenant-binding-acceptance.yml`, triggered by
`workflow_dispatch` with a required `candidate_sha` input (defaults to the
locked parent candidate `10123f6af00a5342f2634a01f4d9a0e7190c2173`):

1. Validates `candidate_sha` is a full 40-character hex SHA.
2. Checks out that exact `ref`, then runs `git rev-parse HEAD` and fails the
   job if it does not equal the requested SHA — `actions/checkout` resolves a
   moving ref at fetch time, so this guards against silently accepting a
   different commit than the one being accepted.
3. Installs dependencies and applies migrations (`pnpm db:migrate`) against a
   dedicated `postgis/postgis:16-3.4` service on `localhost:5432` (PostGIS is
   required — the migration set enables the `postgis` extension, matching
   `ci-integ.yml`'s existing jobs).
4. Sets `DRTS_TENANT_BINDING_DATABASE_URL` to that migrated database and
   `DRTS_WEBHOOK_AUTH_EVIDENCE` to an output path, then runs the harness with
   `pnpm exec vitest run ... --no-file-parallelism --maxConcurrency=1
   --reporter=default --reporter=json --outputFile.json=...`, teeing stdout to
   an execution log.
5. Gates on the JSON report: both tests must be present, all must pass, and
   `numPendingTests` must be zero — a skip is treated as a failure, not a
   pass, so a future regression that re-introduces the skip condition cannot
   read as green.
6. Uploads the execution log, JSON test report, and the
   `DRTS_WEBHOOK_AUTH_EVIDENCE` file with `if: always()`, so a failing run
   still leaves evidence to diagnose from instead of nothing.

No product source is modified or written back; the job only reads the
candidate and produces evidence artifacts.

## 3. Structural contract test

`tools/ci/test_tenant_binding_acceptance_workflow.py` asserts (via plain
text/regex parsing, matching `tools/ci/test_workflow_timeouts.py`'s existing
convention of not adding a YAML-parsing dependency to a check that runs in
the same CI job it protects) that the workflow file keeps:

- a required `candidate_sha` `workflow_dispatch` input,
- a timeout on every job,
- a checkout of that exact `ref` plus a HEAD-vs-input comparison,
- the dedicated PostGIS service and `pnpm db:migrate` step,
- the acceptance database/evidence env vars pointed at `localhost:5432`,
- the exact harness path invoked with `--no-file-parallelism
  --maxConcurrency=1`,
- the zero-skip / both-tests-passed gate, and
- an `if: always()` upload step covering the log, report, and evidence file.

## 4. Why `.github/workflows/ci-integ.yml` also changed

This task's declared write scope is the three artifacts above. Adding
`tools/ci/test_tenant_binding_acceptance_workflow.py` as a tracked
`test_*.py` file, without registering it anywhere `ci.yml` or `ci-integ.yml`
already runs `python3 -m unittest ...`, trips
`tools/ci/check_test_coverage.py`'s repo-wide guarantee that every tracked
test file yields a test CI actually runs. That checker executes unconditionally
in both workflows' first job (`scope` / `changes`) on every PR, so an
unregistered test file here would fail CI for every subsequent PR in the
repo, not just this one — confirmed locally: staging the new file and running
`python3 tools/ci/check_test_coverage.py` fails with `tools/ci/
test_tenant_binding_acceptance_workflow.py: on no path CI runs` until it is
registered.

The historical precedent for this exact coupling is commit `31f6aa0f1`
(`CI-JOB-TIMEOUT-001`), which added `tools/ci/test_workflow_timeouts.py` and
its registration in both `ci.yml` and `ci-integ.yml` in the same commit for
the same reason.

The fix here is the smallest possible: one line added to the existing list of
`python3 -m unittest tools/ci/test_*.py` invocations already present in
`ci-integ.yml`'s `changes` job (which `check_test_coverage.py` reads from both
workflow files regardless of which one executes it, so registering in
`ci-integ.yml` alone satisfies the check for both). No job logic, gating
condition, timeout, or other lane's step was touched. Flagging this
explicitly for Codex2 review since it is outside the three literal paths in
this task's `write_scopes`.

## 5. Verification run in this session

This worker VM may run repository checks but may not start product
development servers or Docker Compose, so the acceptance workflow's actual
PostgreSQL/HTTP run cannot be exercised here. What was verified locally:

```bash
python3 -m unittest tools/ci/test_tenant_binding_acceptance_workflow.py -v
# Ran 10 tests in 0.001s — OK

python3 tools/ci/check_test_coverage.py
# check_test_coverage: all 62 test files yield tests CI runs.

python3 -m unittest tools/ci/test_classify_change_scope.py \
  tools/ci/test_check_commit_trailers.py tools/ci/test_check_test_coverage.py \
  tools/ci/test_workflow_timeouts.py tools/ci/test_canonical_consistency.py
# Ran 33 tests — OK
```

The workflow itself must still be dispatched once (`gh workflow run
tenant-binding-acceptance.yml -f candidate_sha=10123f6af00a5342f2634a01f4d9a0e7190c2173`
or the Actions UI equivalent) against a permitted GitHub-hosted runner to
produce the actual `full_appmodule_two_tenant_jwt_http_sql_candidate_evidence`
required by the parent task. That dispatch and its resulting run
URL/log/evidence are the next step, and are what the parent task's
acceptance lifecycle still needs before it can move past `acceptance`.
