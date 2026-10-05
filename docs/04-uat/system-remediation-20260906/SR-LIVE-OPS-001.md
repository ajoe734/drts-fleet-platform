# SR-LIVE-OPS-001 — restore drill evidence

## CI declaration repair (2026-10-05, current)

Owner **Codex**, reviewer **Claude2**. PR #2322 candidate
`6d39b9b294338b87d695ae5ac30544bdd07ccc34` failed both hosted typecheck and
product smoke on the same missing declaration. The fetched `origin/dev` baseline
remains `a7b406dcacff1588fb41119605e61a71837587a6`. This follow-up adds only
`infra/gcp/dev/ops-drill/db_credentials.d.mts` and this evidence section;
runtime parser, tests, workflow and shared TypeScript configuration are unchanged.

| Finding / trigger                                    | Source / change                                                                                                                                             | Old → corrected result                                                                          | Command / evidence                                                                                                                                                                                                                                                                | Remaining                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| H5: strict root typecheck rejects the new ESM import | `restore-drill.test.ts:5` imports `db_credentials.mjs:credentials`; adjacent `.d.mts` declares the string argument and user/password/database string result | Old candidate: TS7016, exit 2; scoped strict compilation after declaration: exit 0; Vitest: 2/2 | [typecheck job 111806185685](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37322701240/job/111806185685), [product smoke job 111805830533](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37322701041/job/111805830533); local before/after logs below | Full local root check still has 13 unrelated worktree-resolution errors; same-new-SHA hosted CI/review required |

Machine evidence: `.local/sr-live-ops-001/ci-repair-20261005/`.
Both hosted logs were retrieved with `gh api --allow-escape-sequences
repos/ajoe734/drts-fleet-platform/actions/jobs/<job-id>/logs` (exit 0).
The local `typecheck-scoped.json` extends the unchanged root configuration,
selects the real `restore-drill.test.ts`, disables incremental caching and points
`typeRoots` at this worktree's `node_modules/@types`. It changes no compiler
strictness or production configuration. Command:
`pnpm exec tsc -p .local/sr-live-ops-001/ci-repair-20261005/typecheck-scoped.json --noEmit`.
`typecheck-scoped-before.log` records TS7016/exit 2;
`typecheck-scoped-after.log` records exit 0. The first scratch-config attempt
could not resolve Node types (TS2688/exit 2); it is not the defect reproduction.

`pnpm run typecheck:root` on the old candidate also reproduced TS7016, plus 13
TS2345 errors in unrelated fleet-list tests: shared dependency symlinks resolve
`ApiClient` through both the canonical checkout and this isolated worktree.
Those extra errors do not appear in either hosted failure log. This environment
limitation is tracked separately and must not be represented as a full local
typecheck pass.

Final checks on the declaration committed in `8f9005afb` (TypeScript 5.9.3,
Vitest 4.1.4); subsequent changes affect this document only:

- Scoped strict `tsc` above: **exit 0**, `typecheck-scoped-after.log`.
- `pnpm exec vitest run tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts`:
  **exit 0, 2/2**, 30.64s, `vitest-after.log`. This executes the same Python
  orchestration regression and real pg-driver credential comparison documented
  below, without cloud, database or browser connections.
- `pnpm run typecheck:root`: **exit 2**, `typecheck-root-after.log`. A comparison
  of actual diagnostic lines confirms that TS7016 was removed and the remaining
  13 TS2345 diagnostics are identical before/after; comparison **exit 0**,
  `typecheck-comparison.txt`. Full repository typecheck is not claimed passed.
- `pnpm exec prettier --check infra/gcp/dev/ops-drill/db_credentials.d.mts
docs/04-uat/system-remediation-20260906/SR-LIVE-OPS-001.md`,
  `git diff --check`, and commit-trailer validation: **exit 0**.
- `git fetch origin && git merge origin/dev`: **exit 0**, already up to date
  with the baseline above. Published commits are preserved.

Old candidate CI: main CI run `37322701041` completed **failure**; integration
run `37322701240` has the confirmed typecheck failure, with unit, build,
integration, IAM and cross-surface jobs successful. Its UI-route job was still
pending when evidence was collected and is not claimed passed. New-candidate
hosted CI is tracked independently through the existing PR/GitHub bus.

H1–H4 and the five required acceptance keys in the next section remain in force.
This declaration repair supplies no new live evidence; operator readiness at
the newly promoted main SHA and Supervisor dispatch remain prerequisites for
the real restore. No cloud resources, deployments or workflow dispatches are
performed by this worker.

## Hosted failure repair (2026-10-05)

