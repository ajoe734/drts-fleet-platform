#!/usr/bin/env bash
set -euo pipefail

max_attempts="${CLOUD_RUN_DEPLOY_RETRY_MAX_ATTEMPTS:-8}"
base_delay="${CLOUD_RUN_DEPLOY_RETRY_BASE_DELAY_SECONDS:-30}"
max_delay="${CLOUD_RUN_DEPLOY_RETRY_MAX_DELAY_SECONDS:-120}"
quota_message="Quota exceeded for total allowable CPU per project per region"

if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo "CLOUD_RUN_DEPLOY_RETRY_MAX_ATTEMPTS must be a positive integer." >&2
  exit 2
fi
if ! [[ "$base_delay" =~ ^[0-9]+$ && "$max_delay" =~ ^[0-9]+$ ]]; then
  echo "Cloud Run deploy retry delays must be non-negative integers." >&2
  exit 2
fi

attempt=1
log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT

while true; do
  : >"$log_file"
  set +e
  gcloud run deploy "$@" 2>&1 | tee "$log_file"
  status="${PIPESTATUS[0]}"
  set -e

  if ((status == 0)); then
    exit 0
  fi

  if ! grep -Fq "$quota_message" "$log_file" || ((attempt >= max_attempts)); then
    exit "$status"
  fi

  delay=$((base_delay * (1 << (attempt - 1))))
  if ((delay > max_delay)); then
    delay="$max_delay"
  fi

  echo "::warning::Cloud Run regional CPU quota is temporarily exhausted; retrying deploy in ${delay}s (attempt $((attempt + 1))/${max_attempts})."
  sleep "$delay"
  attempt=$((attempt + 1))
done
