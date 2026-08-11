from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from adapters.base import DeliveryRequest
from adapters.claude_cli import ClaudeCLIAdapter


class ClaudeCLIAdapterTests(unittest.TestCase):
    def test_claude_command_uses_provider_model_and_task_override(self) -> None:
        config = {
            "paths": {"status_file": "/canonical/ai-status.json"},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
                "claude2": {"id": "claude2", "display_name": "Claude2", "provider": "claude2"},
            },
            "providers": {
                "claude": {"runtime": {"cli": "claude", "model": "claude-sonnet-5"}},
                "claude2": {"runtime": {"cli": "claude", "model": "claude-sonnet-5"}},
            },
        }
        process = mock.Mock(pid=43210)
        with (
            mock.patch("adapters.claude_cli.command_exists", return_value="/usr/bin/claude"),
            mock.patch("adapters.claude_cli._claude_auth_ready", return_value=True),
            mock.patch("adapters.claude_cli.spawn_background_process", return_value=(process, Path("/tmp/claude.log"))) as spawn,
            mock.patch("adapters.claude_cli.runtime_log_path", return_value=Path("/tmp/claude.log")),
            mock.patch("adapters.claude_cli.new_runtime_id", return_value="claude-test"),
        ):
            for agent_id, expected_model, metadata in (
                ("claude", "claude-sonnet-5", {}),
                ("claude2", "claude-fable-5", {"model_preference": "claude-fable-5"}),
            ):
                with self.subTest(agent_id=agent_id):
                    request = DeliveryRequest(
                        agent_id=agent_id,
                        provider=agent_id,
                        delivery_mode="claude_cli",
                        message="wake up",
                        task_id="OPS-CLAUDE-001",
                        metadata=metadata,
                    )
                    result = ClaudeCLIAdapter(config=config, provider_capabilities={}).deliver(request)
                    command = spawn.call_args.args[0]
                    self.assertTrue(result.ok)
                    self.assertEqual(command[command.index("--model") + 1], expected_model)

    def test_claude_cli_resolves_from_configured_workspace_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            status_file = tmp / "canonical" / "ai-status.json"
            status_file.parent.mkdir()
            status_file.write_text('{"tasks":[]}', encoding="utf-8")
            local_cli = status_file.parent / ".orchestrator" / "bin" / "claude"
            local_cli.parent.mkdir(parents=True)
            local_cli.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            local_cli.chmod(0o755)
            config = {
                "paths": {"status_file": str(status_file)},
                "agents": {
                    "claude2": {
                        "id": "claude2",
                        "display_name": "Claude2",
                        "provider": "claude2",
                        "adapter": "claude_cli",
                    }
                },
                "providers": {
                    "claude2": {
                        "delivery_mode": "claude_cli",
                        "runtime": {"cli": "claude", "output_format": "stream-json"},
                    }
                },
            }
            request = DeliveryRequest(
                agent_id="claude2",
                provider="claude2",
                delivery_mode="claude_cli",
                message="wake up",
                task_id="OPS-CLAUDE-001",
            )
            process = mock.Mock()
            process.pid = 43210
            with (
                mock.patch.dict(os.environ, {"PATH": ""}),
                mock.patch("adapters.claude_cli._claude_auth_ready", return_value=True),
                mock.patch("adapters.claude_cli.spawn_background_process", return_value=(process, Path("/tmp/claude.log"))) as spawn,
                mock.patch("adapters.claude_cli.runtime_log_path", return_value=Path("/tmp/claude.log")),
                mock.patch("adapters.claude_cli.new_runtime_id", return_value="claude2-test"),
            ):
                result = ClaudeCLIAdapter(config=config, provider_capabilities={}).deliver(request)

        self.assertTrue(result.ok)
        self.assertEqual(result.mode, "claude_cli")
        self.assertEqual(spawn.call_args.args[0][0], str(local_cli))


if __name__ == "__main__":
    unittest.main()
