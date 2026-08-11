from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ORCHESTRATOR_DIR = Path(__file__).resolve().parent
SERVER = ORCHESTRATOR_DIR / "claude_permission_prompt_mcp.py"


class ClaudePermissionPromptMcpTests(unittest.TestCase):
    def test_stdio_uses_newline_delimited_json_rpc(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.json"
            config_path.write_text("{}\n", encoding="utf-8")
            request = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "test", "version": "1"},
                },
            }
            result = subprocess.run(
                [sys.executable, str(SERVER), "--config", str(config_path)],
                input=json.dumps(request) + "\n",
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        response = json.loads(result.stdout.strip())
        self.assertEqual(response["id"], 1)
        self.assertEqual(response["result"]["serverInfo"]["name"], "orchestrator_approval_broker")
        self.assertEqual(response["result"]["protocolVersion"], "2024-11-05")


if __name__ == "__main__":
    unittest.main()
