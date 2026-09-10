#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from control_plane.runtime import supervisor_runtime as supervisor
from orchestrator_test_support import EvidenceOutputIsolation


class PollWorkersRecoveryTests(EvidenceOutputIsolation, unittest.TestCase):
    def _coordination_worker_config(self) -> dict:
        return {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "active_worker_statuses": ["running", "started", "manual_pending"],
                "dependency_done_statuses": ["done"],
            },
            "providers": {},
            "agents": {"gemini2": {"id": "gemini2", "display_name": "Gemini2"}},
        }

    def _dead_coordination_worker(self, target_files: list[str]) -> dict:
        return {
            "run_id": "run-chair",
            "task_id": None,
            "provider": "gemini2",
            "agent_id": "gemini2",
            "status": "running",
            "queue_event_id": "evt-chair",
            "pid": 4242,
            "last_event_at": "2026-01-01T00:00:00Z",
            "request_snapshot": {
                "reason": "chair_review:blocked_task_triage",
                "metadata": {"mode": "coordination"},
                "target_files": target_files,
            },
        }

    def _poll_dead_coordination_worker(self, worker: dict, config: dict) -> list[dict]:
        state = {"queue": {"events": {"evt-chair": {"status": "started"}}}, "workers": {"run-chair": worker}}
        logged: list[dict] = []
        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": []}),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "detect_worker_failure_signal", return_value=None),
            mock.patch.object(supervisor, "record_worker_evidence", return_value="evidence-ref"),
            mock.patch.object(supervisor, "write_activity_log", side_effect=lambda _c, payload: logged.append(payload)),
        ):
            supervisor.poll_workers(config, state)
        return logged

    def test_coordination_worker_is_failed_when_it_produced_no_declared_output(self) -> None:
        """A dispatch declares target_files; producing none of them is not success.

        The runtime never captures an exit status -- workers are detached and
        observed through /proc -- so before this, a coordination worker was
        called complete whenever the process was gone and no known error string
        appeared in its log. An antigravity run whose entire log was
        "Error: Agent execution terminated due to error." was therefore recorded
        as "exited cleanly", and the lane failure was never attributed.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            missing = str(Path(tmpdir) / "chair.json")
            worker = self._dead_coordination_worker([missing])
            logged = self._poll_dead_coordination_worker(worker, self._coordination_worker_config())

        self.assertEqual(worker["status"], "failed")
        messages = [str(entry.get("message") or "") for entry in logged]
        self.assertFalse([m for m in messages if "exited cleanly" in m], messages)
        self.assertIn("worker_failed", [entry.get("type") for entry in logged])

    def test_coordination_worker_completes_when_its_declared_output_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            produced = Path(tmpdir) / "chair.json"
            produced.write_text("{}", encoding="utf-8")
            worker = self._dead_coordination_worker([str(produced)])
            logged = self._poll_dead_coordination_worker(worker, self._coordination_worker_config())

        self.assertEqual(worker["status"], "completed")
        self.assertIn("worker_completed", [entry.get("type") for entry in logged])

    def test_coordination_worker_without_a_declared_contract_still_completes(self) -> None:
        """Only a declared contract can be enforced; an empty list stays a no-op."""
        worker = self._dead_coordination_worker([])
        logged = self._poll_dead_coordination_worker(worker, self._coordination_worker_config())

        self.assertEqual(worker["status"], "completed")
        self.assertIn("worker_completed", [entry.get("type") for entry in logged])

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

    def _agy_config(self) -> dict:
        return {
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
            "agents": {"antigravity": {"id": "antigravity", "display_name": "Antigravity", "adapter": "antigravity"}},
        }

    def _agy_adapter_config(self) -> dict:
        """Minimal config for direct update_from_log() calls: only the
        worker's configured adapter (not log content shape) may mark it
        agy-shaped, so these unit tests must resolve to adapter=antigravity."""
        return {"agents": {"antigravity": {"adapter": "antigravity"}}}

    def _agy_step_update(self, index: int, step_type: str) -> str:
        return json.dumps({
            "event": "step_update",
            "step_update": {
                "conversation_id": "ff862b49-a393-42f9-a7d1-84cf1951bc45",
                "step_index": index,
                "state": "DONE",
                "step_type": step_type,
                "duration_seconds": 0,
            },
        })

    def _agy_result(self, status: str, *, error: str = "", response: str = "") -> str:
        return json.dumps({
            "event": "result",
            "result": {
                "conversation_id": "ff862b49-a393-42f9-a7d1-84cf1951bc45",
                "status": status,
                "response": response,
                "error": error,
                "duration_seconds": 99.1,
                "num_turns": 1,
                "usage": {"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "cache_read_tokens": 0, "total_tokens": 0},
            },
        })

    def test_repeated_agy_error_events_do_not_recover_a_stalled_worker(self) -> None:
        """Live evidence: enabling agy's stream-json floods the log with repeated
        step_update/error_message noise while the turn is stuck retrying. That
        noise keeps the log's mtime moving, but it is not the turn making
        progress, so it must not un-stall the worker or reset its stall clock.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "agy.log"
            log_path.write_text(
                "\n".join(self._agy_step_update(i, "error_message") for i in range(6)),
                encoding="utf-8",
            )
            # Recent enough that this poll's job is only to decide whether the
            # noise recovers the worker, not to also cross the extended-stall
            # termination threshold checked further down poll_workers.
            recent = (datetime.now(timezone.utc) - timedelta(seconds=120)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "AGY-001",
                        "provider": "antigravity",
                        "agent_id": "antigravity",
                        "status": "stalled",
                        "queue_event_id": "evt-1",
                        "pid": 1234,
                        "log_path": str(log_path),
                        "last_event_at": recent,
                    }
                },
            }
            status = {"tasks": [{"id": "AGY-001", "status": "in_progress", "owner": "Antigravity", "reviewer": "Codex"}]}

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(self._agy_config(), state)

        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "stalled")
        self.assertEqual(worker["last_event_at"], recent)
        self.assertFalse(changed)
        recovered = [
            entry for entry in write_activity_log.call_args_list
            if entry.args[1].get("type") == "worker_recovered"
        ]
        self.assertEqual(recovered, [])

    def test_repeated_agy_error_events_with_advancing_cpu_ticks_do_not_recover_a_stalled_worker(self) -> None:
        """Codex2 exact-candidate rejection repro (.local/worker-recovery-20260910/
        gemini-probe.log, terminal result stripped): a stalled agy worker whose
        stream is stuck in the same error_message retry loop still accrues CPU
        ticks from the retry/auth machinery itself. worker_process_tree_cpu_ticks
        advancing (100 -> 101) must not, by itself, flip the worker back to
        running or refresh last_process_activity_at -- only a real productive
        step_update/result advance (last_event_at moving) may do that once a
        worker's log is known to be agy-shaped. Non-agy adapters are unaffected
        (see test_process_activity_recovers_a_stalled_worker).
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "agy.log"
            log_path.write_text(
                "\n".join(self._agy_step_update(i, "error_message") for i in range(6)),
                encoding="utf-8",
            )
            recent = (datetime.now(timezone.utc) - timedelta(seconds=120)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "AGY-007",
                        "provider": "antigravity",
                        "agent_id": "antigravity",
                        "status": "stalled",
                        "queue_event_id": "evt-1",
                        "pid": 1234,
                        "log_path": str(log_path),
                        "last_event_at": recent,
                        "process_tree_cpu_ticks": 100,
                        "last_process_activity_at": recent,
                    }
                },
            }
            status = {"tasks": [{"id": "AGY-007", "status": "in_progress", "owner": "Antigravity", "reviewer": "Codex"}]}

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "worker_process_tree_cpu_ticks", return_value={1234: 101}),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(self._agy_config(), state)

        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "stalled")
        self.assertEqual(worker["last_event_at"], recent)
        self.assertEqual(worker["last_process_activity_at"], recent)
        self.assertEqual(worker["_agy_stream_productive_event_count"], 0)
        recovered = [
            entry for entry in write_activity_log.call_args_list
            if entry.args[1].get("type") == "worker_recovered"
        ]
        self.assertEqual(recovered, [])

    def test_productive_agy_stream_event_recovers_a_stalled_worker(self) -> None:
        """A real (non-error_message) step_update is the turn actually moving,
        so it must still un-stall the worker the same way any other adapter's
        log growth does.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "agy.log"
            log_path.write_text(
                "\n".join([
                    self._agy_step_update(0, "user_input"),
                    self._agy_step_update(1, "agent_response"),
                ]),
                encoding="utf-8",
            )
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "AGY-002",
                        "provider": "antigravity",
                        "agent_id": "antigravity",
                        "status": "stalled",
                        "queue_event_id": "evt-1",
                        "pid": 1234,
                        "log_path": str(log_path),
                        "last_event_at": "2026-04-06T14:20:00Z",
                    }
                },
            }
            status = {"tasks": [{"id": "AGY-002", "status": "in_progress", "owner": "Antigravity", "reviewer": "Codex"}]}

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(self._agy_config(), state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "running")
        self.assertGreater(worker["last_event_at"], "2026-04-06T14:20:00Z")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_recovered")

    def test_quiet_live_agy_process_leaves_worker_state_unchanged(self) -> None:
        """No new bytes at all (the process is alive but genuinely silent, not
        just noisy) must not be confused with either recovery or fresh stall
        accounting.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "agy.log"
            log_path.write_text(self._agy_step_update(0, "user_input"), encoding="utf-8")
            last_event_at = supervisor.file_iso_mtime(log_path)
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "AGY-003",
                        "provider": "antigravity",
                        "agent_id": "antigravity",
                        "status": "running",
                        "queue_event_id": "evt-1",
                        "pid": 1234,
                        "log_path": str(log_path),
                        "last_event_at": last_event_at,
                    }
                },
            }
            status = {"tasks": [{"id": "AGY-003", "status": "in_progress", "owner": "Antigravity", "reviewer": "Codex"}]}

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(self._agy_config(), state)

        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "running")
        self.assertEqual(worker["last_event_at"], last_event_at)
        write_activity_log.assert_not_called()
        self.assertFalse(changed)

    def test_quiet_productive_agy_process_keeps_cpu_activity_credit(self) -> None:
        """Codex2 rejection repro: a *healthy* quiet agy worker (no error,
        no retry) whose log has already been fully observed (no new bytes
        this poll) still advances via /proc CPU accounting while it works.
        The rejected candidate suppressed that CPU credit for *any*
        agy-shaped worker whenever the log stayed quiet, with no requirement
        that the quiet spell actually contain retry-loop noise -- so this
        legitimate case was stalled after stall_after_seconds and killed
        after twice that interval despite continuing process-tree CPU
        progress. Retry noise (see
        test_repeated_agy_error_events_with_advancing_cpu_ticks_do_not_recover_a_stalled_worker)
        must still be suppressed; a genuinely silent log must not be.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "agy.log"
            log_path.write_text(
                "\n".join([
                    self._agy_step_update(0, "user_input"),
                    self._agy_step_update(1, "agent_response"),
                    self._agy_result("DONE"),
                ]),
                encoding="utf-8",
            )
            # Backdate the log's mtime so it matches an already-observed
            # last_event_at: nothing new landed in the log this poll, so
            # there is no evidence of retry-loop noise to react to.
            stale_epoch = (datetime.now(timezone.utc) - timedelta(seconds=400)).timestamp()
            os.utime(log_path, (stale_epoch, stale_epoch))
            last_event_at = supervisor.file_iso_mtime(log_path)
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "AGY-008",
                        "provider": "antigravity",
                        "agent_id": "antigravity",
                        "status": "running",
                        "queue_event_id": "evt-1",
                        "pid": 1234,
                        "log_path": str(log_path),
                        "last_event_at": last_event_at,
                        "_agy_stream_productive_event_count": 2,
                        "process_tree_cpu_ticks": 100,
                        "last_process_activity_at": last_event_at,
                    }
                },
            }
            status = {"tasks": [{"id": "AGY-008", "status": "in_progress", "owner": "Antigravity", "reviewer": "Codex"}]}

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "worker_process_tree_cpu_ticks", return_value={1234: 101}),
                mock.patch.object(supervisor, "write_activity_log"),
            ):
                supervisor.poll_workers(self._agy_config(), state)

        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "running")
        # The CPU tick advance must still be credited: last_process_activity_at
        # moves forward from the stale baseline instead of being reverted.
        self.assertGreater(worker["last_process_activity_at"], last_event_at)

    def test_dead_worker_with_structured_agy_error_and_exit_zero_is_never_completed(self) -> None:
        """Live probe evidence (.local/worker-recovery-20260910/gemini-probe-result.json):
        agy exited rc=0 after a stream interruption with an empty response and
        zero tokens. At the poll_workers level (not just the failure detector
        in isolation) a dead worker whose log ends in a structured ERROR result
        must be finalized as failed, never as a clean completion.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "agy.log"
            log_path.write_text(
                "\n".join([
                    self._agy_step_update(0, "user_input"),
                    self._agy_step_update(1, "agent_response"),
                    self._agy_step_update(2, "error_message"),
                    self._agy_result("ERROR", error="The stream was interrupted. Please continue the task you were working on."),
                ]),
                encoding="utf-8",
            )
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "AGY-004",
                        "provider": "antigravity",
                        "agent_id": "antigravity",
                        "status": "running",
                        "queue_event_id": "evt-1",
                        "pid": 999999,
                        "log_path": str(log_path),
                        "last_event_at": "2026-04-06T14:20:00Z",
                    }
                },
            }
            status = {"tasks": [{"id": "AGY-004", "status": "in_progress", "owner": "Antigravity", "reviewer": "Codex"}]}

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=False),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(self._agy_config(), state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertIn("stream was interrupted", worker["last_error"].lower())
        logged_types = [entry.args[1].get("type") for entry in write_activity_log.call_args_list]
        self.assertNotIn("worker_completed", logged_types)

    def test_full_agy_retry_trace_with_duplicate_step_does_not_recover_a_stalled_worker(self) -> None:
        """End-to-end reproduction of the rejected-candidate evidence
        (.local/worker-recovery-20260910/gemini-probe.log): six alternating
        agent_response/error_message pairs after the initial user_input,
        terminated by a structured ERROR result, plus a duplicated replay of
        an already-observed step_index. detect_worker_failure_signal is
        mocked out so this only exercises the productive-event counting used
        for the stalled->running recovery decision (the terminal ERROR
        detection itself is covered separately by
        test_dead_worker_with_structured_agy_error_and_exit_zero_is_never_completed).
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "agy.log"
            lines = [self._agy_step_update(0, "user_input")]
            for i in range(6):
                lines.append(self._agy_step_update(2 * i + 1, "agent_response"))
                lines.append(self._agy_step_update(2 * i + 2, "error_message"))
            lines.append(
                self._agy_result(
                    "ERROR",
                    error="The stream was interrupted. Please continue the task you were working on.",
                )
            )
            lines.append(self._agy_step_update(11, "agent_response"))  # duplicate replay of an already-observed step
            log_path.write_text("\n".join(lines), encoding="utf-8")

            old = (datetime.now(timezone.utc) - timedelta(seconds=60)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "AGY-006",
                        "provider": "antigravity",
                        "agent_id": "antigravity",
                        "status": "stalled",
                        "queue_event_id": "evt-1",
                        "pid": 1234,
                        "log_path": str(log_path),
                        "last_event_at": old,
                        "_agy_stream_productive_event_count": 1,  # user_input already credited
                    }
                },
            }
            status = {"tasks": [{"id": "AGY-006", "status": "in_progress", "owner": "Antigravity", "reviewer": "Codex"}]}

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "detect_worker_failure_signal", return_value=None),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(self._agy_config(), state)

        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "stalled")
        self.assertEqual(worker["last_event_at"], old)
        self.assertFalse(changed)
        recovered = [
            entry for entry in write_activity_log.call_args_list
            if entry.args[1].get("type") == "worker_recovered"
        ]
        self.assertEqual(recovered, [])

    def test_agy_counter_survives_a_same_second_mtime_collision(self) -> None:
        """Regression for update_from_log's agy productive-event counter:
        `file_iso_mtime` truncates to whole seconds, so two writes landing in
        the same rounded second used to make the counter never get stored on
        the tick that first saw a real step (the old code only stored it
        inside the `mtime > last_event_at` branch). The next tick then
        compared the freshly computed count against an implicit zero
        baseline and credited the already-seen user_input step as fresh
        progress, even though the only newly appended line was a
        non-productive error_message.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "agy.log"
            worker: dict = {
                "run_id": "run-1",
                "provider": "antigravity",
                "log_path": str(log_path),
                "last_event_at": "2026-01-01T00:00:00Z",
            }
            log_path.write_text(self._agy_step_update(0, "user_input"), encoding="utf-8")
            with mock.patch.object(supervisor, "file_iso_mtime", return_value="2026-01-01T00:00:00Z"):
                supervisor.update_from_log(self._agy_adapter_config(), worker)

            self.assertEqual(worker["last_event_at"], "2026-01-01T00:00:00Z")
            self.assertEqual(worker["_agy_stream_productive_event_count"], 1)

            log_path.write_text(
                "\n".join([self._agy_step_update(0, "user_input"), self._agy_step_update(1, "error_message")]),
                encoding="utf-8",
            )
            with mock.patch.object(supervisor, "file_iso_mtime", return_value="2026-01-01T00:00:01Z"):
                supervisor.update_from_log(self._agy_adapter_config(), worker)

        self.assertEqual(worker["last_event_at"], "2026-01-01T00:00:00Z")
        self.assertEqual(worker["_agy_stream_productive_event_count"], 1)

    def test_split_retry_pairs_across_polls_do_not_repeatedly_reset_the_stall_clock(self) -> None:
        """Regression for the Codex2-rejected candidate: recomputing the
        productive-event count from scratch on every poll let an
        unconfirmed `agent_response` get credited as recovery before the
        log proved whether it was a failed retry. Once the following
        `error_message` invalidated it, the *next* retry's unconfirmed
        `agent_response` got credited all over again -- every failed retry
        re-triggered the stall-clock reset, even though the turn never
        produced a usable response. Unlike
        test_full_agy_retry_trace_with_duplicate_step_does_not_recover_a_stalled_worker
        (which writes the whole trace in one shot), this appends and polls
        one line at a time so the from-scratch count actually fluctuates
        poll over poll the way it did against the live rejected candidate.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "agy.log"
            worker: dict = {
                "run_id": "run-1",
                "provider": "antigravity",
                "log_path": str(log_path),
                "last_event_at": "2026-01-01T00:00:00Z",
            }
            lines: list[str] = []

            def tick(mtime: str) -> None:
                log_path.write_text("\n".join(lines), encoding="utf-8")
                with mock.patch.object(supervisor, "file_iso_mtime", return_value=mtime):
                    supervisor.update_from_log(self._agy_adapter_config(), worker)

            lines.append(self._agy_step_update(0, "user_input"))
            tick("2026-01-01T00:00:01Z")
            self.assertEqual(worker["last_event_at"], "2026-01-01T00:00:01Z")

            for i in range(3):
                lines.append(self._agy_step_update(2 * i + 1, "agent_response"))
                tick(f"2026-01-01T00:00:{2 + 4 * i:02d}Z")
                credited_before_failure = worker["last_event_at"]

                lines.append(self._agy_step_update(2 * i + 2, "error_message"))
                tick(f"2026-01-01T00:00:{3 + 4 * i:02d}Z")
                # A failed retry must never leave the clock further advanced
                # than it stood right after this attempt's optimistic
                # (and later invalidated) response.
                self.assertLessEqual(worker["last_event_at"], credited_before_failure)

            # None of the three retries ever produced a usable response, so
            # the clock must still read the very first tick.
            self.assertEqual(worker["last_event_at"], "2026-01-01T00:00:01Z")

            # A genuine success after the retries -- a terminal result, not
            # another error -- must still be credited.
            lines.append(self._agy_result("DONE"))
            tick("2026-01-01T00:00:20Z")
            self.assertEqual(worker["last_event_at"], "2026-01-01T00:00:20Z")

    def test_codex_result_string_shape_does_not_abort_polling_other_workers(self) -> None:
        """Codex2 rejection repro: nested `step_update`/`result` values were
        used with `.get` before checking they were dicts, so a non-agy log
        line sharing agy's `event` field name (e.g.
        `{"event":"result","result":"Task complete"}`, a real codex shape)
        raised an uncaught AttributeError inside `poll_workers` and aborted
        the tick before the remaining workers were polled.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            malformed_log = Path(tmpdir) / "codex.log"
            malformed_log.write_text(
                json.dumps({"event": "result", "result": "Task complete"}),
                encoding="utf-8",
            )
            normal_log = Path(tmpdir) / "agy.log"
            normal_log.write_text(
                "\n".join([
                    self._agy_step_update(0, "user_input"),
                    self._agy_step_update(1, "agent_response"),
                ]),
                encoding="utf-8",
            )
            state = {
                "queue": {
                    "events": {"evt-1": {"status": "started"}, "evt-2": {"status": "started"}},
                },
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "CODEX-001",
                        "provider": "codex",
                        "agent_id": "codex",
                        "status": "stalled",
                        "queue_event_id": "evt-1",
                        "pid": 1111,
                        "log_path": str(malformed_log),
                        "last_event_at": "2026-04-06T14:20:00Z",
                    },
                    "run-2": {
                        "run_id": "run-2",
                        "task_id": "AGY-003",
                        "provider": "antigravity",
                        "agent_id": "antigravity",
                        "status": "stalled",
                        "queue_event_id": "evt-2",
                        "pid": 2222,
                        "log_path": str(normal_log),
                        "last_event_at": "2026-04-06T14:20:00Z",
                    },
                },
            }
            status = {
                "tasks": [
                    {"id": "CODEX-001", "status": "in_progress", "owner": "Codex", "reviewer": "Claude"},
                    {"id": "AGY-003", "status": "in_progress", "owner": "Antigravity", "reviewer": "Codex"},
                ]
            }

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "write_activity_log"),
            ):
                changed = supervisor.poll_workers(self._agy_config(), state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-2"]["status"], "running")

    def test_non_antigravity_worker_with_embedded_agy_shaped_output_keeps_ordinary_progress(self) -> None:
        """Codex2 rejection repro (case c): a non-antigravity worker's log can
        capture tool output that happens to embed a literal, fully valid agy
        stream-json line -- e.g. a Codex tool call that `cat`s another
        worker's gemini-probe.log. Content-shape detection alone would
        misidentify this Codex worker as agy-shaped and start suppressing its
        own ordinary progress. Scoping `_agy_stream_productive_event_count`
        to the worker's *configured* adapter (this worker's agent_id/provider
        resolves to the default file_inbox adapter, not antigravity) keeps
        the worker on plain mtime-based visibility instead.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "codex.log"
            log_path.write_text(
                "\n".join([
                    json.dumps({"type": "tool_call", "tool": "exec", "command": "cat gemini-probe.log"}),
                    json.dumps({
                        "event": "result",
                        "result": {"status": "ERROR", "response": "", "error": "stream interrupted"},
                    }),
                ]),
                encoding="utf-8",
            )
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "CODEX-002",
                        "provider": "codex",
                        "agent_id": "codex",
                        "status": "stalled",
                        "queue_event_id": "evt-1",
                        "pid": 1111,
                        "log_path": str(log_path),
                        "last_event_at": "2026-04-06T14:20:00Z",
                    }
                },
            }
            status = {"tasks": [{"id": "CODEX-002", "status": "in_progress", "owner": "Codex", "reviewer": "Claude"}]}

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "write_activity_log"),
            ):
                supervisor.poll_workers(self._agy_config(), state)

        worker = state["workers"]["run-1"]
        self.assertNotIn("_agy_stream_productive_event_count", worker)
        self.assertGreater(worker["last_event_at"], "2026-04-06T14:20:00Z")
        self.assertEqual(worker["status"], "running")


