#!/usr/bin/env bash
set -euo pipefail

# This gate intentionally starts no local services: its evidence is only valid
# against the candidate already deployed by the normal Dev workflow.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--resolve-referral-entry-host" ]]; then
  [[ "$#" -eq 1 ]] || { echo "Referral entry host resolution takes no extra arguments." >&2; exit 2; }
  [[ -n "${DRTS_REFERRAL_HOST_API_ID_TOKEN:-}" ]] || { echo "Referral entry host API invocation proof is required." >&2; exit 1; }
  umask 077
  response_dir="$(mktemp -d "${TMPDIR:-/tmp}/drts-referral-entry-host.XXXXXX")"
  trap 'rm -rf "$response_dir"' EXIT
  entry_url="$(python3 - <<'PY_ENTRY_URL'
import os
import re
import sys
from urllib.parse import quote, urlsplit

origin = os.environ.get("DRTS_DEV_API_BASE_URL", "")
slug = os.environ.get("DRTS_REFERRAL_ENTRY_SLUG", "")
candidate = os.environ.get("DRTS_CANDIDATE_SHA", "")
try:
    url = urlsplit(origin)
    if (url.scheme != "https" or not url.hostname or url.username or url.password
            or url.path not in ("", "/") or url.query or url.fragment
            or any(c.isspace() for c in origin)
            or not re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug)
            or not re.fullmatch(r"[a-f0-9]{40}", candidate)):
        raise ValueError()
    print(origin.rstrip("/") + "/api/partner/entries/" + quote(slug, safe=""))
except ValueError:
    sys.exit("Invalid Referral entry host resolution input.")
PY_ENTRY_URL
  )"
  status="$(curl --silent --show-error \
    --request GET --proto '=https' --max-redirs 0 \
    --connect-timeout 10 --max-time 30 --max-filesize 65536 \
    --header "X-Serverless-Authorization: Bearer ${DRTS_REFERRAL_HOST_API_ID_TOKEN}" \
    --dump-header "$response_dir/headers" --output "$response_dir/body" \
    --write-out '%{http_code}' "$entry_url")"
  [[ "$status" == "200" ]] || { echo "Referral entry host GET did not return HTTP 200." >&2; exit 1; }
  python3 - "$response_dir/body" "$response_dir/headers" <<'PY_ENTRY_HOST'
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

try:
    headers = Path(sys.argv[2]).read_text().splitlines()
    served = [line.split(":", 1)[1].strip() for line in headers
              if line.split(":", 1)[0].lower() == "x-drts-candidate-sha"]
    if served != [os.environ["DRTS_CANDIDATE_SHA"]]:
        raise ValueError()
    data = json.loads(Path(sys.argv[1]).read_text())["data"]
    if not isinstance(data, dict):
        raise ValueError()
    def field(snake, camel):
        if snake in data and camel in data and data[snake] != data[camel]:
            raise ValueError()
        return data.get(snake, data.get(camel))
    if field("entry_slug", "entrySlug") != os.environ["DRTS_REFERRAL_ENTRY_SLUG"]:
        raise ValueError()
    host = field("entry_host", "entryHost")
    label = r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    if (not isinstance(host, str) or len(host) > 259
            or not re.fullmatch(label + r"(?:\." + label + r")*(?::[0-9]{1,5})?", host)):
        raise ValueError()
    parsed = urlsplit("https://" + host)
    if parsed.port is not None and not 1 <= parsed.port <= 65535:
        raise ValueError()
    print(host)
except (KeyError, TypeError, ValueError, OSError):
    sys.exit("Invalid canonical Referral entry host response.")
PY_ENTRY_HOST
  exit 0
fi

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
: "${DRTS_OPERATIONAL_TENANT_SESSION_TOKEN:?missing deployment-issued tenant acceptance session}"
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

export DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN="${DRTS_DEV_TENANT_CONSOLE_ID_TOKEN:-${DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN:-}}"
export DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN="${DRTS_DEV_BANK_CONSOLE_ID_TOKEN:-${DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN:-}}"
export DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN="${DRTS_DEV_ENTERPRISE_DISPATCH_ID_TOKEN:-${DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN:-}}"
export DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN="${DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN:-${DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN:-}}"
export DRTS_OPERATIONAL_OPS_CONSOLE_ID_TOKEN="${DRTS_DEV_OPS_CONSOLE_ID_TOKEN:-${DRTS_OPERATIONAL_OPS_CONSOLE_ID_TOKEN:-}}"
export DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_ID_TOKEN="${DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN:-${DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_ID_TOKEN:-}}"
export DRTS_OPERATIONAL_CHANNEL_PARTNER_PORTAL_ID_TOKEN="${DRTS_DEV_CHANNEL_PARTNER_PORTAL_ID_TOKEN:-${DRTS_OPERATIONAL_CHANNEL_PARTNER_PORTAL_ID_TOKEN:-}}"
export DRTS_DEV_TENANT_CONSOLE_ID_TOKEN="${DRTS_OPERATIONAL_TENANT_CONSOLE_ID_TOKEN}"
export DRTS_DEV_BANK_CONSOLE_ID_TOKEN="${DRTS_OPERATIONAL_BANK_CONSOLE_ID_TOKEN}"
export DRTS_DEV_ENTERPRISE_DISPATCH_ID_TOKEN="${DRTS_OPERATIONAL_ENTERPRISE_DISPATCH_ID_TOKEN}"
export DRTS_DEV_PLATFORM_ADMIN_ID_TOKEN="${DRTS_OPERATIONAL_PLATFORM_ADMIN_ID_TOKEN}"
export DRTS_DEV_OPS_CONSOLE_ID_TOKEN="${DRTS_OPERATIONAL_OPS_CONSOLE_ID_TOKEN}"
export DRTS_DEV_FLEET_PARTNER_PORTAL_ID_TOKEN="${DRTS_OPERATIONAL_FLEET_PARTNER_PORTAL_ID_TOKEN}"
export DRTS_DEV_CHANNEL_PARTNER_PORTAL_ID_TOKEN="${DRTS_OPERATIONAL_CHANNEL_PARTNER_PORTAL_ID_TOKEN}"

# First prove every active API/BFF response serves this exact candidate. Then
# execute the higher-level browser mutations and readbacks against those same URLs.
npx playwright test -c playwright.operational-candidate.config.ts "$@"
npx playwright test -c playwright.operational-browser-acceptance.config.ts "$@"
