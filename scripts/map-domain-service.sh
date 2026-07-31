#!/usr/bin/env bash
set -euo pipefail

domain="${1:-}"
service="${2:-}"
region="${3:-${DEV_GCP_REGION:-${REGION:-us-central1}}}"
project="${4:-${DEV_GCP_PROJECT_ID:-${PROJECT:-drts-dev-ray-tw-20260730}}}"

if [ -z "$domain" ] || [ -z "$service" ]; then
  echo "Usage: $0 <domain> <service> [region] [project]" >&2
  exit 2
fi

echo "::group::${domain} -> ${service}"

set +e
describe_output="$(
  gcloud --quiet beta run domain-mappings describe \
    --domain "$domain" \
    --region "$region" \
    --project "$project" \
    --format='value(spec.routeName)' 2>&1
)"
describe_status=$?
set -e

existing_service=""

if [ "$describe_status" -eq 0 ]; then
  existing_service="$describe_output"
else
  # Parse error output strictly.
  # Command-not-found, project-not-found, permission-denied must fail closed.
  if grep -Eiq '(command not found|Project \[.*\] not found|Project \[.*\] is not found|Project .* not found|Permission denied)' <<<"$describe_output"; then
    echo "Fatal error describing domain mapping for ${domain}:" >&2
    echo "$describe_output" >&2
    echo "Refusing to proceed: project-level or command failure detected." >&2
    exit "$describe_status"
  fi

  # Extract message body by stripping the gcloud header line `ERROR: (gcloud.beta.run.domain-mappings.describe)...`
  body="$(grep -vi 'gcloud\.beta\.run\.domain-mappings\.describe' <<<"$describe_output" || true)"
  if [ -z "$body" ]; then
    body="$describe_output"
  fi

  # Verify if message body specifically indicates domain mapping resource was NOT_FOUND
  if grep -Eiq '(Cannot find domain mapping|DomainMapping .* not found|Resource .* not found|NOT_FOUND|not found)' <<<"$body" && \
     ! grep -Eiq 'project' <<<"$body"; then
    existing_service=""
  else
    echo "Error describing domain mapping for ${domain}:" >&2
    echo "$describe_output" >&2
    exit "${describe_status:-1}"
  fi
fi

if [ -n "$existing_service" ]; then
  if [ "$existing_service" = "$service" ]; then
    echo "Domain mapping already targets ${service}; skipping create."
  else
    echo "Existing mapping for ${domain} points at ${existing_service}, expected ${service}." >&2
    echo "Refusing to mutate a live mapping in this domain-maintenance workflow; fail closed and hand off to the single deploy cleanup task." >&2
    exit 1
  fi
else
  gcloud --quiet beta run domain-mappings create \
    --service "$service" \
    --domain "$domain" \
    --region "$region" \
    --project "$project" 2>&1
fi

echo "::endgroup::"
