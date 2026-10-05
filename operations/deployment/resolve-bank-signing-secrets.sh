#!/usr/bin/env bash
set -euo pipefail

# This script resolves Secret Manager mounts for the bank-console-web signing keys.
# Acceptance criteria requires all-or-nothing mounting: either all three keys are
# present, or none are. If partially present, it explicitly fails the deployment.

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <secret_prefix> <project_id>" >&2
  exit 1
fi

SECRET_PREFIX="$1"
PROJECT_ID="$2"

bank_signing_private_secret="${SECRET_PREFIX}-bank-signing-private-key"
bank_signing_public_secret="${SECRET_PREFIX}-bank-signing-public-key"
bank_signing_kid_secret="${SECRET_PREFIX}-bank-signing-key-id"

count=0
for secret in "$bank_signing_private_secret" "$bank_signing_public_secret" "$bank_signing_kid_secret"; do
  # In testing, we might mock gcloud.
  if gcloud secrets describe "$secret" --project "$PROJECT_ID" >/dev/null 2>&1; then
    count=$((count + 1))
  fi
done

if [[ "$count" -eq 3 ]]; then
  echo "BANK_SIGNING_PRIVATE_KEY=${bank_signing_private_secret}:latest,BANK_SIGNING_PUBLIC_KEY=${bank_signing_public_secret}:latest,BANK_SIGNING_KEY_ID=${bank_signing_kid_secret}:latest"
elif [[ "$count" -gt 0 ]]; then
  echo "::error::Bank signing configuration is partial (${count}/3 secrets present). All three of ${bank_signing_private_secret}, ${bank_signing_public_secret}, ${bank_signing_kid_secret} must be present, or none of them." >&2
  exit 1
else
  echo "::notice::Bank signing configuration is absent; dev deploys bank-console-web with UNSIGNED behavior." >&2
  echo ""
fi
