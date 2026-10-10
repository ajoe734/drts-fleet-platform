# OPS-DRILL-CLONE-CREATE-PERMISSION-20261010

Owner: Codex. Independent reviewer: Codex2. This task-scoped evidence extends
the existing [restore-drill ledger](../../../../docs/04-uat/system-remediation-20260906/SR-LIVE-OPS-001.md);
its older permission table and clone-only residual risk are historical.

## Trigger and authorized boundary

The canonical task's 2026-10-10 integration notes record the user's approval
after Cloud Audit Logs reported missing `cloudsql.instances.create` on
`projects/drts-dev-devcc-20260825` during clone authorization, at
`2026-10-10T09:59:52.673Z`. The [failed hosted drill](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38043286508)
ran `124e8d9188e045b46136deca530cd81cb43f506b`; its completed failure and SHA
were independently read with `gh run view`. The audit denial itself is supplied
by the canonical task notes, not newly queried by this worker.

Baseline: `d36ca2f807b70cb94564c023bfe07b02dc70abde` (dispatch branch/dev).
Implementation anchor: `f7c7563c8815192db8b54a1b1d65eb35644ff102`.
The final candidate adds this evidence document only; its full SHA and PR are
recorded by the canonical handoff. No previous review or CI is reused.

`provision_drill_sa.role_specs()` appends `drtsOpsDrillCloneCreate`, containing
exactly `cloudsql.instances.create`, with this exact project binding condition:

```text
resource.service == 'sqladmin.googleapis.com' && resource.name == 'projects/drts-dev-devcc-20260825'
```

The four existing roles, their permissions and conditions, secret access and WIF
bindings are unchanged. `plan()` derives both role definitions and project
bindings from `role_specs()`. `inventory()` audits those exact bindings through
`audit_policy()` / `same_binding()` and verifies each role's permissions.
`apply()` consumes the same definitions. Both pre-write inventory and the
complete readiness audit therefore accept precisely the new binding; no
allowlist bypass or broader matching logic was added.

`check_readiness.check()` still validates the operator's candidate, provider,
freshness and inventory digest receipt; it does not perform IAM authorization
itself. Its receipt schema and the production `main --check-ready` flow are
unchanged. `sweep_drill.destination/sweep` already parse and query both clone and
create events. Only offline create-event fixtures/tests were added. Workflow
safety gates, the restore runner, cleanup and sweep production code are unchanged.

## Residual risk

The drill SA can create new Cloud SQL instances anywhere in this dev project
and extra clones copying dev data. The project condition does not constrain
destination names, instance size or cost. A non-prefix instance cannot be
deleted with the drill SA's existing delete grant; the unchanged sweep reports
it for operator investigation and never bulk-deletes it. Impersonation remains
reachable only through repository-only WIF trust, which is repository-wide,
not restricted to this workflow. SQL Admin overwrite/update/restore and
non-drill deletion remain ungranted. Existing database credentials retain their
database privileges; read-only SQL remains a runner control. `plan.residual_risk`
now displays these risks to the operator before confirmation.

## Finding and acceptance evidence

