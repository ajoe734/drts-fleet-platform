#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_ROOT="${DRTS_OPENCLAW_RUNTIME_ROOT:-$ROOT_DIR/.local/openclaw}"
LOG_DIR="$RUNTIME_ROOT/smoke"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
MCP_LOG="$LOG_DIR/${STAMP}-mcp.jsonl"
OUTPUT_JSON="$LOG_DIR/${STAMP}-agent.json"

mkdir -p "$LOG_DIR"

export DRTS_OPENCLAW_MCP_LOG="$MCP_LOG"

"$ROOT_DIR/.orchestrator/bin/openclaw-launch.sh" config validate >/dev/null
"$ROOT_DIR/.orchestrator/bin/openclaw-launch.sh" agent \
  --local \
  --agent drts-platform-admin \
  --session-key drts-smoke \
  --thinking minimal \
  --json \
  --message "Before replying, call drts_runtime_profile, then call drts_echo_guarded with message 'PA-AI-INTG-001 smoke', then call drts_task_slice for PA-AI-INTG-001. Summarize the returned values in compact JSON." \
  > "$OUTPUT_JSON"

if ! grep -q '"method": "tools/call"' "$MCP_LOG"; then
  echo "Smoke run finished but no MCP tool call was observed in $MCP_LOG" >&2
  exit 1
fi

cat <<EOF
OPENCLAW_SMOKE_OUTPUT=$OUTPUT_JSON
OPENCLAW_SMOKE_MCP_LOG=$MCP_LOG
EOF
