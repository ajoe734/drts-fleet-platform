#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import watch_events


class WatcherBookkeepingTests(unittest.TestCase):
    def test_run_scan_updates_snapshot_without_queueing_when_runtime_enqueue_disabled(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
                "handoffs_path": "handoffs",
            },
            "events": {
                "enqueue_runtime_events": False,
                "review_statuses": ["review"],
                "pending_handoff_statuses": ["pending"],
            },
            "watcher": {"max_seen_events": 2000},
        }
        state = {
            "initialized_at": "2026-04-06T09:00:00Z",
            "last_scan_at": "2026-04-06T09:00:00Z",
            "tasks": {
                "P3-001": {
                    "id": "P3-001",
                    "status": "in_progress",
                    "owner": "Claude",
                    "reviewer": "Codex",
                }
            },
            "pending_handoff_keys": [],
            "seen_event_keys": {},
        }
        status = {
            "tasks": [
                {
                    "id": "P3-001",
                    "status": "review",
                    "owner": "Claude",
                    "reviewer": "Codex",
                }
            ],
            "handoffs": [],
        }

        with (
            mock.patch.object(watch_events, "load_status", return_value=status),
            mock.patch.object(watch_events, "queue_delivery_event", side_effect=AssertionError("watcher should not queue runtime events")),
            mock.patch.object(watch_events, "save_runtime_state"),
        ):
            changed = watch_events.run_scan(config, state, replay=False, provider_capabilities={})

        self.assertTrue(changed)
        self.assertEqual(state["tasks"]["P3-001"]["status"], "review")
        self.assertEqual(state["pending_handoff_keys"], [])
        self.assertIsNotNone(state["last_scan_at"])

    def test_queue_delivery_event_uses_task_brief_context_for_execution(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            status_path = tmp / "ai-status.json"
            event_queue_path = tmp / "event-queue.jsonl"
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "P3-002",
                                "title": "Execution slice",
                                "status": "review",
                                "owner": "Claude",
                                "reviewer": "Codex",
                                "artifacts": ["docs/example.md"],
                                "next": "Short reviewer handoff.",
                            }
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            config = {
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "status_field": "status",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                    "handoffs_path": "handoffs",
                },
                "paths": {
                    "status_file": str(status_path),
                    "event_queue": str(event_queue_path),
                    "activity_log": str(tmp / "activity.jsonl"),
                },
                "agents": {
                    "codex": {
                        "id": "codex",
                        "display_name": "Codex",
                        "provider": "codex2",
                        "adapter": "codex",
                    }
                },
                "providers": {"codex2": {"delivery_mode": "codex"}},
            }
            event = {
                "key": "P3-002:status:review:Codex",
                "task_id": "P3-002",
                "target_agent": "Codex",
                "reason": "review_ready_dispatch",
                "task": {
                    "id": "P3-002",
                    "status": "review",
                    "owner": "Claude",
                    "reviewer": "Codex",
                    "artifacts": ["docs/example.md"],
                },
            }

            queued = watch_events.queue_delivery_event(config, event)

            self.assertTrue(queued)
            payload = json.loads(event_queue_path.read_text(encoding="utf-8").splitlines()[0])
            self.assertIn(".orchestrator/task-briefs/P3-002.md", payload["context_files"])
            self.assertNotIn("current-work.md", payload["context_files"])
            self.assertNotIn("ai-activity-log.jsonl", payload["context_files"])
            self.assertNotIn("docs-site/index.html", payload["context_files"])


if __name__ == "__main__":
    unittest.main()
