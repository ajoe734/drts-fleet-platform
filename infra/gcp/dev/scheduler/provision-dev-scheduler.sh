#!/usr/bin/env bash
# Provision Cloud Scheduler for the two scale-to-zero-safe internal trigger
# routes added by SR-MAIL-RETRY-SCHEDULE-20261001:
#   POST /api/internal/scheduled-tasks/mail-outbox/drain
#   POST /api/internal/scheduled-tasks/approval-timeout-reminders/run
#
# This is step 3 of the operator sequence in
# docs/03-runbooks/dev-scheduled-tasks-20261001.md: deploy the two
# prerequisite fixes first (SR-MAIL-RETRY-SCHEDULE-20261001,
# SEC-INTERNAL-KEY-WIF-PROXY-REPLAY-20261001), then update the
# WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS registry secret with the
# three-entry JSON in docs/02-architecture/internal-key-exceptions.md §8.2
# (which includes the service account this script creates), then run this
# script. See that runbook for why the order matters and how to confirm the
# jobs actually fire successfully afterward.
#
# What it does NOT do, on purpose:
#   - it does not touch WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS or any
#     other Secret Manager secret. Populating that registry is a separate
#     operator step (the runbook above), kept separate so this script never
#     needs permission to read or write secret material.
#   - it does not grant any project-level IAM role. The only IAM binding
#     below is scoped to the one service account this script creates.
#   - it does not add a Cloud Run IAM invoker binding: drts-dev-api already
#     grants roles/run.invoker to allUsers (verified against the live
#     project; see docs/02-architecture/internal-key-exceptions.md
#     integration notes), so authentication happens only inside the app via
#     the OIDC token the jobs below mint, exactly like every other caller in
#     that document's registry.
#   - it does not deploy application code or modify GitHub configuration.
#
# Idempotent: every step checks for the resource before creating it, and the
# two jobs are created-or-updated so reruns pick up a changed schedule or URL
# without manual cleanup.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-drts-dev-devcc-20260825}"
REGION="${REGION:-us-central1}"

SCHEDULER_SA_ID="${SCHEDULER_SA_ID:-drts-dev-scheduler}"
SCHEDULER_SA="${SCHEDULER_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

API_ORIGIN="${API_ORIGIN:-https://drts-dev-api-r6ykdme3wa-uc.a.run.app}"
TIME_ZONE="${TIME_ZONE:-Etc/UTC}"

MAIL_OUTBOX_JOB="${MAIL_OUTBOX_JOB:-drts-dev-mail-outbox-drain}"
MAIL_OUTBOX_SCHEDULE="${MAIL_OUTBOX_SCHEDULE:-* * * * *}"
MAIL_OUTBOX_URI="${API_ORIGIN}/api/internal/scheduled-tasks/mail-outbox/drain"

APPROVAL_REMINDER_JOB="${APPROVAL_REMINDER_JOB:-drts-dev-approval-timeout-reminders-run}"
APPROVAL_REMINDER_SCHEDULE="${APPROVAL_REMINDER_SCHEDULE:-*/5 * * * *}"
APPROVAL_REMINDER_URI="${API_ORIGIN}/api/internal/scheduled-tasks/approval-timeout-reminders/run"

say() { printf '\n=== %s\n' "$*"; }
gc() { gcloud --project "$PROJECT_ID" "$@"; }

# ---------------------------------------------------------------- preflight
say "Preflight"
gcloud projects describe "$PROJECT_ID" --format='value(projectId,lifecycleState)'
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

# ---------------------------------------------------------------- API
say "Enabling Cloud Scheduler API"
gc services enable cloudscheduler.googleapis.com

# Cloud Scheduler's per-project service agent is what actually mints the
# OIDC token at job-execution time; it must exist before it can be granted
# serviceAccountOpenIdTokenCreator below. Enabling the API alone does not
# always provision it in every project, so this call is explicit. Idempotent:
# it returns the existing identity if one is already provisioned.
say "Ensuring the Cloud Scheduler service agent exists"
gc beta services identity create --service=cloudscheduler.googleapis.com >/dev/null
SCHEDULER_SERVICE_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"

# ---------------------------------------------------------------- identity
say "Scheduler service account ${SCHEDULER_SA}"
if ! gc iam service-accounts describe "$SCHEDULER_SA" >/dev/null 2>&1; then
  gc iam service-accounts create "$SCHEDULER_SA_ID" \
    --display-name="DRTS dev Cloud Scheduler trigger identity"
else
  echo "already exists"
fi

