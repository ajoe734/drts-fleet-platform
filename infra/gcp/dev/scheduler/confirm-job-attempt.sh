#!/usr/bin/env bash
# Confirms that a Cloud Scheduler HTTP job's most recently triggered attempt
# actually COMPLETED -- not merely started.
#
# Why this script exists (SR-MAIL-SCHEDULER-PROVISION-20261001 R3 repair):
# `gcloud scheduler jobs run <job>` only dispatches the job and returns
# immediately; it does not wait for the target to respond. Likewise,
# `gcloud scheduler jobs describe <job> --format='value(lastAttemptTime,state,
# status.code)'` run right after `jobs run` only proves the attempt STARTED --
# `lastAttemptTime` is a `google.cloud.scheduler.logging.AttemptStarted`-time
# field, bumped the instant the attempt begins, before Cloud Scheduler (or the
# target) finishes it (https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs).
# `state=ENABLED` plus an absent/zero `status.code` is therefore also
# consistent with an attempt that is still in flight, not only with one that
# succeeded. This script instead polls, bounded by a timeout, for actual
# completion evidence:
#   1. Cloud Scheduler's own per-attempt completion record -- the
#      `AttemptFinished` log entry Google's troubleshooting guide describes
#      (https://docs.cloud.google.com/scheduler/docs/troubleshooting), scoped
#      to this exact job and to timestamps at/after this invocation, so an
#      earlier/unrelated attempt (stale evidence) or another job's attempt
#      (wrong-job evidence) cannot be mistaken for this run's result; or
#   2. a corroborating Cloud Run HTTP request-log entry for the same route,
#      which (unlike the application's own text log) Cloud Run only writes
#      once the handler's response has been sent, i.e. it is itself
#      completion evidence, not an auth-time marker.
#
# Usage:
#   confirm-job-attempt.sh <job-name> <route-path-substring> [timeout-seconds]
#
# Exit codes:
#   0 = confirmed COMPLETED successfully (matching AttemptFinished status.code
#       absent/0, or a matching Cloud Run 2xx response)
#   1 = confirmed COMPLETED but FAILED (matching AttemptFinished non-zero
#       status.code, or a matching Cloud Run non-2xx response)
#   2 = UNCONFIRMED -- no completion evidence found at/after invocation time
#       within the timeout. This is NOT success; absent/pending/stale/
#       wrong-job evidence all fall through to this outcome.
set -euo pipefail

JOB_NAME="${1:?usage: confirm-job-attempt.sh <job-name> <route-path-substring> [timeout-seconds]}"
ROUTE_SUBSTRING="${2:?usage: confirm-job-attempt.sh <job-name> <route-path-substring> [timeout-seconds]}"
TIMEOUT_SECONDS="${3:-90}"

PROJECT_ID="${PROJECT_ID:-drts-dev-devcc-20260825}"
REGION="${REGION:-us-central1}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-drts-dev-api}"
POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-15}"

T0="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Triggering ${JOB_NAME} at ${T0} (bounding all completion evidence below to this time or later)..."
gcloud scheduler jobs run "$JOB_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null

elapsed=0
while :; do
  # Primary evidence: Cloud Scheduler's own AttemptFinished record for this
  # exact job, bounded to timestamps at/after T0. A record that exists but
  # predates T0 (stale) or names a different job_id (wrong job) is excluded
  # by this filter and therefore cannot satisfy this check.
  scheduler_result="$(gcloud logging read \
    "resource.type=\"cloud_scheduler_job\"
     resource.labels.job_id=\"${JOB_NAME}\"
     jsonPayload.\"@type\"=\"type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished\"
     timestamp>=\"${T0}\"" \
    --project="$PROJECT_ID" --freshness=10m --limit=1 \
    --format='value(timestamp,jsonPayload.status.code)' 2>/dev/null || true)"

  if [ -n "$scheduler_result" ]; then
    status_code="$(printf '%s' "$scheduler_result" | cut -f2)"
    if [ -z "$status_code" ] || [ "$status_code" = "0" ]; then
      echo "CONFIRMED COMPLETED (success, Scheduler AttemptFinished): ${scheduler_result}"
      exit 0
    fi
    echo "CONFIRMED COMPLETED (FAILED, Scheduler AttemptFinished status.code=${status_code}): ${scheduler_result}"
    exit 1
  fi

  # Corroborating evidence: Cloud Run's HTTP request log for this route,
  # also bounded to timestamps at/after T0 for the same stale/wrong-target
  # reason as above.
  run_result="$(gcloud logging read \
    "resource.type=\"cloud_run_revision\"
     resource.labels.service_name=\"${CLOUD_RUN_SERVICE}\"
     httpRequest.requestUrl=~\"${ROUTE_SUBSTRING}\"
     timestamp>=\"${T0}\"" \
    --project="$PROJECT_ID" --freshness=10m --limit=1 \
    --format='value(timestamp,httpRequest.status)' 2>/dev/null || true)"

  if [ -n "$run_result" ]; then
    http_status="$(printf '%s' "$run_result" | cut -f2)"
    if [ "$http_status" -ge 200 ] 2>/dev/null && [ "$http_status" -lt 300 ] 2>/dev/null; then
      echo "CONFIRMED COMPLETED (success, Cloud Run HTTP ${http_status}): ${run_result}"
      exit 0
    fi
    echo "CONFIRMED COMPLETED (FAILED, Cloud Run HTTP ${http_status}): ${run_result}"
    exit 1
  fi

  if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
    break
  fi
  sleep "$POLL_INTERVAL_SECONDS"
  elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
done

echo "UNCONFIRMED: no Scheduler AttemptFinished or Cloud Run HTTP record for ${JOB_NAME} at/after ${T0} within ${TIMEOUT_SECONDS}s. This does NOT mean the attempt failed -- it means completion is not yet provable. Do not treat this as success; re-run with a longer timeout or investigate per docs/03-runbooks/dev-scheduled-tasks-20261001.md step 4's troubleshooting section." >&2
exit 2
