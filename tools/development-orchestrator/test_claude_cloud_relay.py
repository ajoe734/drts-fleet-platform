from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

import permission_broker
from adapters.base import DeliveryRequest
from adapters.claude_cli import ClaudeCLIAdapter
from adapters.claude_cloud_relay import (
    RELAY_TOOL_PATH,
    cloud_execution_settings,
    relay_poll_seconds,
)

SPEC = importlib.util.spec_from_file_location("cloud_relay_tool", RELAY_TOOL_PATH)
cloud_relay_tool = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(cloud_relay_tool)

CLOUD = {
    "environment_id": "env_test",
    "repo_url": "https://github.com/example/repo",
}
OWNER_METADATA = {
    "dispatch_role": "owner",
    "dispatch_agent": "Claude2",
    "mode": "execution",
    "task_branch": "claude2/ops-claude-001",
    "base_branch": "dev",
    "task": {"id": "OPS-CLAUDE-001", "write_scopes": ["apps/api/src/", "docs/ops.md"]},
}


class CloudRelayAdapterTests(unittest.TestCase):
    def _deliver(self, runtime_overrides: dict, metadata: dict | None, parent_env: dict | None = None):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            status_file = tmp / "canonical" / "ai-status.json"
            status_file.parent.mkdir()
            status_file.write_text('{"tasks":[]}', encoding="utf-8")
            local_cli = status_file.parent / ".orchestrator" / "bin" / "claude"
            local_cli.parent.mkdir(parents=True)
            local_cli.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            local_cli.chmod(0o755)
            runtime = {"cli": "claude", "model": "claude-sonnet-5", "output_format": "stream-json"}
            runtime.update(runtime_overrides)
            config = {
                "paths": {"status_file": str(status_file)},
                "supervisor": {"stall_after_seconds": 300},
                "agents": {
                    "claude2": {"id": "claude2", "display_name": "Claude2", "provider": "claude2", "adapter": "claude_cli"}
                },
                "providers": {"claude2": {"delivery_mode": "claude_cli", "runtime": runtime}},
            }
            request = DeliveryRequest(
                agent_id="claude2",
                provider="claude2",
                delivery_mode="claude_cli",
                message="ORIGINAL BRIEF",
                task_id="OPS-CLAUDE-001",
                metadata=dict(metadata or {}),
            )
            process = mock.Mock()
            process.pid = 43210
            with (
                mock.patch.dict(os.environ, {"PATH": "", **(parent_env or {})}),
                mock.patch("adapters.claude_cli._claude_auth_ready", return_value=True),
                mock.patch("adapters.claude_cli.spawn_background_process", return_value=(process, Path("/tmp/claude.log"))) as spawn,
                mock.patch("adapters.claude_cli.runtime_log_path", return_value=Path("/tmp/claude.log")),
                mock.patch("adapters.claude_cli.new_runtime_id", return_value="claude2-test"),
            ):
                result = ClaudeCLIAdapter(config=config, provider_capabilities={}).deliver(request)
            return result, spawn.call_args.args[0], spawn.call_args.kwargs["env"]

    def test_owner_execution_dispatch_starts_a_cloud_relay(self) -> None:
        result, command, env = self._deliver({"execution": "cloud", "cloud": CLOUD}, OWNER_METADATA)

        prompt = command[command.index("-p") + 1]
        self.assertTrue(prompt.startswith("# 雲端中繼：OPS-CLAUDE-001"))
        self.assertTrue(prompt.rstrip().endswith("ORIGINAL BRIEF"))
        self.assertNotIn("{{", prompt.split("## 原始派工說明")[0])
        self.assertIn('"environment_id": "env_test"', prompt)
        self.assertIn("claude2/ops-claude-001", prompt)
        self.assertIn(f"python3 {RELAY_TOOL_PATH} land --branch claude2/ops-claude-001 --base dev --sha <SHA> --scope apps/api/src/ --scope docs/ops.md", prompt)
        self.assertIn("--seconds 200", prompt)
        self.assertIn("lookup --state-dir", prompt)
        self.assertIn("record --state-dir", prompt)
        self.assertIn("--run claude2-test", prompt)
        # The relay runs on the local CLI, so it keeps the lane's model.
        self.assertEqual(command[command.index("--model") + 1], "claude-sonnet-5")
        self.assertEqual(env["ORCH_EXECUTION"], "cloud_relay")
        self.assertEqual(env["ORCH_CLOUD_ENVIRONMENT_ID"], "env_test")
        self.assertEqual(result.metadata["execution"], "cloud_relay")

    def test_configured_relay_model_overrides_the_lane_model(self) -> None:
        _, command, _ = self._deliver(
            {"execution": "cloud", "cloud": {**CLOUD, "relay_model": "claude-haiku-4-5"}}, OWNER_METADATA
        )
        self.assertEqual(command[command.index("--model") + 1], "claude-haiku-4-5")

    def test_reviewer_planning_and_branchless_dispatches_stay_local(self) -> None:
        cases = {
            "reviewer": {**OWNER_METADATA, "dispatch_role": "reviewer"},
            "planning": {**OWNER_METADATA, "mode": "planning"},
            "coordination": {**OWNER_METADATA, "mode": "coordination"},
            "no branch": {key: value for key, value in OWNER_METADATA.items() if key != "task_branch"},
        }
        for label, metadata in cases.items():
            with self.subTest(label):
                result, command, env = self._deliver({"execution": "cloud", "cloud": CLOUD}, metadata)
                self.assertEqual(command[command.index("-p") + 1], "ORIGINAL BRIEF")
                self.assertNotIn("ORCH_EXECUTION", env)
                self.assertEqual(result.metadata["execution"], "local")

    def test_local_lane_drops_an_inherited_relay_marker(self) -> None:
        _, command, env = self._deliver(
            {}, OWNER_METADATA, parent_env={"ORCH_EXECUTION": "cloud_relay", "ORCH_CLOUD_ENVIRONMENT_ID": "env_test"}
        )
        self.assertEqual(command[command.index("-p") + 1], "ORIGINAL BRIEF")
        self.assertNotIn("ORCH_EXECUTION", env)
        self.assertNotIn("ORCH_CLOUD_ENVIRONMENT_ID", env)

    def test_cloud_execution_needs_an_environment_and_repo(self) -> None:
        self.assertIsNone(cloud_execution_settings({"execution": "cloud", "cloud": {"environment_id": "env_test"}}))
        self.assertIsNone(cloud_execution_settings({"execution": "local", "cloud": CLOUD}))
        self.assertEqual(cloud_execution_settings({"execution": "cloud", "cloud": CLOUD})["roles"], ["owner"])

    def test_poll_interval_stays_under_the_stall_clock(self) -> None:
        settings = cloud_execution_settings({"execution": "cloud", "cloud": {**CLOUD, "poll_seconds": 600}})
        self.assertEqual(relay_poll_seconds(settings, {"supervisor": {"stall_after_seconds": 300}}), 210)
        self.assertEqual(relay_poll_seconds(settings, {"supervisor": {"stall_after_seconds": 100}}), 60)
        settings["poll_seconds"] = 120
        self.assertEqual(relay_poll_seconds(settings, {}), 120)


