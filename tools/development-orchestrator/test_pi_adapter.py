from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

import provider_permissions
from adapters import ADAPTERS
from adapters.base import DeliveryRequest
from adapters.pi import WORKER_RESULT_EXTENSION, PiAdapter
from control_plane.domain.failure_policy import FailureKind, classify_failure, infer_pause_resume_at
from control_plane.domain.worker_lifecycle import worker_reported_outcome
from control_plane.infra.worker_failure_detector import detect_failure_signal_in_lines
from control_plane.runtime.supervisor_runtime import summarize_command_for_activity_log


CHATGPT_USAGE_LIMIT = "You have hit your ChatGPT usage limit (plus plan). Try again in ~42 min."


def _config(tmp: Path, pi_settings: dict) -> dict:
    return {
        "paths": {
            "status_file": str(tmp / "ai-status.json"),
            "state_file": str(tmp / ".orchestrator" / "state.json"),
        },
        "agents": {"pi": {"id": "pi", "display_name": "Pi", "provider": "pi", "adapter": "pi"}},
        "providers": {"pi": {"delivery_mode": "pi", "pi": pi_settings}},
    }


def _request(message: str = "continue task") -> DeliveryRequest:
    return DeliveryRequest(
        agent_id="pi",
        provider="pi",
        delivery_mode="pi",
        message=message,
        task_id="SR-PI-001",
        metadata={"workspace_root": "/worker"},
    )