class AgyStreamProductiveEventCountTests(unittest.TestCase):
    """Direct coverage of supervisor_runtime._agy_stream_productive_event_count.

    Live evidence: .local/worker-recovery-20260910/gemini-probe.log records a
    real agy stream-json turn -- user_input, then six alternating
    agent_response/error_message pairs, ending in a structured ERROR result
    with an empty response and zero tokens. None of the six retry attempts
    ever produced a usable response, so only the initial user_input is real
    progress.
    """

    def _step(self, index: int, step_type: str, conversation_id: str = "c1") -> str:
        return json.dumps({
            "event": "step_update",
            "step_update": {
                "conversation_id": conversation_id,
                "step_index": index,
                "state": "DONE",
                "step_type": step_type,
                "duration_seconds": 0,
            },
        })

    def _result(self, status: str, conversation_id: str = "c1") -> str:
        return json.dumps({
            "event": "result",
            "result": {
                "conversation_id": conversation_id,
                "status": status,
                "response": "",
                "error": "",
                "duration_seconds": 1,
                "num_turns": 1,
                "usage": {"input_tokens": 0, "output_tokens": 0, "thinking_tokens": 0, "cache_read_tokens": 0, "total_tokens": 0},
            },
        })

    def test_returns_none_for_non_agy_shaped_logs(self) -> None:
        self.assertIsNone(supervisor._agy_stream_productive_event_count("plain text log\nmore lines\n"))

    def test_error_message_steps_are_not_productive(self) -> None:
        content = "\n".join([self._step(0, "error_message"), self._step(1, "error_message")])
        self.assertEqual(supervisor._agy_stream_productive_event_count(content), 0)

    def test_agent_response_immediately_followed_by_error_is_a_failed_attempt(self) -> None:
        lines = [self._step(0, "user_input")]
        for i in range(6):
            lines.append(self._step(2 * i + 1, "agent_response"))
            lines.append(self._step(2 * i + 2, "error_message"))
        content = "\n".join(lines)
        self.assertEqual(supervisor._agy_stream_productive_event_count(content), 1)

    def test_error_terminal_result_is_not_productive(self) -> None:
        lines = [
            self._step(0, "user_input"),
            self._step(1, "agent_response"),
            self._step(2, "error_message"),
            self._result("ERROR"),
        ]
        self.assertEqual(supervisor._agy_stream_productive_event_count("\n".join(lines)), 1)

    def test_successful_terminal_result_is_productive(self) -> None:
        lines = [self._step(0, "user_input"), self._step(1, "agent_response"), self._result("DONE")]
        self.assertEqual(supervisor._agy_stream_productive_event_count("\n".join(lines)), 3)

    def test_duplicate_step_index_is_not_double_counted(self) -> None:
        lines = [self._step(0, "user_input"), self._step(1, "agent_response")]
        base = supervisor._agy_stream_productive_event_count("\n".join(lines))
        duplicated = lines + [self._step(1, "agent_response")]
        self.assertEqual(supervisor._agy_stream_productive_event_count("\n".join(duplicated)), base)

    def test_unconfirmed_trailing_agent_response_is_not_yet_counted(self) -> None:
        """The newest event being an `agent_response` with nothing after it
        (no further step, no terminal result) is exactly the ambiguous shape
        a failed retry starts with. It must not be counted until a following
        event proves it wasn't one -- see
        test_agent_response_immediately_followed_by_error_is_a_failed_attempt
        for what happens once that next event turns out to be an
        `error_message`.
        """
        lines = [self._step(0, "user_input"), self._step(1, "agent_response")]
        self.assertEqual(supervisor._agy_stream_productive_event_count("\n".join(lines)), 1)

    def test_trailing_agent_response_confirmed_by_a_later_step_is_counted(self) -> None:
        lines = [
            self._step(0, "user_input"),
            self._step(1, "agent_response"),
            self._step(2, "tool_call"),
        ]
        self.assertEqual(supervisor._agy_stream_productive_event_count("\n".join(lines)), 3)

    def test_non_dict_nested_step_update_value_does_not_crash_and_is_not_agy_shaped(self) -> None:
        line = json.dumps({"event": "step_update", "step_update": [1, 2, 3]})
        self.assertIsNone(supervisor._agy_stream_productive_event_count(line))

    def test_non_dict_nested_result_value_does_not_crash_and_is_not_agy_shaped(self) -> None:
        """Codex2 rejection repro: a codex log line shaped like
        `{"event":"result","result":"Task complete"}` shares agy's
        top-level `event` field name but carries a plain string, not a
        dict. It must neither raise (the old code called `.get` on the
        string) nor be misidentified as an agy-shaped log, so non-agy
        providers keep falling back to plain mtime-based visibility.
        """
        line = json.dumps({"event": "result", "result": "Task complete"})
        self.assertIsNone(supervisor._agy_stream_productive_event_count(line))

    def test_malformed_nested_value_does_not_mask_real_agy_events_elsewhere_in_the_log(self) -> None:
        lines = [
            json.dumps({"event": "result", "result": "Task complete"}),
            self._step(0, "user_input"),
        ]
        self.assertEqual(supervisor._agy_stream_productive_event_count("\n".join(lines)), 1)

    def test_result_dict_without_status_key_is_not_agy_shaped(self) -> None:
        """Codex2 rejection repro: a Codex log line like
        `{"event":"result","result":{"message":"Task complete"}}` reuses
        agy's top-level `event` field name and carries a *dict* result, but
        one with no `status` key -- an unrelated schema. Requiring `status`
        (mirroring worker_failure_detector._is_antigravity_result_event)
        keeps this from being misidentified as agy-shaped just because the
        nested value happens to be a dict.
        """
        line = json.dumps({"event": "result", "result": {"message": "Task complete"}})
        self.assertIsNone(supervisor._agy_stream_productive_event_count(line))
