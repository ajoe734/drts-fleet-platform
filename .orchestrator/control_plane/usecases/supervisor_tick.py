from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable


class TickPhase(str, Enum):
    RECONCILE = "reconcile"
    PLANNING = "planning"
    EXECUTION = "execution"
    DELIVERY = "delivery"
    FINALIZE = "finalize"


@dataclass(frozen=True)
class TickPlan:
    focus_mode: str
    phases: tuple[TickPhase, ...]


@dataclass(frozen=True)
class SupervisorTickOptions:
    watch: bool
    replay: bool = False
    quiet: bool = False
    verbose: bool = False
    once: bool = False
    manage_pid_file: bool = True


@dataclass(frozen=True)
class TickResult:
    changed: bool
    saved: bool
    focus_mode: str
    phases: tuple[TickPhase, ...]


@dataclass(frozen=True)
class SupervisorTickPorts:
    utc_now: Callable[[], str]
    current_pid: Callable[[], int]
    notify: Callable[[str], None]
    load_runtime_state: Callable[[dict[str, Any]], dict[str, Any]]
    save_runtime_state: Callable[[dict[str, Any], dict[str, Any]], None]
    refresh_control_plane_summary: Callable[..., None]
    load_status: Callable[[dict[str, Any]], dict[str, Any]]
    load_provider_report: Callable[[dict[str, Any]], dict[str, Any]]
    safe_load_approval_state: Callable[[dict[str, Any]], dict[str, Any]]
    ensure_candidate_lifecycle_migration: Callable[[dict[str, Any], dict[str, Any]], bool]
    write_supervisor_pid: Callable[[dict[str, Any]], None]
    write_activity_log: Callable[[dict[str, Any], dict[str, Any]], None]
    console_log: Callable[..., None]
    desired_focus_mode: Callable[[dict[str, Any]], str]
    update_mode_metadata: Callable[..., None]
    reap_finished_children: Callable[[], int]
    maintain_disk_guard: Callable[[dict[str, Any], dict[str, Any]], bool]
    expire_provider_pauses: Callable[..., list[str]]
    prune_stale_approvals: Callable[[dict[str, Any]], int]
    run_scan: Callable[..., bool]
    poll_workers: Callable[..., bool]
    cleanup_inactive_worker_worktrees: Callable[[dict[str, Any], dict[str, Any]], bool]
    reconcile_queue_records: Callable[[dict[str, Any], dict[str, Any]], bool]
    prune_event_queue: Callable[[dict[str, Any], dict[str, Any]], bool]
    prune_completed_dispatch_pauses: Callable[..., bool]
    prune_failure_streaks: Callable[[dict[str, Any], dict[str, Any]], bool]
    refresh_chair_review_state: Callable[..., bool]
    reconcile_optional_automation: Callable[..., bool]
    ensure_planning_baton_dispatch: Callable[..., bool]
    queue_chair_review: Callable[..., bool]
    break_full_deadlock: Callable[..., bool]
    dispatch_ready_tasks: Callable[..., bool]
    dispatch_optional_automation: Callable[..., bool]
    process_queue: Callable[..., bool]
    sync_github_bus: Callable[[dict[str, Any], dict[str, Any]], bool]
    trim_worker_history: Callable[[dict[str, Any], int], None]
    trim_seen_events: Callable[[dict[str, Any], int], None]
    log_runtime_summary: Callable[..., None]


def build_tick_plan(focus_mode: str) -> TickPlan:
    mode = "planning" if str(focus_mode).strip().lower() == "planning" else "execution"
    mode_phase = TickPhase.PLANNING if mode == "planning" else TickPhase.EXECUTION
    return TickPlan(
        focus_mode=mode,
        phases=(
            TickPhase.RECONCILE,
            mode_phase,
            TickPhase.DELIVERY,
            TickPhase.FINALIZE,
        ),
    )


