# Runbook: dev Cloud Scheduler for mail retry & approval-timeout reminders

**Task**: `SR-MAIL-SCHEDULER-PROVISION-20261001`
**Audience**: the human operator with `gcloud`/GCP console access to
`drts-dev-devcc-20260825`. Nothing in this runbook is performed by a worker
session — this task's guardrails forbid running scripts, creating GCP
resources, modifying secrets or GitHub variables, and triggering deploys.

## Why this exists

`SR-MAIL-RETRY-SCHEDULE-20261001` added two HTTP routes so the retryable
mail outbox and the approval-timeout reminder sweep can run while
`apps/api`'s Cloud Run service is scaled to zero:

- `POST /api/internal/scheduled-tasks/mail-outbox/drain`
- `POST /api/internal/scheduled-tasks/approval-timeout-reminders/run`

Nothing in `dev` calls them yet: the Cloud Scheduler API is not enabled on
`drts-dev-devcc-20260825`, there is no scheduler service account, and the
`WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` registry (the only auth path
these `system`-realm-only routes accept) does not list one. Both facts were
independently re-verified via read-only `gcloud` on 2026-10-01; see
`docs/02-architecture/internal-key-exceptions.md` §8.1.

## Operator sequence

Do these in order. Steps 2 and 3 are deliberately separate: the script in
step 3 creates the service account the registry entry in step 2 names, but
does not itself read or write the registry secret, and the registry entry
in step 2 names a service account that does not exist until step 3 creates
it. Either order of 2/3 leaves a short window where one side references the
other before it exists; that window is harmless (a nonexistent principal
just can't verify yet, same as any not-yet-onboarded caller — see
§7.9's unregistered-caller fallback), but step 1 must come before either,
and a job firing before *both* 2 and 3 are done will fail closed
(`WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED` or `WORKLOAD_PRINCIPAL_NOT_REGISTERED`),
not open a security hole.

### 1. Confirm the two prerequisite fixes are on the deployed candidate

Both are already merged to `dev`:

- `SR-MAIL-RETRY-SCHEDULE-20261001` (PR #2261) — adds the two routes and
  their policy entries.
- `SEC-INTERNAL-KEY-WIF-PROXY-REPLAY-20261001` (PR #2262) — fixes the
  general-proxy false-replay rejection, the CI `actorType` mismatch, and
  the unregistered-caller blast-radius bug in `GoogleWorkloadIdentityAdapter`.
  None of the three defects it fixed are specific to the scheduler routes,
  but the fixed file (`google-workload-identity.adapter.ts`) is the same
  code path these routes authenticate through, so deploy it first anyway.

Trigger (or confirm a already-triggered) `Deploy — Dev` against a ref that
includes both merge commits:

```bash
gh workflow run deploy-dev.yml --repo ajoe734/drts-fleet-platform \
  -f source_ref=<publish/vYYYY.MM.DD.N or full SHA including both merges>
```

Wait for the run to finish green before continuing. If it is not green,
stop here — do not populate the registry secret in step 2 against a
candidate that has not deployed cleanly.

### 2. Update the `WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS` registry secret

Paste the full three-entry JSON from
`docs/02-architecture/internal-key-exceptions.md` §8.2 as the value of the
Secret Manager secret `${DEV_SECRET_PREFIX:-drts-dev}-workload-identity-google-service-principals`
in `drts-dev-devcc-20260825`:

```bash
gcloud secrets versions add drts-dev-workload-identity-google-service-principals \
  --project=drts-dev-devcc-20260825 \
  --data-file=<(cat <<'JSON'
[ ... the §8.2 three-entry array, compacted or not ... ]
JSON
)
```

(If the secret does not exist yet, use `gcloud secrets create ... --replication-policy=automatic --data-file=-` instead, matching the `put_secret` pattern in `infra/gcp/dev/provision-dev-project.sh`.)

A new secret version does not take effect until the API's Cloud Run
revision is redeployed or restarted with that version mounted (the deploy
workflow mounts `:latest` at deploy time, per
`.github/workflows/deploy-dev.yml` §7.5's wiring) — plan for a redeploy
after this step, before step 4's verification.

### 3. Run the scheduler provisioning script

```bash
PROJECT_ID=drts-dev-devcc-20260825 REGION=us-central1 \
  infra/gcp/dev/scheduler/provision-dev-scheduler.sh
```

This enables `cloudscheduler.googleapis.com`, creates
`drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com`, grants
the Cloud Scheduler service agent `roles/iam.serviceAccountTokenCreator` on
that one service account (not a project role), and creates or updates the
two HTTP jobs (`drts-dev-mail-outbox-drain` every minute,
`drts-dev-approval-timeout-reminders-run` every 5 minutes — rationale in
`docs/02-architecture/internal-key-exceptions.md` §8.3). It is safe to
rerun; it does not touch the registry secret from step 2.

### 4. Confirm a scheduled trigger actually succeeds end to end

After both step 2's redeploy and step 3 are done:

```bash
gcloud scheduler jobs run drts-dev-mail-outbox-drain \
  --location=us-central1 --project=drts-dev-devcc-20260825
gcloud scheduler jobs describe drts-dev-mail-outbox-drain \
  --location=us-central1 --project=drts-dev-devcc-20260825 \
  --format='value(status.lastAttemptTime,status.state)'
```

A successful manual run shows a recent `lastAttemptTime` and no error
state. Cross-check against the application's own logs, since a Cloud
Scheduler job can report success at the HTTP layer while the request still
failed authorization inside the app:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision"
   resource.labels.service_name="drts-dev-api"
   jsonPayload.message=~"AUTH_GOOGLE_WORKLOAD_IDENTITY_USED.*principalId=dev-scheduler"' \
  --project=drts-dev-devcc-20260825 --limit=5 --format='value(timestamp,jsonPayload.message)'
```

Repeat both commands for `drts-dev-approval-timeout-reminders-run`. If
either job's manual run instead surfaces `WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED`,
`WORKLOAD_PRINCIPAL_NOT_REGISTERED`, or `WORKLOAD_ROUTE_SCOPE_DENIED` in the
Cloud Run logs, re-check step 2 (secret not yet redeployed, or JSON pasted
with a typo in `serviceAccountEmail`/`routeScopes`) before re-running step 3
or 4 — none of those three errors are fixed by re-running the provisioning
script.

Once both manual runs show a clean `AUTH_GOOGLE_WORKLOAD_IDENTITY_USED` log
line and a 2xx response, leave the jobs on their configured schedule; no
further manual trigger is needed.
