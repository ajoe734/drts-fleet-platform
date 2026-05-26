#!/usr/bin/env bash
# claude-lane-keepalive.sh
#
# Successor to scripts/claude2-keepalive.sh. Exercises one or more Claude
# OAuth lanes to keep their refresh tokens warm — same problem, broader
# scope.
#
# Background:
# Claude Code OAuth tokens are designed for "IDE is always open" usage.
# When supervisor uses them for unattended backend dispatch, the token
# can decay between dispatch gaps and the next worker hits a 401 that
# halts the lane. The original `claude2-keepalive.sh` covered only the
# claude2 lane (which has no IDE driver session at all). The main claude
# lane has historically been lucky — the developer's IDE has been open
# 24/7, refreshing `~/.claude/.credentials.json` on every API call. That
# luck breaks the moment the IDE is closed, the host reboots, or the
# extension crashes.
#
# This script exercises whatever set of lanes the caller asks for, so a
# single systemd timer can keep every OAuth lane healthy without
# scattering one cron entry per lane.
#
# Each invocation issues a tiny --print call (haiku model, single-token
# reply) under the correct env for that lane, logs one structured line
# to .orchestrator/logs/claude-lane-keepalive.log, and exits non-zero if
# ANY lane fails so the systemd unit can surface the failure in
# `systemctl --user status`.
#
# Usage:
#   claude-lane-keepalive.sh                # exercises all known lanes
#   claude-lane-keepalive.sh claude2        # only claude2
#   claude-lane-keepalive.sh claude claude2 # multiple

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_BIN="${ROOT_DIR}/.orchestrator/bin/claude"
LOG_FILE="${ROOT_DIR}/.orchestrator/logs/claude-lane-keepalive.log"

# Default lane list when invoked with no args.
DEFAULT_LANES=(claude claude2)

if [[ $# -gt 0 ]]; then
  LANES=("$@")
else
  LANES=("${DEFAULT_LANES[@]}")
fi

mkdir -p "$(dirname "$LOG_FILE")"

timestamp() { date -u +%Y-%m-%dT%H:%M:%SZ; }

if [[ ! -x "$CLAUDE_BIN" ]]; then
  echo "$(timestamp) ERROR claude wrapper missing: $CLAUDE_BIN" >> "$LOG_FILE"
  exit 127
fi

# Truncate log past ~256 KB to bound disk usage.
if [[ -f "$LOG_FILE" ]] && [[ $(stat -c %s "$LOG_FILE") -gt 262144 ]]; then
  tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

run_lane() {
  local lane="$1"
  local env_kind env_val
  case "$lane" in
    claude)
      # Main lane: CLAUDE_CONFIG_DIR isolation so the keepalive does not
      # pollute the developer's IDE session sidebar.
      env_kind=CLAUDE_CONFIG_DIR
      env_val=/home/edna/.claude-autoworker
      ;;
    claude2)
      # Isolated personal-OAuth lane on a different account; uses HOME=
      # so the CLI's config-dir resolution looks under ~/.claude2-home/.
      env_kind=HOME
      env_val=/home/edna/.claude2-home
      ;;
    *)
      echo "$(timestamp) ERROR unknown lane=$lane" >> "$LOG_FILE"
      return 2
      ;;
  esac

  if [[ ! -d "$env_val" ]]; then
    echo "$(timestamp) ERROR lane=$lane $env_kind=$env_val: not a directory" >> "$LOG_FILE"
    return 127
  fi

  local start_ts rc out first
  start_ts=$(timestamp)
  if out=$(env "$env_kind=$env_val" timeout 60 "$CLAUDE_BIN" --print --model haiku 'reply: ok' 2>&1); then
    echo "$start_ts OK lane=$lane refresh ok" >> "$LOG_FILE"
    return 0
  else
    rc=$?
    first=$(printf '%s\n' "$out" | head -n 1 | tr -d '\r')
    echo "$start_ts FAIL lane=$lane rc=$rc msg=$first" >> "$LOG_FILE"
    return "$rc"
  fi
}

overall_rc=0
for lane in "${LANES[@]}"; do
  if ! run_lane "$lane"; then
    overall_rc=1
  fi
done

exit "$overall_rc"
