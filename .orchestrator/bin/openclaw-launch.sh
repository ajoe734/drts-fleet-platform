#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_ROOT="${DRTS_OPENCLAW_RUNTIME_ROOT:-$ROOT_DIR/.local/openclaw}"
PROFILE_NAME="${DRTS_OPENCLAW_PROFILE:-platform-admin}"
OPENCLAW_HOME_DIR="${OPENCLAW_HOME:-$RUNTIME_ROOT/home/$PROFILE_NAME}"
OPENCLAW_CONFIG_FILE="${OPENCLAW_CONFIG_PATH:-$OPENCLAW_HOME_DIR/openclaw.json}"
MODEL="${DRTS_OPENCLAW_MODEL:-openai/gpt-5.5}"
MCP_SERVER="$ROOT_DIR/.orchestrator/adapters/openclaw_drts_mcp.py"
STATUS_ROOT="${ORCH_STATUS_ROOT:-${AI_STATUS_ROOT:-$ROOT_DIR}}"

bootstrap_env="$("$ROOT_DIR/.orchestrator/bin/openclaw-bootstrap.sh")"
eval "$bootstrap_env"

mkdir -p "$OPENCLAW_HOME_DIR"

if [[ -n "${DRTS_OPENCLAW_IAP_TOKEN_COMMAND:-}" && -z "${DRTS_OPENCLAW_BEARER_TOKEN:-}" ]]; then
  DRTS_OPENCLAW_BEARER_TOKEN="$(bash -lc "$DRTS_OPENCLAW_IAP_TOKEN_COMMAND")"
  export DRTS_OPENCLAW_BEARER_TOKEN
fi

if [[ -n "${DRTS_OPENCLAW_BEARER_TOKEN:-}" ]]; then
  token_injected="true"
else
  token_injected="false"
fi

python3 - "$ROOT_DIR/.orchestrator/openclaw/runtime-profile.template.json" \
  "$OPENCLAW_CONFIG_FILE" \
  "$ROOT_DIR" \
  "$MODEL" \
  "$MCP_SERVER" \
  "$STATUS_ROOT" \
  "$token_injected" <<'PY'
import json
import sys
from pathlib import Path

template_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
repo_root = sys.argv[3]
model = sys.argv[4]
mcp_server = sys.argv[5]
status_root = sys.argv[6]
token_injected = sys.argv[7]

payload = template_path.read_text(encoding="utf-8")
for key, value in {
    "__WORKSPACE__": repo_root,
    "__REPO_ROOT__": repo_root,
    "__MODEL__": model,
    "__MCP_SERVER__": mcp_server,
    "__STATUS_ROOT__": status_root,
    "__TOKEN_INJECTED__": token_injected,
}.items():
    payload = payload.replace(key, value)
parsed = json.loads(payload)
output_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

export OPENCLAW_HOME="$OPENCLAW_HOME_DIR"
export OPENCLAW_CONFIG_PATH="$OPENCLAW_CONFIG_FILE"
export ORCH_STATUS_ROOT="$STATUS_ROOT"
export AI_STATUS_ROOT="$STATUS_ROOT"
export DRTS_OPENCLAW_TOKEN_INJECTED="$token_injected"

exec "$OPENCLAW_CLI" "$@"
