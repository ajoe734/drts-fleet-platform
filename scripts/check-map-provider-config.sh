#!/usr/bin/env bash
set -euo pipefail

lower() {
  printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'
}

parse_bool() {
  local raw normalized
  raw="${1:-}"
  normalized="$(lower "$raw")"
  case "$normalized" in
    "" ) printf 'false' ;;
    true|1|yes ) printf 'true' ;;
    false|0|no ) printf 'false' ;;
    * )
      echo "MAP provider config check: boolean value '${raw}' is invalid." >&2
      exit 1
      ;;
  esac
}

detect_tier() {
  if [[ "$(parse_bool "${CI:-false}")" == "true" ]]; then
    printf 'ci'
    return
  fi

  case "$(lower "${DRTS_ENV:-${MAP_PROVIDER_DEPLOYMENT_TIER:-${APP_ENV:-${NODE_ENV:-local}}}}")" in
    production|prod ) printf 'production' ;;
    staging|stage ) printf 'staging' ;;
    ci ) printf 'ci' ;;
    * ) printf 'local' ;;
  esac
}

check_env_present() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    MISSING+=("$name")
  fi
}

TIER="$(detect_tier)"
MODE="$(lower "${MAP_PROVIDER_MODE:-mock}")"
PROVIDER_NAME="$(lower "${MAP_PROVIDER_NAME:-google}")"
STRICT_RUNTIME='false'

case "$MODE" in
  mock|external|disabled ) ;;
  * )
    echo "MAP provider config check: MAP_PROVIDER_MODE must be one of: mock, external, disabled (received '${MODE}')." >&2
    exit 1
    ;;
esac

case "$TIER" in
  staging|production ) STRICT_RUNTIME='true' ;;
esac

if [[ "$MODE" == "disabled" ]]; then
  echo "MAP provider config check: mode=disabled tier=${TIER}; provider-backed map/geocode flows remain fail-closed." >&2
  if [[ "$STRICT_RUNTIME" == "true" ]]; then
    exit 1
  fi
  exit 0
fi

ALLOW_MOCK_IN_PROD="$(parse_bool "${MAP_PROVIDER_ALLOW_MOCK_IN_PROD:-false}")"

MISSING=()

if [[ "$MODE" == "mock" ]]; then
  if [[ "$STRICT_RUNTIME" == "true" && "$ALLOW_MOCK_IN_PROD" != "true" ]]; then
    echo "MAP provider config check: mode=mock tier=${TIER} is fail-closed unless MAP_PROVIDER_ALLOW_MOCK_IN_PROD=true." >&2
    exit 1
  fi
  echo "MAP provider config check: mode=mock tier=${TIER}; deterministic mock mode is active."
  exit 0
fi

if [[ "$MODE" == "external" && "$PROVIDER_NAME" != "google" ]]; then
  echo "MAP provider config check: MAP_PROVIDER_NAME must currently be google for release scope (received '${PROVIDER_NAME}')." >&2
  exit 1
fi

check_env_present "MAP_PROVIDER_SERVER_KEY"
check_env_present "MAP_PROVIDER_BROWSER_KEY"
check_env_present "MAP_PROVIDER_ALLOWED_ORIGINS"
check_env_present "MAP_PROVIDER_MOBILE_BUNDLE_IDS"
check_env_present "MAP_PROVIDER_MOBILE_PACKAGE_NAMES"
check_env_present "MAP_PROVIDER_DAILY_QUOTA"
check_env_present "MAP_PROVIDER_MINUTE_QUOTA"
check_env_present "MAP_PROVIDER_QUOTA_WARNING_PERCENT"
check_env_present "MAP_PROVIDER_QUOTA_CRITICAL_PERCENT"

if (( ${#MISSING[@]} > 0 )); then
  if [[ "$STRICT_RUNTIME" == "true" ]]; then
    echo "MAP provider config check: mode=external provider=${PROVIDER_NAME} tier=${TIER} is fail-closed; missing required config: ${MISSING[*]}" >&2
    exit 1
  fi

  echo "MAP provider config check: mode=external provider=${PROVIDER_NAME} tier=${TIER}; live config is incomplete (${MISSING[*]}), so local/CI should remain on the deterministic mock provider."
  exit 0
fi

echo "MAP provider config check: mode=external provider=${PROVIDER_NAME} tier=${TIER}; required config inputs are present."
