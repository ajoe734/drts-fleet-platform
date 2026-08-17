#!/usr/bin/env python3
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from control_plane.runtime import supervisor_runtime as supervisor
from orchestrator_test_support import EvidenceOutputIsolation


class PollWorkersRecoveryTests(EvidenceOutputIsolation, unittest.TestCase):
    def test_lower_priority_worker_is_superseded_when_review_backlog_exists(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "active_worker_statuses": ["running", "started", "waiting_approval", "manual_pending", "retry_backoff", "suspended_approval", "stalled", "fallback"],
                "dependency_done_statuses": ["done"],
            },
            "providers": {},
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot"},
                "codex": {"id": "codex", "display_name": "Codex"},
                "claude": {"id": "claude", "display_name": "Claude"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FB-003",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 12345,
                    "last_event_at": "2999-01-01T00:00:00Z",
                    "request_snapshot": {"reason": "owned_ready_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "FB-003", "status": "todo", "owner": "Copilot", "reviewer": "Codex", "depends_on": []},
                {"id": "EX-001", "status": "review", "owner": "Claude", "reviewer": "Copilot", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "terminate_worker_pid") as terminate_worker_pid,
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "superseded")
        self.assertIn("prioritize higher-priority review work", worker["last_error"])
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        terminate_worker_pid.assert_called_once_with(12345)
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_superseded")

    def test_lower_priority_worker_kept_when_lane_capacity_available(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "active_worker_statuses": ["running", "started", "waiting_approval", "manual_pending", "retry_backoff", "suspended_approval", "stalled", "fallback"],
                "dependency_done_statuses": ["done"],
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"codex2": 3},
            },
            "providers": {},
            "agents": {
                "codex2": {"id": "codex2", "display_name": "Codex2"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {
                "events": {
                    "evt-low": {"status": "started"},
                    "evt-high": {"status": "started"},
                }
            },
            "workers": {
                "run-low": {
                    "run_id": "run-low",
                    "task_id": "PBK-UI-004",
                    "provider": "codex2",
                    "agent_id": "codex2",
                    "status": "running",
                    "queue_event_id": "evt-low",
                    "pid": 12345,
                    "last_event_at": "2999-01-01T00:00:00Z",
                    "request_snapshot": {"reason": "owned_ready_dispatch"},
                },
                "run-high": {
                    "run_id": "run-high",
                    "task_id": "PBK-UI-003-SIDECAR-REVIEW",
                    "provider": "codex2",
                    "agent_id": "codex2",
                    "status": "running",
                    "queue_event_id": "evt-high",
                    "pid": 12346,
                    "last_event_at": "2999-01-01T00:00:00Z",
                    "request_snapshot": {"reason": "review_ready_dispatch"},
                },
            },
        }
        status = {
            "tasks": [
                {"id": "PBK-UI-003-SIDECAR-REVIEW", "status": "review", "owner": "Claude2", "reviewer": "Codex2", "depends_on": []},
                {"id": "PBK-UI-004", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": ["PBK-UI-003"]},
                {"id": "PBK-UI-003", "status": "done", "owner": "Claude2", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "terminate_worker_pid") as terminate_worker_pid,
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "utc_now", return_value="2026-04-06T09:01:00Z"),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            supervisor.poll_workers(config, state)

        self.assertEqual(state["workers"]["run-low"]["status"], "running")
        self.assertEqual(state["workers"]["run-high"]["status"], "running")
        terminate_worker_pid.assert_not_called()

    def test_chair_guarded_higher_priority_task_does_not_supersede_full_lane(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "active_worker_statuses": ["running"],
                "review_statuses": ["review"],
                "dependency_done_statuses": ["done"],
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"codex2": 1},
            },
            "agents": {"codex2": {"id": "codex2", "display_name": "Codex2"}},
        }
        low_worker = {
            "task_id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
            "provider": "codex2",
            "agent_id": "codex2",
            "status": "running",
            "queue_event_id": "evt-low",
            "request_snapshot": {"reason": "owned_in_progress_dispatch"},
        }
        state = {
            "queue": {"events": {"evt-low": {"status": "started"}}},
            "workers": {"run-low": low_worker},
            "failure_streaks": {
                "PBK-UI-003:reviewer": {
                    "task_id": "PBK-UI-003",
                    "role": "reviewer",
                    "agent": "Codex2",
                    "awaiting_chair": True,
                }
            },
        }
        task_map = {
            "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR": {
                "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                "status": "in_progress",
                "owner": "Codex2",
                "reviewer": "Claude2",
                "depends_on": [],
            },
            "PBK-UI-003": {
                "id": "PBK-UI-003",
                "status": "review",
                "owner": "Claude2",
                "reviewer": "Codex2",
                "depends_on": [],
            },
        }

        with mock.patch.object(supervisor, "load_event_queue", return_value=[]):
            self.assertFalse(
                supervisor.higher_priority_ready_task_exists(
                    config,
                    low_worker,
                    task_map,
                    state=state,
                    active_statuses={"running"},
                )
            )

    def test_agent_dispatch_loads_skip_events_with_active_workers(self) -> None:
        config = {
            "ready_dispatcher": {"active_worker_statuses": ["running"]},
            "agents": {"codex2": {"id": "codex2", "display_name": "Codex2"}},
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
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        events = [
            {
                "event_id": "evt-active",
                "target_agent": "codex2",
                "target_display_name": "Codex2",
                "reason": "owned_in_progress_dispatch",
            },
            {
                "event_id": "evt-pending",
                "target_agent": "codex2",
                "target_display_name": "Codex2",
                "reason": "review_ready_dispatch",
            },
        ]

        with mock.patch.object(supervisor, "load_event_queue", return_value=events):
            loads = supervisor.agent_dispatch_loads(config, state, {"running"})

        self.assertEqual(loads, {"Codex2": [1, 0]})

    def test_dead_worker_for_open_task_is_marked_failed_not_completed(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "EX-001",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "EX-001", "status": "in_progress", "owner": "Codex", "reviewer": "Claude"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(worker["last_error"], "Worker exited before the task reached a terminal status.")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_dead_worker_for_open_task_can_be_reassigned(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "qwen": {"id": "qwen", "display_name": "Qwen"},
                "codex": {"id": "codex", "display_name": "Codex"},
                "claude": {"id": "claude", "display_name": "Claude"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "EX-002",
                    "provider": "qwen",
                    "agent_id": "qwen",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "EX-002", "status": "in_progress", "owner": "Qwen", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(
                supervisor,
                "maybe_reassign_task_after_worker_failure",
                return_value="Claude",
            ) as maybe_reassign,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "reassigned")
        self.assertEqual(worker["reassigned_to"], "Claude")
        self.assertEqual(worker["last_error"], "Worker exited before the task reached a terminal status.")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        maybe_reassign.assert_called_once_with(
            config,
            worker,
            "Worker exited before the task reached a terminal status.",
            terminal=True,
            state=state,
        )
        write_activity_log.assert_not_called()

    def test_dead_owner_worker_that_advanced_task_to_review_is_completed(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FBP-008",
                    "provider": "claude",
                    "agent_id": "claude",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-15T16:19:02Z",
                    "request_snapshot": {"reason": "owned_ready_dispatch"},
                }
            },
        }
        status = {"tasks": [{"id": "FBP-008", "status": "review", "owner": "Claude", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "completed")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_completed")

    def test_dead_owner_worker_completed_when_status_write_lands_between_loads(self) -> None:
        """Race protection: worker writes status='review' to ai-status.json then exits
        within the same supervisor tick. The task_map cached at the top of the tick
        still shows 'in_progress'; only a fresh re-read sees 'review'. The supervisor
        must not flag this as 'exited before terminal status'."""
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "PBK-UI-003",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-05-18T19:07:30Z",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        stale_status = {"tasks": [{"id": "PBK-UI-003", "status": "in_progress", "owner": "Codex", "reviewer": "Gemini2"}]}
        fresh_status = {"tasks": [{"id": "PBK-UI-003", "status": "review", "owner": "Codex", "reviewer": "Gemini2"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", side_effect=[stale_status, fresh_status]),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "completed")
        self.assertNotIn("last_error", {k: v for k, v in worker.items() if k == "last_error" and v})
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_completed")
        self.assertIn("fresh re-read", write_activity_log.call_args.args[1]["message"])

    def test_dead_owner_worker_still_terminal_when_fresh_status_unchanged(self) -> None:
        """When the fresh re-read confirms the task did not advance, the worker is
        still flagged as 'exited before terminal status' (the race-protection re-read
        must not paper over genuine premature exits)."""
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "EX-009",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-05-18T19:07:30Z",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        # Both cached and fresh agree: still in_progress (worker really did exit prematurely).
        status = {"tasks": [{"id": "EX-009", "status": "in_progress", "owner": "Codex", "reviewer": "Claude"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(worker["last_error"], "Worker exited before the task reached a terminal status.")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_dead_worker_generic_exit_rehydrates_auth_failure_from_log(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "codex2.log"
            log_path.write_text('error: refresh_token_reused\n', encoding="utf-8")
            config = {
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                },
                "supervisor": {"stall_after_seconds": 300},
                "ready_dispatcher": {},
                "providers": {},
                "agents": {
                    "claude": {"id": "claude", "display_name": "Claude"},
                    "codex2": {"id": "codex2", "display_name": "Codex2", "provider": "codex2"},
                },
            }
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "provider_pauses": {},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "EX-010",
                        "provider": "codex2",
                        "agent_id": "codex2",
                        "status": "running",
                        "queue_event_id": "evt-1",
                        "pid": 999999,
                        "log_path": str(log_path),
                        "last_event_at": "2026-05-20T04:50:59Z",
                    }
                },
            }
            status = {"tasks": [{"id": "EX-010", "status": "in_progress", "owner": "Codex2", "reviewer": "Claude"}]}
            real_detect = supervisor.detect_worker_failure_signal
            calls = {"count": 0}

            def flaky_detect(worker: dict[str, object]) -> supervisor.WorkerFailureSignal | None:
                calls["count"] += 1
                if calls["count"] == 1:
                    return None
                return real_detect(worker)  # type: ignore[arg-type]

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=False),
                mock.patch.object(supervisor, "detect_worker_failure_signal", side_effect=flaky_detect),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(worker["last_error_kind"], "auth")
        self.assertIn("refresh_token_reused", worker["last_error"])
        self.assertEqual(state["provider_pauses"]["codex2"]["kind"], "auth")
        self.assertIn("refresh_token_reused", state["provider_pauses"]["codex2"]["reason"])
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_dead_reviewer_worker_that_advanced_to_integrating_is_completed(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FBP-008",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-15T16:30:07Z",
                    "request_snapshot": {"reason": "review_ready_dispatch"},
                }
            },
        }
        status = {"tasks": [{"id": "FBP-008", "status": "integrating", "owner": "Claude", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "completed")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_completed")

    def test_dead_waiting_approval_worker_is_failed_and_approval_is_resolved(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "manual_pending"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "OC-002",
                    "provider": "claude",
                    "agent_id": "claude",
                    "status": "waiting_approval",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "OC-002", "status": "review", "owner": "Codex", "reviewer": "Claude"}]}
        approval_state = {
            "pending": [
                {
                    "approval_id": "apr-1",
                    "worker_run_id": "run-1",
                    "task_id": "OC-002",
                    "provider": "claude",
                    "tool_name": "Bash",
                    "created_at": "2026-04-06T09:01:00Z",
                }
            ],
            "history": [],
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value=approval_state),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "resolve_approval") as resolve_approval,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(worker["last_error"], "Worker exited while waiting for approval.")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        resolve_approval.assert_called_once_with(
            config,
            "apr-1",
            decision="deny",
            note="Auto-denied because the worker exited before approval could be applied.",
            remember=False,
        )
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_dead_claude_waiting_approval_worker_with_session_is_suspended(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "active_worker_statuses": [
                    "running",
                    "waiting_approval",
                    "suspended_approval",
                    "manual_pending",
                ]
            },
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "manual_pending"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "LP-004",
                    "provider": "claude",
                    "agent_id": "claude",
                    "status": "waiting_approval",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "session_id": "sess-123",
                    "resume_token": "sess-123",
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "LP-004", "status": "in_progress", "owner": "Claude", "reviewer": "Codex"}]}
        approval_state = {
            "pending": [
                {
                    "approval_id": "apr-1",
                    "worker_run_id": "run-1",
                    "task_id": "LP-004",
                    "provider": "claude",
                    "tool_name": "ToolSearch",
                    "created_at": "2026-04-06T09:01:00Z",
                }
            ],
            "history": [],
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value=approval_state),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "resolve_approval") as resolve_approval,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "suspended_approval")
        self.assertEqual(worker["deferred_action"], "apr-1")
        self.assertEqual(worker["last_event_at"], "2026-04-06T09:01:00Z")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "manual_pending")
        resolve_approval.assert_not_called()
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_waiting_approval")

    def test_dead_stale_worker_is_reaped_when_task_assignment_moved(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "codex": {"id": "codex", "name": "Codex"},
                "claude": {"id": "claude", "name": "Claude"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "manual_pending"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "EX-001",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "manual_pending",
                    "queue_event_id": "evt-1",
                    "pid": None,
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "EX-001", "status": "review", "owner": "Grok", "reviewer": "Claude"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "superseded")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_superseded")

    def test_stalled_worker_returns_to_running_after_new_log_activity(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "LP-002",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "stalled",
                    "queue_event_id": "evt-1",
                    "pid": 1234,
                    "last_event_at": "2026-04-06T14:20:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "LP-002", "status": "in_progress", "owner": "Codex", "reviewer": "Copilot"}]}

        def bump_log_activity(_config, worker):
            worker["last_event_at"] = "2026-04-06T14:31:28Z"

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "update_from_log", side_effect=bump_log_activity),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "running")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_recovered")

    def test_process_activity_prevents_quiet_verification_from_stalling(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {"codex": {"id": "codex", "display_name": "Codex"}},
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "LP-CPU-001",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 1234,
                    "last_event_at": "2026-04-06T14:20:00Z",
                    "process_tree_cpu_ticks": 100,
                    "last_process_activity_at": "2026-04-06T14:20:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "LP-CPU-001", "status": "in_progress", "owner": "Codex", "reviewer": "Copilot"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "worker_process_tree_cpu_ticks", return_value={1234: 101}),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "running")
        self.assertEqual(worker["process_tree_cpu_ticks"], 101)
        self.assertGreater(worker["last_process_activity_at"], worker["last_event_at"])
        write_activity_log.assert_not_called()

    def test_process_activity_recovers_a_stalled_worker(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {"codex": {"id": "codex", "display_name": "Codex"}},
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "LP-CPU-002",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "stalled",
                    "queue_event_id": "evt-1",
                    "pid": 1234,
                    "last_event_at": "2026-04-06T14:20:00Z",
                    "process_tree_cpu_ticks": 100,
                    "last_process_activity_at": "2026-04-06T14:20:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "LP-CPU-002", "status": "in_progress", "owner": "Codex", "reviewer": "Copilot"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "worker_process_tree_cpu_ticks", return_value={1234: 101}),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "running")
        self.assertIn("local process activity", write_activity_log.call_args.args[1]["message"])

    def test_manual_pending_file_inbox_worker_is_reaped_after_auth_recovers(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "codex": {"id": "codex", "display_name": "Codex"},
                "copilot": {"id": "copilot", "display_name": "Copilot"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "manual_pending"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FBP-010-SIDECAR-REVIEW",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "mode": "file_inbox",
                    "status": "manual_pending",
                    "queue_event_id": "evt-1",
                    "pid": None,
                    "last_event_at": "2026-04-16T00:23:21Z",
                }
            },
        }
        status = {
            "tasks": [
                {
                    "id": "FBP-010-SIDECAR-REVIEW",
                    "status": "review",
                    "owner": "Codex",
                    "reviewer": "Copilot",
                }
            ]
        }
        provider_report = {
            "providers": {
                "copilot": {
                    "auth_ready": True,
                    "local_cli_worker_supported": True,
                }
            }
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value=provider_report),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertNotIn("run-1", state["workers"])
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_reaped")
        self.assertIn("auth recovered", write_activity_log.call_args.args[1]["message"])

    def test_stalled_worker_is_terminated_after_extended_stall(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["todo", "in_progress"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FB-003",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "stalled",
                    "queue_event_id": "evt-1",
                    "pid": 1234,
                    "last_event_at": "2026-04-06T14:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "FB-003", "status": "todo", "owner": "Copilot", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "update_from_log", side_effect=lambda *_args, **_kwargs: None),
            mock.patch.object(supervisor, "terminate_worker_pid") as terminate_worker_pid,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "failed")
        terminate_worker_pid.assert_called_once_with(1234)
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_stalled_worker_can_be_reassigned_after_extended_stall(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["todo", "in_progress"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "qwen": {"id": "qwen", "display_name": "Qwen"},
                "codex": {"id": "codex", "display_name": "Codex"},
                "claude": {"id": "claude", "display_name": "Claude"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FB-004",
                    "provider": "qwen",
                    "agent_id": "qwen",
                    "status": "stalled",
                    "queue_event_id": "evt-1",
                    "pid": 1234,
                    "last_event_at": "2026-04-06T14:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "FB-004", "status": "in_progress", "owner": "Qwen", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "update_from_log", side_effect=lambda *_args, **_kwargs: None),
            mock.patch.object(supervisor, "terminate_worker_pid") as terminate_worker_pid,
            mock.patch.object(
                supervisor,
                "maybe_reassign_task_after_worker_failure",
                return_value="Claude",
            ) as maybe_reassign,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "reassigned")
        self.assertEqual(worker["reassigned_to"], "Claude")
        self.assertIn("terminated for redispatch", worker["last_error"])
        terminate_worker_pid.assert_called_once_with(1234)
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        maybe_reassign.assert_called_once()
        self.assertIn("terminated for redispatch", maybe_reassign.call_args.args[2])
        self.assertEqual(maybe_reassign.call_args.kwargs, {"terminal": True, "state": state})
        write_activity_log.assert_not_called()

    def test_alive_worker_is_superseded_after_reassignment(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot"},
                "gemini": {"id": "gemini", "display_name": "Gemini"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "REG-002",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "stalled",
                    "queue_event_id": "evt-1",
                    "pid": 2222,
                    "last_event_at": "2026-04-06T14:19:47Z",
                }
            },
        }
        status = {"tasks": [{"id": "REG-002", "status": "review", "owner": "Codex", "reviewer": "Gemini"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate_worker_pid,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "superseded")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        terminate_worker_pid.assert_called_once_with(2222)
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_superseded")
