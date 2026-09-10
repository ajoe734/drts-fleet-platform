from __future__ import annotations

import json
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
from control_plane.infra.worker_failure_detector import detect_failure_signal_in_lines


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
            self.assertIn("--output-format", command)
            self.assertEqual(command[command.index("--output-format") + 1], "stream-json")
            print_index = command.index("--print")
            self.assertEqual(command[print_index + 1], "wake up")
            self.assertEqual(command[-2:], ["--print", "wake up"])
            add_dirs = [command[i + 1] for i, v in enumerate(command) if v == "--add-dir"]
            self.assertIn(str(tenant_repo), add_dirs)

    def test_stale_include_directory_is_dropped_from_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            tenant_repo = tmp / "tenant-commute-hub"
            tenant_repo.mkdir()
            stale_repo = tmp / "removed-tenant-repo"
            config = _base_config(tmp, {
                "cli": "agy",
                "assume_authed": True,
                "include_directories": True,
                "extra_include_directories": [str(stale_repo), str(tenant_repo)],
            })
            request = DeliveryRequest(
                agent_id="gemini2", provider="gemini2", delivery_mode="antigravity",
                message="wake up", task_id="XREPO-001",
            )
            process = mock.Mock(); process.pid = 51516
            with (
                mock.patch("adapters.antigravity.command_exists", return_value="/usr/bin/agy"),
                mock.patch("adapters.antigravity.spawn_background_process", return_value=(process, Path("/tmp/agy.log"))) as spawn,
                mock.patch("adapters.antigravity.runtime_log_path", return_value=Path("/tmp/agy.log")),
                mock.patch("adapters.antigravity.new_runtime_id", return_value="gemini2-test"),
            ):
                result = AntigravityAdapter(config=config, provider_capabilities={}).deliver(request)

            self.assertTrue(result.ok)
            command = spawn.call_args.args[0]
            add_dirs = [command[i + 1] for i, v in enumerate(command) if v == "--add-dir"]
            self.assertIn(str(tenant_repo), add_dirs)
            self.assertNotIn(str(stale_repo), add_dirs)

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

    def test_config_home_isolates_auth_path(self) -> None:
        from adapters import antigravity as ag
        a = ag._app_data_dir({"config_home": "~/.antigravity2-home"})
        self.assertTrue(str(a).endswith("/.antigravity2-home/.gemini/antigravity-cli"))
        # distinct homes -> distinct token storage (two accounts)
        b = ag._app_data_dir({"config_home": "~/.antigravity-home"})
        self.assertNotEqual(str(a), str(b))


if __name__ == "__main__":
    unittest.main()


class SandboxDefaultTests(unittest.TestCase):
    """An auto-approving lane must still be restricted in what it can reach.

    Five of seven lanes ran with `--dangerously-skip-permissions` and no
    restriction of any kind. That is their only enforcement surface: a worktree
    checkout carries no .claude/ settings, and the MCP approval tool is never
    consulted because auto-approval means nothing is ever asked -- measured at
    zero calls across every recent worker log. The deny list in
    permission_broker.py reaches neither path, so it protected the chatbox
    session and nothing that actually edits files.

    `agy` accepts both flags together, so whether tools run and what they may
    reach are separable, and only the first one has to stay open.
    """

    def _spawn_command(self, antigravity_settings: dict) -> list[str]:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            config = _base_config(tmp, {"cli": "agy", "assume_authed": True, **antigravity_settings})
            request = DeliveryRequest(
                agent_id="gemini2", provider="gemini2", delivery_mode="antigravity",
                message="wake up", task_id="SANDBOX-001",
            )
            process = mock.Mock(); process.pid = 4242
            with (
                mock.patch("adapters.antigravity.command_exists", return_value="/usr/bin/agy"),
                mock.patch("adapters.antigravity.spawn_background_process",
                           return_value=(process, Path("/tmp/agy.log"))) as spawn,
                mock.patch("adapters.antigravity.runtime_log_path", return_value=Path("/tmp/agy.log")),
                mock.patch("adapters.antigravity.new_runtime_id", return_value="gemini2-test"),
            ):
                AntigravityAdapter(config=config, provider_capabilities={}).deliver(request)
            return list(spawn.call_args.args[0])

    def test_a_lane_is_sandboxed_unless_it_opts_out(self) -> None:
        self.assertIn("--sandbox", self._spawn_command({}))

    def test_auto_approval_stays_on_so_the_lane_does_not_block(self) -> None:
        """Removing this would hang an unattended worker on its first tool call."""
        self.assertIn("--dangerously-skip-permissions", self._spawn_command({}))

    def test_an_explicit_false_still_opts_out_without_a_redeploy(self) -> None:
        self.assertNotIn("--sandbox", self._spawn_command({"sandbox": False}))

    def test_the_two_flags_are_independent(self) -> None:
        command = self._spawn_command({"skip_permissions": False})

        self.assertNotIn("--dangerously-skip-permissions", command)
        self.assertIn("--sandbox", command)


