#!/usr/bin/env bash
set -euo pipefail

# Resolves and validates Secret Manager mounts for opt-in driver onboarding
# dual-channel notifications (DRV-ONB-006).
# Default is false. When enabled (true), fails closed unless:
# - DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS (comma-separated SHA-256) and
#   DRIVER_ONBOARDING_IOS_APP_ID (<TEAMID>.com.cctechsupport.drts.driver) are valid
# - Complete Remote SMTP secrets (6/6) are present
# - Secret Manager metadata exists (probed via gcloud secrets describe only;
#   never creating, reading, or printing secret values) for
#   DRIVER_ONBOARDING_CODE_PEPPER (at least 32 bytes),
#   DRIVER_ONBOARDING_DELIVERY_KEY (64 hex), and complete Twilio SMS
#   (TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET,
#   TWILIO_FROM_NUMBER).

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <secret_prefix> <project_id> [smtp_secret_count]" >&2
  exit 1
fi

secret_prefix="$1"
project_id="$2"
smtp_secret_count="${3:-${SMTP_SECRET_COUNT:-0}}"

driver_onboarding_raw="${DEV_DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED:-${DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED:-false}}"
driver_onboarding_normalized="$(printf '%s' "$driver_onboarding_raw" | tr '[:upper:]' '[:lower:]')"
driver_onboarding_notifications_enabled=false
case "$driver_onboarding_normalized" in
  true) driver_onboarding_notifications_enabled=true ;;
  false|"") driver_onboarding_notifications_enabled=false ;;
  *)
    echo "::error::Invalid DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED value: ${driver_onboarding_raw}. Use true/false." >&2
    exit 1
    ;;
esac

driver_onboarding_mounts=""
if [[ "$driver_onboarding_notifications_enabled" == true ]]; then
  driver_onboarding_android_raw="${DEV_DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS:-${DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS:-}}"
  driver_onboarding_ios_app_id="$(printf '%s' "${DEV_DRIVER_ONBOARDING_IOS_APP_ID:-${DRIVER_ONBOARDING_IOS_APP_ID:-}}" | tr -d '[:space:]')"
  if [[ -z "$driver_onboarding_android_raw" || -z "$driver_onboarding_ios_app_id" ]]; then
    echo "::error::Enabling DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED requires DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS and DRIVER_ONBOARDING_IOS_APP_ID." >&2
    exit 1
  fi
  if [[ ! "$driver_onboarding_ios_app_id" =~ ^[A-Z0-9]{10}\.com\.cctechsupport\.drts\.driver$ ]]; then
    echo "::error::DRIVER_ONBOARDING_IOS_APP_ID must match <TEAMID>.com.cctechsupport.drts.driver." >&2
    exit 1
  fi
  IFS=',' read -r -a driver_onboarding_fp_items <<<"$driver_onboarding_android_raw"
  driver_onboarding_fp_count=0
  for fp_item in "${driver_onboarding_fp_items[@]}"; do
    fp_cleaned="$(printf '%s' "$fp_item" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')"
    if [[ ! "$fp_cleaned" =~ ^([A-F0-9]{2}:){31}[A-F0-9]{2}$ ]]; then
      echo "::error::DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS must be comma-separated SHA-256 certificate fingerprints (AA:BB:...:FF)." >&2
      exit 1
    fi
    driver_onboarding_fp_count=$((driver_onboarding_fp_count + 1))
  done
  if [[ "$driver_onboarding_fp_count" -eq 0 ]]; then
    echo "::error::DRIVER_ONBOARDING_ANDROID_CERT_FINGERPRINTS must contain at least one SHA-256 certificate fingerprint." >&2
    exit 1
  fi
  if [[ "$smtp_secret_count" -ne 6 ]]; then
    echo "::error::Enabling DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED requires complete Remote SMTP secrets (REMOTE_SMTP_* and NOTIFICATION_FROM_EMAIL)." >&2
    exit 1
  fi
  driver_onboarding_code_pepper_secret="${secret_prefix}-driver-onboarding-code-pepper"
  driver_onboarding_delivery_key_secret="${secret_prefix}-driver-onboarding-delivery-key"
  if ! gcloud secrets describe "$driver_onboarding_code_pepper_secret" --project "$project_id" >/dev/null 2>&1; then
    echo "::error::Enabling DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED requires Secret Manager secret ${driver_onboarding_code_pepper_secret} (DRIVER_ONBOARDING_CODE_PEPPER, at least 32 bytes)." >&2
    exit 1
  fi
  if ! gcloud secrets describe "$driver_onboarding_delivery_key_secret" --project "$project_id" >/dev/null 2>&1; then
    echo "::error::Enabling DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED requires Secret Manager secret ${driver_onboarding_delivery_key_secret} (DRIVER_ONBOARDING_DELIVERY_KEY, 64 hex)." >&2
    exit 1
  fi
  driver_onboarding_twilio_mounts=""
  for twilio_setting in TWILIO_ACCOUNT_SID TWILIO_API_KEY_SID TWILIO_API_KEY_SECRET TWILIO_FROM_NUMBER; do
    twilio_suffix="$(printf '%s' "$twilio_setting" | tr '[:upper:]_' '[:lower:]-')"
    twilio_secret="${secret_prefix}-${twilio_suffix}"
    if ! gcloud secrets describe "$twilio_secret" --project "$project_id" >/dev/null 2>&1; then
      echo "::error::Enabling DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED requires complete Twilio SMS secrets (missing ${twilio_secret})." >&2
      exit 1
    fi
    driver_onboarding_twilio_mounts="${driver_onboarding_twilio_mounts},${twilio_setting}=${twilio_secret}:latest"
  done
  driver_onboarding_mounts="DRIVER_ONBOARDING_CODE_PEPPER=${driver_onboarding_code_pepper_secret}:latest,DRIVER_ONBOARDING_DELIVERY_KEY=${driver_onboarding_delivery_key_secret}:latest${driver_onboarding_twilio_mounts}"
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "driver_onboarding_notifications_enabled=${driver_onboarding_notifications_enabled}" >> "$GITHUB_OUTPUT"
fi

printf '%s\n' "$driver_onboarding_mounts"
