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
# completion evidence.
#
# Why R4 changed how that evidence is read and weighted:
#   - Scheduler outcome field (F2 part A): the `AttemptFinished` log entry
#     (https://docs.cloud.google.com/scheduler/docs/troubleshooting) is a
#     Cloud Logging record, not the `Job` resource -- its `jsonPayload.status`
#     field is a scalar `google.rpc.Code` NAME STRING (e.g. `"OK"` on
#     success, `"NOT_FOUND"`/`"PERMISSION_DENIED"`/`"UNAUTHENTICATED"` on
#     failure), not the nested `{code, message}` `google.rpc.Status` object
#     that the unrelated `Job.status` REST field uses. A published failing
#     Scheduler log confirms the scalar shape:
#     https://discuss.google.dev/t/convert-a-gcp-dataflow-successful-job-into-pipeline/125395 .
#     Selecting `jsonPayload.status.code` against a scalar `status` prints an
#     empty field for every outcome -- success, every failure code, and a
#     malformed/unrecognized record alike -- so treating "empty" as success
#     silently certified failed and unauthenticated attempts as successful.
#     This script now selects the scalar `jsonPayload.status` field directly
#     and classifies it: exactly `"OK"` is success; a recognized
#     `google.rpc.Code` name other than `OK` is a confirmed failure; anything
#     else (empty, or a string this script does not recognize) is NOT treated
#     as success on its own -- see the R5 note below for the one additional
#     signal that can still confirm success from the same record.
#
# Why R5 changed the success path again (F2, success-path gap): a
# successful HTTP-target `AttemptFinished` record can omit the scalar
# `jsonPayload.status` field entirely while still carrying
# `httpRequest.status=200` (or another 2xx) on that SAME log entry -- a
# published operator log shows this exact shape
# (https://stackoverflow.com/questions/70882319/google-cloud-scheduler-getting-returned-message-in-logs),
# and Cloud Scheduler's own `HttpTarget` contract treats any 2xx response as
# a successful invocation
# (https://docs.cloud.google.com/scheduler/docs/reference/rest/v1/projects.locations.jobs#HttpTarget).
# Google has not documented every record shape, so this script does not
# assume an empty scalar status always means a 2xx was returned -- it reads
# `httpRequest.status` (https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#HttpRequest)
# from the *same* Scheduler `AttemptFinished` record (not the diagnostic
# Cloud Run query below, which stays non-decisive) and treats a 2xx value
# there as success ONLY when the scalar status is empty/unrecognized. A
# recognized scalar status is still checked first and always wins --
# Scheduler's own `google.rpc.Code` classification is the more authoritative
# signal, so a record that improbably carries both a recognized failure
# status AND an HTTP 2xx is still reported as the confirmed failure, not
# success (fail-closed on conflicting evidence, per the "F2 success-path
# gap" repair scope: this adds one additional success signal, it does not
# add new failure-classification paths from `httpRequest.status` alone --
# a non-2xx/absent `httpRequest.status` alongside an empty/unrecognized
# scalar status still falls through to UNCONFIRMED, exactly as before).
#   - Cloud Run corroboration (F2 part B): `apps/api/src/main.ts` enables
#     CORS, so an unrelated OPTIONS preflight to the same route can return a
#     2xx while the actual scheduler-triggered POST is still in flight or
#     later fails, and nothing in the Cloud Run HTTP request log correlates a
#     given request back to a specific Scheduler job attempt (Cloud
#     Scheduler's own headers are not part of Cloud Logging's structured
#     `httpRequest` fields). A Cloud Run log entry for this route can
#     therefore never be used to CONFIRM this script's own attempt -- it is
#     printed only as non-decisive diagnostic context (and now scoped to
#     `requestMethod="POST"` to at least exclude preflights), and completion
#     success/failure is decided solely by the Scheduler `AttemptFinished`
#     record.
#
# Usage:
#   confirm-job-attempt.sh <job-name> <route-path-substring> [timeout-seconds]
#
# Exit codes:
#   0 = confirmed COMPLETED successfully (matching AttemptFinished
#       status="OK", OR status empty/unrecognized with the same record's
#       httpRequest.status in the 2xx range)
#   1 = confirmed COMPLETED but FAILED (matching AttemptFinished status is a
#       recognized non-OK google.rpc.Code name -- checked before, and takes
#       priority over, httpRequest.status)
#   2 = UNCONFIRMED -- no completion evidence found at/after invocation time
#       within the timeout, or a matching record's status field was empty or
#       unrecognized AND its httpRequest.status was not a 2xx. This is NOT
#       success; absent/pending/stale/wrong-job/unrecognized evidence all
#       fall through to this outcome. A diagnostic Cloud Run POST record, if
#       one was seen, is reported here but never changes the exit code.
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

run_diagnostic=""

