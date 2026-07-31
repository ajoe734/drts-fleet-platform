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
  is_domain_not_found=0

  # Positively require exact domain-mappings.describe NOT_FOUND header anchored to ^ERROR:
  if grep -Eq '^ERROR: (\(gcloud\.(beta\.)?run\.domain-mappings\.describe\)|gcloud\.(beta\.)?run\.domain-mappings\.describe)[[:space:]]*NOT_FOUND:' <<<"$describe_output"; then
    # Extract body strictly after the ^ERROR: ... NOT_FOUND: header
    body_output="$(sed -nE 's/^ERROR: (\(gcloud\.(beta\.)?run\.domain-mappings\.describe\)|gcloud\.(beta\.)?run\.domain-mappings\.describe)[[:space:]]*NOT_FOUND:[[:space:]]*//p' <<<"$describe_output")"
    if [ -z "$body_output" ]; then
      body_output="$(sed -nE 's/^ERROR: [^:]*NOT_FOUND:[[:space:]]*//p' <<<"$describe_output")"
    fi

    domain_escaped="$(printf '%s\n' "$domain" | sed -e 's/\\/\\\\/g' -e 's/[.[\*^$()+?{|]/\\&/g')"

    if grep -Eiq "Cannot find domain mapping (for )?[^a-zA-Z0-9]?${domain_escaped}[^a-zA-Z0-9]?" <<<"$body_output" || \
       grep -Eiq "(Resource|DomainMapping|Domain mapping)[[:space:]]+[^a-zA-Z0-9]?${domain_escaped}[^a-zA-Z0-9]?[[:space:]]+(was not found|not found)" <<<"$body_output"; then
      if ! grep -Eiq '(Service account|Region|Project|Permission|Unauthorized|Access Denied|Quota)' <<<"$body_output"; then
        is_domain_not_found=1
      fi
    fi
  fi

  if [ "$is_domain_not_found" -eq 1 ]; then
    existing_service=""
  else
    echo "Fatal error describing domain mapping for ${domain}:" >&2
    echo "$describe_output" >&2
    echo "Refusing to proceed: error output does not match domain-not-found for ${domain}." >&2
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
