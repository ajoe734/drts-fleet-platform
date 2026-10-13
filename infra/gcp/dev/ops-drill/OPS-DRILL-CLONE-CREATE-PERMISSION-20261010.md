# OPS-DRILL-CLONE-CREATE-PERMISSION-20261010

Owner: Codex. Independent reviewer: Codex2. This task-scoped evidence extends
the existing [restore-drill ledger](../../../../docs/04-uat/system-remediation-20260906/SR-LIVE-OPS-001.md);
its older permission table and clone-only residual risk are historical.

The earlier conditional and unconditional create designs below are historical.
The current repair and evidence are in
[OPS-DRILL-SWEEP-CREATE-AUDIT-20261013](#ops-drill-sweep-create-audit-20261013).

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

## 2026-10-13 unconditional project create correction

Task: `OPS-DRILL-CLONE-CREATE-UNCONDITIONAL-20261013`. Owner: Codex;
independent reviewer: Codex2. This section extends the original artifact and
does not replace the prior candidate's evidence or claim its CI for this repair.

Baseline: `b619182b4e2c3058b91f9cc4428c8b5c628a231b`.
First implementation anchor: `088dd757c0f612b82aeb71cd7e7b194a3e052d00`.
The final candidate SHA, branch and PR are recorded by canonical handoff.

Canonical dispatch notes report that the operator applied the old conditional
binding on 2026-10-12, but the next clone was still denied with missing
`cloudsql.instances.create` on the project. The condition never matched the
attributes supplied by Cloud SQL's project-level authorization check.
The worker independently read [drill run 38334799388](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38334799388):
it completed with `failure`, workflow head
`cb7cb2639b0aa7b7adf539c85e85bdae3c9c85e2`. Dispatch identifies the drill's
operator-readiness candidate as `da4debac`; the workflow head and readiness
candidate are separate identities. The Cloud Audit Logs denial at
2026-10-13T02:02:00.745Z remains supplied task evidence, not a new cloud query.

### Production boundaries and replacement

`role_specs()` now sets only `drtsOpsDrillCloneCreate.expression` to `None`.
Its permissions remain exactly `[cloudsql.instances.create]`. `binding()` emits
the project's unconditional custom-role binding. All four other role definitions
and bindings compare identically against baseline production functions.
Existing secret access, repository-only WIF, source clone and prefix delete
conditions remain unchanged.

`legacy_create_binding()` identifies the full old role/title/expression pair.
`inventory(complete=False)` allows that exact pair only on this project for an
operator migration; it still verifies the custom role's exact permissions and
audits all other project, ancestor, secret and SA grants before any write.
`inventory(complete=True)` uses only the final allowlist, so readiness rejects
the old condition even when an unconditional binding already exists.
`audit_policy()` / `same_binding()` retain exact role and condition comparison
and reject all SA grants inherited from a folder or organization.

`apply()` removes only the drill SA member from that exact obsolete binding
before adding the unconditional binding. The [gcloud command contract](https://docs.cloud.google.com/sdk/gcloud/reference/projects/remove-iam-policy-binding)
selects the member, role and exact condition, including optional description;
the implementation does not use `--all`. Other members and all unrelated
role/condition pairs survive. An already-present unconditional binding is not
added again; repeat apply performs no writes. Failed removal stops before add;
failed add can be retried from the audited intermediate state. Migration does
not publish readiness. `main --check-ready` audits again after operator
confirmation; `check_readiness.check()` retains its candidate/provider/age/digest
receipt checks. Its docstring now points explicitly to the strict IAM audit.

### Residual risk and operational boundary

This corrects a condition that never authorized create; the intended scope
remains the single SQL create permission on this dev project approved by the
user on 2026-10-10. The SA can create Cloud SQL instances of **any name** and
size in this project, with cost risk, and extra clones can copy dev data.
There is no IAM-enforced destination name, size or cost cap. Instances outside
the drill prefix cannot be deleted by this SA; sweep reports them for operator
investigation. Impersonation remains through repository-only WIF trust, which
is repository-wide rather than workflow-specific. SQL Admin update, overwrite,
restore and non-prefix delete remain ungranted. Existing DB credentials retain
their database privileges; read-only SQL remains a runner control.
`plan.residual_risk` displays the corrected unconditional binding and these risks.

No live gcloud mutation, operator apply/readiness publication, cloud receipt,
workflow dispatch, deployment, product server, browser runner or Docker was
performed by this worker. Only fake external CLI processes were used in tests;
the fake proxy waits for a signal and never opens a socket. After same-candidate
review/CI/merge, Supervisor handles promotion, operator apply and readiness,
then hosted drill redispatch. Real Cloud SQL authorization is still unverified.

### Finding-level evidence for this candidate

Machine-specific logs: `.local/ops-drill-clone-create-unconditional-20261013/`.
External CLI behavior is mocked; production planning, policy auditing,
replacement, readiness publication, restore and sweep functions are exercised.
Readiness tests isolate only the local git dirty-tree query and operator input;
the authorization audit is never mocked.

| Finding / acceptance                                                         | Source / regression                                                                                                                      | Baseline → repair                                                                                                                                                                                                           | Command / evidence                                                                                                                                                                                              | Remaining                                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `drtsOpsDrillCloneCreate改為無條件綁定且角色仍只含cloudsql.instances.create` | `role_specs`, `binding`, `plan`; `test_plan_includes_only_project_sql_create_unconditionally`                                            | Baseline assertion fails on non-None expression, exit 1 → repaired plan has no condition and only create                                                                                                                    | Python 3.12.3; `python3 -m unittest tests/unit/system-remediation/sr-live-ops-001/test_drill.py -k test_plan_includes_only_project_sql_create_unconditionally -v`; `baseline-plan.log`, `create-regression.log` | Does not simulate real Cloud SQL IAM Conditions evaluation             |
| Exact replacement with no duplicate grant                                    | `legacy_create_binding`, `inventory`, `apply`; three legacy replacement/retry tests                                                      | Baseline replacement test observes 0 writes instead of 2, exit 1 → precise member removal then add; coexistence needs removal only; failures retry without duplicates                                                       | `-k test_legacy_create_is_replaced_exactly -v`: `baseline-replacement.log`; `-k create -v`: `create-regression.log`                                                                                             | Live IAM apply remains operator-only                                   |
| `readiness稽核接受此綁定並拒絕任何更寬授權`                                  | `audit_policy`, `inventory`, `main --check-ready`, `check_readiness.check`; positive receipt and negative drift/inheritance/legacy tests | Exact unconditional grant accepts; extra permissions, predefined/unapproved roles, altered conditions, other newly unconditional grants, folder/org inheritance and obsolete conditions reject before readiness publication | `create-regression.log`, `unit.log`; existing readiness publication/receipt regression                                                                                                                          | Live operator readiness and actual hosted clone unverified             |
| Preserve all other authorizations and safety controls                        | Baseline/current production `role_specs` / `binding` comparison; existing apply, restore, sweep and cleanup tests                        | Four other roles and bindings identical; unrelated members/grants survive migration                                                                                                                                         | `role-preservation.log`; `unit.log`                                                                                                                                                                             | Offline CLI boundary scope only                                        |
| Correct residual risk                                                        | `role_specs` comment, `plan.residual_risk`, this section                                                                                 | Historical ineffective condition → explicit one-permission unconditional project grant, any-name/size/cost/repository trust risks                                                                                           | Production diff and content review; runtime reproduction not applicable                                                                                                                                         | Operator must review plan before apply                                 |
| `同候選SHA CI通過且獨立reviewer審查`                                         | Final published candidate and PR; independent Codex2 review                                                                              | Pending canonical handoff/hosted CI; no prior green result reused                                                                                                                                                           | Candidate lifecycle records exact SHA and results                                                                                                                                                               | Same-SHA CI, independent review, merge and acceptance evidence pending |

Checks on verification anchor `b64d6847177c659df07d03a730436b0601dd55ce`:

- Create-scoped regression: **pass**, exit 0, 11/11, 31.833s
  (`create-regression.log`; production code matches the verification anchor).
- `python3 -m unittest tests/unit/system-remediation/sr-live-ops-001/test_drill.py -v`:
  **pass**, exit 0, 48/48, 58.733s (`unit.log`).
- `pnpm exec vitest run tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts`:
  **pass**, exit 0, 1 file / 2 tests, 59.71s (`vitest.log`); this executes the
  real Python suite through the existing CI wrapper. Node v22.23.2 /
  pnpm 10.33.0 / Vitest 4.1.4.
- `python3 -m py_compile infra/gcp/dev/ops-drill/*.py tests/unit/system-remediation/sr-live-ops-001/test_drill.py tests/unit/system-remediation/sr-live-ops-001/fake_cli.py`:
  **pass**, exit 0.
- `python3 tools/ci/check_test_coverage.py`: **pass**, exit 0; all 97 registered
  test files yield tests run by CI. The existing `ci-integ.yml` executes this
  Python suite; the Vitest wrapper also executes it against offline CLIs.
- Baseline/current role comparison: **pass**, exit 0 (`role-preservation.log`);
  production role definitions/bindings are compared directly, not copied SQL
  or mocked authorization logic.
- `pnpm exec prettier --check infra/gcp/dev/ops-drill/OPS-DRILL-CLONE-CREATE-PERMISSION-20261010.md`
  and `git diff --check`: **pass**, exit 0; rechecked after the final evidence edit.

The final closeout commit changes this evidence document only after the
verification anchor; tested production and regression code is identical.
Hosted same-SHA CI starts from the final PR/handoff and remains pending here.

The first repaired replacement-test run failed because its expected-state
fixture shared the legacy and desired member list; this was corrected by
copying the fixture. `create-fixture-failure.log` retains that failure, and
the final scoped/full results above contain no failing or skipped tests.

## OPS-DRILL-SWEEP-CREATE-AUDIT-20261013

Owner: Codex. Independent reviewer: Codex2. Baseline:
`108766390714775d2cdaeab390bf0ff5c4590d1b`. Regression anchor:
`5dc55a85b`; implementation/verification anchor:
`de25cfa20240d43e9f9b3e5c0a6f3e5dac5eb33f`. The final candidate adds this
evidence update and fixture formatting; production code is the verified anchor's
code. Its full SHA, branch and PR are recorded by canonical handoff.

### Actual trigger and repair boundary

The [hosted drill 38379371905](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38379371905)
at `cb8f33103105067a6d2752561c27a784c6400676` restored/read back successfully
and confirmed deletion, but its sweep failed. This worker read the completed
job results and downloaded sanitized artifacts into
`.local/ops-drill-sweep-create-audit-20261013/hosted-baseline/`:
`restore_readback_passed`, clone operation
`616d39b0-33fa-494f-a2da-36c000000032`, RTO runnable 508.124s/readable 511.810s,
cleanup `deleted` at `10:02:12.491508Z`; sweep failure
`audit_destination_or_identity_missing` with no remaining drill instances.

The dispatch's canonical integration notes supply three actual audit shapes:
clone start with a destination in the request, clone completion with a null
request, and create permission check with no operation/null request. The last
record identifies the new instance in the granted create authorization's
`resourceAttributes.name` and its `database_id` label. These shapes are retained
in `tests/unit/system-remediation/sr-live-ops-001/create-audit-20261013.json`;
insert IDs are sanitized, and tokens/OAuth identifiers are omitted. No live
audit query or IAM mutation was run by this worker.

`sweep_drill.destination()` handles null requests, extracts only granted
`cloudsql.instances.create` authorizations with service
`sqladmin.googleapis.com` and an exact `projects/<PROJECT>/instances/<name>`
path, and checks agreement among authorization names, request name and the
optional `database_id == <PROJECT>:<name>`. Missing identity/destination,
malformed data and conflicts fail closed. Source/project `resourceName` is
never a destination fallback. Clone completion correlation remains restricted
to clone records with the same operation ID. Non-drill destinations are
reported for operator inspection; foreign projects fail before acceptance.

The same observed new-instance resource attribute is the basis for narrowing
`drtsOpsDrillCloneCreate` to exactly the temporary role's sqladmin/drill-prefix
expression. Its sole permission remains `cloudsql.instances.create`.
`inventory(complete=True)` accepts only the new binding, rejecting unconditional,
obsolete project-name conditions, broader/altered grants and inheritance.
Pre-apply inventory allows only the two exact historical create bindings for
replacement. `apply()` removes the drill SA from those exact bindings before
adding the new condition (`--condition=None` selects the unconditional grant),
preserves other members/grants, and remains retryable without duplicate grants.
Readiness publication is separate and performs the strict post-apply audit.

Remaining risk: the prefix condition does not limit instance size, count or
cost. Additional drill-prefixed clones may copy dev data; clone source IAM,
runner destination guards and sweep remain necessary. WIF trust remains
repository-wide, and DB credentials retain their SQL privileges.

### Finding-level verification

Logs: `.local/ops-drill-sweep-create-audit-20261013/`. Python 3.12.3,
Node v22.23.2, pnpm 10.33.0, Vitest 4.1.4. External CLI responses are mocked;
production destination parsing, sweep, policy inventory, apply, readiness
publication, restore and cleanup execute unchanged through those boundaries.
The dummy proxy process does not bind a socket. Readiness tests isolate git's
dirty-tree check and operator input, retaining the production IAM audit.

| Finding / required acceptance                                 | Source and test                                                                                                                                                        | Baseline → repair                                                                                                                                                                                                                         | Command / result / evidence                                                                                                                                                                                                                                 | Pending or limitation                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sweep能從create權限檢查紀錄取得目的地且仍拒絕無法辨識的紀錄` | `destination`, `sweep`; `test_sweep_real_clone_completion_and_create_check_pass` and three real-create negative/positive tests                                         | Baseline null request raises AttributeError (exit 1); repaired three-record sweep passes; non-drill/foreign project, absent/denied/wrong permission, malformed service/path/labels/request, conflicting names and missing identity reject | `python3 -m unittest tests/unit/system-remediation/sr-live-ops-001/test_drill.py -k test_sweep_real_clone_completion_and_create_check_pass -v`: baseline exit 1 (`baseline-sweep.log`) → repaired exit 0 (`repaired-sweep.log`); full regression `unit.log` | Offline audit boundary; fresh hosted sweep awaits operator readiness/redispatch                               |
| `建立權限依實證收緊為drill前綴`                               | `role_specs`, `obsolete_create_bindings`, `inventory`, `apply`, readiness publisher; prefix plan, exact migration/retry, dual-obsolete-grant and drift/readiness tests | Baseline plan expression is None (exit 1); repaired expression equals temporary sqladmin/prefix condition; unconditional grant removal uses exact None selector; strict readiness rejects old/broader grants                              | `-k test_plan_limits_sql_create_to_drill_prefix -v`: baseline exit 1 (`baseline-prefix.log`) → repaired exit 0 (`repaired-prefix.log`); full suite exit 0 (`unit.log`); four other production role definitions/bindings unchanged (`role-preservation.log`) | Real condition application/evaluation remains Supervisor/operator work after integration; no gcloud mutations |
| Prior restore/sweep/cleanup and readiness regressions         | Existing `test_drill.py` and Vitest CI wrapper                                                                                                                         | All prior behaviors retained, including leftovers, truncated/missing audit, correlated completion, failed replacement retry, ancestor/resource grants and candidate receipt                                                               | `python3 -m unittest tests/unit/system-remediation/sr-live-ops-001/test_drill.py -v`: exit 0, 54/54, 64.097s (`unit.log`); `pnpm exec vitest run tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts`: exit 0, 2/2, 61.95s (`vitest.log`)   | No product server, PG, browser runner or Docker started                                                       |
| `同候選SHA CI通過且獨立reviewer審查`                          | Final pushed candidate/PR and canonical lifecycle; assigned Codex2 reviewer                                                                                            | Local checks pass; hosted CI and independent same-SHA review pending at candidate creation                                                                                                                                                | Exact final SHA/PR supplied at handoff; no baseline CI/review reused                                                                                                                                                                                        | CI results must be read for this candidate; reviewer approval, merge and acceptance are not owner completion  |

Additional checks: `python3 -m py_compile infra/gcp/dev/ops-drill/*.py
tests/unit/system-remediation/sr-live-ops-001/test_drill.py
tests/unit/system-remediation/sr-live-ops-001/fake_cli.py` and
`python3 tools/ci/check_test_coverage.py`: exit 0 (97 registered test files).
Formatting and `git diff --check` are checked before the final commit.
Local checks have no failing or skipped tests. The two intentional baseline
regression failures above are retained separately from the passing repair runs.
