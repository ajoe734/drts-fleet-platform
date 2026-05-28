#!/usr/bin/env bash
# lane-health.sh
#
# Inspect each Claude OAuth lane's credentials.json and report the
# remaining time-to-expiry for its access token. Writes a structured
# JSON line per lane to .orchestrator/logs/lane-health.jsonl so the
# velocity dashboard (or any other observer) can surface impending
# token expiry BEFORE the supervisor hits a 401.
#
# Exit code:
#   0 — all checked lanes have > warn_threshold seconds remaining.
#   1 — at least one lane is below warn_threshold (default 1800s = 30m).
#   2 — at least one lane could not be inspected at all (missing creds).
#
# This script is intended to be run alongside the keepalive timer (or
# more frequently if desired). It does NOT touch the credentials files
# or attempt any refresh; it is pure observation.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="${ROOT_DIR}/.orchestrator/logs/lane-health.jsonl"
WARN_THRESHOLD_SECONDS="${LANE_HEALTH_WARN_SECONDS:-1800}"

mkdir -p "$(dirname "$LOG_FILE")"

timestamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# (lane, credentials_path) pairs. Add new lanes here as they get OAuth-
# managed credentials files.
LANES=(
  "claude:/home/edna/.claude-autoworker/.credentials.json"
  "claude2:/home/edna/.claude2-home/.claude/.credentials.json"
)

# Truncate jsonl log past ~512 KB.
if [[ -f "$LOG_FILE" ]] && [[ $(stat -c %s "$LOG_FILE") -gt 524288 ]]; then
  tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

overall_rc=0
ts=$(timestamp)

for pair in "${LANES[@]}"; do
  lane="${pair%%:*}"
  creds="${pair#*:}"

  if [[ ! -f "$creds" ]]; then
    printf '{"ts":"%s","lane":"%s","status":"missing","creds":"%s"}\n' \
      "$ts" "$lane" "$creds" >> "$LOG_FILE"
    overall_rc=2
    continue
  fi

  # Extract expiresAt (ms epoch) via python — avoids dragging jq in.
  expiry_seconds=$(python3 -c "
import json, sys
try:
    with open('$creds') as f:
        c = json.load(f)
    co = c.get('claudeAiOauth', {})
    exp = co.get('expiresAt')
    print(int(exp / 1000) if exp else 0)
except Exception:
    print(0)
" 2>/dev/null || echo 0)

  if [[ "$expiry_seconds" == "0" ]]; then
    printf '{"ts":"%s","lane":"%s","status":"unreadable","creds":"%s"}\n' \
      "$ts" "$lane" "$creds" >> "$LOG_FILE"
    overall_rc=2
    continue
  fi

  now_seconds=$(date -u +%s)
  ttl_seconds=$(( expiry_seconds - now_seconds ))

  if [[ "$ttl_seconds" -lt 0 ]]; then
    status=expired
    overall_rc=1
  elif [[ "$ttl_seconds" -lt "$WARN_THRESHOLD_SECONDS" ]]; then
    status=warn
    overall_rc=1
  else
    status=ok
  fi

  printf '{"ts":"%s","lane":"%s","status":"%s","ttl_seconds":%d,"expires_at":%d}\n' \
    "$ts" "$lane" "$status" "$ttl_seconds" "$expiry_seconds" >> "$LOG_FILE"
done

exit "$overall_rc"
