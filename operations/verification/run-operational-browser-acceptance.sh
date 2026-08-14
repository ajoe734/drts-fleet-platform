#!/usr/bin/env bash
set -euo pipefail

# This gate intentionally starts no local services: its evidence is only valid
# against the candidate already deployed by the normal Dev workflow.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

CANDIDATE_SHA="${DRTS_CANDIDATE_SHA:-}"
SOURCE_MANIFEST="${DRTS_OPERATIONAL_BROWSER_JOURNEYS_FILE:-tests/e2e/fixtures/operational-browser-journeys.json}"
CANDIDATE_SURFACE_MANIFEST="${DRTS_OPERATIONAL_CANDIDATE_MANIFEST_FILE:-tests/e2e/fixtures/candidate-journey-manifest.json}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) CANDIDATE_SHA="${2:-}"; shift 2 ;;
    --manifest) SOURCE_MANIFEST="${2:-}"; shift 2 ;;
    *) echo "Usage: $0 --sha <40-hex-sha> [--manifest <path>]" >&2; exit 2 ;;
  esac
done
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::candidate SHA must be a full lowercase immutable Git SHA" >&2; exit 1; }
[[ -f "$SOURCE_MANIFEST" ]] || { echo "::error::journey manifest not found: $SOURCE_MANIFEST" >&2; exit 1; }
[[ -f "$CANDIDATE_SURFACE_MANIFEST" ]] || { echo "::error::candidate surface manifest not found: $CANDIDATE_SURFACE_MANIFEST" >&2; exit 1; }

MATERIALIZED_MANIFEST="$(mktemp "${TMPDIR:-/tmp}/drts-operational-journeys.XXXXXX.json")"
MATERIALIZED_SURFACE_MANIFEST="$(mktemp "${TMPDIR:-/tmp}/drts-candidate-surfaces.XXXXXX.json")"
trap 'rm -f "$MATERIALIZED_MANIFEST" "$MATERIALIZED_SURFACE_MANIFEST"' EXIT
sed "s/__SET_DRTS_CANDIDATE_SHA__/${CANDIDATE_SHA}/g" "$SOURCE_MANIFEST" > "$MATERIALIZED_MANIFEST"
sed "s/__DRTS_CANDIDATE_SHA__/${CANDIDATE_SHA}/g" "$CANDIDATE_SURFACE_MANIFEST" > "$MATERIALIZED_SURFACE_MANIFEST"
export DRTS_CANDIDATE_SHA="$CANDIDATE_SHA"
export DRTS_OPERATIONAL_BROWSER_JOURNEYS_FILE="$MATERIALIZED_MANIFEST"
export DRTS_OPERATIONAL_MANIFEST="$MATERIALIZED_SURFACE_MANIFEST"

: "${DRTS_DEV_API_BASE_URL:?missing API deployed URL}"
: "${DRTS_DEV_OPS_CONSOLE_BASE_URL:?missing Ops Console deployed URL}"
: "${DRTS_DEV_REFERRAL_EMBED_BASE_URL:?missing referral deployed URL}"
: "${DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL:?missing enterprise deployed URL}"
: "${DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL:?missing fleet deployed URL}"
: "${DRTS_DEV_PLATFORM_ADMIN_BASE_URL:?missing platform admin deployed URL}"
: "${DRTS_DEV_TENANT_CONSOLE_BASE_URL:?missing tenant console deployed URL}"
: "${DRTS_DEV_BANK_CONSOLE_BASE_URL:?missing bank deployed URL}"
: "${DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL:?missing channel deployed URL}"
: "${DRTS_DEV_PARTNER_BOOKING_BASE_URL:?missing paused Partner Booking URL}"
: "${DRTS_DEV_CONCIERGE_BASE_URL:?missing retired Concierge URL}"
: "${DRTS_DEV_PASSENGER_BASE_URL:?missing retired Passenger URL}"

export DRTS_OPERATIONAL_API_URL="$DRTS_DEV_API_BASE_URL"
export DRTS_OPERATIONAL_PLATFORM_ADMIN_URL="$DRTS_DEV_PLATFORM_ADMIN_BASE_URL"
export DRTS_OPERATIONAL_OPS_CONSOLE_URL="$DRTS_DEV_OPS_CONSOLE_BASE_URL"
export DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_URL="$DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL"
export DRTS_OPERATIONAL_TENANT_CONSOLE_URL="$DRTS_DEV_TENANT_CONSOLE_BASE_URL"
export DRTS_OPERATIONAL_BANK_CONSOLE_URL="$DRTS_DEV_BANK_CONSOLE_BASE_URL"
export DRTS_OPERATIONAL_REFERRAL_EMBED_URL="$DRTS_DEV_REFERRAL_EMBED_BASE_URL"
export DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_URL="$DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL"
export DRTS_OPERATIONAL_CHANNEL_PARTNER_PORTAL_URL="$DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL"
export DRTS_OPERATIONAL_PARTNER_BOOKING_URL="$DRTS_DEV_PARTNER_BOOKING_BASE_URL"
export DRTS_OPERATIONAL_CONCIERGE_PORTAL_URL="$DRTS_DEV_CONCIERGE_BASE_URL"
export DRTS_OPERATIONAL_PASSENGER_WEB_URL="$DRTS_DEV_PASSENGER_BASE_URL"

# First prove every active API/BFF response serves this exact candidate. Then
# execute the higher-level browser mutations and readbacks against those same URLs.
npx playwright test -c playwright.operational-candidate.config.ts "$@"
npx playwright test -c playwright.operational-browser-acceptance.config.ts "$@"