Owner **Codex**, reviewer **Claude2**. This section supersedes the historical
readiness, query-window and operator instructions below. Dispatch baseline:
`origin/dev` **a7b406dcacff1588fb41119605e61a71837587a6**, fetched before changes
and merged without conflict as `7a416db213e41c36b6d7e8a4ec1833d9ce2f19c1`.
The original published history was retained. The two defective Python modules
are byte-identical at this baseline and previous reviewed candidate
`0437249456822a7c8c3b1c8861c87e77d2a03a19` (merged through PR #2286).
Final implementation checkpoint: `2c372b8fbc8ccc88769da19c1e7980d7e3c0146d`.
The evidence-only closeout SHA is recorded in canonical handoff and the new PR;
it must receive its own review/CI, not inherit PR #2286's approval.

Supervisor's 2026-10-05T14:00Z integration notes and the retrieved
[first hosted drill](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37320255336)
are the repair source. It ran main candidate
`bc85c54cf080a5906721912e4c009f4bf5c11239`, base/main parent
`a8f511aa28d356620c8d88599029b1d3e561f090`, attempt 1. Readiness succeeded;
restore failed with `invalid_db_secret` before cloning (`cleanup=not_created`).
Sweep failed with `child_unavailable_or_timeout`; its inventory found no drill
instances. This is failed live evidence, not a completed restore.

Retrieved with `gh run view 37320255336 --json headSha,conclusion,url,createdAt,updatedAt`
and `gh run download 37320255336 --dir .local/sr-live-ops-001/rework-20261005/hosted`
(both exit 0). Artifact name:
`sr-live-ops-bc85c54cf080a5906721912e4c009f4bf5c11239-37320255336-1`.
SHA256 of `restore.json`:
`4545d3c23555b386d20ec70346caded03cd8b3548a3fc51f89162b2293d74846`;
`sweep.json`: `a281973f87433856aa119ef510b79c243a136bb302aca13074704229c64b9c05`;
`readiness.json`: `118129143aa4325092af07973ce8b46857ec4ba9a8c98bda6ebaf63b136bb3b7`.

| Finding / trigger                         | Source / change                                                                                                        | Old → corrected result                                                                                                                                                       | Command / evidence                                                                                                                                                                                        | Remaining                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| H1: JSON resource treated as DB URL       | `restore_drill.Readback.__init__`; `fake_cli.py` now returns base64 `payload.data` for `--format=json`                 | Existing successful-readback test fails with the realistic boundary → passes when secret access uses raw output without `gc()`'s JSON format                                 | `regression-before.txt` / `regression-after.txt`; real Python orchestration with external CLI fakes                                                                                                       | Real secret read under drill SA on hosted runner                                                                   |
| H2: socket URL / special password parsing | `provision-dev-project.sh:db_url`; API `DatabaseService` passes URL to `pg.Pool`; new `db_credentials.mjs:credentials` | Old `Readback` with raw synthetic `[]` password throws `ValueError` in `urlsplit` → socket/TCP, encoded delimiters, raw brackets, query credentials and pgpass escaping pass | `parser-before.txt`; unit `test_readback_uses_raw_secret_and_pg_credentials_for_socket_and_tcp_urls`; Vitest compares eight inputs against actual API `pg.Client.connectionParameters` without connecting | Only credential interpretation is reused; connection host/options are deliberately fixed to the local hosted proxy |
| H3: 400-day audit query times out         | `sweep_drill.sweep`                                                                                                    | Old window/bounded-timeout tests fail → window starts at restore `started_at` minus 15m, ends at sweep start; invalid/future/over-95m run start fails closed                 | Five new sweep tests, including transient/persistent `subprocess.TimeoutExpired`; no live logging call in tests                                                                                           | Hosted latency and audit availability remain unverified                                                            |
| H4: promotion has no dev ancestry         | Workflow `base_sha` input description; existing ancestry checks retained                                               | Historical instruction to use dev SHA replaced by main ancestor/main parent; no guard bypass                                                                                 | Workflow/YAML content check; real run's base above                                                                                                                                                        | Operator must refresh readiness for new promoted main SHA                                                          |
| Prior cleanup, IAM and evidence findings  | Existing production orchestration, provisioner and artifact validator unchanged except secret/sweep boundaries         | All prior 32 tests retained and passing alongside seven added cases (39 total)                                                                                               | Final unit + Vitest results below                                                                                                                                                                         | Offline results never establish live acceptance                                                                    |

The secret command now follows Google's documented
[raw UTF-8 access behavior](https://docs.cloud.google.com/sdk/gcloud/reference/secrets/versions/access).
Credentials pass through captured private pipes to a Node helper, never command
arguments, logs or artifacts. It uses the same WHATWG URL normalization,
empty-host fallback, query credential precedence and decoding rules used by the
API's installed `pg-connection-string@2.12.0`
([upstream implementation](https://github.com/brianc/node-postgres/blob/master/packages/pg-connection-string/index.js)).
It extracts only user/password/database; URL host, SSL files and connection
options cannot override the hosted proxy/read-only settings. Invalid credentials
fail with a sanitized code before clone. `pgpass` is created mode 0600 before
writing, inherited `PG*` variables are removed, and credentials remain inside
the temporary directory/private process pipes. The workflow explicitly supplies
Node 22 before offline checks and readback. No npm installation is added.

Sweep still inventories **all** remaining drill instances and rejects unknown,
foreign, missing-own-operation or truncated audit evidence. Only the audit time
range changes: restore start minus 15 minutes to sweep start. If restore never
wrote evidence, it uses sweep start minus 15 minutes. Up to four 25-second logging
reads plus three 20-second waits and the 90-second inventory fit within the
existing five-minute step. A timeout is recorded in `audit_read_attempts`; repeated
timeouts produce `audit_read_timeout`, never a clean sweep. Earlier historical
create activity outside this run window is no longer asserted to have been scanned.

Completed local checks at `2c372b8fbc8ccc88769da19c1e7980d7e3c0146d`, Python 3.12.3,
Node v22.23.2, Vitest 4.1.4. Machine-specific evidence directory:
`.local/sr-live-ops-001/rework-20261005/`.

- `python3 -m unittest tests/unit/system-remediation/sr-live-ops-001/test_drill.py -v`:
  **exit 0, 39/39**, 32.921s, `unit-esm.txt`.
- `pnpm exec vitest run tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts`:
  **exit 0, 2/2**, 31.89s, `vitest-esm.txt`; includes the Python suite and actual
  pg driver comparison. No database/proxy/browser connection is made.
- `pnpm exec eslint tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts infra/gcp/dev/ops-drill/db_credentials.mjs --max-warnings=0`:
  **exit 0**, `lint-esm.txt`. The initial CommonJS helper failed lint; the final
  ESM change and reruns supersede that result.
- `python3 tools/ci/check_test_coverage.py`: **exit 0**, all 83 tracked Python test files
  covered. No new change to `.github/workflows/ci-integ.yml` was needed.
- Python compilation, `node --check infra/gcp/dev/ops-drill/db_credentials.mjs`,
  both shell entrypoints' `bash -n`, YAML dispatch-only assertion and `bash -n`
  for all seven workflow shell bodies: **exit 0**, `syntax-final.txt`.
- `pnpm exec prettier --check` on the changed workflow, helper, TS test and this
  document, `git diff --check`, and `python3 tools/ci/git/check_commit_trailers.py
--base origin/dev --head HEAD`: **exit 0**. Before handoff, a fresh fetch/merge
  found the dev baseline unchanged; the final evidence commits leave tested code
  byte-identical to the implementation checkpoint above.
- Before/after narrow probes: seven tests against unchanged old Python modules
  with the corrected external fake **exit 1** (seven failures/seven subtest
  errors); the repaired implementation plus invalid-secret rejection **exit 0,
  8/8**. Logs: `regression-before.txt`, `regression-after.txt`. No active tree was reset.

| Required acceptance              | Evidence available now                                                                                                                                                                                                 | Outstanding / responsible party                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `authorized_isolated_ops_target` | User approval + Supervisor-confirmed SA/conditioned roles/single-secret access; previous main's readiness artifact retrieved. Live `DEV_GCP_*` reread still targets `drts-dev-devcc-20260825:us-central1:drts-dev-db`. | Operator refreshes `--check-ready` at the new promoted main SHA; old receipt is not valid for this candidate.                                  |
| `backup_restore_readback`        | Hosted failure before clone, new 39-test offline regression.                                                                                                                                                           | Supervisor dispatches repaired workflow after merge/publish/promotion; real source/clone readback + deletion/sweep artifacts required.         |
| `rpo_rto_capacity_baseline`      | No successful live RPO/RTO yet; capacity remains explicitly unevaluated.                                                                                                                                               | Supervisor/operator provide approved representative workload/SLO and live measurements; this repair does not authorize load testing.           |
| `scheduled_job_restart_proof`    | Historical Scheduler/revision observations retained below, including unresolved HTTP 500.                                                                                                                              | Supervisor/reviewer collect and bind current read-only Scheduler/Cloud Run evidence; no controlled restart or multi-instance proof is claimed. |
| `live_candidate_sha`             | Old main run's candidate/base verified; new candidate locked only at handoff.                                                                                                                                          | Map new reviewed dev candidate → publish → promoted main drill SHA and deployed API revision; merge SHA is not the candidate.                  |

Execution sequence after review/CI: merge to dev, publish and promote; operator
runs `--check-ready` from a clean checkout at the **new main SHA**; Supervisor
dispatches with that full main SHA and a full **main ancestor** (normally its main
parent). The dev baseline above is traceability, not the workflow's `base_sha`
when promotion creates a tree commit. No worker ran live IAM apply/readiness,
read the actual secret, created/deleted a cloud instance, dispatched a workflow,
started a product/PG/proxy server, ran Playwright or performed load testing.
All five gates remain pending for this candidate; do not mark the task done.

## Historical delivery context (2026-10-03)

Owner: Codex. Reviewer: Claude2. Base: `cccd9b1118e2008adccabc117fef94bcebdccfe0`
(original branch base, origin/dev fetched 2026-10-03). The preceding dispatch fetched
`origin/dev` at `a1b84bd336b3e3179abd01a3f753a299275cc423`. This CI-registration
follow-up fetched and merged `5bf63636aa1a0a7bf70cda6c692002ba88e942e6`;
published history is preserved without rebasing. The operator/sweep delivery below
supersedes the IAM-blocked checkpoint. No live acceptance is claimed.

Supervisor rejected `e7e7d4ba7b038f2b075e51e48b6c39b873771a0e` on 2026-10-03:
the runner only printed success, referenced the wrong source, proposed an overwrite,
used nonexistent workflow variables, introduced an unapproved recurring schedule,
and omitted the dedicated IAM provisioning script. That branch is not a base or evidence.

The approved cost scope is one temporary same-tier PITR clone of `drts-dev-db`,
named `drts-dev-db-drill-<run>`, deleted after the run. Operator performs IAM setup;
Supervisor dispatches only after the workflow reaches main. Workers do neither.
No product runtime, database, proxy or browser server may run on this VM.

Read-only live inspection on 2026-10-03: GitHub `DEV_GCP_*` variables resolve to
`drts-dev-devcc-20260825`, `us-central1`, `drts-dev-db`. `gcloud sql instances describe`
returned RUNNABLE, POSTGRES_15, db-custom-1-3840, ZONAL, 10 GB, PITR enabled,
daily backup 18:00 UTC, seven retained backups and seven days of transaction logs.
These observations do not demonstrate restore success.

## CI registration follow-up (2026-10-03)

Previous candidate: `d93d87d820b481ecfffbf34805cd342e07c19253`, PR #2286.
Supervisor's 05:40Z scope approval permits exactly one unittest command in
`.github/workflows/ci-integ.yml`; the 05:45Z correction requires merging current
`origin/dev` before handoff and preserving both this task and
`AUDIT-DEPENDENCY-GATES-20261002` additions. No independent Claude2 review was
present on the PR at dispatch; the actionable finding is the failed CI gate.

The new command is the final line of `changes` / `Verify scope classifier
contract`, immediately before the existing live-mail unittest step. The workflow
diff against the merged dev base is exactly one added line. Neither the checker
nor the drill implementation/tests were changed. Checkpoint
`fe64094cba7de0a1b360c0ba46533224ab5bdddc` was normally pushed; merge commit
`144459467728a5fb77f5b9fcb55b4edbd972be2e` integrates the base above without
conflicts. The final evidence-only commit's full SHA is recorded by canonical
handoff after checking local, remote and PR heads agree.

| Finding / acceptance                                        | Source / change                                                                            | Previous → current result                                                                                                            | Commands / evidence                                                                                                                                                                                                 | Remaining                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| CI Python suite not registered                              | `ci-integ.yml` direct unittest line; `check_test_coverage.covered_targets/collected_files` | Previous candidate exits 1 for `test_drill.py` alone → merged implementation exits 0, all 80 tracked Python test files collect tests | `python3 tools/ci/check_test_coverage.py`; local `coverage-before.txt` / `coverage-merged.txt`; [previous hosted failure](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37090506760/job/111109685129) | New candidate hosted CI and Claude2 review required |
| Earlier F1–F6, credential, cleanup and evidence regressions | Existing `test_drill.py` invokes production orchestration with fake CLI boundaries         | 32/32 pass after registration; merged-version result below                                                                           | Exact registered unittest command below                                                                                                                                                                             | These are offline tests, not live acceptance        |

Machine-specific output is under this assigned worktree's
`.local/sr-live-ops-001/ci-registration-20261003/`. Completed checks:

- `python3 -m unittest tests/unit/system-remediation/sr-live-ops-001/test_drill.py -v`:
  **exit 0, 32/32** at the registration checkpoint, 26.893 seconds
  (`unit-after.txt`). At merge `144459467728a5fb77f5b9fcb55b4edbd972be2e`,
  **exit 0, 32/32**, 26.638 seconds (`unit-merged.txt`).
- `python3 tools/ci/check_test_coverage.py`: **exit 1** on the previous candidate
  (`coverage-before.txt`), **exit 0** after registration and after merging dev
  (`coverage-after.txt`, `coverage-merged.txt`), all 80 files covered.
- `python3 -m unittest tools/ci/test_check_test_coverage.py tools/ci/test_workflow_timeouts.py -v`:
  **exit 0, 11/11** (`ci-contracts.txt`); merged rerun **exit 0, 11/11**, 1.461
  seconds (`ci-contracts-merged.txt`).
- Python `yaml.safe_load` of `ci-integ.yml` and `bash -n` over its **35** shell
  run bodies: **exit 0**, syntax only, no workflow commands executed.
- `pnpm exec prettier --check .github/workflows/ci-integ.yml`: **exit 1 before
  loading Prettier**, shared dependency target missing. Explicit tool-cache
  fallback `pnpm dlx prettier@3.6.2 --check .github/workflows/ci-integ.yml`:
  **exit 0**; final check also includes this evidence document. No dependency,
  lockfile or shared symlink was changed.
- `git diff --check`: **exit 0**. The scoped source diff confirms the drill,
  provisioner, artifact validator and their tests are unchanged from the prior
  candidate; this follow-up repairs CI registration and records its evidence.

All five live acceptance rows in the ledger below remain pending. Operator owns
IAM apply/readiness; Supervisor owns hosted dispatch after main and collection
of live restore, workload/SLO, scheduler/revision and deployed-source evidence.
This worker did not apply IAM, publish readiness, create a clone, dispatch a
workflow, run a product server or run Playwright. New candidate CI results belong
to its own SHA; no previous candidate's green result is reused.

Hosted checkpoint verification was read to completion before this evidence update:
at `fe64094cba7de0a1b360c0ba46533224ab5bdddc`,
[CI run 37100160333](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37100160333)
and [integration run 37100160345](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37100160345)
both concluded **success**. The
[changes job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37100160345/job/111137968835)
log shows the registered command running **32 tests in 20.935 seconds**, followed
by the coverage check reporting **all 80 test files**. Retrieved logs/results are
`anchor-hosted-coverage.txt`, `anchor-ci-result.json` and
`anchor-ci-integ-result.json` in the local evidence directory above. These are
checkpoint results; the final candidate still requires its own CI and review.

## Supervisor decision and retained implementation (2026-10-03T02:20Z)

The canonical task's `integration_notes` accepts the inability to enforce the
clone destination through IAM. Supervisor explicitly directs an operator apply
script and post-run compensating controls, with **no mediated service**. This
resolves the design blocker at checkpoint `54b56c63617b7fbe23d935f20e4e7728b54633b4`;
it does not constitute provisioning or a live restore. Implementation anchors:
`a6a0ad69a7c1b4c622306e3664a603aca65388a7` and `10323e14f`.
The final full candidate SHA, branch and PR #2286 are recorded by the canonical
handoff command, after normal push. This document is part of that candidate.

`provision-drill-sa.sh` now defaults to a read-only plan; `--apply` inventories
IAM before prompting for `APPLY <SA> <full-candidate-SHA>`. It creates missing
resources/bindings additively, verifies readback, and does not publish readiness.
A rerun leaves exact existing resources untouched. Permission/condition drift,
extra direct SA grants, inherited grants, ambiguous public/group grants and
failed ancestor reads stop the operation; the script neither broadens access
nor deletes unknown grants. It also checks resource policies on other secrets
and service accounts for credential/impersonation paths. Operators need read
access to these policies across project/ancestors; absence is a blocker, not an
empty policy. The audit is conservative for group membership and does not claim
IAM Policy Troubleshooter or a live permission probe has been performed.

| Custom role               | Permissions                                          | Binding / purpose                                                                         |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `drtsOpsDrillSourceClone` | `cloudsql.instances.clone` only                      | Exact source name + SQL service; never automatically falls back to unconditional          |
| `drtsOpsDrillTemporary`   | `cloudsql.instances.get`, `.connect`, `.delete`      | SQL service and `drts-dev-db-drill-` resource prefix; get also supports operation polling |
| `drtsOpsDrillSourceRead`  | `cloudsql.instances.get`, `.connect`                 | Exact source name + SQL service for profile, recovery-window and readback                 |
| `drtsOpsDrillInventory`   | `cloudsql.instances.list`, `logging.logEntries.list` | Project read-only inventory and Admin Activity sweep                                      |

`roles/secretmanager.secretAccessor` is bound on `drts-dev-db-url` only.
`roles/iam.workloadIdentityUser` is bound on the dedicated SA only, to the existing
repository principalSet after verifying issuer, mapping, condition and enabled
state. This WIF trust is repository-wide, not restricted to this workflow.

Authority: Google's [Cloud SQL permissions table](https://docs.cloud.google.com/sql/docs/postgres/iam-permissions)
maps clone to `cloudsql.instances.clone`, operation polling to instance get, and
listing to instance list (the table has duplicate list entries). Its
[IAM Conditions example](https://docs.cloud.google.com/sql/docs/postgres/iam-conditions)
uses the SQL service and instance resource name. The source-only clone condition
is retained conservatively; actual clone/recovery-window/operation authorization
under this SA is still a hosted validation item. If source conditioning is
rejected, stop and provide the exact denial to Supervisor/operator; this candidate
does not exercise the authorized fallback automatically.
The [audit reference](https://docs.cloud.google.com/sql/docs/postgres/audit-logging)
identifies clone/create Admin Activity methods and the Cloud SQL service name.

**Residual risk accepted by Supervisor:** a misused token can create an extra
clone, costing money and copying dev data within the project. Cloud SQL Admin API
update/restore/import/export/user changes and deletion of non-drill instances are
not granted. The existing DB secret retains its SQL-level privileges; read-only
transactions are runner controls, not a newly restricted database credential.
These controls must not be described as preventing all SQL writes by a stolen
credential or as an IAM-enforced destination prefix.

`--check-ready` requires a separate interactive `READY <SA> <SHA>` confirmation
and a second complete policy audit. It is the **operator**, not the worker, who
creates/updates the new repository variable `DEV_OPS_DRILL_READY`. Its JSON binds
the candidate, provider, SA, check time and policy digest. It expires after 24 hours.
The workflow validates it before authentication and uploads a sanitized receipt
without the provider field. The digest is an audit fingerprint, not a signature
or live permission proof. Changed IAM requires renewed operator audit; a receipt
is not continuous enforcement against subsequent policy changes.

The workflow remains dispatch-only/main-only. `always()` retries exact-target
cleanup and runs `sweep_drill.py` independently, even if cleanup fails. The sweep
lists all remaining drill instances and examines up to 999 retained Admin Activity
clone/create records for this SA in a stated 400-day query window. Full pages,
missing destinations, uncorrelated LRO completion records, missing own-clone audit,
query failures, residual drill instances or non-prefix destinations fail the run.
It prints exact leftover names and uploads allowlisted IDs/timestamps; it never
bulk-deletes foreign resources. Audit ingestion has three 20-second retries.
Retention, log latency or an unexpected response shape can therefore require
operator investigation. A lost runner/token still cannot guarantee cleanup.

The hosted-only `restore-artifact.spec.ts` retrieves the completed successful
workflow run and candidate/run/attempt-named artifact from GitHub. It invokes
`validate_live_evidence.py`, which recomputes readback comparisons and RPO and
requires readiness, cleanup and sweep evidence. Missing evidence fails rather
than skipping. This verifies restore evidence only; capacity/restart acceptance
remain pending. No Playwright command was run on this VM.

### Operator handoff (not executed by the worker)

After Claude2 review and same-candidate integration, in a clean checkout at the
reviewed full SHA, using the operator's GCP IAM and GitHub variables permissions:

```bash
bash infra/gcp/dev/ops-drill/provision-drill-sa.sh
bash infra/gcp/dev/ops-drill/provision-drill-sa.sh --apply
bash infra/gcp/dev/ops-drill/provision-drill-sa.sh --check-ready
```

Read the displayed plan, then type the exact candidate-bearing phrase at each
prompt. A noninteractive pipe or GitHub Actions runner is refused. No `--yes`
bypass exists. If the audit reports an unexpected grant, operator investigates
the original policy; the script does not silently remove it. After the workflow
is reachable from main, Supervisor dispatches with this full candidate SHA and
the original base SHA above. Workers do not dispatch or apply IAM. On an
authorized hosted acceptance runner, with `OPS_DRILL_RUN_ID` and `CANDIDATE_SHA`:

```bash
pnpm exec playwright test -c playwright.system-remediation.config.ts sr-live-ops-001
```

### Current finding / validation ledger

| Finding / acceptance                   | Source / change                                                             | Previous → current result                                                                                                                         | Commands / evidence                                                                                | Remaining                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| F6: no operator apply                  | `provision_drill_sa.main/apply/inventory/confirm`                           | `54b56c63 --apply` exits 2 without CLI access → fake-boundary apply makes 11 intended mutations; rerun makes zero; partial failure safely resumes | `.local/sr-live-ops-001/old-apply-reproduction.txt`; unit + Vitest commands below                  | Actual operator apply/readiness not run                                                |
| Accepted destination risk              | Exact clone source; conditioned temporary-role delete; `sweep_drill.sweep`  | Previous unconditional readiness blocker removed after explicit Supervisor decision; non-prefix creation and leftovers now fail sweep             | Unit scenarios cover leftovers, unknown/empty/denied/truncated audit and correlated LRO completion | Real conditioned clone/poll/recovery permissions and audit shape unverified            |
| F1–F5 + credential/cleanup regressions | Existing real `restore_drill.run` preserved                                 | All earlier name/profile/PITR/readback/cleanup/signal/secret cases retained                                                                       | Real shell/Python orchestration, fake external CLI only                                            | No live clone or PG acceptance                                                         |
| `authorized_isolated_ops_target`       | Approved project/profile; dedicated IAM/operator receipt implementation     | Real variables/provider re-read; plan only exits 0                                                                                                | `.local/sr-live-ops-001/iam-plan-current.json`                                                     | Operator provisioning and hosted readiness evidence                                    |
| `backup_restore_readback`              | Runner + GitHub artifact retrieval + shared readback validator              | Offline orchestration/comparison checks pass                                                                                                      | Unit results below                                                                                 | Supervisor hosted drill after main; real artifact                                      |
| `rpo_rto_capacity_baseline`            | Existing observed timings; validator explicitly leaves capacity unevaluated | No fabricated capacity/SLO result                                                                                                                 | Offline tests only                                                                                 | Approved representative workload/SLO; actual measurements                              |
| `scheduled_job_restart_proof`          | Historical read-only Scheduler/revision observations below                  | HTTP 500 remains unresolved; no controlled restart inferred                                                                                       | Existing query/resource/insert IDs below                                                           | Independent assessment and candidate/deployment mapping                                |
| `live_candidate_sha`                   | Full SHA checkout guards; receipt and artifact validator                    | Wrong candidate/provider/stale receipt rejected                                                                                                   | Unit regression; canonical candidate handoff                                                       | Hosted run + deployed API revision/source mapping                                      |
| CI Python coverage registration        | `tools/ci/check_test_coverage.py` reads only `ci.yml`/`ci-integ.yml`        | Previous #2286 Change scope failed; now repaired by the approved single-line registration above                                                   | Previous runs `37086894984` / `37090506760`; before/after checker evidence above                   | New candidate hosted CI and review; scope approval is recorded in canonical task notes |

Previous local checks at implementation anchor `2686475b78060cb0131c87bafaff375fa56c349e`
(the final follow-up changes this evidence document only):

- `python3 -m unittest tests/unit/system-remediation/sr-live-ops-001/test_drill.py -v`:
  **exit 0, 32/32**, 25.888 seconds; `.local/sr-live-ops-001/unit-final.txt`.
  It includes partial-apply retry, inherited/resource-level grants, operator
  confirmation/readiness, audit LRO correlation, real runner cleanup/readback,
  and artifact comparison checks.
- `pnpm exec vitest run tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts`:
  **exit 0** at the preceding 31-test version, Vitest 4.1.4, one wrapper passed
  in 23.14 seconds (`vitest-current.txt`). Final 32-test rerun **exit 1 before
  loading tests** (`vitest-final.txt`): the shared `node_modules/vitest` link into
  `gemini-audit-dependency-gates-20261002` became unavailable again. Final native
  Python results above are independent of that dependency failure.
- `pnpm exec eslint tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts tests/e2e/system-remediation/sr-live-ops-001/restore-artifact.spec.ts --max-warnings=0`:
  initial **exit 0**; final rerun **exit 1 before loading ESLint**, same shared
  dependency tree disappeared. Only formatting changed in the TS spec between
  those runs; no dependency, symlink or lockfile was modified by this task.
- `python3 -m py_compile infra/gcp/dev/ops-drill/*.py`, `bash -n` on both shell
  entrypoints, YAML dispatch-only check and `bash -n` on all **seven** workflow
  run bodies: **exit 0**. Parsing/syntax checks do not execute a hosted workflow.
- `pnpm dlx prettier@3.6.2 --check` for the workflow, this document and both TS
  files: **exit 0**. `git diff --check`: **exit 0**.
- `python3 tools/ci/check_test_coverage.py`: **exit 1**, exclusively the missing
  shared-CI registration described above (`ci-test-coverage.txt`). A canonical
  progress request asks Supervisor to extend scope/dependencies for
  `.github/workflows/ci-integ.yml`; no shared file was edited without that scope.
  Existing PR checks also show this failure; the green aggregation alone does
  not prove CI acceptance.
- Baseline reproduction extracted `54b56c63:infra/gcp/dev/ops-drill/provision_drill_sa.py`
  into `.local/sr-live-ops-001/old-provisioner.py`, ran `--apply` with an empty CLI
  search path and the Python executable explicitly selected: **exit 2** with
  `clone_destination_iam_enforcement_unverified`, no external command possible.
  Evidence: `old-apply-reproduction.txt`. This did not run the new live apply path.
- The default read-only provisioner plan rereads live `DEV_GCP_*` and the provider;
  initial and final **exit 0**, `iam-plan-current.json` / `iam-plan-final.json`.
  The latter records implementation anchor `2686475b7`; script hashes are in
  `.local/sr-live-ops-001/source-hashes-final.txt`. No worker has run live `--apply`,
  live `--check-ready`, dispatch, database/proxy runtime, load or Playwright/E2E.

All tests above fake external CLI boundaries; none substitute for real IAM, PG,
restore, capacity or scheduler acceptance. Prior evidence sections are retained
for traceability and are explicitly historical where superseded.

## Historical IAM-blocked checkpoint (54b56c63; superseded by decision above)

[Google's permission table](https://docs.cloud.google.com/sql/docs/postgres/iam-permissions)
documents `cloudsql.instances.clone` for `instances.clone`, without requiring
`cloudsql.instances.create`. The [REST contract](https://docs.cloud.google.com/sql/docs/postgres/admin-api/rest/v1/instances/clone)
addresses the source in the URL and places `destinationInstanceName` in the body.
[IAM Conditions](https://docs.cloud.google.com/sql/docs/postgres/iam-conditions)
supports instance name conditions, but does not document checking the clone destination
against that condition. A source-only clone grant plus a prefix-scoped delete grant
does **not establish** prefix-restricted clone creation. Do not add a broad admin role,
or claim a shell name check supplies an IAM guarantee. Provisioning must fail closed
until Supervisor resolves this boundary with documented enforcement or a reviewed
mediated execution design. No IAM mutation has been attempted.

## Required acceptance ledger (checkpoint)

| Key                            | Evidence now                                                                      | Remaining / responsible party                                                               |
| ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| authorized_isolated_ops_target | User cost approval in canonical integration_notes; real target verified read-only | IAM destination boundary: Supervisor; provisioning: operator                                |
| backup_restore_readback        | Real runner implemented; offline regressions only                                 | Hosted PITR clone and readback: Supervisor after IAM and merge                              |
| rpo_rto_capacity_baseline      | Source tier observed only                                                         | Measured RTO/RPO; separately approved representative capacity/SLO workload still required   |
| scheduled_job_restart_proof    | New Scheduler/request logs across revisions, including failures                   | Independent assessment, unresolved HTTP 500, candidate binding; no controlled restart proof |
| live_candidate_sha             | Base recorded above                                                               | Immutable runner candidate, hosted run, deployed API revision/image mapping                 |

Unit fakes test orchestration and rejection/cleanup paths only, never stand in
for Cloud SQL, PG behavior, capacity or live acceptance.

## Implementation and remaining boundary

`run-restore-drill.sh` executes `restore_drill.py`: hosted/main/immutable-SHA guards,
current-variable and approved source-profile checks, recovery-window selection,
real asynchronous PITR clone, operation polling, RUNNABLE/readable checks,
source/clone readback, RTO/RPO observations, sanitized evidence and cleanup.
The workflow is dispatch-only. Its readiness step currently refuses execution
before authentication or cost; this checkpoint must not be dispatched as ready.

`readback.sql` uses a bounded read-only transaction on four authoritative tables:

| Table                                     | Migration                       | Production caller                                       |
| ----------------------------------------- | ------------------------------- | ------------------------------------------------------- |
| `ops.phase1_owned_orders`                 | V0011 runtime snapshots         | `owned-mobility/owned-mobility.repository.ts`           |
| `core.phase1_tenant_passengers`           | V0013 source-of-truth snapshots | `tenant-partner/tenant-partner.repository.ts`           |
| `reg.phase1_registry_contracts`           | V0013                           | `regulatory-registry/regulatory-registry.repository.ts` |
| `ops.phase1_notification_mail_deliveries` | V0103 notification mail outbox  | `notification-delivery/postgres-mail-outbox.ts`         |

Migration paths are under `infra/migrations/`; callers under `apps/api/src/modules/`.
No parallel schema or business write is introduced. Source is observed before
and after cloning; its count/latest write at-or-before the PITR cutoff is compared
to the clone. Concurrent source changes can make this conservative comparison
fail. It does not reconstruct old source row versions or prove row-content integrity.
All-empty observations, missing tables/timestamps, mismatches and writes after the
point fail closed. A quiet, nonempty source window may be needed; the worker does
not pause source writes. RPO is the observed point-to-last-present-write interval,
including idle time, **not a proven data-loss bound**. Database bytes and one query
duration are observations, not representative capacity/SLO acceptance.

The existing `drts-dev-db-url` secret stays in private memory and mode-0600 pgpass;
it is never put in argv, printed (even as a mask directive), or uploaded. Child
stderr is withheld because it can contain credentials. `psql -X` uses the source
and clone Auth Proxy connections only on the hosted runner. The proxy binary is
version/SHA256 pinned to [Google's v2.18.2 release](https://github.com/GoogleCloudPlatform/cloud-sql-proxy/releases/tag/v2.18.2).

Cleanup intent is persisted before clone. `finally` handles exceptions and
SIGTERM/SIGINT, including an uncertain clone API result. Delete must be accepted
and absence confirmed. The workflow `always()` step retries uncertain cleanup
only for matching run/candidate/target evidence. A lost runner, SIGKILL or lost
credentials still requires operator inspection/deletion of the **exact** target;
the task does not claim those events can guarantee automatic cleanup.

**Provisioning is incomplete.** `provision-drill-sa.sh` produces a read-only plan
after re-reading the live project and provider issuer/mapping/condition.
`--apply` and `--check-ready` exit **2 before any mutation**. The plan separates
source clone, source/clone connect, prefix-only delete, one-secret access and
SA-level WIF. General create/update/restore/restart/admin permissions are omitted.
It does not pretend an idempotent provisioner is finished. Recovery-window and
operation-polling permission behavior also needs verification under the final SA.
The task's `internal-key-exceptions.md §11.1` reference is stale at this base;
the equivalent provider-trust check is in **§14.1**. The provider is repository-wide,
not workflow-specific. Supervisor must resolve destination enforcement with
documented Cloud SQL behavior or a reviewed mediated execution design and any
required scope expansion, before the operator application path can be completed.

## Finding and validation ledger

Rejected source: `e7e7d4ba7b038f2b075e51e48b6c39b873771a0e`.
Preservation checkpoints: `c11d64a6f` (boundary/ledger), `bf0f4b5dd`
(runner/workflow/tests). No review candidate is locked while provisioning is
incomplete. The final pushed checkpoint is recorded by the canonical status
command; it is not a live candidate or CI/merge/acceptance completion.

| Finding / trigger                       | Implementation / authority                                         | Old → new result                                                                                                             | Command / evidence                                                                                                                                                                                       | Remaining                                            |
| --------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| F1: placeholder prints success          | `restore_drill.run`, real gcloud/psql calls                        | Rejected script exits 0 with only `AUTHORIZED_ISOLATED_OPS_TARGET=1`; new missing-operation/readback paths fail and clean up | Old extracted using `git show <rejected-SHA>:infra/gcp/dev/ops-drill/run-restore-drill.sh`, run with bash: exit 0; `.local/sr-live-ops-001/rejected-runner-output.txt`. New 21-test Python suite: exit 0 | No live restore                                      |
| F2/F3: wrong source / overwrite         | `context`, `validate_target`, `run`, `cleanup`                     | Only `drts-dev-db` → new run-specific clone; source/preexisting/foreign targets never deleted; no backups-restore command    | Name, preexisting-target, uncertain clone failure, signal and cleanup-denial cases pass                                                                                                                  | IAM destination boundary unresolved                  |
| F4: wrong variables/identity            | Workflow `DEV_GCP_*`, `secrets.DEV_WIF_PROVIDER`, dedicated SA     | Variables verified live; read-only provider plan passes                                                                      | `bash infra/gcp/dev/ops-drill/provision-drill-sa.sh --output .local/sr-live-ops-001/iam-plan.json`: exit 0, plan only                                                                                    | SA/roles not provisioned                             |
| F5: unapproved recurring cost           | Workflow triggers, main/SHA checks                                 | Dispatch-only, no schedule                                                                                                   | YAML parsed; every workflow run body passed `bash -n`, exit 0                                                                                                                                            | No dispatch                                          |
| F6: missing least-privilege provisioner | `provision_drill_sa.plan/main`, Google permission references above | Read-only plan only; apply deliberately exits 2 before IAM writes                                                            | Provider-trust rejection and no-write tests pass; actual `--apply`: exit 2                                                                                                                               | **Unresolved**; operator application path incomplete |
| Credential-bearing CLI errors           | `command`, `Readback`, allowlisted evidence                        | Fake CLI emits password/URL; actual shell entrypoint exits 1 and does not expose either                                      | Shell stdout/stderr, argv and evidence regression in 21-test suite                                                                                                                                       | No real secret read by worker                        |

Checks completed on 2026-10-03:

- `python3 tests/unit/system-remediation/sr-live-ops-001/test_drill.py -v`: exit 0,
  **21/21**, `.local/sr-live-ops-001/unit-results.txt`.
- `python3 -m py_compile infra/gcp/dev/ops-drill/restore_drill.py infra/gcp/dev/ops-drill/provision_drill_sa.py`:
  exit 0. `bash -n` for both entrypoints and extracted workflow run bodies: exit 0.
- `pnpm exec vitest run tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts`:
  initial exit 0 (wrapper ran the then-19-test suite). Later rerun exited 1 **before
  loading tests**: shared `node_modules/vitest` points into another worker's unavailable
  dependency tree. The latest 21-test Python pass is independent of this issue;
  do not label the final Vitest rerun passed.
- `pnpm exec eslint tests/unit/system-remediation/sr-live-ops-001/restore-drill.test.ts --max-warnings=0`:
  exit 0. Initial Prettier check failed on this document; formatting corrected using
  `pnpm dlx prettier@3.6.2 --write` (tool cache only, no dependency/lockfile change).
- Final `pnpm dlx prettier@3.6.2 --check` on the workflow, this document and the
  Vitest wrapper: exit 0. `git diff --check`: exit 0.
- Playwright/E2E, PG runtime, capacity workload, cloud mutation and hosted acceptance
  were **not run**. Hosted artifact/E2E acceptance remains to be completed after IAM resolution.

Latest runner SHA256: `2b04a06cf1e8bd2d2fb908c138850649fa1cd7f2b6f1aceadc60faee38a76f7d`.
Provisioning-plan SHA256: `f45396fe7887e8de616d10d79b1a5d19bf191eb22c52523c0bc53034204eea8f`.

## Read-only Scheduler / revision observations

Retrieved on 2026-10-03 in this isolated worker's `.local/sr-live-ops-001/`:

- `scheduler-attempts.json`: 1,793 AttemptFinished records, observed range
  `2026-10-02T00:37:09Z`–`2026-10-03T01:31:07Z`. Mail: 1,407 HTTP 201,
  86 HTTP 401, **one HTTP 500**. Reminder: 282 HTTP 201, 17 HTTP 401.
  SHA256 `9e4558ac4a4f23062a0c2754c4846c2a8917f59fd26f7688e39938ff0fa7f38b`.
- `run-requests.json`: 1,796 POST records over a slightly different query interval,
  `2026-10-02T00:36:00Z`–`2026-10-03T01:34:00Z`. Revisions `00038-dlc`,
  `00039-jgs`, `00040-k7z`, `00041-lgc`, `00042-trm`, `00043-cq8` have respectively
  244, 264, 326, 177, 16, 647 HTTP 201s. Earlier `00036-hd4`/`00037-qx9` contain
  401s. This supports observed request continuity across revisions, not a controlled
  crash/multi-instance test. SHA256 `3f92013eea01e0083cb3fdc465e8bc2f8d2e1ff4308ca4e0a43b5fa8921040aa`.
- Retrievable success examples: `drts-dev-api-00038-dlc`, mail insertId
  `6abf149400093f2ef1aaeafe`, `2026-10-02T02:19:00.239235Z`;
  `drts-dev-api-00043-cq8`, mail `6abfdd35000232ef8d9a492b`,
  `2026-10-02T16:35:00.928917Z`; reminder `6abfdd36000b554fb9b88230`,
  `2026-10-02T16:35:02.703881Z`.
- `scheduler-failure.json`: mail insertId `1un2xt6e5p9vr`,
  `2026-10-02T18:36:03.446154129Z`, HTTP 500 / INTERNAL,
  `URL_UNREACHABLE-UNREACHABLE_5xx`. Cloud Run HTTP-500 lookup for
  18:35:50–18:36:15 returned `[]` (`run-failure.json`). Cause is **unresolved**,
  not attributed to application code or declared repaired. A blanket 100%-success
  claim does not hold for this window.
- `api-revision.json`: `drts-dev-api-00043-cq8`, image digest
  `us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts/api@sha256:a41fb04b1911a4e84f52a31c47a672398ef4b790a0a48f4f991ea695fcb5cb25`.
  Labels do not provide the deployed source SHA; the worker SHA is not a substitute.

Exact queries (all exit 0; no jobs triggered or restarted):

```bash
gcloud logging read 'resource.type="cloud_scheduler_job" resource.labels.location="us-central1" (resource.labels.job_id="drts-dev-mail-outbox-drain" OR resource.labels.job_id="drts-dev-approval-timeout-reminders-run") jsonPayload."@type"="type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished"' --project=drts-dev-devcc-20260825 --freshness=24h --limit=2500 --order=asc --format='json(timestamp,insertId,resource.labels,jsonPayload.status,httpRequest.status)'
gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="drts-dev-api" resource.labels.location="us-central1" httpRequest.requestMethod="POST" (httpRequest.requestUrl:"/internal/scheduled-tasks/mail-outbox/drain" OR httpRequest.requestUrl:"/internal/scheduled-tasks/approval-timeout-reminders/run")' --project=drts-dev-devcc-20260825 --freshness=24h --limit=2500 --order=asc --format='json(timestamp,insertId,resource.labels,httpRequest.status,httpRequest.requestUrl)'
gcloud logging read 'insertId="1un2xt6e5p9vr" resource.type="cloud_scheduler_job"' --project=drts-dev-devcc-20260825 --limit=2 --format='json(timestamp,insertId,jsonPayload.debugInfo,jsonPayload.status,httpRequest.status)'
gcloud logging read 'resource.type="cloud_run_revision" resource.labels.service_name="drts-dev-api" timestamp>="2026-10-02T18:35:50Z" timestamp<="2026-10-02T18:36:15Z" httpRequest.status=500' --project=drts-dev-devcc-20260825 --limit=20 --format='json(timestamp,insertId,trace,resource.labels,httpRequest.status,httpRequest.requestUrl)'
gcloud run revisions describe drts-dev-api-00043-cq8 --project=drts-dev-devcc-20260825 --region=us-central1 --format='json(metadata.name,metadata.labels,status.imageDigest)'
```
