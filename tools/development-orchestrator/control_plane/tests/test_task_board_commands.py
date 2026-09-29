from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from orchestrator_test_support import DispatchEnvironmentIsolation

from control_plane.usecases.task_board_commands import (
    TaskBoardCommandExecutor,
    TaskBoardCommandRuntime,
    run_task_board_command,
)


class TaskBoardCommandExecutorTests(DispatchEnvironmentIsolation, unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.temp_dir = tempfile.TemporaryDirectory()
        self.status_file = Path(self.temp_dir.name) / "ai-status.json"
        self.status_file.write_text("{}", encoding="utf-8")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_mutation_runs_as_one_load_command_sync_transaction(self) -> None:
        events: list[str] = []
        state = {"value": 1}

        def mutate(payload: dict, _args: list[str]) -> None:
            events.append("command")
            payload["value"] = 2

        runtime = TaskBoardCommandRuntime(
            status_file=self.status_file,
            load_state=lambda: events.append("load") or dict(state),
            save_state=lambda payload: events.append(f"save:{payload['value']}"),
            sync_all=lambda payload: events.append(f"sync:{payload['value']}"),
            read_only_commands={},
            mutation_commands={"change": mutate},
        )

        result = TaskBoardCommandExecutor(runtime).execute("change", [])

        self.assertEqual(result, 0)
        self.assertEqual(events, ["load", "command", "sync:2"])

    def test_sync_failure_restores_pre_command_state(self) -> None:
        restored: list[dict] = []
        state = {"items": ["before"]}

        def mutate(payload: dict, _args: list[str]) -> None:
            payload["items"].append("after")

        def fail_sync(_payload: dict) -> None:
            raise OSError("disk full")

        runtime = TaskBoardCommandRuntime(
            status_file=self.status_file,
            load_state=lambda: {"items": list(state["items"])},
            save_state=lambda payload: restored.append(payload),
            sync_all=fail_sync,
            read_only_commands={},
            mutation_commands={"change": mutate},
        )

        with self.assertRaisesRegex(OSError, "disk full"):
            TaskBoardCommandExecutor(runtime).execute("change", [])

        self.assertEqual(restored, [{"items": ["before"]}])

    def test_read_only_command_never_saves_or_syncs(self) -> None:
        calls: list[str] = []
        runtime = TaskBoardCommandRuntime(
            status_file=self.status_file,
            load_state=lambda: {"value": 1},
            save_state=lambda _payload: calls.append("save"),
            sync_all=lambda _payload: calls.append("sync"),
            read_only_commands={
                "show": lambda payload, _args: calls.append(f"show:{payload['value']}")
            },
            mutation_commands={},
        )

        TaskBoardCommandExecutor(runtime).execute("show", [])

        self.assertEqual(calls, ["show:1"])


class TaskBoardGatewayTests(unittest.TestCase):
    def test_gateway_loads_canonical_command_module(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "ai-status.json").write_text('{"tasks": []}', encoding="utf-8")
            config = {"paths": {"status_file": str(root / "ai-status.json")}}

            result = run_task_board_command(
                config,
                "list",
                environ={"AI_NAME": "Codex2"},
            )

        self.assertTrue(result.ok)

    def test_gateway_reports_unknown_command_without_raising(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            status_file = Path(temp) / "ai-status.json"
            status_file.write_text('{"tasks": []}', encoding="utf-8")
            config = {
                "paths": {"status_file": str(status_file)}
            }

            result = run_task_board_command(config, "not-a-command")

        self.assertFalse(result.ok)
        self.assertIn("Unknown command", result.error)


class DispatchedWorkerAcceptanceTests(DispatchEnvironmentIsolation, unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(temp_dir.cleanup)
        self.root = Path(temp_dir.name)
        self.status_file = self.root / "ai-status.json"
        self.config = {"paths": {"status_file": str(self.status_file)}}
        self.task = {
            "id": "TASK-001",
            "title": "Record acceptance",
            "owner": "Codex",
            "reviewer": "Codex2",
            "eligible_agents": {"owner": ["Codex"], "reviewer": ["Codex2"]},
            "status": "acceptance",
            "candidate_lifecycle_version": 1,
            "candidate_sha": "a" * 40,
            "reviewed_sha": "a" * 40,
            "ci_sha": "a" * 40,
            "ci_status": "success",
            "merge_sha": "b" * 40,
            "required_acceptance": ["staging_signoff"],
        }
        self.state = {"tasks": [self.task]}
        self.env = {
            "AI_NAME": "Codex",
            "ORCH_DISPATCH_ROLE": "owner",
            "ORCH_RUN_ID": "acceptance-run-1",
            "ORCH_DISPATCH_TASK_ID": "TASK-001",
            "ORCH_DISPATCH_AGENT": "Codex",
            "ACCEPTANCE_EVIDENCE_JSON": '{"staging_signoff": "run-42"}',
        }
        self.write_state()

    def write_state(self) -> None:
        self.status_file.write_text(json.dumps(self.state), encoding="utf-8")

    def assert_board_unchanged(self) -> None:
        self.assertEqual(json.loads(self.status_file.read_text(encoding="utf-8")), self.state)
        self.assertFalse((self.root / "ai-activity-log.jsonl").exists())

    def test_dispatched_owner_records_acceptance_for_own_task(self) -> None:
        result = run_task_board_command(
            self.config, "record-acceptance", ["TASK-001", "Staging accepted"], environ=self.env,
        )

        self.assertTrue(result.ok, result.error)
        task = json.loads(self.status_file.read_text(encoding="utf-8"))["tasks"][0]
        self.assertEqual(task["acceptance_evidence"], {"staging_signoff": "run-42"})
        self.assertEqual(task["status"], "done")
        for key in ("candidate_sha", "reviewed_sha", "ci_sha", "ci_status", "merge_sha"):
            self.assertEqual(task[key], self.task[key])

    def test_dispatched_owner_cannot_record_acceptance_for_different_task(self) -> None:
        self.state["tasks"].append({**self.task, "id": "TASK-002"})
        self.write_state()

        result = run_task_board_command(
            self.config, "record-acceptance", ["TASK-002", "Staging accepted"], environ=self.env,
        )

        self.assertFalse(result.ok)
        self.assertIn("Dispatched worker cannot mutate a different task", result.error)
        self.assert_board_unchanged()

    def test_dispatched_owner_cannot_assign_even_own_task(self) -> None:
        result = run_task_board_command(
            self.config, "assign", ["TASK-001", "Codex", "Codex2", "Reassign"], environ=self.env,
        )

        self.assertFalse(result.ok)
        self.assertIn("Dispatched workers must use their assigned task lifecycle commands", result.error)
        self.assert_board_unchanged()

    def test_dispatched_acceptance_still_requires_authorized_actor(self) -> None:
        result = run_task_board_command(
            self.config, "record-acceptance", ["TASK-001", "Staging accepted"],
            environ={**self.env, "AI_NAME": "Claude"},
        )

        self.assertFalse(result.ok)
        self.assertIn("Only the owner, reviewer, or Supervisor can record acceptance", result.error)
        self.assert_board_unchanged()

    def test_dispatched_acceptance_still_requires_acceptance_status(self) -> None:
        self.task["status"] = "integrating"
        self.write_state()

        result = run_task_board_command(
            self.config, "record-acceptance", ["TASK-001", "Staging accepted"], environ=self.env,
        )

        self.assertFalse(result.ok)
        self.assertIn("is not awaiting acceptance evidence", result.error)
        self.assert_board_unchanged()

    def test_dispatched_acceptance_still_rejects_unrequired_evidence(self) -> None:
        result = run_task_board_command(
            self.config, "record-acceptance", ["TASK-001", "Staging accepted"],
            environ={**self.env, "ACCEPTANCE_EVIDENCE_JSON": '{"unrequired_gate": "run-42"}'},
        )

        self.assertFalse(result.ok)
        self.assertIn("Acceptance evidence is not required for TASK-001: unrequired_gate", result.error)
        self.assert_board_unchanged()


if __name__ == "__main__":
    unittest.main()
