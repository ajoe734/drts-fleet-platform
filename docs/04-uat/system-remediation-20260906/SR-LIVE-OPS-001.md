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

| Key | Evidence now | Remaining / responsible party |
| --- | --- | --- |
| authorized_isolated_ops_target | User cost approval in canonical integration_notes; real target verified read-only | IAM destination boundary: Supervisor; provisioning: operator |
| backup_restore_readback | None yet; runner implementation in progress | Hosted PITR clone and readback: Supervisor after IAM and merge |
| rpo_rto_capacity_baseline | Source tier observed only | Measured RTO/RPO; separately approved representative capacity/SLO workload still required |
| scheduled_job_restart_proof | Supervisor's earlier log observations are historical | Retrieve bounded Scheduler/Cloud Run logs across revisions; no restart command |
| live_candidate_sha | Base recorded above | Immutable runner candidate, hosted run, deployed API revision/image mapping |

Unit fakes will test orchestration and rejection/cleanup paths only, never stand in
for Cloud SQL, PG behavior, capacity or live acceptance.
