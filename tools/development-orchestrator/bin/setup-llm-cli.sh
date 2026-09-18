#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

cat > "$ROOT_DIR/.orchestrator/claude-approval-broker.mcp.json" <<EOF
{
  "mcpServers": {
    "orchestrator_approval_broker": {
      "command": "python3",
      "args": [
        "$ROOT_DIR/tools/development-orchestrator/claude_permission_prompt_mcp.py",
        "--config",
        "$ROOT_DIR/.orchestrator/config.json"
      ],
      "env": {
        "PYTHONUNBUFFERED": "1"
      }
    }
  }
}
EOF

python3 "$ROOT_DIR/tools/development-orchestrator/sync_provider_permissions.py" --apply >/dev/null
bash "$ROOT_DIR/tools/development-orchestrator/bin/ai-status.sh" sync >/dev/null
FIRST_PROMPT="$(bash "$ROOT_DIR/tools/development-orchestrator/bin/ai-status.sh" prompt)"

cat <<EOF
LLM CLI setup applied for: $ROOT_DIR

Next steps:
1. Start supervisor
   bash tools/development-orchestrator/bin/run-supervisor.sh --verbose

2. Start dashboard
   bash tools/development-orchestrator/bin/run-dashboard.sh

3. If you need a temporary public URL for the dashboard
   bash tools/development-orchestrator/bin/run-dashboard-tunnel.sh

4. In each LLM CLI, use this first prompt:
   $FIRST_PROMPT

5. As the repo gains project-specific architecture or backlog docs, update
   AI_COLLABORATION_GUIDE.md and ai-status.json canonical layers so the prompt
   stays aligned with the repo's real source of truth.
EOF
