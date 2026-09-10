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
locked parent candidate `10123f6af00a5342f2634a01f4d9a0e7190c2173`), or by a
narrow `push` trigger (see §6a):

1. Validates `candidate_sha` is a full 40-character hex SHA. The input is
   routed through job-level `env: CANDIDATE_SHA` and read back as `$CANDIDATE_SHA`
   in every `run:` step rather than interpolated directly via `${{ }}` inside
   the shell block — direct interpolation is textually substituted before the
   shell runs, which is a script-injection vector for a `workflow_dispatch`
   input. `with:`/`concurrency:`/artifact-`name:` usages of
   `${{ github.event.inputs.candidate_sha }}` are unaffected: those contexts
   are not shell and do not have this exposure.
2. Checks out that exact `ref`, then runs `git rev-parse HEAD` and fails the
   job if it does not equal the requested SHA — `actions/checkout` resolves a
   moving ref at fetch time, so this guards against silently accepting a
   different commit than the one being accepted.
3. Creates the evidence directory, then installs dependencies and applies
   migrations (`pnpm db:migrate`) against a dedicated `postgis/postgis:16-3.4`
   service on `localhost:5432` (PostGIS is required — the migration set
   enables the `postgis` extension, matching `ci-integ.yml`'s existing jobs).
   The evidence directory is created *before* install/migrate run (not only
   after they succeed), and install/migrate output is appended into the same
   execution log the harness writes to, so a failure in either step still
   leaves a log to diagnose from instead of nothing.
4. Sets `DRTS_TENANT_BINDING_DATABASE_URL` to that migrated database and
   `DRTS_WEBHOOK_AUTH_EVIDENCE` to an output path, then runs the harness with
   `pnpm exec vitest run ... --no-file-parallelism --maxConcurrency=1
   --reporter=default --reporter=json --outputFile.json=...`, appending
   stdout to the execution log.
5. Gates on the JSON report: both tests must be present, all must pass, and
   `numPendingTests` must be zero — a skip is treated as a failure, not a
   pass, so a future regression that re-introduces the skip condition cannot
   read as green.
6. Records a `run-status.json` file with `if: always()`, derived only from
   real step outcomes (`steps.install.outcome`, `steps.migrate.outcome`,
   `steps.harness.outcome`, `steps.gate.outcome`) and whether a test report
   was actually produced. Status is `passed` only when **all four** of
   install, migrate, harness, and gate outcomes are `success` *and* a report
   exists; `not_run` when install or migration never completed (harness never
   got to execute); otherwise `failed`. It always includes `candidate_sha`
   and, separately, `workflow_sha` (the commit that supplied the workflow
   definition for this run — see §6a). This step never infers or fabricates a
   pass — see §5 for why an early install/migrate failure previously produced
   no evidence at all, and §7 for a real false-pass this logic previously had.
7. Uploads the execution log, JSON test report, the
   `DRTS_WEBHOOK_AUTH_EVIDENCE` file, and `run-status.json` with
   `if: always()`, so a failing run — even one that fails before the harness
   runs — still leaves evidence to diagnose from instead of nothing.

No product source is modified or written back; the job only reads the
candidate and produces evidence artifacts.

## 3. Structural contract test and behavioral status-script test

`tools/ci/test_tenant_binding_acceptance_workflow.py` asserts (via plain
text/regex parsing, matching `tools/ci/test_workflow_timeouts.py`'s existing
convention of not adding a YAML-parsing dependency to a check that runs in
the same CI job it protects) that the workflow file keeps:

- a required `candidate_sha` `workflow_dispatch` input,
- the narrow `push` trigger scoped to this exact branch and the three
  task-owned files (see §6a),
- the `candidate_sha` fallback to the locked parent SHA on every context
  that reads it (checkout `ref`, `concurrency` group, `CANDIDATE_SHA` env,
  artifact `name`), and `WORKFLOW_SHA` recorded separately from
  `CANDIDATE_SHA`,
- a timeout on every job,
- a checkout of that exact `ref` plus a HEAD-vs-input comparison,
- the dedicated PostGIS service and `pnpm db:migrate` step,
- the acceptance database/evidence env vars pointed at `localhost:5432`,
- the exact harness path invoked with `--no-file-parallelism
  --maxConcurrency=1`,
- the zero-skip / both-tests-passed gate,
- an `if: always()` upload step covering the log, report, evidence, and
  run-status file, and
- an `if: always()` run-status step that derives status from real step
  outcomes (never a bare pass) and names the candidate, and creates the
  evidence directory before `pnpm install`/`pnpm db:migrate` run.

`RunStatusScriptBehaviorTests` in the same file goes further than token
presence: it extracts the `Record run status` step's `python3 - <<'PY_STATUS'`
heredoc verbatim out of the YAML, dedents it into standalone runnable Python,
and actually executes it in a scratch directory with crafted
`INSTALL_OUTCOME`/`MIGRATE_OUTCOME`/`HARNESS_OUTCOME`/`GATE_OUTCOME` env vars
and test-report fixtures, then asserts on the real `run-status.json` it
writes. This is what caught, and now guards against regressing, the false-pass
bug in §7 — a regex check that the script merely *mentions*
`steps.harness.outcome` would not have caught the script reading that value
into a variable it then never used in the status decision.

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
# Ran 22 tests — OK (includes RunStatusScriptBehaviorTests, which extracts
# and actually executes the embedded run-status script; see §3 and §7)

python3 tools/ci/check_test_coverage.py
# check_test_coverage: all 62 test files yield tests CI runs.

python3 -m unittest tools/ci/test_classify_change_scope.py \
  tools/ci/test_check_commit_trailers.py tools/ci/test_check_test_coverage.py \
  tools/ci/test_workflow_timeouts.py tools/ci/test_canonical_consistency.py
# Ran 33 tests — OK
```

Both embedded `python3 - <<'PY_...'` heredocs (the zero-skip gate and the
run-status step) were extracted and byte-compiled locally to catch a syntax
error before dispatch, since neither runs directly in this worker's own
checks; the run-status script is additionally exercised behaviorally by
`RunStatusScriptBehaviorTests` (§3).

## 6. Dispatch registration — this workflow is not runnable from `dev` alone

Codex2 review flagged (2026-09-10) that this workflow cannot actually be
dispatched once PR #1882 merges to `dev`, even though `candidate_sha`
defaults to the parent's locked candidate. The mechanism:

- This repository's default branch is `main` (confirmed via the GitHub
  Contents/Actions APIs: a `workflow_dispatch`-only workflow file that exists
  only on `dev` returns 404 from both the Contents API and the Actions
  workflow-list API for `main`).
- GitHub only lists a `workflow_dispatch`-triggered workflow as dispatchable
  (via the Actions UI "Run workflow" button, `gh workflow run <file>`, or the
  `POST .../actions/workflows/{id}/dispatches` API) once that workflow file
  has been *registered* by existing on the repository's **default branch**.
  A workflow that only has a `workflow_dispatch` trigger and no `push`/
  `pull_request` trigger has no other way to become registered — see
  [Manually running a workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
- `docs/ops/branch-strategy.md` §4 confirms this repo already has two other
  `workflow_dispatch`-only workflows (`deploy-staging.yml`, `deploy-prod.yml`)
  that are runnable today precisely because they already live on `main`.
  Merging PR #1882 into `dev` does not put `tenant-binding-acceptance.yml` on
  `main` — `dev` only reaches `main` through the full promote rail (§5 Gates
  2–3: nightly publish → ≥30 min soak → hourly promote), which can take up to
  ~24h and is not something this task should wait on or trigger itself.

**Authorized bootstrap path** (branch-strategy.md §5 "Hotfix path", already
documented and already used for direct-to-main tooling changes): branch this
one workflow file off `main`, PR it to `main` under the 3 main-branch gates
(or an authorized admin bypass), merge, then cherry-pick the same commit into
`dev` in the same change so `main` never out-diverges `dev` per the
Reconciliation rule. This is a CI/tooling-only file with no product-code
change and no risk to the reconciliation invariant. Once merged to `main`,
the workflow is registered and dispatchable.

**Exact dispatch command once registered**, using the locked parent
candidate SHA and dispatching *from* `main` (where the workflow file now
lives) while still checking out and verifying the original candidate — the
`--ref` below selects which copy of the *workflow YAML* runs, not which
commit gets tested; the job's own `actions/checkout` step still pins to, and
hard-fails on any mismatch with, `candidate_sha`:

```bash
gh workflow run tenant-binding-acceptance.yml \
  --ref main \
  -f candidate_sha=10123f6af00a5342f2634a01f4d9a0e7190c2173
```

This retains the parent's locked checkout SHA regardless of which ref the
workflow definition itself is dispatched from.

That dispatch and its resulting run URL/log/evidence are the next step, and
are what the parent task's acceptance lifecycle still needs before it can
move past `acceptance`. The bootstrap PR to `main` is a prerequisite for the
`workflow_dispatch` path specifically and is out of this worker's write scope
to execute (pushing to `main` is not a normal task-branch push); it must be
actioned by a lane authorized for direct-to-main changes before that path is
usable. §6a below is the runnable path that does not depend on it.

## 6a. Push trigger — a runnable path that does not require the `main` bootstrap

The Supervisor requires a runnable remote acceptance path as part of this
task, not only the documented `main`-bootstrap blocker in §6. `push`-triggered
workflows do not have `workflow_dispatch`'s default-branch registration
requirement: GitHub evaluates and runs the workflow file *as it exists at the
pushed commit*, on whatever branch that commit lands on, with no dependency
on the file being present on the default branch first.

The workflow's `on:` block therefore also declares:

```yaml
push:
  branches:
    - claude2/sr-qa-webhook-001-acceptance-runner
  paths:
    - .github/workflows/tenant-binding-acceptance.yml
    - tools/ci/test_tenant_binding_acceptance_workflow.py
    - docs/04-uat/system-remediation-20260906/tenant-binding-acceptance-runner.md
```

This is deliberately narrow: it only fires on a push to this task's own
branch, and only when a push touches one of the three artifacts in this
task's `write_scopes`. It does not add a trigger on `main`, `dev`, or any
shared branch, and does not change any other workflow's gating.

Because a `push` event has no `workflow_dispatch.inputs`, every place that
previously read `github.event.inputs.candidate_sha` now falls back to the
locked parent candidate when that input is absent:

```
github.event.inputs.candidate_sha || '10123f6af00a5342f2634a01f4d9a0e7190c2173'
```

applied identically to the checkout `ref`, the `concurrency` group, the
`CANDIDATE_SHA` job env, and the uploaded artifact `name`. This means a push
to this branch always re-verifies the same immutable parent candidate that
`workflow_dispatch`'s default already targets — it never checks out or tests
the pushed commit itself. The pushed commit's SHA is still recorded, but
separately: job env `WORKFLOW_SHA: ${{ github.sha }}` is threaded into
`run-status.json` as its own `workflow_sha` field, so evidence from a
push-triggered run never conflates "which commit changed the workflow" with
"which commit is being accepted".

**Observing a push-triggered run**, once this branch is pushed with these
files changed (local `gh` commands to list/watch GitHub-hosted runs are
authorized; no product runtime is started):

```bash
gh run list --workflow=tenant-binding-acceptance.yml \
  --branch=claude2/sr-qa-webhook-001-acceptance-runner --limit 5
gh run watch <run-id>
gh run view <run-id> --log
gh run download <run-id>   # fetches execution-log.txt / test-report.json /
                            # evidence-auth-http.json / run-status.json
```

The `main`-bootstrap path in §6 remains valid and still worth pursuing
separately: it is what makes the workflow dispatchable on demand for *any*
future candidate SHA, not just the one fixed value this push trigger falls
back to. The two paths are complementary, not alternatives — §6a exists so
this task does not have to block on §6's bootstrap PR landing first.

## 7. Bug found and fixed: run-status could report "passed" for a failed harness

Codex2 review (2026-09-10) reproduced a real false-pass in the run-status
computation without starting any product/server/DB: vitest's JSON reporter
can write `test-report.json` with `success: true` and both tests accounted
for even when the harness process itself later exits non-zero (e.g. an
unhandled error surfacing after the tests finished), which the GitHub Actions
runtime records as `steps.harness.outcome: failure` (or `cancelled`, on a
mid-step cancellation) while the report on disk still looks clean. The prior
logic was:

```python
if gate_outcome == "success" and report_path.exists():
    status = "passed"
```

— which never looked at `harness_outcome` at all, so a failed or cancelled
harness step with a clean-looking report was recorded as `"passed"` even
though the job itself was red. The fix requires all four tracked step
outcomes to be `success`, not just the gate step's:

```python
if (
    install_outcome == "success"
    and migrate_outcome == "success"
    and harness_outcome == "success"
    and gate_outcome == "success"
    and report_path.exists()
):
    status = "passed"
elif install_outcome != "success" or migrate_outcome != "success":
    status = "not_run"
else:
    status = "failed"
```

`RunStatusScriptBehaviorTests` (§3) covers this with behavioral regressions
that execute the real script: genuine full success (`passed`), successful
report with `harness=failure` (must be `failed`, not `passed` — the exact
reproduced case), successful report with `harness=cancelled` (must be
`failed`), successful report with `gate=failure` (must be `failed`), a
missing report despite success-looking outcomes (must not be `passed`), and
install/migrate failure (must be `not_run`).
