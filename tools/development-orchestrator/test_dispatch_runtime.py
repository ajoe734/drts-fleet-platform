#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from control_plane.runtime import supervisor_runtime as supervisor
from orchestrator_test_support import EvidenceOutputIsolation


class ProcessQueueDispatchGuardTests(EvidenceOutputIsolation, unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {},
            "agents": {
                "codex": {
                    "id": "codex",
                    "name": "Codex",
                    "display_name": "Codex",
                    "provider": "codex",
                    "adapter": "codex",
                }
            },
            "providers": {
                "codex": {
                    "delivery_mode": "codex",
                }
            },
        }
        self.provider_report: dict[str, object] = {}

    def test_build_request_uses_provider_model_preference_for_qwen_agent(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "agents": {
                "qwen": {
                    "id": "qwen",
                    "display_name": "Qwen",
                    "provider": "qwen",
                    "adapter": "qwen",
                }
            },
            "providers": {
                "qwen": {
                    "delivery_mode": "qwen",
                    "model_preference": {
                        "qwen": "qwen3-coder-plus",
                    },
                }
            },
        }

        request = supervisor.build_request(
            config,
            {
                "target_agent": "qwen",
                "message": "wake",
            },
        )

        self.assertEqual(request.agent_id, "qwen")
        self.assertEqual(request.provider, "qwen")
        self.assertEqual(request.metadata["model_preference"], "qwen3-coder-plus")

    def test_build_request_rejects_provider_without_delivery_mode(self) -> None:
        config = {
            "agents": {
                "qwen": {"id": "qwen", "display_name": "Qwen", "provider": "qwen"}
            },
            "providers": {"qwen": {}},
        }

        with self.assertRaisesRegex(ValueError, "no configured delivery_mode"):
            supervisor.build_request(config, {"target_agent": "qwen", "message": "wake"})

    def test_skips_stale_owned_dispatch_event_after_task_completion(self) -> None:
        queued_task = {
            "id": "BUS-VAL-001",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-05T11:45:16Z",
        }
        queued_event = supervisor.build_dispatch_event(
            queued_task,
            "Codex",
            "owned_in_progress_dispatch",
            {"BUS-VAL-001": queued_task},
        )
        queue_payload = {
            "event_id": "evt-stale",
            "event_key": queued_event["key"],
            "task_id": "BUS-VAL-001",
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
            "message": "wake",
        }
        state = {"queue": {"events": {}}, "workers": {}}
        current_status = {
            "tasks": [
                {
                    **queued_task,
                    "status": "done",
                    "last_update": "2026-04-05T12:00:00Z",
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value=current_status),
            mock.patch.object(supervisor, "start_worker_for_request", side_effect=AssertionError("stale event should not start a worker")),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-stale"]
        self.assertEqual(record["status"], "completed")
        self.assertEqual(record["skip_reason"], "stale_dispatch_event")

    def test_marks_event_without_message_manual_pending_without_crashing(self) -> None:
        task = {
            "id": "BUS-VAL-MALFORMED-001",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-05T11:45:16Z",
        }
        queue_payload = {
            "event_id": "evt-missing-message",
            "task_id": task["id"],
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
        }
        state = {"queue": {"events": {}}, "workers": {}}

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [task]}),
            mock.patch.object(
                supervisor,
                "start_worker_for_request",
                side_effect=AssertionError("malformed event must not start a worker"),
            ),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-missing-message"]
        self.assertEqual(record["status"], "manual_pending")
        self.assertEqual(record["error"], "invalid_queue_event_missing_message")
        write_activity_log.assert_called_once()

    def test_skips_queued_dispatch_when_task_is_integrating(self) -> None:
        task = {
            "id": "BUS-VAL-CI-001",
            "status": "integrating",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "ci_status": "pending",
            "pr_url": "https://github.com/example/repo/pull/1",
            "last_update": "2026-04-05T11:45:16Z",
        }
        queued_event = supervisor.build_dispatch_event(
            task,
            "Codex",
            "owned_in_progress_dispatch",
            {"BUS-VAL-CI-001": task},
        )
        queue_payload = {
            "event_id": "evt-ci-pending",
            "event_key": queued_event["key"],
            "task_id": "BUS-VAL-CI-001",
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
            "message": "wake",
        }
        state = {"queue": {"events": {}}, "workers": {}}

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [task]}),
            mock.patch.object(
                supervisor,
                "start_worker_for_request",
                side_effect=AssertionError("Integrating task should not start a worker"),
            ),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-ci-pending"]
        self.assertEqual(record["status"], "completed")
        self.assertEqual(record["skip_reason"], "stale_dispatch_event")

    def test_chair_does_not_dispatch_evidence_only_integration(self) -> None:
        task = {
            "id": "BUS-VAL-CI-002",
            "status": "integrating",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "ci_status": "pending",
        }

        self.assertIsNone(
            supervisor.chair_dispatch_action_reason(
                self.config,
                task,
                {"BUS-VAL-CI-002": task},
            )
        )

    def test_proactive_claim_does_not_reassign_evidence_only_integration(self) -> None:
        task = {
            "id": "BUS-VAL-CI-003",
            "status": "integrating",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "ci_status": "pending",
        }

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            self.config,
            task=task,
            task_map={"BUS-VAL-CI-003": task},
            idle_agent_name="Gemini",
            idle_agent_names=["Gemini"],
            agent_loads={"Codex": [1], "Gemini": []},
            helper_settings={
                "enabled": True,
                "task_statuses": ["integrating"],
                "availability_first": True,
                "allow_any_idle_lane": True,
            },
        )

        self.assertIsNone(plan)

    def test_build_request_uses_task_brief_context_for_execution_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            status_path = tmp / "ai-status.json"
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "BUS-VAL-002",
                                "title": "Execution review",
                                "status": "review",
                                "owner": "Claude",
                                "reviewer": "Qwen",
                                "artifacts": ["docs/example.md"],
                                "next": "Review the execution slice.",
                            }
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "task_briefs_dir": str(tmp / "task-briefs"),
                },
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "status_field": "status",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                },
                "agents": {
                    "qwen": {
                        "id": "qwen",
                        "display_name": "Qwen",
                        "provider": "qwen",
                        "adapter": "qwen",
                    }
                },
                "providers": {"qwen": {"delivery_mode": "qwen"}},
            }

            request = supervisor.build_request(
                config,
                {
                    "target_agent": "qwen",
                    "message": "wake",
                    "task_id": "BUS-VAL-002",
                    "metadata": {
                        "mode": "execution",
                        "task": {
                            "id": "BUS-VAL-002",
                            "status": "review",
                            "owner": "Claude",
                            "reviewer": "Qwen",
                            "artifacts": ["docs/example.md"],
                        },
                    },
                },
            )

            self.assertIn(str(tmp / "task-briefs" / "BUS-VAL-002.md"), request.context_files)
            self.assertNotIn("current-work.md", request.context_files)
            self.assertNotIn("ai-activity-log.jsonl", request.context_files)
            self.assertNotIn("tools/development-orchestrator/dashboard/index.html", request.context_files)

    def test_dispatch_ready_tasks_accepts_backlog_as_owned_ready(self) -> None:
        state = {"queue": {"events": {}}, "workers": {}, "seen_event_keys": {}}
        status = {
            "tasks": [
                {
                    "id": "BUS-VAL-003",
                    "status": "backlog",
                    "owner": "Codex",
                    "reviewer": "",
                    "depends_on": [],
                    "artifacts": ["docs/example.md"],
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(self.config, state)

        self.assertTrue(changed)
        queue_delivery_event.assert_called_once()
        event = queue_delivery_event.call_args.args[1]
        self.assertEqual(event["reason"], "owned_ready_dispatch")
        self.assertEqual(event["task_id"], "BUS-VAL-003")

    def test_dispatcher_honors_codex2_lane_capacity_override(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"codex2": 3},
                "max_dispatches_per_tick": 4,
            },
            "agents": {
                "codex2": {
                    "id": "codex2",
                    "display_name": "Codex2",
                    "provider": "codex2",
                    "adapter": "codex",
                }
            },
            "providers": {"codex2": {"delivery_mode": "codex"}},
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-active": {
                    "run_id": "run-active",
                    "task_id": "CODEX2-ACTIVE",
                    "agent_id": "codex2",
                    "provider": "codex2",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
            "seen_event_keys": {},
        }
        status = {
            "tasks": [
                {"id": "CODEX2-ACTIVE", "status": "in_progress", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-1", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-2", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-3", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertTrue(changed)
        queued_task_ids = [call.args[1]["task_id"] for call in queue_delivery_event.call_args_list]
        self.assertEqual(queued_task_ids, ["CODEX2-NEXT-1", "CODEX2-NEXT-2"])

    def test_lane_capacity_override_zero_disables_lane(self) -> None:
        settings = {
            "max_tasks_per_agent": 4,
            "max_tasks_per_agent_by_lane": {"gemini": 0},
        }

        self.assertEqual(supervisor.max_tasks_per_agent_for_lane(settings, "Gemini"), 0)

    def test_first_viable_agent_skips_disabled_lane(self) -> None:
        config = {
            "ready_dispatcher": {
                "max_tasks_per_agent": 2,
                "max_tasks_per_agent_by_lane": {"gemini": 0, "codex": 2},
            },
            "agents": {
                "gemini": {"display_name": "Gemini", "provider": "gemini"},
                "codex": {"display_name": "Codex", "provider": "codex"},
            },
        }

        result = supervisor.first_viable_agent(
            config,
            ["Gemini", "Codex"],
            exclude=set(),
        )

        self.assertEqual(result, "Codex")

    def test_dispatcher_round_robins_ready_reviews_across_lanes(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"claude": 5, "claude2": 3},
                "max_dispatches_per_tick": 2,
            },
            "agents": {
                "claude": {
                    "id": "claude",
                    "display_name": "Claude",
                    "provider": "claude",
                },
                "claude2": {
                    "id": "claude2",
                    "display_name": "Claude2",
                    "provider": "claude2",
                },
            },
            "providers": {},
        }
        state = {"queue": {"events": {}}, "workers": {}, "seen_event_keys": {}}
        status = {
            "tasks": [
                {"id": "CLAUDE-REV-1", "status": "review", "owner": "Codex", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE-REV-2", "status": "review", "owner": "Codex", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE2-REV-1", "status": "review", "owner": "Codex", "reviewer": "Claude2", "depends_on": []},
                {"id": "CLAUDE2-REV-2", "status": "review", "owner": "Codex", "reviewer": "Claude2", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertTrue(changed)
        queued = [(call.args[1]["task_id"], call.args[1]["target_agent"]) for call in queue_delivery_event.call_args_list]
        self.assertEqual(
            queued,
            [("CLAUDE-REV-1", "Claude"), ("CLAUDE2-REV-1", "Claude2")],
        )

    def test_dispatcher_returns_to_first_lane_after_each_ready_lane_gets_one(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"claude": 5, "claude2": 3},
                "max_dispatches_per_tick": 3,
            },
            "agents": {
                "claude": {
                    "id": "claude",
                    "display_name": "Claude",
                    "provider": "claude",
                },
                "claude2": {
                    "id": "claude2",
                    "display_name": "Claude2",
                    "provider": "claude2",
                },
            },
            "providers": {},
        }
        state = {"queue": {"events": {}}, "workers": {}, "seen_event_keys": {}}
        status = {
            "tasks": [
                {"id": "CLAUDE-REV-1", "status": "review", "owner": "Codex", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE-REV-2", "status": "review", "owner": "Codex", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE2-REV-1", "status": "review", "owner": "Codex", "reviewer": "Claude2", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertTrue(changed)
        queued = [(call.args[1]["task_id"], call.args[1]["target_agent"]) for call in queue_delivery_event.call_args_list]
        self.assertEqual(
            queued,
            [("CLAUDE-REV-1", "Claude"), ("CLAUDE2-REV-1", "Claude2"), ("CLAUDE-REV-2", "Claude")],
        )

    def test_dispatcher_rotates_start_lane_across_ticks(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"claude": 5, "claude2": 3, "codex": 3, "codex2": 3},
                "max_dispatches_per_tick": 2,
            },
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
                "claude2": {"id": "claude2", "display_name": "Claude2", "provider": "claude2"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "codex2": {"id": "codex2", "display_name": "Codex2", "provider": "codex2"},
            },
            "providers": {},
        }
        status = {
            "tasks": [
                {"id": "CLAUDE-REV-1", "status": "review", "owner": "Ops", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE2-REV-1", "status": "review", "owner": "Ops", "reviewer": "Claude2", "depends_on": []},
                {"id": "CODEX-REV-1", "status": "review", "owner": "Ops", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-REV-1", "status": "review", "owner": "Ops", "reviewer": "Codex2", "depends_on": []},
            ]
        }
        first_state = {"queue": {"events": {}}, "workers": {}, "seen_event_keys": {}, "ready_dispatcher": {}}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as first_queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, first_state, provider_report={})

        self.assertTrue(changed)
        first_queued = [
            (call.args[1]["task_id"], call.args[1]["target_agent"]) for call in first_queue_delivery_event.call_args_list
        ]
        self.assertEqual(
            first_queued,
            [("CLAUDE-REV-1", "Claude"), ("CLAUDE2-REV-1", "Claude2")],
        )
        self.assertEqual(first_state["ready_dispatcher"]["next_agent_cursor"], 2)

        second_state = {
            "queue": {"events": {}},
            "workers": {},
            "seen_event_keys": {},
            "ready_dispatcher": {"next_agent_cursor": first_state["ready_dispatcher"]["next_agent_cursor"]},
        }
        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as second_queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, second_state, provider_report={})

        self.assertTrue(changed)
        second_queued = [
            (call.args[1]["task_id"], call.args[1]["target_agent"]) for call in second_queue_delivery_event.call_args_list
        ]
        self.assertEqual(
            second_queued,
            [("CODEX-REV-1", "Codex"), ("CODEX2-REV-1", "Codex2")],
        )

    def test_outstanding_delivery_counts_skip_events_with_active_workers(self) -> None:
        config = {
            "ready_dispatcher": {
                "active_worker_statuses": ["running", "manual_pending"],
            }
        }
        state = {
            "queue": {
                "events": {
                    "evt-active": {"status": "started"},
                    "evt-pending": {"status": "queued"},
                }
            },
            "workers": {
                "run-active": {
                    "queue_event_id": "evt-active",
                    "agent_id": "codex2",
                    "task_id": "CODEX2-ACTIVE",
                    "status": "running",
                }
            },
        }
        events = [
            {
                "event_id": "evt-active",
                "event_key": "dispatcher:Codex2:CODEX2-ACTIVE",
                "target_agent": "codex2",
                "task_id": "CODEX2-ACTIVE",
            },
            {
                "event_id": "evt-pending",
                "event_key": "dispatcher:Codex2:CODEX2-PENDING",
                "target_agent": "codex2",
                "task_id": "CODEX2-PENDING",
            },
        ]

        with mock.patch.object(supervisor, "load_event_queue", return_value=events):
            agents, task_agents, event_keys = supervisor.outstanding_delivery_indexes(config, state)
            counts = supervisor.outstanding_delivery_agent_counts(config, state)

        self.assertEqual(agents, {"codex2"})
        self.assertEqual(task_agents, {("CODEX2-PENDING", "codex2")})
        self.assertEqual(event_keys, {"dispatcher:Codex2:CODEX2-PENDING"})
        self.assertEqual(counts, {"codex2": 1})

    def test_dispatcher_does_not_double_count_started_events_against_lane_capacity(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"codex2": 3},
                "max_dispatches_per_tick": 4,
            },
            "agents": {
                "codex2": {
                    "id": "codex2",
                    "display_name": "Codex2",
                    "provider": "codex2",
                    "adapter": "codex",
                }
            },
            "providers": {"codex2": {"delivery_mode": "codex"}},
        }
        active_task = {"id": "CODEX2-ACTIVE", "status": "in_progress", "owner": "Codex2", "reviewer": "Codex", "depends_on": []}
        active_event = supervisor.build_dispatch_event(
            active_task,
            "Codex2",
            "owned_in_progress_dispatch",
            {"CODEX2-ACTIVE": active_task},
        )
        active_event["event_id"] = "evt-active"
        state = {
            "queue": {"events": {"evt-active": {"status": "started", "run_id": "run-active"}}},
            "workers": {
                "run-active": {
                    "run_id": "run-active",
                    "queue_event_id": "evt-active",
                    "task_id": "CODEX2-ACTIVE",
                    "agent_id": "codex2",
                    "provider": "codex2",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
            "seen_event_keys": {},
        }
        status = {
            "tasks": [
                active_task,
                {"id": "CODEX2-NEXT-1", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-2", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-3", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[active_event]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertTrue(changed)
        queued_task_ids = [call.args[1]["task_id"] for call in queue_delivery_event.call_args_list]
        self.assertEqual(queued_task_ids, ["CODEX2-NEXT-1", "CODEX2-NEXT-2"])

    def test_prune_completed_dispatch_pauses_removes_done_task_entries(self) -> None:
        state = {
            "dispatch_pauses": [
                {"task_id": "DONE-1", "worker_run_id": "run-1"},
                {"task_id": "ACTIVE-1", "worker_run_id": "run-2"},
            ]
        }
        status = {
            "tasks": [
                {"id": "DONE-1", "status": "done"},
                {"id": "ACTIVE-1", "status": "review"},
            ]
        }

        changed = supervisor.prune_completed_dispatch_pauses(state, status)

        self.assertTrue(changed)
        self.assertEqual(state["dispatch_pauses"], [{"task_id": "ACTIVE-1", "worker_run_id": "run-2"}])

    def test_prune_completed_dispatch_pauses_removes_stale_entries_when_task_has_active_worker(self) -> None:
        state = {
            "dispatch_pauses": [
                {"task_id": "ACTIVE-1", "worker_run_id": "run-1"},
                {"task_id": "PAUSED-1", "worker_run_id": "run-2"},
            ],
            "workers": {
                "live-1": {"task_id": "ACTIVE-1", "status": "running"},
            },
        }
        status = {
            "tasks": [
                {"id": "ACTIVE-1", "status": "in_progress"},
                {"id": "PAUSED-1", "status": "backlog"},
            ]
        }

        changed = supervisor.prune_completed_dispatch_pauses(state, status)

        self.assertTrue(changed)
        self.assertEqual(state["dispatch_pauses"], [{"task_id": "PAUSED-1", "worker_run_id": "run-2"}])

    def test_prune_completed_dispatch_pauses_removes_entries_for_tasks_updated_after_pause(self) -> None:
        state = {
            "dispatch_pauses": [
                {"task_id": "REASSIGNED-1", "worker_run_id": "run-1", "paused_at": "2026-04-19T16:03:02Z"},
                {"task_id": "CURRENT-1", "worker_run_id": "run-2", "paused_at": "2026-04-19T16:10:43Z"},
            ],
            "workers": {},
        }
        status = {
            "tasks": [
                {"id": "REASSIGNED-1", "status": "backlog", "last_update": "2026-04-19T16:10:27Z"},
                {"id": "CURRENT-1", "status": "backlog", "last_update": "2026-04-19T16:10:35Z"},
            ]
        }

        changed = supervisor.prune_completed_dispatch_pauses(state, status)

        self.assertTrue(changed)
        self.assertEqual(state["dispatch_pauses"], [{"task_id": "CURRENT-1", "worker_run_id": "run-2", "paused_at": "2026-04-19T16:10:43Z"}])

    def test_prune_completed_dispatch_pauses_removes_recovered_taskless_auth_pause(self) -> None:
        state = {
            "provider_pauses": {
                "gemini": {
                    "kind": "quota",
                    "reason": "quota exhausted",
                    "paused_at": "2026-05-17T13:51:45Z",
                    "resume_at": 9999999999,
                }
            },
            "dispatch_pauses": [
                {
                    "provider": "codex",
                    "task_id": None,
                    "worker_run_id": "codex-stale-auth",
                    "failure_kind": "auth",
                    "summary": "auth: archived log context mentioned token_invalidated",
                    "paused_at": "2026-05-17T15:27:57Z",
                },
                {
                    "provider": "gemini",
                    "task_id": None,
                    "worker_run_id": "gemini-quota",
                    "failure_kind": "quota/terminal",
                    "summary": "quota/terminal: reason: 'QUOTA_EXHAUSTED'",
                    "paused_at": "2026-05-17T13:51:45Z",
                },
            ],
            "workers": {},
        }
        provider_report = {
            "providers": {"codex": {"auth_ready": True}, "gemini": {"auth_ready": True}},
            "agent_adapters": {"codex": {"supported": True}, "gemini": {"supported": True}},
        }

        changed = supervisor.prune_completed_dispatch_pauses(
            state,
            {"tasks": []},
            config=self.config,
            provider_report=provider_report,
        )

        self.assertTrue(changed)
        self.assertEqual(
            state["dispatch_pauses"],
            [
                {
                    "provider": "gemini",
                    "task_id": None,
                    "worker_run_id": "gemini-quota",
                    "failure_kind": "quota/terminal",
                    "summary": "quota/terminal: reason: 'QUOTA_EXHAUSTED'",
                    "paused_at": "2026-05-17T13:51:45Z",
                }
            ],
        )

    def _taskless(self, **overrides) -> dict:
        pause = {
            "provider": "gemini",
            "task_id": None,
            "worker_run_id": "gemini-20260813T155207Z-aaafb200",
            "failure_kind": "quota/terminal",
            "summary": "quota/terminal: Individual quota reached.",
            "paused_at": "2026-08-13T15:52:16Z",
            "blocked_until": None,
        }
        pause.update(overrides)
        return pause

    HEALTHY = {"providers": {"gemini": {"auth_ready": True}},
               "agent_adapters": {"gemini": {"supported": True}}}

    def test_a_taskless_quota_pause_on_a_recovered_lane_is_pruned(self) -> None:
        """The entry found on the live board six days after it was written.

        Nothing could remove it. It names no task, so every task-based rule
        skipped it, and the taskless rule only recognised failure_kind `auth`.
        It blocks no dispatch -- the consumer drops taskless records -- but it
        counts as a failure on every surface reading the list, forever, and each
        new one adds another.
        """
        state = {"provider_pauses": {}, "dispatch_pauses": [self._taskless()], "workers": {}}

        changed = supervisor.prune_completed_dispatch_pauses(
            state, {"tasks": []}, config=self.config, provider_report=self.HEALTHY)

        self.assertTrue(changed)
        self.assertEqual(state["dispatch_pauses"], [])

    def test_a_taskless_pause_inside_its_retry_window_is_kept(self) -> None:
        """blocked_until is the lane's own answer to when it is worth trying
        again; recovering it early would dispatch straight back into the wall."""
        state = {"provider_pauses": {},
                 "dispatch_pauses": [self._taskless(blocked_until="2099-01-01T00:00:00Z")],
                 "workers": {}}

        changed = supervisor.prune_completed_dispatch_pauses(
            state, {"tasks": []}, config=self.config, provider_report=self.HEALTHY)

        self.assertFalse(changed)
        self.assertEqual(len(state["dispatch_pauses"]), 1)

    def test_a_lane_keyed_provider_pause_still_holds_the_dispatch_pause(self) -> None:
        """The registry names the lane in the key, and for lane-scoped entries
        that is the only place it appears. Reading only the lane_id field made
        those invisible, so widening the rule above would have cleared a lane
        that is still recorded as paused."""
        state = {"provider_pauses": {"gemini": {"kind": "quota", "resume_at": 9999999999}},
                 "dispatch_pauses": [self._taskless()], "workers": {}}

        changed = supervisor.prune_completed_dispatch_pauses(
            state, {"tasks": []}, config=self.config, provider_report=self.HEALTHY)

        self.assertFalse(changed)
        self.assertEqual(len(state["dispatch_pauses"]), 1)

    def test_lane_has_recorded_pause_reads_the_key_as_well_as_the_field(self) -> None:
        self.assertTrue(supervisor.lane_has_recorded_pause(
            {"provider_pauses": {"gemini": {"kind": "quota"}}}, "gemini"))
        self.assertTrue(supervisor.lane_has_recorded_pause(
            {"provider_pauses": {"identity:gemini:abc": {"lane_id": "gemini"}}}, "gemini"))
        self.assertFalse(supervisor.lane_has_recorded_pause(
            {"provider_pauses": {"codex": {"kind": "quota"}}}, "gemini"))

    def test_starts_current_owned_dispatch_event(self) -> None:
        current_task = {
            "id": "BUS-VAL-004",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-05T14:54:01Z",
        }
        current_event = supervisor.build_dispatch_event(
            current_task,
            "Codex",
            "owned_in_progress_dispatch",
            {"BUS-VAL-004": current_task},
        )
        queue_payload = {
            "event_id": "evt-current",
            "event_key": current_event["key"],
            "task_id": "BUS-VAL-004",
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
            "message": "wake",
        }
        state = {"queue": {"events": {}}, "workers": {}}
        request = object()
        delivery = {"manual_confirmation_required": False, "auto_delivered": True}

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [current_task]}),
            mock.patch.object(supervisor, "build_request", return_value=request) as build_request,
            mock.patch.object(supervisor, "start_worker_for_request", return_value=(True, "run-123", delivery)) as start_worker,
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-current"]
        self.assertEqual(record["status"], "started")
        self.assertEqual(record["run_id"], "run-123")
        build_request.assert_called_once_with(self.config, queue_payload)
        start_worker.assert_called_once()

    def test_process_queue_defers_worker_start_when_disk_guard_blocks_dispatch(self) -> None:
        queued_task = {
            "id": "BUS-VAL-005",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-05T14:54:01Z",
        }
        queued_event = supervisor.build_dispatch_event(
            queued_task,
            "Codex",
            "owned_in_progress_dispatch",
            {"BUS-VAL-005": queued_task},
        )
        queue_payload = {
            "event_id": "evt-disk",
            "event_key": queued_event["key"],
            "task_id": "BUS-VAL-005",
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
            "message": "wake",
        }
        state = {
            "queue": {"events": {}},
            "workers": {},
            "disk_guard": {
                "dispatch_blocked": True,
                "reason": "disk usage 90.00% >= 85.00%",
            },
        }
        config = {**self.config, "supervisor": {"disk_guard": {"enabled": True}}}

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [queued_task]}),
            mock.patch.object(supervisor, "build_request", side_effect=AssertionError("worker request should be deferred")),
            mock.patch.object(supervisor, "start_worker_for_request", side_effect=AssertionError("worker should not start")),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.process_queue(config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-disk"]
        self.assertEqual(record["status"], "queued")
        self.assertEqual(record["attempt_count"], 0)
        self.assertEqual(record["deferred_reason"], "disk_guard")

    def test_dispatcher_can_requeue_same_task_after_previous_failure(self) -> None:
        current_task = {
            "id": "REG-002",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": [],
            "last_update": "2026-04-06T09:00:00Z",
            "artifacts": ["services/registry/promotion/"],
            "next": "continue",
        }
        state = {
            "queue": {
                "events": {
                    "evt-old": {
                        "status": "failed",
                        "run_id": "old-run",
                    }
                }
            },
            "workers": {
                "old-run": {
                    "run_id": "old-run",
                    "queue_event_id": "evt-old",
                    "task_id": "REG-002",
                    "agent_id": "codex",
                    "status": "failed",
                }
            },
            "seen_event_keys": {"dispatcher:Codex:REG-002:owned_in_progress_dispatch:stale-signature": "2026-04-06T08:59:00Z"},
        }
        status = {"tasks": [current_task]}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(self.config, state)

        self.assertTrue(changed)
        queue_delivery_event.assert_called_once()
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "REG-002")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "owned_in_progress_dispatch")

    def test_dispatcher_does_not_queue_new_events_when_disk_guard_blocks_dispatch(self) -> None:
        current_task = {
            "id": "REG-DISK-001",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": [],
        }
        state = {
            "queue": {"events": {}},
            "workers": {},
            "seen_event_keys": {},
            "disk_guard": {
                "dispatch_blocked": True,
                "reason": "disk usage 90.00% >= 85.00%",
            },
        }
        status = {"tasks": [current_task]}
        config = {**self.config, "supervisor": {"disk_guard": {"enabled": True}}}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", side_effect=AssertionError("new event should not be queued")),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["queue"]["events"], {})
        self.assertEqual(state["disk_guard"]["last_dispatch_block_source"], "ready_dispatcher")

    def test_dispatcher_never_queues_evidence_only_integration(self) -> None:
        current_task = {
            "id": "REG-002",
            "status": "integrating",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": ["REG-001"],
            "last_update": "2026-04-06T15:00:00Z",
        }
        dependency = {
            "id": "REG-001",
            "status": "done",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-06T14:00:00Z",
        }
        state = {"queue": {"events": {}}, "workers": {}}
        status = {"tasks": [dependency, current_task]}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(self.config, state)

        self.assertFalse(changed)
        queue_delivery_event.assert_not_called()

    def test_dispatcher_waits_for_done_not_integrating_dependencies(self) -> None:
        current_task = {
            "id": "FB-003",
            "status": "todo",
            "owner": "Claude",
            "reviewer": "Codex",
            "depends_on": ["REG-002"],
            "last_update": "2026-04-06T15:00:00Z",
        }
        dependency = {
            "id": "REG-002",
            "status": "integrating",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": ["REG-001"],
            "last_update": "2026-04-06T14:00:00Z",
        }
        state = {"queue": {"events": {}}, "workers": {}}
        status = {"tasks": [dependency, current_task]}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(self.config, state)

        self.assertFalse(changed)
        queue_delivery_event.assert_not_called()

    def test_dispatcher_helper_claims_ready_todo_when_owner_is_busy(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["todo"],
                    "require_owner_higher_priority_load": True,
                }
            },
            "worker_reassignment": {
                "owner_fallbacks": {
                    "Copilot": ["Codex", "Claude", "Gemini"],
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
            },
            "providers": {},
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-owner": {
                    "run_id": "run-owner",
                    "task_id": "LP-005",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "review_ready_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "LP-005", "status": "review", "owner": "Copilot", "reviewer": "Codex", "depends_on": []},
                {"id": "FB-003", "status": "todo", "owner": "Copilot", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        persist.assert_called_once()
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "FB-003")
        self.assertEqual(kwargs["new_owner"], "Codex")
        self.assertEqual(kwargs["new_reviewer"], "Copilot")
        self.assertEqual(kwargs["handoff_to"], "Codex")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "FB-003")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "owned_ready_dispatch")

    def test_dispatcher_availability_first_claims_in_progress_when_owner_is_busy(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["in_progress", "review", "todo"],
                    "availability_first": True,
                    "allow_any_idle_lane": True,
                    "require_assigned_agent_busy": True,
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
            },
            "providers": {},
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-busy": {
                    "run_id": "run-busy",
                    "task_id": "BUSY-1",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "BUSY-1", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
                {"id": "REG-100", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        persist.assert_called_once()
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "REG-100")
        self.assertEqual(kwargs["new_owner"], "Codex")
        self.assertEqual(kwargs["new_reviewer"], "Claude")
        self.assertEqual(kwargs["handoff_to"], "Codex")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "REG-100")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "owned_in_progress_dispatch")

    def test_dispatcher_availability_first_skips_quota_paused_idle_lane(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["in_progress"],
                    "availability_first": True,
                    "allow_any_idle_lane": True,
                    "require_assigned_agent_busy": True,
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
            },
            "providers": {},
        }
        state = {
            "queue": {"events": {}},
            "provider_pauses": {
                "codex": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "codex",
                    "kind": "quota",
                    "reason": "provider quota exhausted",
                    "paused_at": "2026-04-16T00:00:00Z",
                    "resume_at": 9999999999,
                }
            },
            "workers": {
                "run-busy": {
                    "run_id": "run-busy",
                    "task_id": "BUSY-PAUSED",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "BUSY-PAUSED", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
                {"id": "REG-PAUSED", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "REG-PAUSED")
        self.assertEqual(kwargs["new_owner"], "Claude")
        self.assertEqual(kwargs["new_reviewer"], "Copilot")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "REG-PAUSED")
        self.assertEqual(queued_event["target_agent"], "Claude")
        self.assertEqual(queued_event["reason"], "owned_in_progress_dispatch")

    def test_dispatcher_does_not_claim_evidence_only_integration_when_owner_is_busy(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["integrating"],
                    "availability_first": True,
                    "allow_any_idle_lane": True,
                    "require_assigned_agent_busy": True,
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
            },
            "providers": {},
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-busy": {
                    "run_id": "run-busy",
                    "task_id": "BUSY-2",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "BUSY-2", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
                {"id": "FIN-100", "status": "integrating", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertFalse(changed)
        persist.assert_not_called()
        queue_delivery_event.assert_not_called()

    def test_dispatcher_availability_first_claims_review_when_reviewer_is_busy(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["review"],
                    "availability_first": True,
                    "allow_any_idle_lane": True,
                    "require_assigned_agent_busy": True,
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
            },
            "providers": {},
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-busy": {
                    "run_id": "run-busy",
                    "task_id": "BUSY-3",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "review_ready_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "BUSY-3", "status": "review", "owner": "Claude", "reviewer": "Copilot", "depends_on": []},
                {"id": "REV-100", "status": "review", "owner": "Claude", "reviewer": "Copilot", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "REV-100")
        self.assertEqual(kwargs["new_owner"], "Claude")
        self.assertEqual(kwargs["new_reviewer"], "Codex")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "REV-100")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "review_ready_dispatch")

    def test_dispatcher_does_not_helper_claim_when_owner_is_not_busy(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["todo"],
                    "require_owner_higher_priority_load": True,
                }
            },
            "worker_reassignment": {
                "owner_fallbacks": {
                    "Copilot": ["Codex", "Claude", "Gemini"],
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
            },
            "providers": {},
        }
        state = {"queue": {"events": {}}, "workers": {}}
        status = {
            "tasks": [
                {"id": "FB-003", "status": "todo", "owner": "Copilot", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        persist.assert_not_called()
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "FB-003")
        self.assertEqual(queued_event["target_agent"], "Copilot")

    def test_skips_duplicate_start_when_active_worker_already_exists(self) -> None:
        current_task = {
            "id": "P3-001",
            "status": "review",
            "owner": "Claude",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-06T05:30:43Z",
        }
        current_event = supervisor.build_dispatch_event(
            current_task,
            "Gemini",
            "review_ready_dispatch",
            {"P3-001": current_task},
        )
        queue_payload = {
            "event_id": "evt-current",
            "event_key": current_event["key"],
            "task_id": "P3-001",
            "target_agent": "gemini",
            "target_display_name": "Gemini",
            "reason": "review_ready_dispatch",
            "message": "wake",
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "gemini-run-1": {
                    "run_id": "gemini-run-1",
                    "queue_event_id": "evt-current",
                    "status": "running",
                }
            },
        }

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [current_task]}),
            mock.patch.object(supervisor, "start_worker_for_request", side_effect=AssertionError("duplicate queue event should not start another worker")),
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-current"]
        self.assertEqual(record["status"], "started")
        self.assertEqual(record["run_id"], "gemini-run-1")
