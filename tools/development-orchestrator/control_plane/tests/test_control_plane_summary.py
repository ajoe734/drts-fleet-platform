from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from control_plane.projections.control_plane_summary import (
    build_control_plane_summary,
    refresh_control_plane_summary,
)


class ControlPlaneSummaryTests(unittest.TestCase):
    def test_builds_bounded_operational_projection(self) -> None:
        summary = build_control_plane_summary(
            {"agents": {"codex": {"name": "Codex", "provider": "codex"}}},
            {
                "tasks": [
                    {
                        "id": "TASK-1",
                        "status": "backlog",
                        "owner": "Codex",
                    }
                ]
            },
            {
                "supervisor": {"lifecycle": "running"},
                "workers": {
                    "run-1": {
                        "task_id": "TASK-1",
                        "agent_id": "codex",
                        "status": "running",
                        "request_snapshot": {"large": "not projected"},
                    }
                },
                "queue": {"events": {"evt-1": {"status": "queued"}}},
            },
            {"pending": [{"status": "pending"}]},
            [{"event_id": "evt-1"}],
            {
                "generated_at": "2026-07-18T00:00:00Z",
                "agent_adapters": {
                    "codex": {
                        "adapter": "codex",
                        "supported": True,
                        "notes": "large diagnostic text is intentionally omitted",
                    }
                },
            },
        )

        self.assertEqual(summary["tasks"]["by_status"], {"backlog": 1})
        self.assertEqual(
            summary["tasks"]["dispatch_previews"]["TASK-1"]["target_agent"],
            "Codex",
        )
        self.assertEqual(summary["runtime"]["active_worker_count"], 1)
        self.assertNotIn(
            "request_snapshot", summary["runtime"]["active_workers"][0]
        )
        self.assertNotIn("notes", summary["provider_report"]["agents"]["codex"])

    def test_refresh_writes_configured_projection_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            status_path = root / "ai-status.json"
            approval_path = root / "approvals.json"
            queue_path = root / "events.jsonl"
            summary_path = root / "summary.json"
            status_path.write_text('{"tasks": []}', encoding="utf-8")
            approval_path.write_text('{"pending": [], "history": []}', encoding="utf-8")
            queue_path.write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "approval_queue": str(approval_path),
                    "event_queue": str(queue_path),
                    "control_plane_summary": str(summary_path),
                }
            }

            refresh_control_plane_summary(config, {"workers": {}, "queue": {}})
            payload = json.loads(summary_path.read_text(encoding="utf-8"))

        self.assertEqual(payload["version"], 1)
        self.assertEqual(payload["tasks"]["total"], 0)


if __name__ == "__main__":
    unittest.main()