elapsed=0
while :; do
  # Decisive evidence: Cloud Scheduler's own AttemptFinished record for this
  # exact job in this exact region, bounded to timestamps at/after T0. A
  # record that exists but predates T0 (stale), names a different job_id
  # (wrong job) or a different location (wrong region) is excluded by this
  # filter and therefore cannot satisfy this check.
  scheduler_result="$(gcloud logging read \
    "resource.type=\"cloud_scheduler_job\"
     resource.labels.job_id=\"${JOB_NAME}\"
     resource.labels.location=\"${REGION}\"
     jsonPayload.\"@type\"=\"type.googleapis.com/google.cloud.scheduler.logging.AttemptFinished\"
     timestamp>=\"${T0}\"" \
    --project="$PROJECT_ID" --freshness=10m --limit=1 \
    --format='value(timestamp,jsonPayload.status,httpRequest.status)' 2>/dev/null || true)"

  if [ -n "$scheduler_result" ]; then
    status_value="$(printf '%s' "$scheduler_result" | cut -f2)"
    http_status_value="$(printf '%s' "$scheduler_result" | cut -f3)"
    case "$status_value" in
      OK)
        echo "CONFIRMED COMPLETED (success, Scheduler AttemptFinished status=OK): ${scheduler_result}"
        exit 0
        ;;
      CANCELLED | UNKNOWN | INVALID_ARGUMENT | DEADLINE_EXCEEDED | NOT_FOUND | \
      ALREADY_EXISTS | PERMISSION_DENIED | UNAUTHENTICATED | RESOURCE_EXHAUSTED | \
      FAILED_PRECONDITION | ABORTED | OUT_OF_RANGE | UNIMPLEMENTED | INTERNAL | \
      UNAVAILABLE | DATA_LOSS)
        echo "CONFIRMED COMPLETED (FAILED, Scheduler AttemptFinished status=${status_value}): ${scheduler_result}"
        exit 1
        ;;
      *)
        # No decisive scalar status on this record. Fall back to the same
        # record's httpRequest.status: a 2xx there is still decisive success
        # evidence from Scheduler itself (see the R5 header note above) --
        # but only here, never as a new failure signal, so a non-2xx or
        # absent httpRequest.status still falls through to UNCONFIRMED below.
        if [[ "$http_status_value" =~ ^2[0-9][0-9]$ ]]; then
          echo "CONFIRMED COMPLETED (success, Scheduler AttemptFinished httpRequest.status=${http_status_value}, jsonPayload.status empty/unrecognized): ${scheduler_result}"
          exit 0
        fi
        echo "WARNING: matching Scheduler AttemptFinished record found but neither its status ('${status_value}') nor its httpRequest.status ('${http_status_value}') is decisive -- not treating this as success; continuing to poll: ${scheduler_result}" >&2
        ;;
    esac
  fi

  # Non-decisive diagnostic: a Cloud Run HTTP POST request-log entry for this
  # route, bounded to timestamps at/after T0. This can never confirm success
  # or failure on its own -- see the F2 part B note in the header -- so it is
  # recorded once and only surfaced in the final UNCONFIRMED message.
  if [ -z "$run_diagnostic" ]; then
    run_result="$(gcloud logging read \
      "resource.type=\"cloud_run_revision\"
       resource.labels.service_name=\"${CLOUD_RUN_SERVICE}\"
       httpRequest.requestMethod=\"POST\"
       httpRequest.requestUrl=~\"${ROUTE_SUBSTRING}\"
       timestamp>=\"${T0}\"" \
      --project="$PROJECT_ID" --freshness=10m --limit=1 \
      --format='value(timestamp,httpRequest.status)' 2>/dev/null || true)"
    if [ -n "$run_result" ]; then
      run_diagnostic="$run_result"
      echo "DIAGNOSTIC (not decisive, cannot be correlated to this specific Scheduler attempt): matching Cloud Run POST request-log entry: ${run_result}" >&2
    fi
  fi

  if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
    break
  fi
  sleep "$POLL_INTERVAL_SECONDS"
  elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
done

if [ -n "$run_diagnostic" ]; then
  echo "UNCONFIRMED: no Scheduler AttemptFinished record (with a recognized status) for ${JOB_NAME} at/after ${T0} within ${TIMEOUT_SECONDS}s. A diagnostic Cloud Run POST record was seen (${run_diagnostic}) but it cannot be reliably attributed to this specific attempt, so it is NOT used to confirm completion. This does NOT mean the attempt failed -- it means completion is not yet provable. Re-run with a longer timeout or investigate per docs/03-runbooks/dev-scheduled-tasks-20261001.md step 4's troubleshooting section." >&2
else
  echo "UNCONFIRMED: no Scheduler AttemptFinished record and no diagnostic Cloud Run POST record for ${JOB_NAME} at/after ${T0} within ${TIMEOUT_SECONDS}s. This does NOT mean the attempt failed -- it means completion is not yet provable. Do not treat this as success; re-run with a longer timeout or investigate per docs/03-runbooks/dev-scheduled-tasks-20261001.md step 4's troubleshooting section." >&2
fi
exit 2
