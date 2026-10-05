#!/usr/bin/env bash
set -euo pipefail

service="${1:-}"
region="${2:-}"
project="${3:-}"

if [[ -z "$service" || -z "$region" || -z "$project" ]]; then
  echo "Usage: $0 <service> <region> <project>" >&2
  exit 2
fi

# `gcloud run services remove-iam-policy-binding` raises
# IamPolicyBindingNotFound and exits non-zero when the binding is already
# absent (e.g. because `gcloud run deploy --no-allow-unauthenticated` already
# retracted it, or a prior run of this script already did). Read the policy
# first so an already-absent binding is a verified success instead of a
# fatal error, while any other get/remove failure (auth, permission, API)
# still fails closed under `set -e`.
policy_json="$(
  gcloud run services get-iam-policy "$service" \
    --region "$region" \
    --project "$project" \
    --format=json
)"

if printf '%s' "$policy_json" | jq -e '
      any(.bindings[]?;
        .role == "roles/run.invoker" and
        (.members // [] | any(. == "allUsers"))
      )
    ' >/dev/null; then
  echo "Removing public allUsers run.invoker binding from ${service}."
  gcloud run services remove-iam-policy-binding "$service" \
    --region "$region" \
    --project "$project" \
    --member allUsers \
    --role roles/run.invoker
else
  echo "allUsers run.invoker binding on roles/run.invoker is already absent for ${service}; nothing to remove."
fi
