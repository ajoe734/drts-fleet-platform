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

# `jq -e` exits 0 when the filter's last output is present/true and 1 when
# it is false/null/absent, but it also exits with other nonzero codes
# (2, 4, 5, ...) on a compile, parse or runtime error. The policy-is-public
# check below must tell those apart: a nonzero exit that is NOT "evaluated
# to false" is a failure to read the policy, not a verified absence, and
# must fail closed rather than silently skip removal.
jq_exit=0
printf '%s' "$policy_json" | jq -e '
      any(.bindings[]?;
        .role == "roles/run.invoker" and
        (.members // [] | any(. == "allUsers"))
      )
    ' >/dev/null || jq_exit=$?

if [[ "$jq_exit" -eq 0 ]]; then
  echo "Removing public allUsers run.invoker binding from ${service}."
  gcloud run services remove-iam-policy-binding "$service" \
    --region "$region" \
    --project "$project" \
    --member allUsers \
    --role roles/run.invoker
elif [[ "$jq_exit" -eq 1 ]]; then
  echo "allUsers run.invoker binding on roles/run.invoker is already absent for ${service}; nothing to remove."
else
  echo "Failed to evaluate the IAM policy for ${service} (jq exit ${jq_exit}); refusing to treat this as a verified absence." >&2
  exit "$jq_exit"
fi
