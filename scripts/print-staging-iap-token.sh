#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${DRTS_GCP_PROJECT_ID:-autotaxi-492811}"
IAP_CLIENT_ID="${DRTS_STAGING_IAP_CLIENT_ID:-1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com}"
IMPERSONATE_SERVICE_ACCOUNT="${DRTS_STAGING_TOKEN_SERVICE_ACCOUNT:-github-actions-deployer@autotaxi-492811.iam.gserviceaccount.com}"

if [[ -n "${IMPERSONATE_SERVICE_ACCOUNT}" ]]; then
  ACCESS_TOKEN="$(gcloud auth print-access-token 2>/dev/null)"
  RESPONSE="$(curl -s -X POST \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${IMPERSONATE_SERVICE_ACCOUNT}:generateIdToken" \
    -d "{\"audience\": \"${IAP_CLIENT_ID}\", \"includeEmail\": true}")"
  TOKEN="$(echo "${RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token') or d.get('id_token',''))" 2>/dev/null || true)"
  if [[ -z "${TOKEN}" ]]; then
    echo "[print-staging-iap-token] generateIdToken failed: ${RESPONSE}" >&2
    # Fallback: try direct identity token (works when running as a service account key)
    gcloud auth print-identity-token \
      --include-email \
      --project "${PROJECT_ID}" \
      --impersonate-service-account "${IMPERSONATE_SERVICE_ACCOUNT}" \
      --audiences "${IAP_CLIENT_ID}"
    exit 0
  fi
  echo "${TOKEN}"
  exit 0
fi

gcloud auth print-identity-token \
  --include-email \
  --project "${PROJECT_ID}" \
  --audiences "${IAP_CLIENT_ID}"
