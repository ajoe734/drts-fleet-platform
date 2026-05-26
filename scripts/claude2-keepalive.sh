#!/usr/bin/env bash
# claude2-keepalive.sh
#
# Why this script exists:
# The claude2 lane runs against `HOME=~/.claude2-home`, which has no
# long-lived "driver" session like the IDE's main claude lane does. When
# supervisor dispatch gaps exceed the OAuth refresh-token grace period
# (~8 h in observed behaviour), the next dispatched worker hits
# `API Error: 401 Invalid authentication credentials` and the lane goes
# auth-paused. Reauth requires an interactive OAuth round-trip, which
# blocks unattended dispatch.
#
# This keepalive issues a minimal --print invocation every cron tick to
# (a) keep the refresh token "warm" and (b) trigger the claude CLI's
# in-band token-refresh write. The call is cheap (haiku model, single
# token reply) and idempotent. If it fails, we log the symptom so the
# operator can see the lane is degrading before the next real dispatch
# fails.
#
# Designed to be invoked from cron every 30 minutes. Margin: token TTL
# observed at ~8 h, so 30 min cadence gives ~16x safety margin.
#
# See feedback_autoworker_creds_symlink.md for the underlying mechanism
# and the related main-lane symlink workaround that we *cannot* use here
# without merging the bjoe734 / ajoe734 account quotas.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_BIN="${ROOT_DIR}/.orchestrator/bin/claude"
LOG_FILE="${ROOT_DIR}/.orchestrator/logs/claude2-keepalive.log"
CLAUDE2_HOME="/home/edna/.claude2-home"

mkdir -p "$(dirname "$LOG_FILE")"

timestamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

if [[ ! -x "$CLAUDE_BIN" ]]; then
  echo "$(timestamp) ERROR claude wrapper missing: $CLAUDE_BIN" >> "$LOG_FILE"
  exit 127
fi

if [[ ! -d "$CLAUDE2_HOME" ]]; then
  echo "$(timestamp) ERROR claude2 home missing: $CLAUDE2_HOME" >> "$LOG_FILE"
  exit 127
fi

# Truncate log if it grows past ~256 KB to bound disk usage.
if [[ -f "$LOG_FILE" ]] && [[ $(stat -c %s "$LOG_FILE") -gt 262144 ]]; then
  tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

start_ts=$(timestamp)
if out=$(HOME="$CLAUDE2_HOME" timeout 60 "$CLAUDE_BIN" --print --model haiku 'reply: ok' 2>&1); then
  echo "$start_ts OK refresh ok" >> "$LOG_FILE"
  exit 0
else
  rc=$?
  # First line of stderr/stdout is usually the actionable signal
  first=$(printf '%s\n' "$out" | head -n 1 | tr -d '\r')
  echo "$start_ts FAIL rc=$rc msg=$first" >> "$LOG_FILE"
  exit "$rc"
fi
