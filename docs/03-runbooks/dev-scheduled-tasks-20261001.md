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
and a job firing before _both_ 2 and 3 are done will fail closed
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

After both step 2's redeploy and step 3 are done.

**`jobs run` only dispatches — it is not proof of completion.** A tempting
shortcut is:

```bash
gcloud scheduler jobs run drts-dev-mail-outbox-drain \
  --location=us-central1 --project=drts-dev-devcc-20260825
gcloud scheduler jobs describe drts-dev-mail-outbox-drain \
  --location=us-central1 --project=drts-dev-devcc-20260825 \
  --format='value(lastAttemptTime,state,status.code)'
```

(`lastAttemptTime` and `state` are top-level fields on the `Job` resource,
not nested under `status` — `status` is a `google.rpc.Status` and only its
`code` field is meaningful here; nesting the first two under `status.` in
`--format=value(...)` silently prints nothing.) **Do not stop here.**
`jobs run` returns as soon as Cloud Scheduler has dispatched the HTTP call,
before the target responds, and `lastAttemptTime` is bumped the instant the
attempt _starts_, not when it finishes
(https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs).
Immediately after `jobs run`, `state=ENABLED` plus `status.code` absent or
`0` is consistent with the attempt having already failed-closed, still being
in flight, _or_ having genuinely succeeded — the three are indistinguishable
from this describe output alone. Treat the two commands above only as "the
attempt started"; they are not a completed-success check.

