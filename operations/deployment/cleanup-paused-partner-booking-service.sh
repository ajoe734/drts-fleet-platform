#!/usr/bin/env bash
set -euo pipefail

project="${1:-}"
region="${2:-}"
paused_service="drts-dev-partner-booking-web"
tolerated_retired_service="drts-passenger-web"

if [[ -z "$project" || -z "$region" ]]; then
  echo "Usage: $0 <project> <region>" >&2
  exit 2
fi

active_services=(
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
active_sorted="$(
  printf '%s\n' "${active_services[@]}" |
    LC_ALL=C sort
)"
allowed_sorted="$(
  printf '%s\n' \
    "${active_services[@]}" \
    "$paused_service" \
    "$tolerated_retired_service" |
    LC_ALL=C sort
)"

missing="$(
  comm -23 \
    <(printf '%s\n' "$active_sorted") \
    <(printf '%s\n' "$actual_sorted")
)"
unexpected="$(
  comm -13 \
    <(printf '%s\n' "$allowed_sorted") \
    <(printf '%s\n' "$actual_sorted")
)"

if [[ -n "$missing" || -n "$unexpected" ]]; then
  echo "Cloud Run inventory does not match the 9 active services plus only optional ${paused_service} and ${tolerated_retired_service}; refusing deletion." >&2
  if [[ -n "$missing" ]]; then
    echo "Missing active services:" >&2
    printf '%s\n' "$missing" >&2
  fi
  if [[ -n "$unexpected" ]]; then
    echo "Unexpected services:" >&2
    printf '%s\n' "$unexpected" >&2
  fi
  exit 1
fi

if ! printf '%s\n' "$actual_sorted" | grep -Fx "$paused_service" >/dev/null; then
  echo "Partner Booking is paused and ${paused_service} is already absent."
  exit 0
fi

gcloud run services delete "$paused_service" \
  --platform=managed \
  --region "$region" \
  --project "$project" \
  --quiet

echo "Deleted only ${paused_service}; Partner Booking code remains preserved in the repository."
