#!/usr/bin/env bash
set -euo pipefail

service="${1:-}"
region="${2:-}"
project="${3:-}"
host="${4:-}"

if [[ -z "$service" || -z "$region" || -z "$project" || -z "$host" ]]; then
  echo "Usage: $0 <service> <region> <project> <host>" >&2
  echo "  <host> is the public hostname bureau reviewers and passengers will use, e.g. bureau.smarttransport.tw." >&2
  exit 2
fi

if ! [[ "$host" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; then
  echo "::error::'${host}' is not a plausible DNS hostname; refusing to provision a load balancer for it." >&2
  exit 1
fi

# Why this exists (entry-R1-ordinary-browser-authentication-finding.md): the
# passenger-app-web Cloud Run service stays `--no-allow-unauthenticated`
# (operations/deployment/deploy-cloud-run-service.sh +
# enforce-no-public-access.sh), so a plain browser GET to its *.run.app origin
# or to the existing ride.smarttransport.tw Cloud Run domain mapping always
# gets a 403: Cloud Run's own IAM check has no browser login flow, only
# Authorization: Bearer <identity-token>. Cloud IAP is the GCP-native way to
# put a real browser-login (or, as configured below, a deliberately public)
# front door on a Cloud Run service that otherwise stays private:
# https://docs.cloud.google.com/run/docs/authenticating/developers (private
# service access) + https://docs.cloud.google.com/iap/docs/enabling-cloud-run.
#
# Topology, modelled on the already-reviewed production public-entry rail
# (operations/verification/production-release-rail/public-entry.cjs), scoped
# to dev and to this one task's write_scopes:
#   one regional serverless NEG (passenger-app-web)
#     -> backend service A "<service>-public-entry"      (IAP enabled, allUsers accessor)
#     -> backend service B "<service>-review-driver-guard" (IAP enabled, no accessor grant at all)
#   one URL map on $host: default -> A; /review-driver* and
#   /api/review-driver-api/* -> B.
#
# Both backend services point at the SAME Cloud Run service, so the two
# driver-rehearsal/dispatch-control routes stay unreachable through this new
# public front door even though the rest of the app (passenger /login,
# /review, booking, trips) is deliberately open to anonymous browsers, same
# as production's passenger-app-web entry. Cloud Run's own IAM (run.invoker
# restricted to the Cloud IAP service agent; see
# grant-passenger-app-iap-invoker.sh) is unchanged by this script and keeps
# the direct *.run.app origin exactly as private as it is today.
#
# Idempotency: every resource below is checked with `list --filter=name=...`
# (always a clean empty/non-empty JSON array, never an ambiguous error
# string to pattern-match) before create; the URL map is always re-applied
# via `import` from a generated, fully-declarative routing config, since a
# partial `add-path-matcher` cannot be safely diffed by hand.

public_backend="${service}-public-entry"
guard_backend="${service}-review-driver-guard"
neg_name="${service}-neg"
urlmap_name="${service}-public-entry-urlmap"
cert_name="${service}-public-entry-cert"
ip_name="${service}-public-entry-ip"
proxy_name="${service}-public-entry-proxy"
forwarding_rule_name="${service}-public-entry-fr"

# $1 = resource name to filter on; $2.. = full gcloud args up to and
# including "list" (e.g. "compute" "backend-services" "list" "--global").
# Using an argument array (not a word-split string) keeps "list" in the
# right position regardless of how many extra flags a resource type needs.
exists() {
  local name="$1"
  shift
  local result
  result="$(gcloud "$@" --project="$project" --filter="name=${name}" --format='value(name)')"
  [[ -n "$result" ]]
}

echo "::group::IAP service agent"
project_number="$(gcloud projects describe "$project" --format='value(projectNumber)')"
if ! [[ "$project_number" =~ ^[0-9]+$ ]]; then
  echo "::error::Could not resolve a numeric project number for ${project}." >&2
  exit 1
fi
iap_agent="service-${project_number}@gcp-sa-iap.iam.gserviceaccount.com"
echo "::endgroup::"

echo "::group::Serverless NEG (${neg_name})"
if exists "$neg_name" compute network-endpoint-groups list --regions="${region}"; then
  echo "${neg_name} already exists; skipping create."
else
  gcloud compute network-endpoint-groups create "$neg_name" \
    --project="$project" \
    --region="$region" \
    --network-endpoint-type=serverless \
    --cloud-run-service="$service"
fi
echo "::endgroup::"

for backend in "$public_backend" "$guard_backend"; do
  echo "::group::Backend service (${backend})"
  if exists "$backend" compute backend-services list --global; then
    echo "${backend} already exists; skipping create."
  else
    gcloud compute backend-services create "$backend" \
      --project="$project" \
      --global \
      --load-balancing-scheme=EXTERNAL_MANAGED \
      --protocol=HTTPS
    gcloud compute backend-services add-backend "$backend" \
      --project="$project" \
      --global \
      --network-endpoint-group="$neg_name" \
      --network-endpoint-group-region="$region"
  fi

  # Idempotent regardless of create/already-existed: make sure IAP is on and
  # Cloud Run's invoker allows the agent IAP will actually call through as.
  gcloud compute backend-services update "$backend" \
    --project="$project" \
    --global \
    --iap=enabled
  echo "::endgroup::"
done

echo "::group::Guard backend (${guard_backend}) must never be publicly accessible"
# No `2>/dev/null || echo '{}'` fallback here: a resource that legitimately
# has no bindings yet still returns a valid, successful empty policy from
# get-iam-policy. Any actual failure (permission denied, API unavailable,
# transient error) must fail this script closed under `set -e`, not be
# silently reinterpreted as "confirmed no public access" and let the script
# go on to grant public IAP access / import the routing config anyway.
guard_iap_policy="$(
  gcloud iap web get-iam-policy \
    --resource-type=backend-services \
    --service="$guard_backend" \
    --project="$project" \
    --format=json
)"
jq_exit=0
printf '%s' "$guard_iap_policy" | jq -e '
      any(.bindings[]?;
        .role == "roles/iap.httpsResourceAccessor" and
        (.members // [] | any(. == "allUsers" or . == "allAuthenticatedUsers"))
      )
    ' >/dev/null || jq_exit=$?

if [[ "$jq_exit" -eq 0 ]]; then
  echo "::error::${guard_backend} already grants anonymous IAP access; refusing to proceed. This backend must stay closed so /review-driver and dispatch control are never reachable through the public entry." >&2
  exit 1
elif [[ "$jq_exit" -ne 1 ]]; then
  echo "::error::Failed to evaluate the IAP policy for ${guard_backend} (jq exit ${jq_exit}); refusing to treat this as a verified no-public-access state." >&2
  exit "$jq_exit"
fi
echo "Confirmed ${guard_backend} has no anonymous IAP accessor grant."
echo "::endgroup::"

echo "::group::Public IAP accessor grant (${public_backend} only)"
gcloud iap web add-iam-policy-binding \
  --resource-type=backend-services \
  --service="$public_backend" \
  --project="$project" \
  --member=allUsers \
  --role=roles/iap.httpsResourceAccessor
echo "::endgroup::"

echo "::group::URL map (${urlmap_name})"
url_map_config="$(mktemp)"
trap 'rm -f "$url_map_config"' EXIT
cat >"$url_map_config" <<EOF
name: ${urlmap_name}
# Top-level defaultService is the fallback for any request whose Host header
# does not match a hostRule below (including direct-IP requests with a
# forged/absent Host, per
# https://docs.cloud.google.com/load-balancing/docs/url-map-concepts). It
# MUST be the guard backend, not the public one: pointing it at the public
# backend would let anyone reach /review-driver and dispatch control simply
# by sending a mismatched Host, bypassing the path rule below entirely even
# though both backends serve the same Cloud Run service.
defaultService: projects/${project}/global/backendServices/${guard_backend}
hostRules:
  - hosts:
      - "${host}"
    pathMatcher: bureau-entry
pathMatchers:
  - name: bureau-entry
    defaultService: projects/${project}/global/backendServices/${public_backend}
    pathRules:
      - paths:
          - "/review-driver"
          - "/review-driver/*"
          - "/api/review-driver-api/*"
        service: projects/${project}/global/backendServices/${guard_backend}
EOF
gcloud compute url-maps import "$urlmap_name" \
  --project="$project" \
  --global \
  --source="$url_map_config" \
  --quiet
echo "::endgroup::"

echo "::group::Managed SSL certificate (${cert_name})"
if exists "$cert_name" compute ssl-certificates list --global; then
  echo "${cert_name} already exists; skipping create."
else
  gcloud compute ssl-certificates create "$cert_name" \
    --project="$project" \
    --global \
    --domains="$host"
fi
echo "::endgroup::"

echo "::group::Static external IP (${ip_name})"
if ! exists "$ip_name" compute addresses list --global; then
  gcloud compute addresses create "$ip_name" \
    --project="$project" \
    --global \
    --ip-version=IPV4
fi
static_ip="$(
  gcloud compute addresses describe "$ip_name" \
    --project="$project" \
    --global \
    --format='value(address)'
)"
echo "::endgroup::"

echo "::group::Target HTTPS proxy (${proxy_name})"
if exists "$proxy_name" compute target-https-proxies list --global; then
  gcloud compute target-https-proxies update "$proxy_name" \
    --project="$project" \
    --global \
    --url-map="$urlmap_name" \
    --ssl-certificates="$cert_name"
else
  gcloud compute target-https-proxies create "$proxy_name" \
    --project="$project" \
    --global \
    --url-map="$urlmap_name" \
    --ssl-certificates="$cert_name"
fi
echo "::endgroup::"

echo "::group::Global forwarding rule (${forwarding_rule_name})"
if exists "$forwarding_rule_name" compute forwarding-rules list --global; then
  echo "${forwarding_rule_name} already exists; skipping create."
else
  gcloud compute forwarding-rules create "$forwarding_rule_name" \
    --project="$project" \
    --global \
    --load-balancing-scheme=EXTERNAL_MANAGED \
    --address="$ip_name" \
    --target-https-proxy="$proxy_name" \
    --ports=443
fi
echo "::endgroup::"

cat <<SUMMARY

Passenger public entry provisioning complete for ${service} (project ${project}, region ${region}).

Static IP for ${host}: ${static_ip}
  -> If this IP is not yet the DNS A record for ${host}, add it now:
       ${host}  A  ${static_ip}
     The managed certificate (${cert_name}) only activates once that record
     resolves and Google's CA validates it; this can take minutes to hours.

Once DNS and the certificate are both live:
  https://${host}/login      -> real passenger login, open to any browser
  https://${host}/review     -> existing shared-rehearsal review entry
  https://${host}/review-driver and /api/review-driver-api/*
     -> intentionally NOT reachable here (routed to ${guard_backend}, which
        has no IAP accessor grant); dispatch control stays exactly as
        private as before this change.
SUMMARY
