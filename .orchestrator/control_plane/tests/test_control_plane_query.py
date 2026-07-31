from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from control_plane.app.control_plane_query import query


class ControlPlaneQueryTests(unittest.TestCase):
    def test_dispatch_preview_reads_the_repo_owned_by_the_supplied_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_dir = root / ".orchestrator"
            config_dir.mkdir()
            config_path = config_dir / "config.json"
            config_path.write_text(
                json.dumps({"paths": {"status_file": "ai-status.json"}}),
                encoding="utf-8",
            )
            (root / "ai-status.json").write_text(
                json.dumps(
                    {
                        "tasks": [
                            {"id": "DEP-1", "status": "done"},
                            {
                                "id": "TASK-1",
                                "status": "backlog",
                                "owner": "Codex",
                                "depends_on": ["DEP-1"],
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )

            result = query(
                [
                    "--config",
                    str(config_path),
                    "dispatch-preview",
                    "TASK-1",
                    "--source",
                    "test",
                ]
            )

        self.assertTrue(result["ok"])
        self.assertEqual(
            result["dispatch"]["queue_event"]["target_agent"], "Codex"
        )

    def test_enqueue_dispatch_writes_once_through_canonical_queue_repo(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            config_dir = root / ".orchestrator"
            config_dir.mkdir()
            config_path = config_dir / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "paths": {
                            "status_file": "ai-status.json",
                            "event_queue": ".orchestrator/event-queue.jsonl",
                        }
                    }
                ),
                encoding="utf-8",
            )
            (root / "ai-status.json").write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "TASK-1",
                                "status": "backlog",
                                "owner": "Codex",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            argv = [
                "--config",
                str(config_path),
                "enqueue-dispatch",
                "TASK-1",
                "--source",
                "test",
            ]

            first = query(argv)
            duplicate = query(argv)
            rows = [
                json.loads(line)
                for line in (config_dir / "event-queue.jsonl")
                .read_text(encoding="utf-8")
                .splitlines()
            ]

        self.assertTrue(first["queued"])
        self.assertFalse(duplicate["queued"])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["task_id"], "TASK-1")


if __name__ == "__main__":
    unittest.main()
