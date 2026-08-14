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
from adapters.gemini import GeminiAdapter


class GeminiAdapterTests(unittest.TestCase):
    def test_gemini_command_includes_extra_workspace_directories(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            tenant_repo = tmp / "tenant-commute-hub"
            tenant_repo.mkdir()
            status_file = tmp / "drts-fleet-platform" / "ai-status.json"
            status_file.parent.mkdir()
            status_file.write_text('{"tasks":[]}', encoding="utf-8")
            config = {
                "paths": {"status_file": str(status_file)},
                "agents": {
                    "gemini2": {
                        "id": "gemini2",
                        "display_name": "Gemini2",
                        "provider": "gemini2",
                        "adapter": "gemini",
                    }
                },
                "providers": {
                    "gemini2": {
                        "delivery_mode": "gemini",
                        "gemini": {
                            "cli": "gemini",
                            "include_directories": True,
                            "extra_include_directories": [str(tenant_repo)],
                        },
                        "approval": {"default_approval_mode": "yolo"},
                    }
                },
            }
            request = DeliveryRequest(
                agent_id="gemini2",
                provider="gemini2",
                delivery_mode="gemini",
                message="wake up",
                task_id="XREPO-001",
            )
            process = mock.Mock()
            process.pid = 43210
            with (
                mock.patch("adapters.gemini.command_exists", return_value="/usr/bin/gemini"),
                mock.patch("adapters.gemini._gemini_auth_ready", return_value=True),
                mock.patch("adapters.gemini.spawn_background_process", return_value=(process, Path("/tmp/gemini.log"))) as spawn,
                mock.patch("adapters.gemini.runtime_log_path", return_value=Path("/tmp/gemini.log")),
                mock.patch("adapters.gemini.new_runtime_id", return_value="gemini2-test"),
            ):
                result = GeminiAdapter(config=config, provider_capabilities={}).deliver(request)

            self.assertTrue(result.ok)
            command = spawn.call_args.args[0]
            self.assertEqual(command[0], "/usr/bin/gemini")
            self.assertIn("--skip-trust", command)
            self.assertIn("--allowed-tools", command)
            self.assertIn("run_shell_command", command[command.index("--allowed-tools") + 1])
            include_values = [
                command[index + 1]
                for index, value in enumerate(command)
                if value == "--include-directories"
            ]
            self.assertEqual(include_values, [str(status_file.parent), str(tenant_repo)])

    def test_gemini_cli_resolves_from_configured_workspace_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            status_file = tmp / "workspace" / "ai-status.json"
            status_file.parent.mkdir()
            status_file.write_text('{"tasks":[]}', encoding="utf-8")
            local_cli = status_file.parent / ".orchestrator" / "bin" / "node_modules" / ".bin" / "gemini"
            local_cli.parent.mkdir(parents=True)
            local_cli.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            local_cli.chmod(0o755)
            config = {
                "paths": {"status_file": str(status_file)},
                "agents": {
                    "gemini2": {
                        "id": "gemini2",
                        "display_name": "Gemini2",
                        "provider": "gemini2",
                        "adapter": "gemini",
                    }
                },
                "providers": {
                    "gemini2": {
                        "delivery_mode": "gemini",
                        "gemini": {"cli": "gemini"},
                    }
                },
            }
            request = DeliveryRequest(
                agent_id="gemini2",
                provider="gemini2",
                delivery_mode="gemini",
                message="wake up",
                task_id="XREPO-001",
            )
            process = mock.Mock()
            process.pid = 43210
            with (
                mock.patch.dict(os.environ, {"PATH": ""}),
                mock.patch("adapters.gemini._gemini_auth_ready", return_value=True),
                mock.patch("adapters.gemini.spawn_background_process", return_value=(process, Path("/tmp/gemini.log"))) as spawn,
                mock.patch("adapters.gemini.runtime_log_path", return_value=Path("/tmp/gemini.log")),
                mock.patch("adapters.gemini.new_runtime_id", return_value="gemini2-test"),
            ):
                result = GeminiAdapter(config=config, provider_capabilities={}).deliver(request)

            self.assertTrue(result.ok)
            self.assertEqual(spawn.call_args.args[0][0], str(local_cli))

    def test_gemini_dispatch_uses_assigned_worker_workspace(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            status_file = tmp / "canonical" / "ai-status.json"
            status_file.parent.mkdir()
            status_file.write_text('{"tasks":[]}', encoding="utf-8")
            worker_root = tmp / "worker-pbk-ui-003"
            worker_root.mkdir()
            config = {
                "paths": {"status_file": str(status_file)},
                "agents": {
                    "gemini2": {
                        "id": "gemini2",
                        "display_name": "Gemini2",
                        "provider": "gemini2",
                        "adapter": "gemini",
                    }
                },
                "providers": {
                    "gemini2": {
                        "delivery_mode": "gemini",
                        "gemini": {"cli": "gemini", "include_directories": True},
                    }
                },
            }
            request = DeliveryRequest(
                agent_id="gemini2",
                provider="gemini2",
                delivery_mode="gemini",
                message="wake up",
                task_id="PBK-UI-003",
                metadata={"workspace_root": str(worker_root), "task_branch": "gemini2/pbk-ui-003"},
            )
            process = mock.Mock()
            process.pid = 43210
            with (
                mock.patch("adapters.gemini.command_exists", return_value="/usr/bin/gemini"),
                mock.patch("adapters.gemini._gemini_auth_ready", return_value=True),
                mock.patch("adapters.gemini.spawn_background_process", return_value=(process, Path("/tmp/gemini.log"))) as spawn,
                mock.patch("adapters.gemini.runtime_log_path", return_value=Path("/tmp/gemini.log")),
                mock.patch("adapters.gemini.new_runtime_id", return_value="gemini2-test"),
            ):
                result = GeminiAdapter(config=config, provider_capabilities={}).deliver(request)

            self.assertTrue(result.ok)
            command = spawn.call_args.args[0]
            self.assertEqual(spawn.call_args.kwargs["cwd"], worker_root)
            self.assertIn(str(worker_root), command)
            self.assertEqual(spawn.call_args.kwargs["env"]["ORCH_STATUS_ROOT"], str(status_file.parent))
            self.assertEqual(spawn.call_args.kwargs["env"]["ORCH_WORKSPACE_ROOT"], str(worker_root))

    def test_gemini_dispatch_falls_back_when_cli_disappears_after_capability_check(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            status_file = tmp / "drts-fleet-platform" / "ai-status.json"
            status_file.parent.mkdir()
            status_file.write_text('{"tasks":[]}', encoding="utf-8")
            config = {
                "paths": {"status_file": str(status_file)},
                "agents": {
                    "gemini2": {
                        "id": "gemini2",
                        "display_name": "Gemini2",
                        "provider": "gemini2",
                        "adapter": "gemini",
                    }
                },
                "providers": {
                    "gemini2": {
                        "delivery_mode": "gemini",
                        "gemini": {"cli": "gemini"},
                    }
                },
            }
            request = DeliveryRequest(
                agent_id="gemini2",
                provider="gemini2",
                delivery_mode="gemini",
                message="wake up",
                task_id="XREPO-001",
            )

            with (
                mock.patch("adapters.gemini.command_exists", side_effect=["/usr/bin/gemini", None]),
                mock.patch("adapters.gemini._gemini_auth_ready", return_value=True),
                mock.patch("adapters.gemini.spawn_background_process") as spawn,
            ):
                result = GeminiAdapter(config=config, provider_capabilities={}).deliver(request)

            self.assertTrue(result.ok)
            self.assertEqual(result.adapter, "gemini")
            self.assertEqual(result.mode, "file_inbox")
            self.assertFalse(result.auto_delivered)
            self.assertTrue(result.manual_confirmation_required)
            self.assertIn("no longer resolvable", result.error or "")
            self.assertTrue(Path(result.payload_path or "").exists())
            spawn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