def _jwt(claims: dict) -> str:
    def part(value: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    return f"{part({'alg': 'none'})}.{part(claims)}.sig"


def _assistant_end(stop_reason: str, error: str | None = None) -> str:
    message = {"role": "assistant", "content": [], "stopReason": stop_reason}
    if error:
        message["errorMessage"] = error
    return json.dumps({"type": "message_end", "message": message})


class PiAdapterCommandTests(unittest.TestCase):
    def _deliver(self, pi_settings: dict, message: str = "continue task"):
        with tempfile.TemporaryDirectory() as tmpdir:
            config = _config(Path(tmpdir), pi_settings)
            process = mock.Mock(pid=4242)
            with (
                mock.patch("adapters.pi.command_exists", return_value="/usr/bin/pi"),
                mock.patch("adapters.pi.new_runtime_id", return_value="pi-test"),
                mock.patch("adapters.pi.worker_result_path", return_value=Path("/canonical/worker-results/pi-test.json")),
                mock.patch("adapters.pi.runtime_log_path", return_value=Path("/runtime/worker.log")),
                mock.patch("adapters.pi.spawn_background_process", return_value=(process, Path("/runtime/worker.log"))) as spawn,
            ):
                result = PiAdapter(config=config, provider_capabilities={}).deliver(_request(message))
        return result, spawn.call_args.args[0], spawn.call_args.kwargs["env"]

    def test_registered_under_its_adapter_name(self) -> None:
        self.assertIs(ADAPTERS["pi"], PiAdapter)

    def test_one_shot_json_run_with_result_extension_and_prompt_last(self) -> None:
        result, command, env = self._deliver({"model": "gpt-6-astra"}, message="-starts with a dash")

        self.assertTrue(result.ok)
        self.assertEqual(result.mode, "pi")
        self.assertEqual(command[0], "/usr/bin/pi")
        self.assertEqual(command[command.index("--mode") + 1], "json")
        self.assertNotIn("-p", command)
        for flag in ("--no-session", "--no-approve", "--no-extensions", "--no-skills"):
            self.assertIn(flag, command)
        self.assertEqual(command[command.index("--extension") + 1], str(WORKER_RESULT_EXTENSION))
        self.assertEqual(command[-2:], ["--", "-starts with a dash"])
        self.assertEqual(env["DRTS_WORKER_RESULT_PATH"], "/canonical/worker-results/pi-test.json")
        self.assertEqual(result.metadata["result_path"], "/canonical/worker-results/pi-test.json")

    def test_bare_model_is_pinned_to_the_chatgpt_provider(self) -> None:
        _, command, _ = self._deliver({"model": "gpt-6-astra", "thinking": "medium"})
        self.assertEqual(command[command.index("--model") + 1], "openai-codex/gpt-6-astra")
        self.assertEqual(command[command.index("--thinking") + 1], "medium")

    def test_qualified_model_and_extra_args_pass_through(self) -> None:
        _, command, _ = self._deliver({"model": "openai/gpt-x", "extra_args": ["--tools", "read,bash"]})
        self.assertEqual(command[command.index("--model") + 1], "openai/gpt-x")
        self.assertEqual(command[command.index("--tools") + 1], "read,bash")
        self.assertLess(command.index("--tools"), command.index("--"))

    def test_agent_dir_isolates_the_login_without_touching_home(self) -> None:
        _, _, env = self._deliver({"agent_dir": "/srv/pi-lane2"})
        self.assertEqual(env["PI_CODING_AGENT_DIR"], "/srv/pi-lane2")
        self.assertEqual(env.get("HOME"), os.environ.get("HOME"))

    def test_missing_cli_does_not_spawn(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            config = _config(Path(tmpdir), {})
            with (
                mock.patch("adapters.pi.command_exists", return_value=None),
                mock.patch("adapters.pi.spawn_background_process") as spawn,
            ):
                result = PiAdapter(config=config, provider_capabilities={}).deliver(_request())
        self.assertFalse(result.ok)
        self.assertTrue(result.manual_confirmation_required)
        spawn.assert_not_called()

    def test_activity_log_keeps_the_prompt_out_of_args_preview(self) -> None:
        _, command, _ = self._deliver({"model": "gpt-6-astra"}, message="read a very large task packet")
        summary = summarize_command_for_activity_log(command)
        self.assertEqual(summary["prompt_chars"], len("read a very large task packet"))
        self.assertNotIn("read a very large task packet", summary["args_preview"])


class PiStreamFailureDetectionTests(unittest.TestCase):
    """`pi --mode json` exits 0 whether or not its run failed; the events decide."""

    def test_completed_run_is_not_a_failure_even_with_alarming_tool_output(self) -> None:
        lines = [
            json.dumps({"type": "session", "id": "s", "cwd": "/worker"}),
            json.dumps({"type": "message_end", "message": {"role": "user", "content": "error: rate limit exceeded"}}),
            json.dumps({"type": "tool_execution_end", "toolName": "bash", "isError": True,
                        "result": {"content": [{"type": "text", "text": "status: 401 Failed to authenticate"}]}}),
            _assistant_end("toolUse"),
            json.dumps({"type": "agent_end", "messages": [], "willRetry": False}),
            json.dumps({"type": "agent_settled"}),
        ]
        self.assertIsNone(detect_failure_signal_in_lines(lines))

    def test_chatgpt_usage_limit_pauses_the_lane(self) -> None:
        lines = [
            _assistant_end("error", CHATGPT_USAGE_LIMIT),
            json.dumps({"type": "turn_end", "message": {"role": "assistant", "stopReason": "error"}}),
            json.dumps({"type": "agent_end", "messages": [], "willRetry": False}),
            json.dumps({"type": "agent_settled"}),
        ]
        signal = detect_failure_signal_in_lines(lines)
        self.assertIsNotNone(signal)
        self.assertEqual(signal.reason, CHATGPT_USAGE_LIMIT)
        self.assertEqual(signal.source, "pi_assistant_error")
        self.assertTrue(signal.provider_pause_authorized)

    def test_run_that_pi_is_still_retrying_is_left_alone(self) -> None:
        failed_attempt = [
            _assistant_end("error", "429 rate limit exceeded"),
            json.dumps({"type": "agent_end", "messages": [], "willRetry": True}),
        ]
        self.assertIsNone(detect_failure_signal_in_lines(failed_attempt))
        retrying = failed_attempt + [
            json.dumps({"type": "auto_retry_start", "attempt": 1, "maxAttempts": 3, "delayMs": 2000,
                        "errorMessage": "429 rate limit exceeded"}),
        ]
        self.assertIsNone(detect_failure_signal_in_lines(retrying))

    def test_successful_retry_overrides_the_failed_attempt(self) -> None:
        lines = [
            _assistant_end("error", "529 overloaded"),
            json.dumps({"type": "agent_end", "messages": [], "willRetry": True}),
            json.dumps({"type": "auto_retry_start", "attempt": 1, "errorMessage": "529 overloaded"}),
            _assistant_end("stop"),
            json.dumps({"type": "auto_retry_end", "success": True, "attempt": 1}),
            json.dumps({"type": "agent_settled"}),
        ]
        self.assertIsNone(detect_failure_signal_in_lines(lines))

    def test_exhausted_retries_fail_the_worker_without_pausing_the_lane(self) -> None:
        lines = [
            _assistant_end("error", "529 overloaded"),
            json.dumps({"type": "agent_end", "messages": [], "willRetry": False}),
            json.dumps({"type": "auto_retry_end", "success": False, "attempt": 3, "finalError": "529 overloaded"}),
            json.dumps({"type": "agent_settled"}),
        ]
        signal = detect_failure_signal_in_lines(lines)
        self.assertIsNotNone(signal)
        self.assertEqual(signal.reason, "529 overloaded")
        self.assertEqual(signal.source, "pi_retry_exhausted")
        self.assertFalse(signal.provider_pause_authorized)

    def test_chatgpt_usage_limit_is_a_quota_wall_with_a_reset(self) -> None:
        decision = classify_failure({}, {"provider": "pi"}, CHATGPT_USAGE_LIMIT)
        self.assertEqual(decision.kind, FailureKind.QUOTA_TERMINAL)
        paused_at = datetime(2026, 10, 2, 1, 0, tzinfo=timezone.utc)
        resume_at = infer_pause_resume_at(CHATGPT_USAGE_LIMIT, paused_at=paused_at)
        self.assertEqual(resume_at - paused_at.timestamp(), 42 * 60)


class PiCapabilityProbeTests(unittest.TestCase):
    def test_auth_ready_reads_pi_auth_check_without_refreshing(self) -> None:
        ready = subprocess.CompletedProcess([], 0, stdout='{"status":"ready","provider":"openai-codex","authType":"oauth"}')
        with mock.patch("provider_permissions.run_command", return_value=ready) as run:
            self.assertTrue(provider_permissions._pi_auth_ready("/usr/bin/pi", {"model": "gpt-6-astra"}))
        argv = run.call_args.args[0]
        self.assertEqual(argv[argv.index("--provider") + 1], "openai-codex")
        self.assertIn("--no-refresh", argv)

        missing = subprocess.CompletedProcess(
            [], 1, stdout='{"status":"not_ready","provider":"openai-codex","reason":"credentials_not_configured"}'
        )
        with mock.patch("provider_permissions.run_command", return_value=missing):
            self.assertFalse(provider_permissions._pi_auth_ready("/usr/bin/pi", {}))

    def test_chatgpt_login_shares_the_codex_quota_pool_for_the_same_account(self) -> None:
        claims = {"https://api.openai.com/auth": {"chatgpt_account_id": "acct-1"}}
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            (tmp / "pi").mkdir()
            (tmp / "pi" / "auth.json").write_text(json.dumps(
                {"openai-codex": {"type": "oauth", "access": _jwt(claims), "refresh": "r", "expires": 0, "accountId": "acct-1"}}
            ))
            (tmp / "codex").mkdir()
            (tmp / "codex" / "auth.json").write_text(json.dumps({"tokens": {"id_token": _jwt(claims)}}))
            pi_identity = provider_permissions._pi_identity({"agent_dir": str(tmp / "pi"), "model": "gpt-6-astra"})
            codex_identity = provider_permissions._codex_identity({"config_home": str(tmp / "codex"), "model": "gpt-6-astra"})

        self.assertEqual(pi_identity["state"], "auth_ready")
        self.assertEqual(pi_identity["provider_family"], "codex")
        self.assertEqual(pi_identity["quota_pool"], codex_identity["quota_pool"])

    def test_without_a_login_the_identity_is_unknown(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            identity = provider_permissions._pi_identity({"agent_dir": tmpdir})
        self.assertEqual(identity["state"], "identity_unknown")
        self.assertIsNone(identity["quota_pool"])


FAUX_PROVIDER_EXTENSION = """
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";

export default function (pi) {
	const faux = fauxProvider({ provider: "drts-faux", models: [{ id: "worker" }] });
	faux.setResponses([
		fauxAssistantMessage([fauxToolCall("bash", { command: "echo pi-lane-ok" })], { stopReason: "toolUse" }),
		fauxAssistantMessage(
			[fauxToolCall("submit_worker_result", {
				outcome: "progress",
				summary: "faux run",
				task_status_written: "progress",
				blocker: null,
				verification: ["echo pi-lane-ok"],
			})],
			{ stopReason: "toolUse" },
		),
	]);
	pi.registerProvider(faux.provider);
}
"""


@unittest.skipUnless(shutil.which("pi"), "pi CLI is not installed")
class PiWorkerResultEndToEndTests(unittest.TestCase):
    """Runs the adapter's real command line against pi's scripted faux model."""

    def test_submit_worker_result_writes_a_result_the_supervisor_accepts(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            faux = tmp / "faux.ts"
            faux.write_text(FAUX_PROVIDER_EXTENSION, encoding="utf-8")
            (tmp / "worker").mkdir()
            config = _config(tmp, {
                "model": "drts-faux/worker",
                "agent_dir": str(tmp / "pi-agent"),
                "extra_args": ["--extension", str(faux)],
            })
            request = DeliveryRequest("pi", "pi", "pi", "run the smoke task", metadata={"workspace_root": str(tmp / "worker")})
            with mock.patch(
                "adapters.pi.spawn_background_process", return_value=(mock.Mock(pid=1), tmp / "worker.log")
            ) as spawn:
                result = PiAdapter(config=config, provider_capabilities={}).deliver(request)
            command, env = spawn.call_args.args[0], spawn.call_args.kwargs["env"]

            # The supervisor's worker unit gives pi a null stdin; an open pipe
            # would make pi wait for piped input.
            run = subprocess.run(
                command, cwd=tmp / "worker", env=env, stdin=subprocess.DEVNULL,
                capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(run.returncode, 0, run.stderr)
            outcome = worker_reported_outcome({"result_path": result.metadata["result_path"]})
            log_lines = run.stdout.splitlines()

        self.assertEqual(outcome, {
            "outcome": "progress",
            "summary": "faux run",
            "task_status_written": "progress",
            "blocker": None,
            "verification": ["echo pi-lane-ok"],
        })
        self.assertIsNone(detect_failure_signal_in_lines(log_lines))
        # terminate: true ends the run on the tool call, with no further model turn.
        self.assertEqual(json.loads(log_lines[-1])["type"], "agent_settled")


if __name__ == "__main__":
    unittest.main()