| Finding / acceptance                                                     | Production source and regression                                                                                          | Old result → corrected result                                                                                                                                                                                                                                                                                                                             | Command / version / evidence                                                                                                                                                                                                  | Remaining                                                                               |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Missing project create / 演練帳號計畫加入條件式cloudsql.instances.create | `role_specs`, `binding`, `plan`; `test_plan_includes_only_project_sql_create_with_exact_condition`                        | New test calls baseline production `plan()` with fake external CLIs: missing role raises `StopIteration`, exit 1 → exact one-permission role and exact service/project condition accepted, exit 0                                                                                                                                                         | Python 3.12.3; `python3 -m unittest tests/unit/system-remediation/sr-live-ops-001/test_drill.py -k test_plan_includes_only_project_sql_create_with_exact_condition -v`; `baseline-reproduction.log` / `create-regression.log` | Real IAM is unapplied; hosted clone authorization unverified                            |
| readiness稽核與測試同步更新且不放寬其他權限                              | `inventory`, `audit_policy`, `apply`, `main --check-ready`, `check_readiness.check`; upgrade and drift tests              | Already provisioned account needs exactly two additional writes; old IAM remains identical after removing new role/binding. Complete readiness accepts new grant. Unconditioned, `true`, service-only, name-only, prefix, foreign-project, extra permission/grant, missing binding and inherited grants reject; no readiness publication or repair writes | Targeted `-k create`: exit 0, 6/6, 10.114s; full unittest command below: exit 0, 43/43; `create-regression.log`, `unit.log`                                                                                                   | CLI boundaries are fake; no live policy or IAM Conditions evaluation claimed            |
| Preserve sweep/cleanup safety with create capability                     | Existing `sweep_drill.destination/sweep`, real restore runner; create/foreign-create fixtures and all prior failure cases | Prefix create event passes the existing audit; foreign create fails with exact destination and no deletion; existing cleanup, leftovers, missing/truncated audit, LRO and credential regressions pass                                                                                                                                                     | Full unittest: exit 0, 43/43, 38.391s; `unit.log`                                                                                                                                                                             | No live clone, proxy, database, server or Docker process started                        |
| Risk disclosure                                                          | `plan.residual_risk`, explanation above                                                                                   | Clone-only historical description → explicit new-instance/cost/name/size/repository-wide trust risks                                                                                                                                                                                                                                                      | Reviewed production diff and task-authorized condition; documentation check is applicable, runtime reproduction is not                                                                                                        | Operator must review risk before applying                                               |
| 同候選SHA CI通過且獨立reviewer審查                                       | Final candidate supplied by canonical handoff; Codex2 reviews that SHA                                                    | Pending; no owner approval, merge or completion claim                                                                                                                                                                                                                                                                                                     | PR/head, hosted checks and reviewer result are collected by existing candidate lifecycle                                                                                                                                      | Same-SHA hosted CI, independent review, integration and acceptance evidence outstanding |

Machine-specific logs are under `.local/ops-drill-clone-create-permission-20261010/`.
Tests execute production functions and shell entrypoints against fake `gcloud`,
`gh`, `psql` and proxy executables. The fake proxy only waits for a signal and
never opens a socket. In readiness-negative tests only the local git dirty-tree
query is isolated; the policy audit and readiness publication logic are real.

Checks on implementation anchor `f7c7563c8815192db8b54a1b1d65eb35644ff102`:

- `python3 -m unittest tests/unit/system-remediation/sr-live-ops-001/test_drill.py -v`:
  **pass**, exit 0, 43/43, 38.391s (`unit.log`).
- `python3 -m py_compile infra/gcp/dev/ops-drill/*.py tests/unit/system-remediation/sr-live-ops-001/test_drill.py tests/unit/system-remediation/sr-live-ops-001/fake_cli.py`:
  **pass**, exit 0.
- `python3 tools/ci/check_test_coverage.py`: **pass**, exit 0; all 95 registered
  test files run in CI. Existing `ci-integ.yml` already executes this Python suite.
- `pnpm exec vitest run tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts`:
  **environment failure**, exit 1 before test loading (`vitest.log`): shared
  `node_modules/vitest/vitest.mjs` is absent. Node v22.23.2 / pnpm 10.33.0.
  This is neither a passed nor a failed test case. No dependencies or links changed.
- `pnpm dlx prettier@3.6.2 --check infra/gcp/dev/ops-drill/OPS-DRILL-CLONE-CREATE-PERMISSION-20261010.md`: **pass**, exit 0 after formatting (`format-final.log`); initial check reported formatting changes (`format.log`).
- `git diff --check`: **pass**, exit 0.

No gcloud mutations, live operator `--apply` / `--check-ready`, GitHub variable
writes, workflow dispatch, deployment or browser tests were performed.
After review/CI/merge, Supervisor handles promotion to main; the operator applies
IAM and publishes readiness at the promoted SHA; Supervisor then re-dispatches
the hosted drill. This task does not claim successful live restore acceptance.
