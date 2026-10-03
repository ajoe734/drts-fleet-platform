# SR-LIVE-OPS-001 — restore drill evidence

Owner: Codex. Reviewer: Claude2. Base: `cccd9b1118e2008adccabc117fef94bcebdccfe0`
(origin/dev fetched 2026-10-03). This is an implementation checkpoint, not live acceptance.

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

## IAM boundary under investigation

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
