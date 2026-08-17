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


class TaskBriefPathTests(unittest.TestCase):
    def test_generated_briefs_do_not_share_the_tracked_source_directory(self) -> None:
        self.assertEqual(
            common.task_brief_path("TASK-001"),
            common.ORCHESTRATOR_DIR / "generated" / "task-briefs" / "TASK-001.md",
        )

    def test_configured_runtime_output_paths_are_used(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            output_root = Path(tmpdir)
            config = {
                "paths": {
                    "task_briefs_dir": str(output_root / "briefs"),
                    "evidence_dir": str(output_root / "evidence"),
                }
            }

            self.assertEqual(
                common.task_brief_path("TASK-001", config),
                output_root / "briefs" / "TASK-001.md",
            )
            self.assertEqual(
                common.evidence_path("run-001", config),
                output_root / "evidence" / "run-001.json",
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


if __name__ == "__main__":
    unittest.main()
