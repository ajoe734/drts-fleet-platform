#!/usr/bin/env bash
set -euo pipefail

action="${1:-none}"
project="${2:-}"
region="${3:-}"
retired_service="drts-passenger-web"

case "$action" in
  none)
    echo "Retired service cleanup disabled; Cloud Run inventory is unchanged."
    exit 0
    ;;
  delete-drts-passenger-web) ;;
  *)
    echo "Unsupported retired service cleanup action: ${action}" >&2
    echo "Allowed actions: none, delete-drts-passenger-web." >&2
    exit 2
    ;;
esac

if [[ -z "$project" || -z "$region" ]]; then
  echo "Usage: $0 <none|delete-drts-passenger-web> <project> <region>" >&2
  exit 2
fi

intended_services=(
  "drts-dev-api"
  "drts-dev-platform-admin-web"
  "drts-dev-ops-console-web"
  "drts-dev-fleet-partner-portal-web"
  "drts-dev-tenant-console-web"
  "drts-dev-bank-console-web"
  "drts-dev-referral-embed-web"
  "drts-dev-enterprise-dispatch-web"
  "drts-channel-partner-portal-web"
)

inventory_output="$(
  gcloud run services list \
    --platform=managed \
    --region "$region" \
    --project "$project" \
    --format='value(metadata.name)'
)"

actual_sorted="$(
  printf '%s\n' "$inventory_output" |
    sed '/^[[:space:]]*$/d' |
    LC_ALL=C sort
)"
expected_sorted="$(
  printf '%s\n' "${intended_services[@]}" "$retired_service" |
    LC_ALL=C sort
)"

if [[ "$actual_sorted" != "$expected_sorted" ]]; then
  missing="$(
    comm -23 \
      <(printf '%s\n' "$expected_sorted") \
      <(printf '%s\n' "$actual_sorted")
  )"
  extra="$(
    comm -13 \
      <(printf '%s\n' "$expected_sorted") \
      <(printf '%s\n' "$actual_sorted")
  )"

  echo "Cloud Run inventory does not exactly match the 9 active services plus ${retired_service}; refusing deletion." >&2
  if [[ -n "$missing" ]]; then
    echo "Missing services:" >&2
    printf '%s\n' "$missing" >&2
  fi
  if [[ -n "$extra" ]]; then
    echo "Unexpected services:" >&2
    printf '%s\n' "$extra" >&2
  fi
  exit 1
fi

gcloud run services delete "$retired_service" \
  --platform=managed \
  --region "$region" \
  --project "$project" \
  --quiet

echo "Deleted only ${retired_service} after exact Cloud Run inventory validation."
