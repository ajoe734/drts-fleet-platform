from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

from adapters.antigravity import AntigravityAdapter
from adapters.base import DeliveryRequest


def _base_config(tmp: Path, antigravity_settings: dict) -> dict:
    status_file = tmp / "drts-fleet-platform" / "ai-status.json"
    status_file.parent.mkdir(parents=True, exist_ok=True)
    status_file.write_text('{"tasks":[]}', encoding="utf-8")
    return {
        "paths": {"status_file": str(status_file)},
        "agents": {
            "gemini2": {
                "id": "gemini2",
                "display_name": "Antigravity2",
                "provider": "gemini2",
                "adapter": "antigravity",
            }
        },
        "providers": {"gemini2": {"antigravity": antigravity_settings}},
    }


class AntigravityAdapterTests(unittest.TestCase):
    def test_headless_print_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            tenant_repo = tmp / "tenant-commute-hub"
            tenant_repo.mkdir()
            config = _base_config(tmp, {
                "cli": "agy",
                "assume_authed": True,
                "include_directories": True,
                "extra_include_directories": [str(tenant_repo)],
            })
            request = DeliveryRequest(
                agent_id="gemini2", provider="gemini2", delivery_mode="antigravity",
                message="wake up", task_id="XREPO-001",
            )
            process = mock.Mock(); process.pid = 51515
            with (
                mock.patch("adapters.antigravity.command_exists", return_value="/usr/bin/agy"),
                mock.patch("adapters.antigravity.spawn_background_process", return_value=(process, Path("/tmp/agy.log"))) as spawn,
                mock.patch("adapters.antigravity.runtime_log_path", return_value=Path("/tmp/agy.log")),
                mock.patch("adapters.antigravity.new_runtime_id", return_value="gemini2-test"),
            ):
                result = AntigravityAdapter(config=config, provider_capabilities={}).deliver(request)

            self.assertTrue(result.ok)
            self.assertEqual(result.mode, "antigravity")
            command = spawn.call_args.args[0]
            self.assertEqual(command[0], "/usr/bin/agy")
            self.assertIn("--print", command)
            self.assertIn("--dangerously-skip-permissions", command)
            self.assertEqual(command[-1], "wake up")  # prompt is the trailing positional
            add_dirs = [command[i + 1] for i, v in enumerate(command) if v == "--add-dir"]
            self.assertIn(str(tenant_repo), add_dirs)

    def test_falls_back_to_inbox_when_not_signed_in(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            config = _base_config(tmp, {
                "cli": "agy",
                # not signed in: no token, isolated empty app_data_dir
                "app_data_dir": str(tmp / "no-antigravity-auth"),
            })
            request = DeliveryRequest(
                agent_id="gemini2", provider="gemini2", delivery_mode="antigravity",
                message="wake up", task_id="XREPO-001",
            )
            with (
                mock.patch("adapters.antigravity.command_exists", return_value="/usr/bin/agy"),
                mock.patch("adapters.antigravity.spawn_background_process") as spawn,
            ):
                result = AntigravityAdapter(config=config, provider_capabilities={}).deliver(request)

            self.assertEqual(result.mode, "file_inbox")
            self.assertFalse(result.auto_delivered)
            self.assertTrue(result.manual_confirmation_required)
            self.assertIn("sign in", (result.notes or "").lower())
            spawn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
