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

  case "$(lower "${MAP_PROVIDER_DEPLOYMENT_TIER:-${APP_ENV:-${NODE_ENV:-local}}}")" in
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

check_secret_present() {
  local secret_name="$1"
  if ! gcloud secrets describe "$secret_name" --project "$MAP_PROVIDER_PROJECT_ID" >/dev/null 2>&1; then
    MISSING+=("secret:${secret_name}")
  fi
}

TIER="$(detect_tier)"
BACKEND="$(lower "${MAP_PROVIDER_BACKEND:-mock}")"
STRICT_RUNTIME='false'

case "$BACKEND" in
  mock|google ) ;;
  * )
    echo "MAP provider config check: MAP_PROVIDER_BACKEND must be one of: mock, google (received '${BACKEND}')." >&2
    exit 1
    ;;
esac

case "$TIER" in
  staging|production ) STRICT_RUNTIME='true' ;;
esac

if [[ "$BACKEND" == "mock" ]]; then
  echo "MAP provider config check: backend=mock tier=${TIER}; deterministic mock mode is active."
  exit 0
fi

SECRET_SOURCE="$(lower "${MAP_PROVIDER_SECRET_SOURCE:-env}")"
REQUIRE_BROWSER_KEY="$(parse_bool "${MAP_PROVIDER_REQUIRE_BROWSER_KEY:-false}")"
REQUIRE_ANDROID_KEY="$(parse_bool "${MAP_PROVIDER_REQUIRE_ANDROID_KEY:-false}")"
REQUIRE_IOS_KEY="$(parse_bool "${MAP_PROVIDER_REQUIRE_IOS_KEY:-false}")"
REQUIRE_WEB_CSP_READY="$(parse_bool "${MAP_PROVIDER_REQUIRE_WEB_CSP_READY:-false}")"

MISSING=()

case "$SECRET_SOURCE" in
  env )
    check_env_present "GOOGLE_MAPS_GEOCODING_API_KEY"
    check_env_present "GOOGLE_MAPS_ROUTES_API_KEY"
    ;;
  secret_manager )
    : "${MAP_PROVIDER_PROJECT_ID:?MAP_PROVIDER_PROJECT_ID is required when MAP_PROVIDER_SECRET_SOURCE=secret_manager}"
    : "${MAP_PROVIDER_SECRET_PREFIX:?MAP_PROVIDER_SECRET_PREFIX is required when MAP_PROVIDER_SECRET_SOURCE=secret_manager}"
    check_secret_present "${MAP_PROVIDER_SECRET_PREFIX}-google-maps-geocoding-api-key"
    check_secret_present "${MAP_PROVIDER_SECRET_PREFIX}-google-maps-routes-api-key"
    ;;
  * )
    echo "MAP provider config check: MAP_PROVIDER_SECRET_SOURCE must be env or secret_manager (received '${SECRET_SOURCE}')." >&2
    exit 1
    ;;
esac

if [[ "$REQUIRE_BROWSER_KEY" == "true" ]]; then
  check_env_present "GOOGLE_MAPS_BROWSER_KEY"
  check_env_present "MAP_PROVIDER_ALLOWED_ORIGINS"
fi

if [[ "$REQUIRE_WEB_CSP_READY" == "true" && "$(parse_bool "${MAP_PROVIDER_WEB_CSP_READY:-false}")" != "true" ]]; then
  MISSING+=("MAP_PROVIDER_WEB_CSP_READY")
fi

if [[ "$REQUIRE_ANDROID_KEY" == "true" ]]; then
  check_env_present "GOOGLE_MAPS_ANDROID_KEY"
  check_env_present "GOOGLE_MAPS_ANDROID_PACKAGE"
  check_env_present "GOOGLE_MAPS_ANDROID_SHA1_CERTS"
fi

if [[ "$REQUIRE_IOS_KEY" == "true" ]]; then
  check_env_present "GOOGLE_MAPS_IOS_KEY"
  check_env_present "GOOGLE_MAPS_IOS_BUNDLE_ID"
fi

if (( ${#MISSING[@]} > 0 )); then
  if [[ "$STRICT_RUNTIME" == "true" ]]; then
    echo "MAP provider config check: backend=google tier=${TIER} is fail-closed; missing required config: ${MISSING[*]}" >&2
    exit 1
  fi

  echo "MAP provider config check: backend=google tier=${TIER}; live config is incomplete (${MISSING[*]}), so local/CI should remain on the deterministic mock provider."
  exit 0
fi

echo "MAP provider config check: backend=google tier=${TIER}; live server-side config is ready."