def _agy_step_update(index: int, step_type: str) -> str:
    return json.dumps({
        "event": "step_update",
        "step_update": {
            "conversation_id": "ff862b49-a393-42f9-a7d1-84cf1951bc45",
            "step_index": index,
            "state": "DONE",
            "step_type": step_type,
            "duration_seconds": 0,
        },
    })


def _agy_result(status: str, *, error: str = "", response: str = "") -> str:
    return json.dumps({
        "event": "result",
        "result": {
            "conversation_id": "ff862b49-a393-42f9-a7d1-84cf1951bc45",
            "status": status,
            "response": response,
            "error": error,
            "duration_seconds": 99.1,
            "num_turns": 1,
            "usage": {"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "cache_read_tokens": 0, "total_tokens": 0},
        },
    })


class AntigravityStreamLifecycleTests(unittest.TestCase):
    """agy's `--output-format stream-json` events, decoded the way a live log tail sees them.

    Live evidence (.local/worker-recovery-20260910/gemini-probe-result.json): a
    read-only probe exited rc=0 after a stream interruption, with an empty
    response and zero tokens -- and the worker log's last line was still just
    the default text mode's bare "error: interrupted", because nothing asked
    for stream-json. worker_failure_detector.py must treat the terminal
    `result` event as authoritative regardless of process exit code, while the
    repeated `step_update`/`error_message` noise mid-stream must stay inert so
    a quiet-but-alive turn is not mistaken for either outcome.
    """

    def test_quiet_live_process_with_only_step_updates_is_not_a_failure(self) -> None:
        lines = [_agy_step_update(i, "agent_response" if i % 2 else "error_message") for i in range(6)]
        self.assertIsNone(detect_failure_signal_in_lines(lines))

    def test_structured_error_with_exit_zero_is_never_classified_success(self) -> None:
        lines = [
            _agy_step_update(0, "user_input"),
            _agy_step_update(1, "agent_response"),
            _agy_step_update(2, "error_message"),
            _agy_result("ERROR", error="The stream was interrupted. Please continue the task you were working on."),
        ]
        signal = detect_failure_signal_in_lines(lines)
        self.assertIsNotNone(signal)
        self.assertIn("stream was interrupted", signal.reason.lower())
        self.assertEqual(signal.source, "antigravity_stream_result_error")

    def test_successful_terminal_result_is_not_flagged(self) -> None:
        lines = [
            _agy_step_update(0, "user_input"),
            _agy_step_update(1, "agent_response"),
            _agy_result("DONE", response="Task complete."),
        ]
        self.assertIsNone(detect_failure_signal_in_lines(lines))

    def test_non_agy_result_event_with_string_result_is_not_swallowed(self) -> None:
        """Codex2 exact-candidate rejection repro: `{"event": "result", "result":
        "..."}` where `result` is a plain string (not agy's `{"status": ...}`
        dict) is a different tool's schema reusing the same `event` field name.
        Recognizing it as agy's terminal event and returning early erased the
        embedded auth failure text instead of falling through to generic
        candidate detection.
        """
        lines = [json.dumps({"event": "result", "result": "Error: Failed to authenticate"})]
        signal = detect_failure_signal_in_lines(lines)
        self.assertIsNotNone(signal)
        self.assertIn("failed to authenticate", signal.reason.lower())

    def test_agy_shaped_result_dict_without_status_is_not_swallowed(self) -> None:
        """A `result` dict with no `status` key (e.g. `{"error": "..."}`) is not
        agy's recognized terminal shape either; it must still fall through to
        generic candidate detection instead of being treated as an
        authoritative (and here incorrect) non-failure.
        """
        lines = [json.dumps({"event": "result", "result": {"error": "Error: Failed to authenticate"}})]
        signal = detect_failure_signal_in_lines(lines)
        self.assertIsNotNone(signal)
        self.assertIn("failed to authenticate", signal.reason.lower())

    def test_non_agy_result_event_does_not_erase_an_earlier_real_agy_error(self) -> None:
        """A trailing non-agy `event: result` line (string result) must not
        short-circuit the reverse scan and hide a genuine agy ERROR earlier in
        the same log.
        """
        lines = [
            _agy_step_update(0, "user_input"),
            _agy_step_update(1, "agent_response"),
            _agy_step_update(2, "error_message"),
            _agy_result("ERROR", error="The stream was interrupted. Please continue the task you were working on."),
            json.dumps({"event": "result", "result": "Task complete"}),
        ]
        signal = detect_failure_signal_in_lines(lines)
        self.assertIsNotNone(signal)
        self.assertIn("stream was interrupted", signal.reason.lower())
        self.assertEqual(signal.source, "antigravity_stream_result_error")