class CloudRelayBrokerTests(unittest.TestCase):
    CREATE = {
        "action": "create",
        "body": {"run_once_at": "2026-10-24T15:07:00Z", "job_config": {"ccr": {"environment_id": "env_test"}}},
    }

    def _evaluate(self, tool_name: str, tool_input: dict, *, relay: bool) -> str:
        env = {"ORCH_EXECUTION": "cloud_relay", "ORCH_CLOUD_ENVIRONMENT_ID": "env_test"} if relay else {}
        with mock.patch.dict(os.environ, env):
            if not relay:
                os.environ.pop("ORCH_EXECUTION", None)
            with mock.patch("permission_broker._check_claude_allow_rules", return_value=False):
                return permission_broker.evaluate_tool_request(tool_name, tool_input, {})["decision"]

    def test_relay_may_follow_its_routine(self) -> None:
        for action in ("get", "list_runs", "get_run_log"):
            with self.subTest(action):
                self.assertEqual(self._evaluate("RemoteTrigger", {"action": action}, relay=True), "allow")
        self.assertEqual(self._evaluate("RemoteTrigger", self.CREATE, relay=True), "allow")

    def test_relay_may_not_create_other_routines(self) -> None:
        recurring = {"action": "create", "body": {**self.CREATE["body"], "cron_expression": "0 * * * *"}}
        elsewhere = {
            "action": "create",
            "body": {"run_once_at": "2026-10-24T15:07:00Z", "job_config": {"ccr": {"environment_id": "env_other"}}},
        }
        unscheduled = {"action": "create", "body": {"job_config": {"ccr": {"environment_id": "env_test"}}}}
        for label, tool_input in {
            "recurring": recurring,
            "other environment": elsewhere,
            "no run_once_at": unscheduled,
            "list": {"action": "list"},
            "run": {"action": "run", "trigger_id": "trig_x"},
            "update": {"action": "update", "trigger_id": "trig_x", "body": {}},
        }.items():
            with self.subTest(label):
                self.assertEqual(self._evaluate("RemoteTrigger", tool_input, relay=True), "defer")

    def test_other_sessions_get_no_remote_trigger_rule(self) -> None:
        self.assertEqual(self._evaluate("RemoteTrigger", {"action": "list_runs"}, relay=False), "defer")
        self.assertEqual(self._evaluate("RemoteTrigger", self.CREATE, relay=False), "defer")

    def test_relay_never_edits_locally(self) -> None:
        for tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
            with self.subTest(tool):
                self.assertEqual(self._evaluate(tool, {"file_path": "README.md"}, relay=True), "deny")