class SupervisorTickRunner:
    def __init__(self, ports: SupervisorTickPorts) -> None:
        self.ports = ports

    def run(
        self,
        config: dict[str, Any],
        options: SupervisorTickOptions,
    ) -> TickResult:
        heartbeat_at = self.ports.utc_now()
        state = self.ports.load_runtime_state(config)
        reaped_children = self.ports.reap_finished_children()
        changed = self.ports.maintain_disk_guard(config, state)
        disk_guard_record = dict(state.get("disk_guard", {}) or {})
        if reaped_children:
            changed = True
            self.ports.write_activity_log(
                config,
                {
                    "type": "worker_child_processes_reaped",
                    "message": (
                        f"Reaped {reaped_children} finished supervisor child process(es)."
                    ),
                    "count": reaped_children,
                },
            )
        if options.manage_pid_file:
            self.ports.write_supervisor_pid(config)

        status = self.ports.load_status(config)
        if self.ports.ensure_candidate_lifecycle_migration(config, status):
            changed = True
            status = self.ports.load_status(config)
        focus_mode = self.ports.desired_focus_mode(status)
        previous_heartbeat = state.get("supervisor", {}).get("last_heartbeat_at")
        self.ports.notify("WATCHDOG=1")
        self._stamp(state, focus_mode, heartbeat_at)
        provider_report = self.ports.load_provider_report(config)
        changed = bool(
            self.ports.expire_provider_pauses(config, state, provider_report)
        ) or changed
        if self.ports.prune_stale_approvals(config):
            changed = True

        if options.watch:
            changed = self.ports.run_scan(
                config,
                state,
                replay=options.replay,
                provider_capabilities=provider_report,
            ) or changed
            state = self.ports.load_runtime_state(config)
            if disk_guard_record:
                state["disk_guard"] = disk_guard_record
            self._stamp(state, focus_mode, heartbeat_at)
            changed = bool(
                self.ports.expire_provider_pauses(config, state, provider_report)
            ) or changed

        status = self.ports.load_status(config)
        focus_mode = self.ports.desired_focus_mode(status)
        changed, status = self._reconcile(
            config, state, status, provider_report, changed
        )
        focus_mode = self.ports.desired_focus_mode(status)
        plan = build_tick_plan(focus_mode)
        for phase in plan.phases[1:]:
            if phase == TickPhase.PLANNING:
                changed = self.ports.ensure_planning_baton_dispatch(
                    config, state, status
                ) or changed
            elif phase == TickPhase.EXECUTION:
                changed = self._execute_mode_work(
                    config, state, status, provider_report, changed
                )
            elif phase == TickPhase.DELIVERY:
                changed = self._deliver(config, state, provider_report, changed)
            elif phase == TickPhase.FINALIZE:
                changed, status = self._finalize(
                    config, state, status, provider_report, changed
                )

        self.ports.trim_worker_history(
            state, int(config.get("supervisor", {}).get("max_worker_history", 200))
        )
        self.ports.trim_seen_events(
            state, int(config.get("watcher", {}).get("max_seen_events", 2000))
        )
        self._stamp(state, plan.focus_mode, heartbeat_at)
        try:
            self.ports.save_runtime_state(config, state)
        except OSError as exc:
            self.ports.console_log(
                f"unable to save runtime state: {exc}", quiet=options.quiet
            )
            return TickResult(changed, False, plan.focus_mode, plan.phases)
        try:
            self.ports.refresh_control_plane_summary(
                config,
                state,
                provider_report,
            )
        except Exception as exc:
            try:
                self.ports.write_activity_log(
                    config,
                    {
                        "type": "control_plane_summary_refresh_failed",
                        "message": f"{type(exc).__name__}: {exc}",
                    },
                )
            except Exception:
                pass
        self.ports.log_runtime_summary(
            state,
            self.ports.safe_load_approval_state(config),
            changed=changed,
            quiet=options.quiet,
            verbose=options.verbose,
            previous_heartbeat=previous_heartbeat,
            warn_after_seconds=float(
                config.get("supervisor", {}).get(
                    "heartbeat_warn_after_seconds", 10.0
                )
            ),
            once=options.once,
        )
        return TickResult(changed, True, plan.focus_mode, plan.phases)

    def _stamp(
        self, state: dict[str, Any], focus_mode: str, heartbeat_at: str
    ) -> None:
        supervisor_state = state.setdefault("supervisor", {})
        previous_pid = supervisor_state.get("pid")
        current_pid = self.ports.current_pid()
        supervisor_state["pid"] = current_pid
        supervisor_state["last_heartbeat_at"] = heartbeat_at
        supervisor_state["lifecycle"] = "running"
        if not supervisor_state.get("started_at") or previous_pid != current_pid:
            supervisor_state["started_at"] = heartbeat_at
        self.ports.update_mode_metadata(
            state,
            focus_mode=focus_mode,
            heartbeat_at=heartbeat_at,
        )

    def _reconcile(
        self,
        config: dict[str, Any],
        state: dict[str, Any],
        status: dict[str, Any],
        provider_report: dict[str, Any],
        changed: bool,
    ) -> tuple[bool, dict[str, Any]]:
        changed = self.ports.poll_workers(config, state, provider_report) or changed
        changed = self.ports.cleanup_inactive_worker_worktrees(config, state) or changed
        changed = self.ports.reconcile_queue_records(config, state) or changed
        changed = self.ports.prune_event_queue(config, state) or changed
        changed = self.ports.prune_completed_dispatch_pauses(
            state, status, config=config, provider_report=provider_report
        ) or changed
        changed = self.ports.prune_failure_streaks(state, status) or changed
        changed = self.ports.refresh_chair_review_state(
            config, state, provider_report
        ) or changed
        changed = self.ports.reconcile_optional_automation(
            config, state, provider_report
        ) or changed
        return changed, self.ports.load_status(config)

    def _execute_mode_work(
        self,
        config: dict[str, Any],
        state: dict[str, Any],
        status: dict[str, Any],
        provider_report: dict[str, Any],
        changed: bool,
    ) -> bool:
        changed = self.ports.queue_chair_review(
            config, state, status, provider_report
        ) or changed
        changed = self.ports.break_full_deadlock(config, state, status) or changed
        changed = self.ports.dispatch_ready_tasks(
            config, state, provider_report
        ) or changed
        return self.ports.dispatch_optional_automation(config, state) or changed

    def _deliver(
        self,
        config: dict[str, Any],
        state: dict[str, Any],
        provider_report: dict[str, Any],
        changed: bool,
    ) -> bool:
        changed = self.ports.process_queue(config, state, provider_report) or changed
        return self.ports.poll_workers(config, state, provider_report) or changed

    def _finalize(
        self,
        config: dict[str, Any],
        state: dict[str, Any],
        status: dict[str, Any],
        provider_report: dict[str, Any],
        changed: bool,
    ) -> tuple[bool, dict[str, Any]]:
        status = self.ports.load_status(config)
        changed = self.ports.reconcile_queue_records(config, state) or changed
        changed = self.ports.prune_event_queue(config, state) or changed
        changed = self.ports.prune_completed_dispatch_pauses(
            state, status, config=config, provider_report=provider_report
        ) or changed
        changed = self.ports.prune_failure_streaks(state, status) or changed
        changed = self.ports.sync_github_bus(config, state) or changed
        return changed, status
