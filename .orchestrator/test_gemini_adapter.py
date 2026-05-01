from __future__ import annotations

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
            include_values = [
                command[index + 1]
                for index, value in enumerate(command)
                if value == "--include-directories"
            ]
            self.assertEqual(include_values, [str(status_file.parent), str(tenant_repo)])


if __name__ == "__main__":
    unittest.main()