**Use the completion-check script instead** —
`infra/gcp/dev/scheduler/confirm-job-attempt.sh` fires the job and then
polls (bounded by a timeout) for Cloud Scheduler's own per-attempt
completion record: the `AttemptFinished` log entry Google's troubleshooting
guide describes (https://docs.cloud.google.com/scheduler/docs/troubleshooting),
which pairs each `AttemptStarted` with a later `AttemptFinished` carrying
the real outcome in a scalar `jsonPayload.status` field (a `google.rpc.Code`
name string such as `"OK"` or `"NOT_FOUND"` — not the nested
`{code, message}` object the unrelated `Job.status` REST field uses). The
lookup is bounded to timestamps at or after the moment the script fires the
job and scoped to this job's exact `job_id`/`location`, so a stale (older),
wrong-job, or wrong-region log entry cannot be mistaken for this attempt's
result. The script also looks for a Cloud Run HTTP `POST` request-log entry
for the same route and prints it if found, but **only as a non-decisive
diagnostic** — unlike the AttemptFinished record, a Cloud Run log entry
cannot be reliably attributed to this specific Scheduler attempt (nothing in
Cloud Logging's structured `httpRequest` fields correlates it to a job
attempt, and an unrelated request such as a CORS preflight can hit the same
route), so it never changes the exit code:

```bash
infra/gcp/dev/scheduler/confirm-job-attempt.sh \
  drts-dev-mail-outbox-drain internal/scheduled-tasks/mail-outbox/drain
infra/gcp/dev/scheduler/confirm-job-attempt.sh \
  drts-dev-approval-timeout-reminders-run internal/scheduled-tasks/approval-timeout-reminders/run
```

Exit `0` means a matching Scheduler `AttemptFinished` record with
`status="OK"` was found, **or** one whose scalar `status` was empty or
unrecognized but whose own `httpRequest.status` was in the 2xx range — a
successful HTTP-target invocation can omit the scalar field entirely and
report the outcome only via `httpRequest.status`
(https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs#HttpTarget),
and this script checks that field on the _same_ record before giving up, not
the separate (and never decisive) Cloud Run diagnostic described above. Exit
`1` means a matching record with a recognized non-`OK` `google.rpc.Code`
name was found (the script prints it) — a recognized scalar failure always
wins even if `httpRequest.status` on the same record looks like a success,
since Scheduler's own outcome classification is checked first. Exit `2`
means no such record was found within the timeout — either no evidence at
all, or only a record whose `status` field was empty/unrecognized **and**
whose `httpRequest.status` was not a 2xx either, or only the non-decisive
Cloud Run diagnostic. Exit `2` is **not** success, it means completion is
still unproven (keep investigating, or re-run with a longer timeout via the
script's third argument). A timeout/exit-`2` result does not by itself mean
nothing downstream ran either — the handler may still complete after the
poll window closes, which is exactly why this is reported as "unconfirmed,"
not "failed."

A completed-success result is still not proof the request was authenticated
and authorized as the scheduler identity: cross-check the application's own
logs for the specific principal and route. `apps/api` uses Nest's default
logger (`this.logger.log(...)`/`this.logger.warn(...)` in
`apps/api/src/modules/auth/google-workload-identity.adapter.ts`), which
writes plain strings — Cloud Run ingests these as `textPayload`, not a
structured `jsonPayload`, so filtering on a `jsonPayload` field matches
nothing even when the line is present. The adapter logs **both** a success
line (`AUTH_GOOGLE_WORKLOAD_IDENTITY_USED`) and a route-scope-denial line
(`AUTH_GOOGLE_WORKLOAD_IDENTITY_ROUTE_SCOPE_DENIED`) with the same
`principalId=...route=...` shape, so search for either with one query
rather than assuming only the success line is possible:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision"
   resource.labels.service_name="drts-dev-api"
   textPayload=~"AUTH_GOOGLE_WORKLOAD_IDENTITY_(USED|ROUTE_SCOPE_DENIED)\].*principalId=dev-scheduler.*route=POST /api/internal/scheduled-tasks/mail-outbox/drain"' \
  --project=drts-dev-devcc-20260825 --limit=5 --format='value(timestamp,textPayload)'
```

Repeat for `drts-dev-approval-timeout-reminders-run` (substitute its own
route in the `textPayload` filter). Only a line matching both the expected
time window and the specific route confirms that _this_ attempt reached the
handler as the scheduler principal — an older, unrelated log for the same
principal is not evidence the current attempt worked.

Troubleshooting a failed or unconfirmed run: `BootstrapAuthGuard.tryGoogleWorkloadIdentityFallback`
(`apps/api/src/common/auth/bootstrap-auth.guard.ts:688-737`) wraps the
adapter call in a `catch` that logs a rejection reason code before falling
through to the route's ordinary `JWT_INVALID` (401) rejection, so a failing
scheduler request **does** surface a diagnostic line — just not in the HTTP
response, and never with the bearer token itself. Query for it by route
only, since this line is emitted before the adapter resolves a principal and
therefore has no `principalId=` field to filter on:

```bash
gcloud logging read \
  'resource.type="cloud_run_revision"
   resource.labels.service_name="drts-dev-api"
   textPayload=~"AUTH_GOOGLE_WORKLOAD_IDENTITY_FALLBACK_DENIED\].*route=POST /api/internal/scheduled-tasks/mail-outbox/drain"' \
  --project=drts-dev-devcc-20260825 --limit=5 --format='value(timestamp,textPayload)'
```

The logged `reason=` value is the adapter's `ApiRequestError` code (or
`UNKNOWN_ERROR` if the adapter threw something else). So:

- `reason=WORKLOAD_ASSERTION_REPLAYED` — a one-time-use token was reused
  against a route that is not on the replay-tolerant allowlist
  (`REPLAY_TOLERANT_SYSTEM_ROUTE_KEYS` in `bootstrap-auth.guard.ts`). The two
  scheduled-task routes in this runbook are on that allowlist; `POST
/api/auth/token` deliberately is not. If the drain/reminder jobs are
  hitting this, confirm the deployed revision actually matches this fix
  (step 5) and is not an older build still enforcing one-time use on them.
- `reason=WORKLOAD_AUDIENCE_MISMATCH` — the job's OIDC audience does not
  match `allowedTokenAudiences` for this principal's registry entry.
- `reason=WORKLOAD_PRINCIPAL_NOT_REGISTERED` — no registry entry matches
  this service account; check for a typo in `serviceAccountEmail`/
  `principalId` (step 2).
- `reason=WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED` — step 2's secret was
  never actually redeployed/mounted (the Cloud Run revision still has the
  old or empty registry).
- If the query above finds `AUTH_GOOGLE_WORKLOAD_IDENTITY_ROUTE_SCOPE_DENIED`
  instead (from the combined success/scope-denial query earlier), the
  registry is live and the principal resolves, but its `routeScopes` entry
  does not cover the route/method the job is calling — re-check the pasted
  JSON for a typo in the route path or method (step 2).
- If both queries find nothing at all, re-read the live secret value and the
  deployed revision's environment directly — none of the above are fixed by
  re-running the provisioning script (step 3), since it never touches the
  registry secret.

Once `confirm-job-attempt.sh` reports a completed success (exit `0`) for
both jobs and the combined query above shows a matching, route-specific
`AUTH_GOOGLE_WORKLOAD_IDENTITY_USED` line for each, leave the jobs on their
configured schedule; no further manual trigger is needed.

## 5. Opt-in: Driver onboarding dual-channel notification drain (`DRV-ONB-006`)

`DRV-ONB-006` prepares the opt-in Cloud Run deployment gate and scale-to-zero
Cloud Scheduler job definition for first-approval driver onboarding
notifications (6-digit registration code + HTTPS App Link sent via Email and
SMS):

- Scheduled drain endpoint:
  `POST /api/internal/scheduled-tasks/driver-onboarding-notifications/drain`
- System realm only (`allowedRealms: ["system"]`), replay-tolerant across Cloud
  Scheduler's cached OIDC token window
  (`internal:scheduled-tasks:driver-onboarding-notifications:drain` in
  `REPLAY_TOLERANT_SYSTEM_ROUTE_KEYS`).
- Required system scope: `driver:onboarding:notify`
- Exact route scope pattern:
  `"POST internal/scheduled-tasks/driver-onboarding-notifications/drain"`

### 5.1 Fail-closed Cloud Run configuration (`.github/workflows/deploy-dev.yml`)

`DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED` (configured via GitHub variable
`DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED` or
`DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED`) defaults to `false`.

- **When `false` (default)**: existing deployments set
  `DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED=false`, do not mount
  `DRIVER_ONBOARDING_CODE_PEPPER` or `DRIVER_ONBOARDING_DELIVERY_KEY`, and do
  not require `DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS` or
  `DRIVER_ONBOARDING_IOS_APP_ID`.
- **When `true` (opt-in enabled)**: `.github/workflows/deploy-dev.yml` fails
  closed (`exit 1`) unless all of the following security and app-association
  configurations are present and valid (probed via `gcloud secrets describe`
  metadata only — never creating, reading, or printing secret values):
  1. `DRIVER_ONBOARDING_CODE_PEPPER` mounted from Secret Manager secret
     `${DEV_SECRET_PREFIX:-drts-dev}-driver-onboarding-code-pepper:latest`
     (at least 32 bytes; HMAC-SHA256 pepper for 6-digit registration codes and
     contact proofs).
  2. `DRIVER_ONBOARDING_DELIVERY_KEY` mounted from Secret Manager secret
     `${DEV_SECRET_PREFIX:-drts-dev}-driver-onboarding-delivery-key:latest`
     (64 hex characters / 32-byte AES-256-GCM key for encrypted delivery
     snapshots).
  3. Complete existing Remote SMTP secret group (`drts-dev-smtp-host`,
     `drts-dev-smtp-port`, `drts-dev-smtp-username`, `drts-dev-smtp-password`,
     `drts-dev-smtp-from-email`, `drts-dev-smtp-recipient-allowlist`) mounted
     as `REMOTE_SMTP_*` and `NOTIFICATION_FROM_EMAIL`.
  4. Complete existing Twilio SMS secret group
     (`${DEV_SECRET_PREFIX:-drts-dev}-twilio-account-sid`,
     `${DEV_SECRET_PREFIX:-drts-dev}-twilio-api-key-sid`,
     `${DEV_SECRET_PREFIX:-drts-dev}-twilio-api-key-secret`,
     `${DEV_SECRET_PREFIX:-drts-dev}-twilio-from-number`) mounted as
     `TWILIO_ACCOUNT_SID`, `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, and
     `TWILIO_FROM_NUMBER`.
  5. `DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS` (via
     `DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS` or
     `DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS`): comma-separated SHA-256
     signing certificate fingerprints (`AA:BB:...:FF`, 32 colon-separated hex
     byte pairs) published by
     `GET https://api.smarttransport.tw/.well-known/assetlinks.json` for
     Android package `com.cctechsupport.drts.driver`.
  6. `DRIVER_ONBOARDING_IOS_APP_ID` (via `DEV_DRIVER_ONBOARDING_IOS_APP_ID` or
     `DRIVER_ONBOARDING_IOS_APP_ID`):
     `<TEAMID>.com.cctechsupport.drts.driver` (10-character uppercase
     alphanumeric Apple Team ID + bundle identifier) published by
     `GET https://api.smarttransport.tw/.well-known/apple-app-site-association`
     for `/driver-activate`.

The API formats the activation link in both Email and SMS notifications as
`https://api.smarttransport.tw/driver-activate#token=<token>` so the one-time
token remains in the URL fragment (never sent in HTTP GET requests or consumed
by link previews), while `GET https://api.smarttransport.tw/driver-activate`
serves a static `no-store` fallback page.

### 5.2 Least-privilege workload grant (`WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS`)

When enabling driver onboarding notifications in shared dev, extend Entry C
(`drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com`,
`principalId: "dev-scheduler"`) in the Secret Manager secret
`${DEV_SECRET_PREFIX:-drts-dev}-workload-identity-google-service-principals`
with the exact route scope
`"POST internal/scheduled-tasks/driver-onboarding-notifications/drain"`,
least-privilege system scope `"driver:onboarding:notify"`, and the live API
Cloud Run origin audience:

```json
{
  "serviceAccountEmail": "drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com",
  "principalId": "dev-scheduler",
  "allowedTokenAudiences": ["https://drts-dev-api-r6ykdme3wa-uc.a.run.app"],
  "routeScopes": [
    "POST internal/scheduled-tasks/mail-outbox/drain",
    "POST internal/scheduled-tasks/approval-timeout-reminders/run",
    "POST internal/scheduled-tasks/regulatory-expiry/run",
    "POST internal/scheduled-tasks/driver-onboarding-notifications/drain"
  ],
  "scopes": [
    "notification-delivery:drain",
    "tenant-partner:approval-timeout-reminders:run",
    "regulatory:write",
    "driver:onboarding:notify"
  ]
}
```

### 5.3 Authorized shared-dev rollout & opt-in scheduler provisioning

All cloud mutations and provisioning commands must be executed only as part of
an authorized shared-dev release (never from a code-only worker session, and
never against the retired project `nodal-alloy-503700-s3`):

1. Verify live GitHub repository variables (`gh variable get DEV_GCP_PROJECT_ID`
   -> `drts-dev-devcc-20260825`, `gh variable get DEV_GCP_REGION` ->
   `us-central1`), confirm the required Secret Manager entries and updated
   `drts-dev-workload-identity-google-service-principals` secret version exist,
   and set `DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS`,
   `DEV_DRIVER_ONBOARDING_IOS_APP_ID`, and
   `DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED=true`.
2. Deploy the approved immutable `publish/v*`, `release/v*`, or full 40-char
   commit SHA through `.github/workflows/deploy-dev.yml`:

   ```bash
   gh workflow run deploy-dev.yml --repo ajoe734/drts-fleet-platform \
     -f source_ref=<publish/vYYYY.MM.DD.N or full 40-char SHA>
   ```

3. Provision the opt-in Cloud Scheduler HTTP job
   (`drts-dev-driver-onboarding-notifications-drain`, default schedule
   `* * * * *`, OIDC service account
   `drts-dev-scheduler@drts-dev-devcc-20260825.iam.gserviceaccount.com`,
   audience `${API_ORIGIN}`):

   ```bash
   PROJECT_ID=drts-dev-devcc-20260825 REGION=us-central1 \
     DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED=true \
     infra/gcp/dev/scheduler/provision-dev-scheduler.sh
   ```

   When `DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED` is omitted or `false`,
   `provision-dev-scheduler.sh` leaves existing jobs untouched and skips
   creating `drts-dev-driver-onboarding-notifications-drain`.

4. Confirm end-to-end scheduled execution and workload identity authorization
   (for `DRV-ONB-012` live shared-dev acceptance):

   ```bash
   infra/gcp/dev/scheduler/confirm-job-attempt.sh \
     drts-dev-driver-onboarding-notifications-drain \
     internal/scheduled-tasks/driver-onboarding-notifications/drain

   gcloud logging read \
     'resource.type="cloud_run_revision"
      resource.labels.service_name="drts-dev-api"
      textPayload=~"AUTH_GOOGLE_WORKLOAD_IDENTITY_(USED|ROUTE_SCOPE_DENIED)\].*principalId=dev-scheduler.*route=POST /api/internal/scheduled-tasks/driver-onboarding-notifications/drain"' \
     --project=drts-dev-devcc-20260825 --limit=5 --format='value(timestamp,textPayload)'
   ```

### 5.4 Verification & Evidence (`DRV-ONB-006`)

| Finding／驗收項                                                                                                                                                                                                           | 原始碼依據與修改位置                                                                                                                                                  | 舊版重現 → 修正版結果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                                                                                     | 未驗項與具體限制                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED` default `false` & fail-closed Secret Manager mounts (`DRIVER_ONBOARDING_CODE_PEPPER`, `DRIVER_ONBOARDING_DELIVERY_KEY`, `REMOTE_SMTP_*`, `NOTIFICATION_FROM_EMAIL`, `TWILIO_*`) | `.github/workflows/deploy-dev.yml` (`env`, `Resolve dev config`, `Resolve API secret mounts`, `Build API env vars`, `Deploy — api`)                                   | Before (`134df5cc4`): no `DRIVER_ONBOARDING_*` secret resolution, env wiring, or fail-closed enable guard existed in `deploy-dev.yml`. After: defaults `DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED=false`; when `true`, verifies metadata via `gcloud secrets describe` (never reads or prints secret values) and refuses enable (`exit 1`) if any required secret or app-link variable is missing/invalid; deduplicates `TWILIO_*` mounts across `api_secrets` and `passenger_secrets`.                                                                                        | `bash -n infra/gcp/dev/scheduler/provision-dev-scheduler.sh` (exit 0); `timeout 90s pnpm exec prettier --check .github/workflows/deploy-dev.yml docs/03-runbooks/dev-scheduled-tasks-20261001.md` (exit 0); workflow shell & unit regression suite via `vitest` (exit 0).            | Live shared-dev Secret Manager creation, workflow dispatch, and real dual-channel delivery are reserved for authorized shared-dev acceptance (`DRV-ONB-012`) per task guardrails.  |
| Android & iOS App Links association variables (`DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS`, `DRIVER_ONBOARDING_IOS_APP_ID`) for `api.smarttransport.tw`                                                                 | `.github/workflows/deploy-dev.yml` (`Resolve dev config`, `Resolve API secret mounts`, `Build API env vars`); `docs/03-runbooks/dev-scheduled-tasks-20261001.md` §5.1 | Before (`134df5cc4`): `DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS` and `DRIVER_ONBOARDING_IOS_APP_ID` were not wired in `deploy-dev.yml`. After: optional/unrequired when flag is `false`; required and format-validated (`^([A-F0-9]{2}:){31}[A-F0-9]{2}$` CSV and `^[A-Z0-9]{10}\.com\.cctechsupport\.drts\.driver$`) when flag is `true`.                                                                                                                                                                                                                                | `timeout 90s pnpm exec vitest run tests/unit/deploy-dev-password-login.test.ts tests/unit/notification-delivery/deploy-dev-smtp.test.ts tests/unit/dev-pax-review-env-transport-20261016/transport.test.ts tests/unit/pax-web-deploy-20261009/deployment-contract.test.ts` (exit 0). | Live `https://api.smarttransport.tw/.well-known/*` and `/driver-activate` probes require authorized shared-dev deployment (`DRV-ONB-012`).                                         |
| Opt-in Cloud Scheduler OIDC drain job & least-privilege `driver:onboarding:notify` workload grant (`driver_onboarding_cloud_runtime_definition_checks`)                                                                   | `infra/gcp/dev/scheduler/provision-dev-scheduler.sh`; `docs/03-runbooks/dev-scheduled-tasks-20261001.md` §5.2–§5.3                                                    | Before (`134df5cc4`): `provision-dev-scheduler.sh` and the runbook only covered mail-outbox, approval-timeout-reminders, and regulatory-expiry. After: defines opt-in `drts-dev-driver-onboarding-notifications-drain` (`POST /api/internal/scheduled-tasks/driver-onboarding-notifications/drain`, OIDC SA `drts-dev-scheduler@...`, audience `${API_ORIGIN}`), preserves existing jobs when `DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED=false`, refuses suspended `nodal-alloy-503700-s3`, and documents the exact route/scope/audience workload grant and completion probes. | `bash -n infra/gcp/dev/scheduler/provision-dev-scheduler.sh` (exit 0); `timeout 90s pnpm exec vitest run tests/unit/sr-mail-scheduler-provision-20261001.test.ts tests/unit/bureau-r14-expiry-reminders-20261024/scheduler-and-route.test.ts` (exit 0).                              | Live Cloud Scheduler job provisioning and `confirm-job-attempt.sh` execution against `drts-dev-devcc-20260825` are performed during authorized shared-dev rollout (`DRV-ONB-012`). |
