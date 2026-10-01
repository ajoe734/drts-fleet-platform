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
the Cloud Scheduler service agent `roles/iam.serviceAccountOpenIdTokenCreator`
on that one service account (not a project role, and not the broader
`roles/iam.serviceAccountTokenCreator` — the OIDC-only role grants exactly
`iam.serviceAccounts.getOpenIdToken` and nothing else, since these jobs only
ever need an OIDC token minted, never `getAccessToken`/`signBlob`/`signJwt`/
delegation), and creates or updates the two HTTP jobs
(`drts-dev-mail-outbox-drain` every minute,
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
  --format='value(lastAttemptTime,state,status.code)'
```

`lastAttemptTime` and `state` are top-level fields on the `Job` resource,
not nested under `status` (`status` is a `google.rpc.Status` and only its
`code` field is meaningful here) — nesting either of the first two fields
under `status.` in the `--format=value(...)` flag silently prints nothing
and is not a usable check. Read the three fields together: a fresh
`lastAttemptTime` (matching when you just ran the command
above) plus `state=ENABLED` plus `status.code` absent or `0`
(`google.rpc.Code.OK`) means Cloud Scheduler's own delivery attempt
succeeded. `state=ENABLED` by itself is not success — it is only the job's
enable/disable toggle and says nothing about whether the last attempt
worked; a nonzero `status.code` means Cloud Scheduler recorded the HTTP call
itself as failed (non-2xx, timeout, etc.) and nothing downstream ran.

A Scheduler-reported success is still not proof the request was
authenticated and authorized as the scheduler identity: cross-check the
application's own logs for the specific principal and route. `apps/api`
uses Nest's default logger
(`this.logger.log(...)`/`this.logger.warn(...)` in
`apps/api/src/modules/auth/google-workload-identity.adapter.ts`), which
writes plain strings — Cloud Run ingests these as `textPayload`, not a
structured `jsonPayload`, so filtering on a `jsonPayload` field matches
nothing even when the line is present:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision"
   resource.labels.service_name="drts-dev-api"
   textPayload=~"AUTH_GOOGLE_WORKLOAD_IDENTITY_USED.*principalId=dev-scheduler.*internal/scheduled-tasks/mail-outbox/drain"' \
  --project=drts-dev-devcc-20260825 --limit=5 --format='value(timestamp,textPayload)'
```

Repeat all three commands for `drts-dev-approval-timeout-reminders-run`
(substitute its own route in the `textPayload` filter). Only a line matching
both the expected `lastAttemptTime`/run and the specific route confirms that
*this* attempt reached the handler as the scheduler principal — an older,
unrelated success log for the same principal is not evidence the current
attempt worked.

Troubleshooting a failed or unconfirmed run: `BootstrapAuthGuard.tryGoogleWorkloadIdentityFallback`
(`apps/api/src/common/auth/bootstrap-auth.guard.ts:664-698`) wraps the
adapter call in a bare `catch { return null; }` and falls through to the
route's ordinary `JWT_INVALID` (401) rejection, so a failing scheduler
request will **not** surface a specific `WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED`,
`WORKLOAD_PRINCIPAL_NOT_REGISTERED`, or `WORKLOAD_AUDIENCE_MISMATCH` code in
either the HTTP response or the Cloud Run logs — the adapter throws those
without logging anything first. The one exception is route-scope denial:
`verifyServicePrincipal` logs
`[AUTH_GOOGLE_WORKLOAD_IDENTITY_ROUTE_SCOPE_DENIED] principalId=... route=...`
(`this.logger.warn`, same file, before the throw) even though the guard
still discards the exception and returns `JWT_INVALID` to the caller. So:

- If the `textPayload` search above instead finds
  `AUTH_GOOGLE_WORKLOAD_IDENTITY_ROUTE_SCOPE_DENIED` for
  `principalId=dev-scheduler`, the registry is live and the principal
  resolves, but its `routeScopes` entry does not cover the route/method the
  job is calling — re-check the pasted JSON for a typo in the route path or
  method (step 2).
- If neither the success line nor the route-scope-denied line appears at
  all, the failure is one of the three silent causes, roughly in order of
  likelihood: (a) step 2's secret was never actually redeployed/mounted
  (the Cloud Run revision still has the old or empty registry), (b) a typo
  in `serviceAccountEmail`/`principalId` means no registry entry matches
  this service account, or (c) `allowedTokenAudiences` does not match the
  job's audience. Confirm by re-reading the live secret value and the
  deployed revision's environment directly — none of those three are fixed
  by re-running the provisioning script (step 3), since it never touches
  the registry secret.

Once both jobs' manual runs show a clean, route-specific
`AUTH_GOOGLE_WORKLOAD_IDENTITY_USED` log line and `status.code` 0/empty,
leave the jobs on their configured schedule; no further manual trigger is
needed.
