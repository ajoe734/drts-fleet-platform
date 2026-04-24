#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="${DRTS_GCP_PROJECT_ID:-autotaxi-492811}"
IAP_CLIENT_ID="${DRTS_STAGING_IAP_CLIENT_ID:-1071409254673-nabnvfu9hr89s1acue6fcfoomn9g1v5k.apps.googleusercontent.com}"
IMPERSONATE_SERVICE_ACCOUNT="${DRTS_STAGING_TOKEN_SERVICE_ACCOUNT:-github-actions-deployer@autotaxi-492811.iam.gserviceaccount.com}"

if [[ -n "${IMPERSONATE_SERVICE_ACCOUNT}" ]]; then
  gcloud auth print-identity-token \
    --include-email \
    --project "${PROJECT_ID}" \
    --impersonate-service-account "${IMPERSONATE_SERVICE_ACCOUNT}" \
    --audiences "${IAP_CLIENT_ID}"
  exit 0
fi

gcloud auth print-identity-token \
  --include-email \
  --project "${PROJECT_ID}" \
  --audiences "${IAP_CLIENT_ID}"
