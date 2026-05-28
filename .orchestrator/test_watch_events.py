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
            self.assertNotIn(".orchestrator/task-briefs/P3-002.md", payload["context_files"])
            self.assertIn("# Task Brief: P3-002", payload["message"])
            self.assertNotIn("current-work.md", payload["context_files"])
            self.assertNotIn("ai-activity-log.jsonl", payload["context_files"])
            self.assertNotIn("docs-site/index.html", payload["context_files"])

    def test_queue_delivery_event_omits_repo_external_artifact_targets(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            status_path = tmp / "ai-status.json"
            event_queue_path = tmp / "event-queue.jsonl"
            status_path.write_text('{"tasks": []}', encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "event_queue": str(event_queue_path),
                    "activity_log": str(tmp / "activity.jsonl"),
                },
                "agents": {
                    "codex": {
                        "id": "codex",
                        "display_name": "Codex",
                        "provider": "codex",
                        "adapter": "codex",
                    }
                },
            }
            event = {
                "key": "P3-003:status:review:Codex",
                "task_id": "P3-003",
                "target_agent": "Codex",
                "reason": "review_ready_dispatch",
                "task": {
                    "id": "P3-003",
                    "artifacts": [
                        "docs/example.md",
                        "/home/edna/workspace/tenant-commute-hub/src",
                    ],
                },
            }

            queued = watch_events.queue_delivery_event(config, event)

            self.assertTrue(queued)
            payload = json.loads(event_queue_path.read_text(encoding="utf-8").splitlines()[0])
            self.assertEqual(payload["target_files"], ["docs/example.md"])
            self.assertIn("## Repo-External Artifacts", payload["message"])
            self.assertIn("/home/edna/workspace/tenant-commute-hub/src", payload["message"])
            self.assertIn("do not stage repo-external paths from this repository", payload["message"])


class RenderWakeupMessageTests(unittest.TestCase):
    """Coverage for the branch-protocol block injected by OPS-GIT-WORKFLOW-005.

    The block must appear with concrete lane/task_id_kebab/base_branch values
    when all three facts are available, and degrade to a blank string when any
    are missing (e.g. planning baton dispatch with no task_id).
    """

    def _config(self, agent_id: str = "claude") -> dict:
        return {
            "agents": {
                agent_id: {
                    "id": agent_id,
                    "display_name": agent_id.capitalize(),
                    "provider": agent_id,
                    "adapter": "claude_cli",
                    "wake_template": ".orchestrator/templates/wakeup.txt",
                }
            },
            "providers": {agent_id: {"delivery_mode": "claude_cli"}},
        }

    def test_backend_task_emits_concrete_branch_block(self) -> None:
        config = self._config(agent_id="claude")
        event = {
            "task_id": "BE-APR-NOTIFY-001",
            "target_agent": "claude",
            "reason": "owned_in_progress_dispatch",
            "task": {"id": "BE-APR-NOTIFY-001"},
            "target_files": [],
        }
        with mock.patch.object(watch_events, "selected_shared_files", return_value=[]):
            rendered = watch_events.render_wakeup_message(config, event, "claude")

        self.assertIn("`claude/be-apr-notify-001`", rendered)
        # v4: backend track now routes to the single `dev` trunk.
        self.assertIn("origin/dev", rendered)
        self.assertIn('LLM-Agent: claude', rendered)
        self.assertIn("Task-ID: BE-APR-NOTIFY-001", rendered)
        self.assertIn(".orchestrator/skills/worker-anchor-commit.md", rendered)
        self.assertNotIn("{{branch_protocol}}", rendered)

    def test_frontend_task_routes_to_frontend_trunk(self) -> None:
        config = self._config(agent_id="gemini2")
        event = {
            "task_id": "UI-CANVAS-OC-PAGE-INCIDENTS-001",
            "target_agent": "gemini2",
            "reason": "owned_in_progress_dispatch",
            "task": {"id": "UI-CANVAS-OC-PAGE-INCIDENTS-001"},
            "target_files": [],
        }
        with mock.patch.object(watch_events, "selected_shared_files", return_value=[]):
            rendered = watch_events.render_wakeup_message(config, event, "gemini2")

        self.assertIn("`gemini2/ui-canvas-oc-page-incidents-001`", rendered)
        # v4: frontend track also routes to the single `dev` trunk.
        self.assertIn("origin/dev", rendered)
        # Lane substitution uses the agent id, not the display name.
        self.assertIn("LLM-Agent: gemini2", rendered)

    def test_missing_task_id_degrades_to_blank_block(self) -> None:
        """Planning-baton or other task-less dispatches must NOT print a
        garbage `git switch -c lane/` line. The block should collapse."""
        config = self._config(agent_id="claude")
        event = {
            "task_id": "",
            "target_agent": "claude",
            "reason": "planning",
            "task": {},
            "target_files": [],
        }
        with mock.patch.object(watch_events, "selected_shared_files", return_value=[]):
            rendered = watch_events.render_wakeup_message(config, event, "claude")

        self.assertNotIn("git switch -c claude/", rendered)
        self.assertNotIn("anchor commit", rendered)
        self.assertNotIn("{{branch_protocol}}", rendered)

    def test_build_branch_protocol_block_requires_all_facts(self) -> None:
        block = watch_events.build_branch_protocol_block(
            task_id="OPS-GIT-WORKFLOW-005",
            lane="claude",
            task_id_kebab="ops-git-workflow-005",
            base_branch="dev",
        )
        self.assertIn("claude/ops-git-workflow-005", block)
        self.assertIn("origin/dev", block)
        self.assertIn("worker-anchor-commit.md", block)

        # Missing any one fact → empty.
        for missing in [
            {"task_id": ""},
            {"lane": ""},
            {"task_id_kebab": ""},
            {"base_branch": ""},
        ]:
            kwargs = {
                "task_id": "OPS-GIT-WORKFLOW-005",
                "lane": "claude",
                "task_id_kebab": "ops-git-workflow-005",
                "base_branch": "backend-dev",
            }
            kwargs.update(missing)
            self.assertEqual(watch_events.build_branch_protocol_block(**kwargs), "")


if __name__ == "__main__":
    unittest.main()
