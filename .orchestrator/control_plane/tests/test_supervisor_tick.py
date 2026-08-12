from __future__ import annotations

import unittest
from typing import Any

from control_plane.usecases.supervisor_tick import (
    SupervisorTickOptions,
    SupervisorTickPorts,
    SupervisorTickRunner,
    TickPhase,
    build_tick_plan,
)


def recording_ports(calls: list[str], *, focus_mode: str) -> SupervisorTickPorts:
    state: dict[str, Any] = {
        "supervisor": {},
        "workers": {},
        "queue": {"events": {}},
    }

    def record(name: str, result: Any = False):
        def callback(*_args: Any, **_kwargs: Any) -> Any:
            calls.append(name)
            return result

        return callback

    return SupervisorTickPorts(
        utc_now=record("utc_now", "2026-07-18T00:00:00Z"),
        current_pid=record("current_pid", 42),
        notify=record("notify", None),
        load_runtime_state=record("load_runtime_state", state),
        save_runtime_state=record("save_runtime_state", None),
        refresh_control_plane_summary=record("refresh_summary", None),
        load_status=record("load_status", {"execution_mode": focus_mode}),
        load_provider_report=record("load_provider_report", {}),
        safe_load_approval_state=record("load_approvals", {"pending": []}),
        write_supervisor_pid=record("write_pid", None),
        write_activity_log=record("activity_log", None),
        console_log=record("console_log", None),
        desired_focus_mode=record("desired_focus_mode", focus_mode),
        update_mode_metadata=record("update_mode", None),
        reap_finished_children=record("reap_children", 0),
        maintain_disk_guard=record("disk_guard", False),
        expire_provider_pauses=record("expire_pauses", []),
        prune_stale_approvals=record("prune_approvals", []),
        run_scan=record("scan", False),
        poll_workers=record("poll_workers", False),
        cleanup_inactive_worker_worktrees=record("cleanup_worktrees", False),
        reconcile_queue_records=record("reconcile_queue", False),
        reconcile_status_from_git=record("reconcile_git", False),
        reconcile_invalid_completed_integrations=record("recover_completed_evidence", False),
        prune_event_queue=record("prune_queue", False),
        prune_completed_dispatch_pauses=record("prune_dispatch_pauses", False),
        prune_failure_streaks=record("prune_failure_streaks", False),
        refresh_chair_review_state=record("refresh_chair", False),
        reconcile_optional_automation=record("reconcile_optional", False),
        ensure_planning_baton_dispatch=record("planning_baton", False),
        queue_chair_review=record("queue_chair", False),
        break_full_deadlock=record("break_deadlock", False),
        dispatch_ready_tasks=record("dispatch_ready", False),
        process_queue=record("process_queue", False),
        sync_github_bus=record("github_sync", False),
        trim_worker_history=record("trim_workers", None),
        trim_seen_events=record("trim_events", None),
        log_runtime_summary=record("runtime_summary", None),
    )


class SupervisorTickPlanTests(unittest.TestCase):
    def test_planning_mode_has_no_execution_phase(self) -> None:
        plan = build_tick_plan("planning")

        self.assertEqual(
            plan.phases,
            (
                TickPhase.RECONCILE,
                TickPhase.PLANNING,
                TickPhase.DELIVERY,
                TickPhase.FINALIZE,
            ),
        )

    def test_unknown_mode_fails_closed_to_execution_plan(self) -> None:
        plan = build_tick_plan("unexpected")

        self.assertEqual(plan.focus_mode, "execution")
        self.assertIn(TickPhase.EXECUTION, plan.phases)


class SupervisorTickRunnerTests(unittest.TestCase):
    def test_planning_tick_excludes_execution_policies(self) -> None:
        calls: list[str] = []
        runner = SupervisorTickRunner(recording_ports(calls, focus_mode="planning"))

        result = runner.run(
            {"supervisor": {}, "watcher": {}},
            SupervisorTickOptions(watch=False, manage_pid_file=False),
        )

        self.assertEqual(result.focus_mode, "planning")
        self.assertIn("planning_baton", calls)
        self.assertNotIn("queue_chair", calls)
        self.assertNotIn("dispatch_ready", calls)
        self.assertLess(calls.index("save_runtime_state"), calls.index("refresh_summary"))
        self.assertLess(calls.index("refresh_summary"), calls.index("runtime_summary"))

    def test_execution_tick_orders_reconcile_policy_delivery_finalize(self) -> None:
        calls: list[str] = []
        runner = SupervisorTickRunner(recording_ports(calls, focus_mode="execution"))

        result = runner.run(
            {"supervisor": {}, "watcher": {}},
            SupervisorTickOptions(watch=False, manage_pid_file=False),
        )

        self.assertEqual(result.focus_mode, "execution")
        ordered = [
            "cleanup_worktrees",
            "recover_completed_evidence",
            "github_sync",
            "refresh_chair",
            "queue_chair",
            "dispatch_ready",
            "process_queue",
            "save_runtime_state",
            "refresh_summary",
        ]
        positions = [calls.index(name) for name in ordered]
        self.assertEqual(positions, sorted(positions))

    def test_github_transition_is_visible_to_dispatch_in_same_tick(self) -> None:
        calls: list[str] = []
        status = {"execution_mode": "execution", "tasks": [{"id": "T-1", "status": "in_progress"}]}
        ports = recording_ports(calls, focus_mode="execution")

        def load_status(_config: dict[str, Any]) -> dict[str, Any]:
            calls.append("load_status")
            return status

        def github_sync(_config: dict[str, Any], _state: dict[str, Any], **_kwargs: Any) -> bool:
            calls.append("github_sync")
            status["tasks"][0]["status"] = "review"
            return True

        def dispatch_ready(
            _config: dict[str, Any], _state: dict[str, Any], _provider_report: dict[str, Any]
        ) -> bool:
            calls.append(f"dispatch_ready:{status['tasks'][0]['status']}")
            return True

        ports = SupervisorTickPorts(
            **{
                **ports.__dict__,
                "load_status": load_status,
                "sync_github_bus": github_sync,
                "dispatch_ready_tasks": dispatch_ready,
            }
        )

        SupervisorTickRunner(ports).run(
            {"supervisor": {}, "watcher": {}},
            SupervisorTickOptions(watch=False, manage_pid_file=False),
        )

        self.assertIn("dispatch_ready:review", calls)

    def test_completed_evidence_recovery_forces_same_tick_github_discovery(self) -> None:
        calls: list[str] = []
        ports = recording_ports(calls, focus_mode="execution")
        force_values: list[bool] = []

        def recover(_config: dict[str, Any], _state: dict[str, Any]) -> bool:
            calls.append("recover_completed_evidence")
            return True

        def github_sync(_config: dict[str, Any], _state: dict[str, Any], **kwargs: Any) -> bool:
            calls.append("github_sync")
            force_values.append(bool(kwargs.get("force")))
            return False

        ports = SupervisorTickPorts(
            **{
                **ports.__dict__,
                "reconcile_invalid_completed_integrations": recover,
                "sync_github_bus": github_sync,
            }
        )

        SupervisorTickRunner(ports).run(
            {"supervisor": {}, "watcher": {}},
            SupervisorTickOptions(watch=False, manage_pid_file=False),
        )

        self.assertEqual(force_values, [True])


if __name__ == "__main__":
    unittest.main()
