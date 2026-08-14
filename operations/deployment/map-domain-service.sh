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
  if [ -z "$describe_output" ] || [[ "$describe_output" == *$'\n'* ]] || \
    ! [[ "$describe_output" =~ ^[a-z]([a-z0-9-]*[a-z0-9])?$ ]]; then
    echo "Fatal error describing domain mapping for ${domain}: expected exactly one non-empty Cloud Run service name, got:" >&2
    echo "$describe_output" >&2
    echo "Refusing to create a domain mapping from an empty, multiline, or malformed describe result." >&2
    exit 1
  fi
  existing_service="$describe_output"
else
  is_domain_not_found=0

  # Positively require exact domain-mappings.describe NOT_FOUND header anchored at byte zero of describe_output
  if [[ "$describe_output" != *$'\n'* ]] && \
    [[ "$describe_output" =~ ^ERROR:[[:space:]]*(\(gcloud\.(beta\.)?run\.domain-mappings\.describe\)|gcloud\.(beta\.)?run\.domain-mappings\.describe)[[:space:]]*NOT_FOUND: ]]; then
    first_line="${describe_output%%$'\n'*}"
    body_output="$(sed -nE 's/^ERROR: (\(gcloud\.(beta\.)?run\.domain-mappings\.describe\)|gcloud\.(beta\.)?run\.domain-mappings\.describe)[[:space:]]*NOT_FOUND:[[:space:]]*//p' <<<"$first_line")"
    if [ -z "$body_output" ]; then
      body_output="$(sed -nE 's/^ERROR: [^:]*NOT_FOUND:[[:space:]]*//p' <<<"$first_line")"
    fi

    domain_escaped="$(printf '%s\n' "$domain" | sed -e 's/\\/\\\\/g' -e 's/[.[\*^$()+?{|]/\\&/g')"
    region_escaped="$(printf '%s\n' "$region" | sed -e 's/\\/\\\\/g' -e 's/[.[\*^$()+?{|]/\\&/g')"
    project_escaped="$(printf '%s\n' "$project" | sed -e 's/\\/\\\\/g' -e 's/[.[\*^$()+?{|]/\\&/g')"

    domain_pattern="('${domain_escaped}'|\"${domain_escaped}\"|\\[${domain_escaped}\\]|${domain_escaped})"
    region_pattern="('${region_escaped}'|\"${region_escaped}\"|\\[${region_escaped}\\]|${region_escaped})"
    project_pattern="('${project_escaped}'|\"${project_escaped}\"|\\[${project_escaped}\\]|${project_escaped})"
    kind_pattern="('DOMAIN_MAPPING'|\"DOMAIN_MAPPING\"|\\[DOMAIN_MAPPING\\]|DOMAIN_MAPPING)"

    mapping_error="$body_output"
    if [[ "$mapping_error" == *" This command is authenticated as "* ]]; then
      auth_context="${mapping_error#* This command is authenticated as }"
      mapping_error="${mapping_error%% This command is authenticated as *}"
      if ! [[ "$auth_context" =~ ^[A-Za-z0-9._%+@*-]+[[:space:]]using[[:space:]]the[[:space:]]credentials[[:space:]]in[[:space:]]/[A-Za-z0-9._/@%+:=-]+,[[:space:]]specified[[:space:]]by[[:space:]]the[[:space:]]\[auth/credential_file_override\][[:space:]]property\.$ ]]; then
        mapping_error=""
      fi
    fi

    if ! grep -Eiq '(^|[^A-Z_])(PERMISSION_DENIED|UNAUTHENTICATED|UNAUTHORIZED|FORBIDDEN|INTERNAL|UNKNOWN|ABORTED|INVALID_ARGUMENT|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|API_ERROR|SERVICE_DISABLED|API_NOT_ENABLED|QUOTA_EXCEEDED)([^A-Z_]|$)|Permission(s)? (denied|required|missing)|Access Denied|Authentication (failed|required)|Invalid credentials|Credential(s)? (have )?expired|Service (is )?(disabled|not enabled)|Quota (is )?(exceeded|error)|API.*(error|disabled|not enabled|unavailable)' <<<"$describe_output"; then
      if grep -Eq "^Cannot find domain mapping (for )?${domain_pattern}[.]?$" <<<"$mapping_error" || \
         grep -Eq "^(Resource|DomainMapping|Domain mapping)[[:space:]]+${domain_pattern}[[:space:]]+(was not found|not found)[.]?$" <<<"$mapping_error" || \
         grep -Eq "^Resource[[:space:]]+${domain_pattern}[[:space:]]+of kind[[:space:]]+${kind_pattern}[[:space:]]+does not exist[.]?$" <<<"$mapping_error" || \
         grep -Eq "^Resource[[:space:]]+${domain_pattern}[[:space:]]+of kind[[:space:]]+${kind_pattern}[[:space:]]+in region[[:space:]]+${region_pattern}[[:space:]]+in project[[:space:]]+${project_pattern}[[:space:]]+does not exist[.]?$" <<<"$mapping_error"; then
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
