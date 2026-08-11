from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from control_plane.usecases.task_board_commands import (
    TaskBoardCommandExecutor,
    TaskBoardCommandRuntime,
    run_task_board_command,
)


class TaskBoardCommandExecutorTests(unittest.TestCase):
    def setUp(self) -> None:
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

    def test_mutation_preparer_runs_inside_transaction_before_sync(self) -> None:
        events: list[str] = []

        def mutate(payload: dict, _args: list[str]) -> None:
            payload["value"] = 2
            events.append("command")

        runtime = TaskBoardCommandRuntime(
            status_file=self.status_file,
            load_state=lambda: {"value": 1},
            save_state=lambda _payload: events.append("save"),
            sync_all=lambda payload: events.append(f"sync:{payload['value']}"),
            read_only_commands={},
            mutation_commands={"change": mutate},
            prepare_mutation=lambda before, after, command, args: events.append(
                f"prepare:{before['value']}:{after['value']}:{command}:{','.join(args)}"
            ) or "prepared",
            commit_mutation=lambda prepared: events.append(f"commit:{prepared}"),
        )

        TaskBoardCommandExecutor(runtime).execute("change", ["reason"])

        self.assertEqual(
            events,
            ["command", "prepare:1:2:change:reason", "sync:2", "commit:prepared"],
        )

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
            prepare_mutation=lambda *_args: "transition",
            commit_mutation=lambda prepared: restored.append({"committed": prepared}),
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
    def test_gateway_loads_module_through_canonical_command_contract(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            scripts = root / "scripts"
            scripts.mkdir()
            (root / "ai-status.json").write_text("{}", encoding="utf-8")
            (scripts / "ai_status.py").write_text(
                "import os\n"
                "def execute_command(command, args):\n"
                "    return f'{command}:{os.environ.get(\"AI_NAME\")}'\n",
                encoding="utf-8",
            )
            config = {"paths": {"status_file": str(root / "ai-status.json")}}

            result = run_task_board_command(
                config,
                "sync",
                environ={"AI_NAME": "Codex2"},
            )

        self.assertTrue(result.ok)
        self.assertEqual(result.payload, "sync:Codex2")

    def test_gateway_reports_missing_module_without_raising(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            config = {
                "paths": {"status_file": str(Path(temp) / "ai-status.json")}
            }

            result = run_task_board_command(config, "sync")

        self.assertFalse(result.ok)
        self.assertIn("not found", result.error)


if __name__ == "__main__":
    unittest.main()
