#!/usr/bin/env bash
set -euo pipefail

service="${1:-}"
region="${2:-}"
project="${3:-}"

if [[ -z "$service" || -z "$region" || -z "$project" ]]; then
  echo "Usage: $0 <service> <region> <project>" >&2
  exit 2
fi

# Background (entry-R1-ordinary-browser-authentication-finding.md): granting a
# single named Google identity roles/run.invoker on this Cloud Run service does
# NOT make it reachable from an ordinary browser. Chrome being signed into
# Google does not attach a Cloud Run identity token to a request to a plain
# *.run.app origin; that only works via `gcloud run services proxy` or an
# explicit Authorization: Bearer <identity-token> header. The real ordinary-
# browser entry is Cloud IAP in front of a regional serverless NEG (see
# setup-passenger-public-entry.sh, wired from domain-mappings-dev.yml). IAP
# terminates the browser's request at the load balancer and then calls this
# Cloud Run service itself using its own service agent's identity token, so
# that agent is the only principal this script ever grants run.invoker to.
#
# This grant is purely additive: it must never remove an existing invoker
# binding (CI/smoke-test callers keep working), and it must never touch
# allUsers/allAuthenticatedUsers (enforce-no-public-access.sh already fails
# the deploy if either appears).
project_number="$(
  gcloud projects describe "$project" --format='value(projectNumber)'
)"

if ! [[ "$project_number" =~ ^[0-9]+$ ]]; then
  echo "::error::Could not resolve a numeric project number for ${project}; refusing to guess the IAP service agent." >&2
  exit 1
fi

iap_agent="service-${project_number}@gcp-sa-iap.iam.gserviceaccount.com"

# A brand-new project has never had iap.googleapis.com enabled, so the
# service-identity call below fails before even reaching a permissions check
# (ENTRY-R11-FIRST-ACTIVATION-API-BOOTSTRAP). `gcloud services enable` is
# itself idempotent against an already-enabled API; a failure here is a real
# activation blocker and must stop the script under `set -e` before the
# identity/grant calls below are attempted.
echo "Ensuring ${project} has iap.googleapis.com enabled."
gcloud services enable iap.googleapis.com \
  --project="$project" \
  --quiet

# The agent above does not exist until the IAP service identity has been
# created at least once for this project
# (https://docs.cloud.google.com/iap/docs/enabling-cloud-run#gcloud).
# `services identity create` is idempotent — safe whether or not the identity
# already exists — so this always runs rather than relying on
# domain-mappings-dev.yml having enabled IAP first. On a fresh project, this
# grant step (part of the normal deploy) can otherwise run before IAP has ever
# been turned on anywhere, and add-iam-policy-binding below would fail because
# the principal does not exist yet (entry-R6-first-activation-review/findings.json).
# `set -e` propagates a failure here as a script failure, and the grant below
# is never attempted.
#
# `beta services identity create` is a `gcloud beta` command: on a cold Cloud
# SDK install that has never used the `beta` component group before, gcloud
# tries to interactively prompt to auto-install it first, which fails outright
# on a noninteractive CI runner ("This prompt could not be answered because
# you are not in an interactive session", actual run39166716207-era
# DeployDev run) before ever reaching IAP itself — this is a cold-SDK/
# component-install failure, not an IAP-disabled or IAM-denied failure.
# `--quiet` is gcloud's own documented fix (it is what that exact error
# message tells the caller to add): it accepts the default answer for any
# prompt, including the component-install confirmation, so this now also
# works unattended on a cold SDK.
echo "Ensuring the Cloud IAP service identity exists for ${project}."
gcloud beta services identity create \
  --service=iap.googleapis.com \
  --project="$project" \
  --quiet

echo "Granting roles/run.invoker on ${service} to the Cloud IAP service agent (${iap_agent})."
gcloud run services add-iam-policy-binding "$service" \
  --region "$region" \
  --project "$project" \
  --member "serviceAccount:${iap_agent}" \
  --role roles/run.invoker