class CloudRelayToolTests(unittest.TestCase):
    def test_scope_matching(self) -> None:
        self.assertTrue(cloud_relay_tool.in_scope("apps/api/src/a.ts", "apps/api/src/"))
        self.assertTrue(cloud_relay_tool.in_scope("apps/api/src/a.ts", "apps/api/src"))
        self.assertFalse(cloud_relay_tool.in_scope("apps/api/srcx/a.ts", "apps/api/src"))
        self.assertTrue(cloud_relay_tool.in_scope("docs/ops.md", "docs/ops.md"))
        self.assertFalse(cloud_relay_tool.in_scope("docs/ops.md.bak", "docs/ops.md"))
        self.assertTrue(cloud_relay_tool.in_scope("tests/unit/x/y.test.ts", "tests/unit/**"))
        self.assertTrue(cloud_relay_tool.in_scope("tests/unit/y.test.ts", "tests/unit/*.test.ts"))
        self.assertFalse(cloud_relay_tool.in_scope("anything", "  "))

    def test_wait_returns_when_the_branch_moves(self) -> None:
        heads = iter(["aaa", "aaa", "bbb"])
        with (
            mock.patch.object(cloud_relay_tool, "remote_head", side_effect=lambda branch: next(heads)),
            mock.patch.object(cloud_relay_tool.time, "sleep"),
        ):
            result = cloud_relay_tool.wait("claude/x", "aaa", 600)
        self.assertEqual(result, {"branch": "claude/x", "branch_head": "bbb", "changed": True})

    def test_routines_are_recorded_per_task_and_expire(self) -> None:
        with tempfile.TemporaryDirectory() as state_dir:
            cloud_relay_tool.record(state_dir, "OPS-1", "trig_a", "run-1")
            cloud_relay_tool.record(state_dir, "OPS-1", "trig_a", "run-1")
            cloud_relay_tool.record(state_dir, "OPS-1", "trig_b", "run-2")
            cloud_relay_tool.record(state_dir, "OPS-2", "trig_c", "run-3")
            found = cloud_relay_tool.lookup(state_dir, "OPS-1", 6)["routines"]
            self.assertEqual([item["trigger_id"] for item in found], ["trig_b", "trig_a"])
            path = Path(state_dir) / "OPS-1.json"
            stale = [{**item, "created_at": "2026-01-01T00:00:00+00:00"} for item in found]
            path.write_text(json.dumps(stale), encoding="utf-8")
            self.assertEqual(cloud_relay_tool.lookup(state_dir, "OPS-1", 6)["routines"], [])
            self.assertEqual(cloud_relay_tool.lookup(state_dir, "MISSING", 6)["routines"], [])

    def test_wait_reports_no_change_at_the_deadline(self) -> None:
        with mock.patch.object(cloud_relay_tool, "remote_head", return_value=None):
            result = cloud_relay_tool.wait("claude/x", "", 0)
        self.assertEqual(result, {"branch": "claude/x", "branch_head": None, "changed": False})


if __name__ == "__main__":
    unittest.main()
