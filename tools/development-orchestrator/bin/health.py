#!/usr/bin/env python3
"""
health.py — DRTS orchestrator health snapshot.

Single-shot answer to "is development moving forward?" Reports supervisor
liveness, active workers, velocity, failure signals, and OAuth lane TTL.

Exit code:
  0 — system healthy
  1 — degraded (heartbeat lag, supersede rate, lane TTL low, etc.)
  2 — critical (supervisor not running or state.json missing)

Designed so an unattended systemd timer can run it every 5 min and the
failing exit code shows up in `systemctl --user status drts-health`.

Options:
  --json   Emit structured JSON instead of human-readable output
  --quiet  Suppress narrative output; only set exit code
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None
from pathlib import Path

_TOOL_ROOT = Path(__file__).resolve().parent.parent
if str(_TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(_TOOL_ROOT))

# The probe answers questions the control plane also answers, so it has to ask
# them the same way. Reading machine truth from files rather than the runtime
# cache is deliberate; redefining what the words mean was not. Counting only
# status == "running" made a fleet stalled on approvals or retries report as
# `workers: 0 running`, which is the same lie the supervisor's own
# `queue: empty` told while it span.
from control_plane.domain.worker_lifecycle import ACTIVE_WORKER_STATUSES  # noqa: E402
from control_plane.runtime.supervisor_runtime import is_agent_dispatch_paused  # noqa: E402

# --- config / tunables ---
RUNTIME_ROOT = Path(__file__).resolve().parents[3]


def canonical_root(runtime_root: Path = RUNTIME_ROOT) -> Path:
    """Resolve machine truth independently of the runtime worktree."""
    explicit = os.environ.get("ORCH_STATUS_ROOT") or os.environ.get("AI_STATUS_ROOT")
    if explicit:
        return Path(explicit).expanduser().resolve()
    try:
        result = subprocess.run(
            [
                "git",
                "-C",
                str(runtime_root),
                "rev-parse",
                "--path-format=absolute",
                "--git-common-dir",
            ],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return runtime_root
    common_dir = Path(result.stdout.strip()) if result.returncode == 0 and result.stdout.strip() else None
    if common_dir is not None and common_dir.name == ".git":
        return common_dir.parent.resolve()
    return runtime_root


ROOT_DIR = canonical_root()
CONFIG_FILE = ROOT_DIR / ".orchestrator/config.json"
STATE_FILE = ROOT_DIR / ".orchestrator/state.json"
STATUS_FILE = ROOT_DIR / "ai-status.json"
CONTROL_PLANE_SUMMARY = ROOT_DIR / ".orchestrator/projections/control-plane-summary.json"
SUPERVISOR_LOG = ROOT_DIR / ".orchestrator/logs/supervisor-bg.log"
LANE_HEALTH_LOG = ROOT_DIR / ".orchestrator/logs/lane-health.jsonl"
CLAUDE_KEEPALIVE_LOG = ROOT_DIR / ".orchestrator/logs/claude-lane-keepalive.log"

HEARTBEAT_LAG_WARN = int(os.environ.get("HEALTH_HEARTBEAT_LAG_WARN", "300"))
DONE_GAP_WARN = int(os.environ.get("HEALTH_DONE_GAP_WARN", "1800"))
SUPERSEDE_RATE_WARN = int(os.environ.get("HEALTH_SUPERSEDE_RATE_WARN", "8"))

# Supervisor writes log timestamps via `datetime.now(ZoneInfo("Asia/Taipei"))`
# regardless of host tz (see supervisor runtime LOCAL_TZ). Parse with that explicit
# zone so cutoff math is correct on hosts in UTC (or any other tz).
SUPERVISOR_LOG_TZ = ZoneInfo("Asia/Taipei") if ZoneInfo else None


def latest_keepalive_status(log_path: Path) -> dict[str, dict]:
    latest: dict[str, dict] = {}
    if not log_path.exists():
        return latest
    try:
        with open(log_path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 200_000))
            tail = f.read().decode("utf-8", "replace").splitlines()
    except OSError:
        return latest
    pattern = re.compile(r"^(?P<ts>\S+)\s+(?P<result>OK|FAIL)\s+lane=(?P<lane>\S+)(?P<rest>.*)$")
    for line in tail:
        match = pattern.match(line.strip())
        if not match:
            continue
        rest = (match.group("rest") or "").strip()
        rc = None
        rc_match = re.search(r"\brc=(\d+)\b", rest)
        if rc_match:
            rc = int(rc_match.group(1))
        if "msg=" in rest:
            message = rest.split("msg=", 1)[1].strip() or None
        elif rest:
            message = rest
        else:
            message = "refresh ok" if match.group("result") == "OK" else None
        latest[match.group("lane")] = {
            "ts": match.group("ts"),
            "result": match.group("result"),
            "rc": rc,
            "message": message,
        }
    return latest


def canonical_task_map() -> dict[str, dict]:
    """Load task truth from ai-status, never from the runtime cache.

    Where the tasks live is configurable (`schema.tasks_path` /
    `schema.task_id_field`) and the supervisor honours it. Hardcoding "tasks"
    and "id" here meant a schema change would leave the probe silently reading
    an empty board while reporting no issue at all.
    """
    try:
        schema = json.loads(CONFIG_FILE.read_text(encoding="utf-8")).get("schema", {}) or {}
    except (OSError, json.JSONDecodeError):
        schema = {}
    tasks_path = schema.get("tasks_path", "tasks")
    task_id_field = schema.get("task_id_field", "id")
    try:
        payload = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    tasks = payload.get(tasks_path) if isinstance(payload, dict) else []
    if isinstance(tasks, list):
        return {
            str(task.get(task_id_field)): task
            for task in tasks
            if isinstance(task, dict) and task.get(task_id_field)
        }
    if isinstance(tasks, dict):
        return {str(task_id): task for task_id, task in tasks.items() if isinstance(task, dict)}
    return {}


def empty_health_result(now_dt: datetime) -> dict:
    return {
        "now": now_dt.isoformat(),
        "supervisor": {
            "running": False,
            "pid": None,
            "rss_kb": None,
            "uptime_seconds": None,
            "heartbeat_lag_seconds": None,
            "heartbeat_source": None,
        },
        "workers": {"running": [], "count": 0},
        "velocity": {
            "done_last_1h": 0,
            "done_last_24h": 0,
            "last_done_at": None,
            "last_done_id": None,
            "seconds_since_last_done": None,
        },
        "failures": {
            "supersedes_last_1h": 0,
            "dispatch_pauses": 0,
            "blockers": 0,
            "provider_pauses": [],
            "chair_review_failure_streak": 0,
        },
        "lanes": [],
        "watchdogs": [],
        "services": [],
        "issues": [],
    }


def collect_supervisor_process(result: dict) -> None:
    try:
        output = subprocess.check_output(
            ["pgrep", "-af", "supervisor_runtime.py"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except subprocess.CalledProcessError:
        output = ""
    except FileNotFoundError:
        result["issues"].append("WARN: pgrep not available")
        output = ""

    pids = [
        int(line.split()[0])
        for line in output.splitlines()
        if "supervisor_runtime.py" in line and "grep" not in line and "claude -p" not in line
    ]
    if pids:
        pid = pids[0]
        try:
            with open(f"/proc/{pid}/status") as handle:
                for line in handle:
                    if line.startswith("VmRSS:"):
                        result["supervisor"]["rss_kb"] = int(line.split()[1])
            with open(f"/proc/{pid}/stat") as handle:
                starttime_ticks = int(handle.read().split()[21])
            with open("/proc/uptime") as handle:
                uptime_seconds = float(handle.read().split()[0])
            result["supervisor"]["uptime_seconds"] = int(
                uptime_seconds - (starttime_ticks / os.sysconf("SC_CLK_TCK"))
            )
        except Exception:
            pass
        result["supervisor"]["pid"] = pid
        result["supervisor"]["running"] = True
    else:
        result["issues"].append("CRITICAL: supervisor not running")


def collect_running_workers(result: dict, state: dict, now_dt: datetime) -> None:
    for worker_id, worker in (state.get("workers", {}) or {}).items():
        if worker.get("status") not in ACTIVE_WORKER_STATUSES:
            continue
        started = (
            worker.get("started_at")
            or worker.get("claimed_at")
            or worker.get("dispatched_at")
            or worker.get("created_at")
            or ""
        )
        age = None
        if started:
            try:
                started_at = datetime.fromisoformat(started.replace("Z", "+00:00"))
                age = int((now_dt - started_at).total_seconds())
            except Exception:
                pass
        result["workers"]["running"].append(
            {
                "id": worker_id,
                "status": worker.get("status"),
                "provider": worker.get("provider"),
                "task_id": worker.get("task_id"),
                "age_seconds": age,
            }
        )
    result["workers"]["count"] = len(result["workers"]["running"])


def task_timestamp(task: dict) -> str:
    for key in ("last_update", "updated_at", "completed_at"):
        if task.get(key):
            return task[key]
    return ""


def collect_velocity(result: dict, tasks: dict[str, dict], now_dt: datetime) -> None:
    done_dts = []
    for task in tasks.values():
        if task.get("status") != "done":
            continue
        timestamp = task_timestamp(task)
        if not timestamp:
            continue
        try:
            done_dts.append((datetime.fromisoformat(timestamp.replace("Z", "+00:00")), task.get("id")))
        except Exception:
            pass

    result["velocity"]["done_last_1h"] = sum(
        1 for completed_at, _ in done_dts if (now_dt - completed_at).total_seconds() < 3600
    )
    result["velocity"]["done_last_24h"] = sum(
        1 for completed_at, _ in done_dts if (now_dt - completed_at).total_seconds() < 86400
    )
    if not done_dts:
        return
    latest_dt, latest_id = max(done_dts, key=lambda item: item[0])
    gap = int((now_dt - latest_dt).total_seconds())
    result["velocity"].update(
        {
            "last_done_at": latest_dt.isoformat(),
            "last_done_id": latest_id,
            "seconds_since_last_done": gap,
        }
    )
    if gap > DONE_GAP_WARN:
        result["issues"].append(f"WARN: no task completed in {gap // 60} min")


def collect_state_failures(result: dict, state: dict, tasks: dict[str, dict]) -> None:
    result["failures"]["dispatch_pauses"] = len(state.get("dispatch_pauses", {}) or {})
    result["failures"]["blockers"] = sum(1 for task in tasks.values() if task.get("status") == "blocked")
    for lane, pause in (state.get("provider_pauses", {}) or {}).items():
        kind = pause.get("kind")
        result["failures"]["provider_pauses"].append({"lane": lane, "kind": kind})
        if kind == "auth":
            # An auth pause never expires on its own -- by design, because the
            # capability probe reads stored credentials and can say "logged in"
            # while the real call returns 401. That leaves a human as the only
            # way out, so the warning has to say which one, or the fleet waits
            # for someone to guess. It waited a day on 2026-08-17.
            result["issues"].append(
                f"WARN: provider {lane} auth paused; re-authenticate, then clear it with "
                "tools/development-orchestrator/bin/provider-pause.py clear <lane>")
    # A chair review that keeps failing is not the same as an idle one, but
    # until the runtime started counting the streak the two were
    # indistinguishable here: the supervisor heartbeat stayed green, the queue
    # read empty every tick, and the retry loop was visible only as repeated
    # lines in the activity log that nothing consumed.
    chair = state.get("chair_review", {}) or {}
    streak = int(chair.get("failure_streak") or 0)
    result["failures"]["chair_review_failure_streak"] = streak
    if streak > 0:
        retry_after = chair.get("cooldown_until") or "unknown"
        result["issues"].append(
            f"WARN: chair review failing ({streak} consecutive), backing off until {retry_after}")


def _unit_is_running(unit: str | None) -> bool:
    """Is the unit a timer triggers currently mid-run."""
    if not unit:
        return False
    try:
        out = subprocess.check_output(
            ["systemctl", "--user", "show", unit, "-p", "ActiveState"],
            text=True, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.CalledProcessError):
        return False
    state = dict(
        line.split("=", 1) for line in out.splitlines() if "=" in line
    ).get("ActiveState", "")
    return state in {"activating", "active", "reloading", "deactivating"}


SYSTEMD_UNIT_DIR = _TOOL_ROOT / "systemd"


def expected_watchdog_timers() -> list[str]:
    """The timers this repository installs, asked of the installer's own source.

    A hand-written list is a second answer to "which timers should exist", and
    it fails silently in the one direction that matters: rename or drop a timer
    and the probe stops looking for it, reporting a healthy system with one
    fewer watchdog. systemd cannot settle it either -- `show` on a unit that
    does not exist returns inactive with no next elapse, which is byte-for-byte
    how a disarmed timer reports itself.
    """
    return sorted(path.name for path in SYSTEMD_UNIT_DIR.glob("*.timer"))


def collect_enabled_services(result: dict) -> None:
    """Services this host is set to run at boot, and whether they are running.

    The watchdog check asks whether the timers still fire. Nothing asked the
    same of the services, and on the 2026-08-16 boot systemd deleted
    drts-dashboard.service from the transaction to break an ordering cycle. It
    reported `enabled` for four days without once being started -- never
    crashed, never restarted, simply never run. `is-enabled` says yes and
    `is-active` says no, and only the second one was being read by anyone.

    The set comes from systemd rather than from a list here, because a unit can
    be installed on this host without being shipped by this repository -- both
    dashboard units are -- and a probe that only knew about the repository's own
    units would have been blind to exactly the one that died.
    """
    try:
        listed = subprocess.check_output(
            ["systemctl", "--user", "list-unit-files", "drts-*.service",
             "--state=enabled", "--no-legend", "--plain"],
            text=True, stderr=subprocess.DEVNULL)
    except (OSError, subprocess.CalledProcessError) as exc:
        result["issues"].append(f"WARN: cannot list enabled services: {exc}")
        return

    for line in listed.splitlines():
        parts = line.split()
        if not parts:
            continue
        unit = parts[0]
        try:
            out = subprocess.check_output(
                ["systemctl", "--user", "show", unit, "-p", "ActiveState", "-p", "Type"],
                text=True, stderr=subprocess.DEVNULL)
        except (OSError, subprocess.CalledProcessError):
            continue
        props = dict(item.split("=", 1) for item in out.splitlines() if "=" in item)
        # A oneshot service is driven by its timer and is inactive between
        # fires; the watchdog collector is what judges those.
        if props.get("Type") == "oneshot":
            continue
        active = props.get("ActiveState")
        result["services"].append({"unit": unit, "active_state": active})
        if active != "active":
            result["issues"].append(
                f"WARN: {unit} is enabled but {active or 'not active'}")


def collect_watchdog_timers(result: dict) -> None:
    """Watch the watchers.

    Every other collector in this file assumes something runs it; on 2026-08-16
    nothing did. All three DRTS timers sat ActiveState=active and
    UnitFileState=enabled with no scheduled elapse, so they looked healthy in
    `list-units` while firing nothing for eight hours. A disarmed probe reports
    no issues, which reads exactly like a healthy system.
    """
    for unit in expected_watchdog_timers():
        entry = {"unit": unit, "active_state": None, "next_elapse": None, "armed": None}
        try:
            out = subprocess.check_output(
                ["systemctl", "--user", "show", unit,
                 "-p", "ActiveState", "-p", "UnitFileState", "-p", "Unit", "-p", "LoadState",
                 "-p", "NextElapseUSecRealtime", "-p", "NextElapseUSecMonotonic"],
                text=True, stderr=subprocess.DEVNULL)
        except (OSError, subprocess.CalledProcessError):
            result["watchdogs"].append(entry)
            continue
        props = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
        entry["active_state"] = props.get("ActiveState")
        entry["unit_file_state"] = props.get("UnitFileState")
        # A timer this repository ships but the host was never given is a
        # missing watchdog, not a healthy one. systemd reports it exactly like a
        # stopped timer, so the difference has to be read from LoadState.
        entry["installed"] = props.get("LoadState") != "not-found"
        if not entry["installed"]:
            entry["armed"] = False
            result["watchdogs"].append(entry)
            result["issues"].append(
                f"WARN: {unit} is shipped by this repo but not installed on this host")
            continue
        # systemd reports "no scheduled elapse" as an empty realtime value and
        # the literal "infinity" for the monotonic one. Treating either as a
        # timestamp is how a disarmed timer reports itself as armed -- the exact
        # failure this check exists to catch.
        never = {"", "0", "infinity", "n/a"}
        next_elapse = next(
            (value for value in (str(props.get("NextElapseUSecRealtime") or "").strip(),
                                 str(props.get("NextElapseUSecMonotonic") or "").strip())
             if value.lower() not in never),
            None)
        entry["next_elapse"] = next_elapse
        # systemd reports no next elapse while the timer's own unit is running,
        # so a 60s watchdog has that window every minute. Judging on the elapse
        # alone made this cry wolf on a healthy timer, and a probe nobody trusts
        # fails the same way as one that stays silent.
        entry["firing"] = _unit_is_running(props.get("Unit"))
        # "enabled and active, nothing scheduled, and nothing running" is the
        # silent-death state; an intentionally stopped timer is not an issue.
        entry["armed"] = next_elapse is not None or entry["firing"]
        result["watchdogs"].append(entry)
        if (props.get("UnitFileState") == "enabled"
                and props.get("ActiveState") == "active" and not entry["armed"]):
            result["issues"].append(
                f"WARN: {unit} is enabled and active but has no next elapse (disarmed)")


def collect_heartbeat(result: dict, state: dict, now_dt: datetime) -> None:
    supervisor_state = state.get("supervisor", {}) or {}
    heartbeat = (
        supervisor_state.get("last_heartbeat_at")
        or supervisor_state.get("heartbeat_at")
        or supervisor_state.get("last_heartbeat")
        or supervisor_state.get("last_tick_at")
        or supervisor_state.get("last_run_at")
        or ""
    )
    if heartbeat:
        try:
            heartbeat_at = datetime.fromisoformat(heartbeat.replace("Z", "+00:00"))
            lag = int((now_dt - heartbeat_at).total_seconds())
            result["supervisor"]["heartbeat_lag_seconds"] = lag
            result["supervisor"]["heartbeat_source"] = "supervisor.state"
            if lag > HEARTBEAT_LAG_WARN:
                result["issues"].append(f"WARN: supervisor heartbeat lag {lag}s")
        except Exception:
            pass
    if result["supervisor"]["heartbeat_lag_seconds"] is not None:
        return
    try:
        heartbeat_at = datetime.fromtimestamp(STATE_FILE.stat().st_mtime, timezone.utc)
        lag = int((now_dt - heartbeat_at).total_seconds())
        result["supervisor"]["heartbeat_lag_seconds"] = lag
        result["supervisor"]["heartbeat_source"] = "state.json mtime"
        if lag > HEARTBEAT_LAG_WARN:
            result["issues"].append(f"WARN: state.json untouched for {lag}s (supervisor likely stalled)")
    except Exception:
        pass


def collect_state_metrics(result: dict, now_dt: datetime) -> None:
    try:
        with open(STATE_FILE) as handle:
            state = json.load(handle)
        tasks = canonical_task_map()
        if not tasks:
            result["issues"].append(f"CRITICAL: canonical task status not found at {STATUS_FILE}")
        collect_running_workers(result, state, now_dt)
        collect_velocity(result, tasks, now_dt)
        collect_state_failures(result, state, tasks)
        collect_heartbeat(result, state, now_dt)
    except FileNotFoundError:
        result["issues"].append(f"CRITICAL: state.json not found at {STATE_FILE}")
    except Exception as exc:
        result["issues"].append(f"WARN: failed to parse state.json: {exc}")


def collect_supersede_rate(result: dict, now_dt: datetime) -> None:
    try:
        if SUPERSEDE_RATE_WARN < 0 or not SUPERVISOR_LOG.exists():
            return
        cutoff_dt = now_dt - timedelta(seconds=3600)
        with open(SUPERVISOR_LOG, "rb") as handle:
            handle.seek(0, 2)
            size = handle.tell()
            handle.seek(max(0, size - 200_000))
            tail = handle.read().decode("utf-8", "replace").splitlines()
        count = 0
        for line in tail:
            if "worker superseded" not in line:
                continue
            match = re.match(r"\[(\S+ \S+)\]", line)
            if not match:
                continue
            try:
                timestamp = datetime.fromisoformat(match.group(1).replace(" ", "T"))
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=SUPERVISOR_LOG_TZ or timezone.utc)
                if timestamp >= cutoff_dt:
                    count += 1
            except Exception:
                pass
        result["failures"]["supersedes_last_1h"] = count
        if count > SUPERSEDE_RATE_WARN:
            result["issues"].append(
                f"WARN: {count} supersedes in last 1h (>{SUPERSEDE_RATE_WARN} threshold)"
            )
    except Exception as exc:
        result["issues"].append(f"WARN: failed to scan supervisor log: {exc}")


def dispatch_paused_lanes(result: dict) -> dict[str, bool] | None:
    """Whether each lane can take work, answered by the dispatcher itself.

    `enabled` in the projection means "configured on", which is a different
    question from "will the supervisor send it work". On 2026-08-18 an expired
    OAuth token paused the account behind claude and claude2; the dispatcher
    refused both lanes for fifteen hours while this probe printed all seven as
    enabled. The chair briefing was corrected for exactly this and the probe was
    not, so the operator-facing surface kept the wrong answer.

    The report is read from disk and passed in. Letting the predicate load it
    would let a read-only probe re-run the provider CLIs and rewrite the cache.
    """
    try:
        config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        report_path = ROOT_DIR / str(
            (config.get("paths") or {}).get("provider_capabilities")
            or ".orchestrator/provider_capabilities.json")
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        # Saying nothing is the failure mode this exists to prevent; an
        # unanswerable question must read as unanswered, never as healthy.
        result["issues"].append(f"WARN: cannot ask the dispatcher which lanes are paused: {exc}")
        return None
    paused = {}
    for agent_id in (config.get("agents") or {}):
        try:
            paused[agent_id] = is_agent_dispatch_paused(
                config, state, agent_id, provider_report=report)
        except Exception as exc:  # noqa: BLE001 - a probe must not die on one lane
            result["issues"].append(f"WARN: dispatch-pause check failed for {agent_id}: {exc}")
    return paused


def collect_lane_summary(result: dict) -> None:
    paused = dispatch_paused_lanes(result)
    try:
        projection = json.loads(CONTROL_PLANE_SUMMARY.read_text(encoding="utf-8"))
        for lane in projection.get("lanes", []):
            if not isinstance(lane, dict):
                continue
            lane_id = lane.get("id") or lane.get("name")
            if not lane.get("enabled", True):
                status = "disabled"
            elif paused is None or lane_id not in paused:
                status = "unknown"
            else:
                status = "paused" if paused[lane_id] else "enabled"
            result["lanes"].append(
                {
                    "lane": lane_id,
                    "status": status,
                    "dispatch_paused": None if paused is None else paused.get(lane_id),
                    "load": lane.get("load"),
                    "as_of": projection.get("generated_at"),
                }
            )
    except Exception as exc:
        result["issues"].append(f"WARN: failed to read canonical control-plane summary: {exc}")


def collect_keepalive(result: dict) -> None:
    try:
        keepalive = latest_keepalive_status(CLAUDE_KEEPALIVE_LOG)
        lanes_by_name = {entry.get("lane"): entry for entry in result["lanes"]}
        for lane, entry in keepalive.items():
            lane_entry = lanes_by_name.get(lane)
            if lane_entry is None:
                lane_entry = {"lane": lane}
                result["lanes"].append(lane_entry)
                lanes_by_name[lane] = lane_entry
            lane_entry["keepalive_result"] = entry.get("result")
            lane_entry["keepalive_as_of"] = entry.get("ts")
            if entry.get("message"):
                lane_entry["keepalive_message"] = entry.get("message")
            if entry.get("result") == "FAIL":
                rc = f" rc={entry.get('rc')}" if entry.get("rc") is not None else ""
                message = f" msg={entry.get('message')}" if entry.get("message") else ""
                result["issues"].append(f"WARN: lane {lane} keepalive failed{rc}{message}")
    except Exception as exc:
        result["issues"].append(f"WARN: failed to read keepalive log: {exc}")


def collect() -> dict:
    now_dt = datetime.now(timezone.utc)
    result = empty_health_result(now_dt)
    collect_supervisor_process(result)
    collect_watchdog_timers(result)
    collect_enabled_services(result)
    collect_state_metrics(result, now_dt)
    collect_supersede_rate(result, now_dt)
    collect_lane_summary(result)
    collect_keepalive(result)
    result["exit_code"] = 2 if any(issue.startswith("CRITICAL") for issue in result["issues"]) else 0
    return result


def fmt_dur(seconds):
    if seconds is None:
        return "?"
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds//60}m{seconds%60}s"
    if seconds < 86400:
        return f"{seconds//3600}h{(seconds%3600)//60}m"
    return f"{seconds//86400}d{(seconds%86400)//3600}h"


def render_human(s: dict) -> None:
    use_color = sys.stdout.isatty()

    def c(code, text):
        return f"\033[{code}m{text}\033[0m" if use_color else text

    GREEN, YELLOW, RED, BOLD = "32", "33", "31", "1"

    def lvl(value, warn, crit):
        if value is None:
            return ""
        if value >= crit:
            return RED
        if value >= warn:
            return YELLOW
        return GREEN

    def num(v, default=0):
        return v if isinstance(v, (int, float)) else default

    sup = s["supervisor"]
    if sup["running"]:
        rss_kb = sup.get("rss_kb")
        rss = f"{rss_kb/1024:.0f} MB" if rss_kb else "?"
        lag = sup.get("heartbeat_lag_seconds")
        lag_str = c(lvl(num(lag, 0), 60, 300), fmt_dur(lag))
        print(f"{c(BOLD, 'supervisor')}: {c(GREEN, 'running')} "
              f"pid={sup.get('pid', '?')} uptime={fmt_dur(sup.get('uptime_seconds'))} "
              f"rss={rss} heartbeat_lag={lag_str}")
    else:
        print(f"{c(BOLD, 'supervisor')}: {c(RED, 'NOT RUNNING')}")

    w = s["workers"]
    print(f"\n{c(BOLD, 'workers')}: {w['count']} running")
    for wkr in w["running"]:
        age = wkr.get("age_seconds")
        age_str = c(lvl(num(age, 0), 3600, 7200), fmt_dur(age))
        tid = wkr.get("task_id") or "(none)"
        prov = wkr.get("provider") or "?"
        print(f"  {prov:10s} task={tid:35s} age={age_str}")

    v = s["velocity"]
    gap = v.get("seconds_since_last_done")
    gap_str = c(lvl(num(gap, 0), 1800, 3600), fmt_dur(gap))
    last_id = v.get("last_done_id") or "?"
    print(f"\n{c(BOLD, 'velocity')}: done_1h={v.get('done_last_1h', 0)} "
          f"done_24h={v.get('done_last_24h', 0)} last_done={last_id} ({gap_str} ago)")

    f = s["failures"]
    sr = num(f.get("supersedes_last_1h"))
    sr_str = c(lvl(sr, 4, 8), str(sr))
    pp_list = f.get("provider_pauses") or []
    print(f"\n{c(BOLD, 'failures')}: supersedes_1h={sr_str} "
          f"dispatch_pauses={f.get('dispatch_pauses', 0)} "
          f"blockers={f.get('blockers', 0)} provider_pauses={len(pp_list)}")
    for pp in pp_list:
        print(f"  {c(RED, 'paused')}: {pp.get('lane', '?')} ({pp.get('kind', '?')})")

    lanes = s.get("lanes") or []
    if lanes:
        print(f"\n{c(BOLD, 'lanes')}:")
        for ln in lanes:
            st = ln.get("status") or "?"
            sc = c(GREEN if st in {"ok", "enabled"}
                   else YELLOW if st in {"warn", "unknown"} else RED, st)
            ttl = fmt_dur(ln.get("ttl_seconds"))
            keepalive = ""
            if ln.get("keepalive_result"):
                keepalive_status = str(ln.get("keepalive_result"))
                keepalive_color = GREEN if keepalive_status == "OK" else RED
                keepalive = f" keepalive={c(keepalive_color, keepalive_status.lower())}"
            print(f"  {ln.get('lane', '?'):10s} {sc:20s} ttl={ttl}{keepalive}")

    services = s.get("services") or []
    if services:
        print(f"\n{c(BOLD, 'services')}:")
        for service in services:
            state = service.get("active_state") or "?"
            print(f"  {service.get('unit', '?'):32s} "
                  f"{c(GREEN if state == 'active' else RED, state)}")

    watchdogs = s.get("watchdogs") or []
    if watchdogs:
        print(f"\n{c(BOLD, 'watchdogs')}:")
        for watchdog in watchdogs:
            armed = watchdog.get("armed")
            state = "armed" if armed else "DISARMED" if armed is False else "unknown"
            print(f"  {watchdog.get('unit', '?'):32s} {c(GREEN if armed else RED, state)}"
                  f"  ({watchdog.get('active_state') or '?'})")

    issues = s.get("issues") or []
    if issues:
        print()
        for i in issues:
            col = RED if i.startswith("CRITICAL") else YELLOW
            print(c(col, i))


def main(argv):
    out_json = "--json" in argv
    quiet = "--quiet" in argv
    if "-h" in argv or "--help" in argv:
        print(__doc__)
        return 0
    s = collect()
    if out_json:
        print(json.dumps(s, indent=2))
    elif not quiet:
        render_human(s)
    return s["exit_code"]


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