# Resource-scoped grant on this one service account only -- not a project
# IAM role -- so Cloud Scheduler can mint an OIDC token asserting this SA's
# identity when a job fires. This uses the OIDC-only role below (grants
# only iam.serviceAccounts.getOpenIdToken) rather than the broader "token
# creator" role, which also carries getAccessToken, signBlob, signJwt, and
# implicitDelegation that these OIDC-only jobs never use -- see
# https://docs.cloud.google.com/iam/docs/service-account-permissions#service_account_roles.
# Without this, job creation/execution fails with a permission-denied error
# naming this exact binding.
say "Granting the Cloud Scheduler service agent permission to mint OIDC tokens as ${SCHEDULER_SA_ID}"
gc iam service-accounts add-iam-policy-binding "$SCHEDULER_SA" \
  --member="serviceAccount:${SCHEDULER_SERVICE_AGENT}" \
  --role="roles/iam.serviceAccountOpenIdTokenCreator" --quiet >/dev/null

# ---------------------------------------------------------------- jobs
create_or_update_job() { # create_or_update_job <name> <schedule> <uri>
  local name="$1" schedule="$2" uri="$3"
  if gc scheduler jobs describe "$name" --location="$REGION" >/dev/null 2>&1; then
    gc scheduler jobs update http "$name" \
      --location="$REGION" \
      --schedule="$schedule" \
      --time-zone="$TIME_ZONE" \
      --uri="$uri" \
      --http-method=POST \
      --oidc-service-account-email="$SCHEDULER_SA" \
      --oidc-token-audience="$API_ORIGIN" >/dev/null
    echo "updated  ${name}"
  else
    gc scheduler jobs create http "$name" \
      --location="$REGION" \
      --schedule="$schedule" \
      --time-zone="$TIME_ZONE" \
      --uri="$uri" \
      --http-method=POST \
      --oidc-service-account-email="$SCHEDULER_SA" \
      --oidc-token-audience="$API_ORIGIN" >/dev/null
    echo "created  ${name}"
  fi
}

# Schedule rationale (full detail in
# docs/02-architecture/internal-key-exceptions.md §8.3):
#   - mail-outbox/drain every 1 minute: the outbox's own retry backoff
#     (1s/2s/4s/8s, capped well under a minute) is already tighter than
#     Cloud Scheduler's 1-minute minimum granularity, so 1 minute is as
#     responsive as an external trigger can usefully be.
#   - approval-timeout-reminders/run every 5 minutes: the reminder's own
#     lead time is 12 hours, so a 5-minute worst-case delivery delay is
#     negligible; the sweep is idempotent either way, so this is a cost
#     trade (5x fewer Cloud Run wake-ups than matching the retired
#     in-process 60s poll literally), not a correctness one.
say "Cloud Scheduler job: ${MAIL_OUTBOX_JOB} (${MAIL_OUTBOX_SCHEDULE})"
create_or_update_job "$MAIL_OUTBOX_JOB" "$MAIL_OUTBOX_SCHEDULE" "$MAIL_OUTBOX_URI"

say "Cloud Scheduler job: ${APPROVAL_REMINDER_JOB} (${APPROVAL_REMINDER_SCHEDULE})"
create_or_update_job "$APPROVAL_REMINDER_JOB" "$APPROVAL_REMINDER_SCHEDULE" "$APPROVAL_REMINDER_URI"

# ---------------------------------------------------------------- handoff
cat <<EOF

=== Next steps (not performed by this script) ===
1. If not already done, update the WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS
   secret with the three-entry JSON in
   docs/02-architecture/internal-key-exceptions.md §8.2 (includes entry C for
   ${SCHEDULER_SA}), then redeploy or otherwise refresh the API's secret
   mount so it picks up the new version.
2. Verify each job actually reaches the API once the registry above is live.
   \`gcloud scheduler jobs run\` only dispatches the job -- it returns before
   the target responds -- and lastAttemptTime/state alone cannot tell a
   still-in-flight attempt from a completed one. Use the bounded completion
   check instead, which polls for Cloud Scheduler's own AttemptFinished
   record (the sole decisive evidence) and also prints a non-decisive Cloud
   Run request-log line if it sees one, since a Cloud Run log entry cannot be
   reliably attributed to this specific attempt:
     infra/gcp/dev/scheduler/confirm-job-attempt.sh ${MAIL_OUTBOX_JOB} internal/scheduled-tasks/mail-outbox/drain
     infra/gcp/dev/scheduler/confirm-job-attempt.sh ${APPROVAL_REMINDER_JOB} internal/scheduled-tasks/approval-timeout-reminders/run
   Exit 0 = confirmed completed successfully; exit 1 = confirmed completed
   but failed (script prints the status code); exit 2 = no completion
   evidence within the timeout, which means unconfirmed, not success. Then
   cross-check the Cloud Run request logs for a matching
   AUTH_GOOGLE_WORKLOAD_IDENTITY_USED textPayload line (this app's Nest
   logger emits plain text, not jsonPayload) with principalId=dev-scheduler
   for the matching route -- the adapter also logs
   AUTH_GOOGLE_WORKLOAD_IDENTITY_ROUTE_SCOPE_DENIED in the same shape, so
   search for either with one query. Full verification steps, including why
   a failed run will not surface a specific WORKLOAD_* error code, are in
   docs/03-runbooks/dev-scheduled-tasks-20261001.md.
EOF
