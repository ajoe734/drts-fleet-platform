#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

THIS_DIR = Path(__file__).resolve().parent
if str(THIS_DIR) not in sys.path:
    sys.path.insert(0, str(THIS_DIR))

import common


class CommandExistsTests(unittest.TestCase):
    def test_finds_repo_local_cli_when_not_on_system_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            local_cli = root / ".orchestrator" / "bin" / "node_modules" / ".bin" / "gemini"
            local_cli.parent.mkdir(parents=True)
            local_cli.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            local_cli.chmod(0o755)

            with mock.patch.object(common, "ROOT", root), mock.patch.dict("os.environ", {"PATH": ""}):
                self.assertEqual(common.command_exists("gemini"), str(local_cli))

    def test_finds_cli_from_additional_search_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            code_root = tmp / "code-copy"
            workspace_root = tmp / "workspace"
            code_root.mkdir()
            local_cli = workspace_root / ".orchestrator" / "bin" / "node_modules" / ".bin" / "gemini"
            local_cli.parent.mkdir(parents=True)
            local_cli.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            local_cli.chmod(0o755)

            with mock.patch.object(common, "ROOT", code_root), mock.patch.dict("os.environ", {"PATH": ""}):
                self.assertEqual(common.command_exists("gemini", search_roots=[workspace_root]), str(local_cli))


class RuntimeClaudeMcpConfigTests(unittest.TestCase):
    def test_uses_runtime_broker_and_canonical_state_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            state_file = root / ".orchestrator" / "state.json"
            config = {"paths": {"state_file": str(state_file)}}

            with mock.patch.object(common, "ORCHESTRATOR_DIR", Path("/runtime/.orchestrator")):
                path = common.runtime_claude_mcp_config_path(config)

            payload = json.loads(path.read_text(encoding="utf-8"))
            server = payload["mcpServers"]["orchestrator_approval_broker"]
            self.assertEqual(server["args"][0], "/runtime/.orchestrator/claude_permission_prompt_mcp.py")
            self.assertEqual(server["args"][2], str(root / ".orchestrator" / "config.json"))


class WorkerScopePropertiesTests(unittest.TestCase):
    def test_selects_bounded_profile_for_execution_heavy_and_control_workers(self) -> None:
        config = {
            "supervisor": {
                "worker_scopes": {
                    "profiles": {
                        "execution": {"memory_high": "4G", "memory_max": "5G"},
                        "heavy": {"memory_high": "5G", "memory_max": "6G"},
                        "control": {"memory_high": "1G", "memory_max": "2G"},
                    }
                }
            }
        }

        self.assertEqual(
            common.worker_scope_properties(config),
            ["MemoryHigh=4G", "MemoryMax=5G"],
        )
        self.assertEqual(
            common.worker_scope_properties(config, {"resource_profile": "heavy"}),
            ["MemoryHigh=5G", "MemoryMax=6G"],
        )
        self.assertEqual(
            common.worker_scope_properties(config, {"control_role": "chair"}),
            ["MemoryHigh=1G", "MemoryMax=2G"],
        )


class JsonlAppendTests(unittest.TestCase):
    def test_append_jsonl_keeps_every_line_parseable_under_concurrency(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "activity.jsonl"

            def worker(worker_id: int) -> None:
                for index in range(50):
                    common.append_jsonl(path, {"worker": worker_id, "index": index})

            threads = [threading.Thread(target=worker, args=(worker_id,)) for worker_id in range(4)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()

            lines = path.read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(lines), 200)
            for line in lines:
                payload = json.loads(line)
                self.assertIn("worker", payload)
                self.assertIn("index", payload)


class TaskSnapshotTests(unittest.TestCase):
    def test_preserves_execution_branch_for_reassigned_work(self) -> None:
        snapshot = common.snapshot_task(
            {
                "id": "TASK-1",
                "status": "in_progress",
                "owner": "Codex",
                "reviewer": "Claude",
                "execution_branch": "codex/task-1",
            },
            {
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
        )

        self.assertEqual(snapshot["execution_branch"], "codex/task-1")


if __name__ == "__main__":
    unittest.main()
