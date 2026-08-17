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
from collections import Counter
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


def collect() -> dict:
    now_dt = datetime.now(timezone.utc)
    result = {
        "now": now_dt.isoformat(),
        "supervisor": {"running": False, "pid": None, "rss_kb": None,
                       "uptime_seconds": None, "heartbeat_lag_seconds": None,
                       "heartbeat_source": None},
        "workers": {"running": [], "count": 0},
        "velocity": {"done_last_1h": 0, "done_last_24h": 0,
                     "last_done_at": None, "last_done_id": None,
                     "seconds_since_last_done": None},
        "failures": {"supersedes_last_1h": 0, "dispatch_pauses": 0,
                     "blockers": 0, "provider_pauses": [],
                     "chair_review_failure_streak": 0},
        "lanes": [],
        "watchdogs": [],
        "issues": [],
    }

    # Watch the watchers. Every other check in this file assumes something runs
    # it; on 2026-08-16 nothing did. All three DRTS timers sat
    # ActiveState=active and UnitFileState=enabled with an empty next elapse,
    # so they looked healthy in `list-units` while firing nothing for eight
    # hours. A disarmed probe reports no issues, which reads exactly like a
    # healthy system.
    for unit in ("drts-health.timer", "drts-canonical-root-watch.timer",
                 "drts-claude-keepalive.timer"):
        entry = {"unit": unit, "active_state": None, "next_elapse": None, "armed": None}
        try:
            out = subprocess.check_output(
                ["systemctl", "--user", "show", unit,
                 "-p", "ActiveState", "-p", "UnitFileState", "-p", "NextElapseUSecRealtime",
                 "-p", "NextElapseUSecMonotonic"],
                text=True, stderr=subprocess.DEVNULL)
        except (OSError, subprocess.CalledProcessError):
            result["watchdogs"].append(entry)
            continue
        props = dict(
            line.split("=", 1) for line in out.splitlines() if "=" in line)
        entry["active_state"] = props.get("ActiveState")
        entry["unit_file_state"] = props.get("UnitFileState")
        # systemd reports "no scheduled elapse" as an empty realtime value and
        # the literal "infinity" for the monotonic one. Treating either as a
        # timestamp is how a disarmed timer reports itself as armed — the exact
        # failure this check exists to catch.
        never = {"", "0", "infinity", "n/a"}
        next_elapse = next(
            (v for v in (str(props.get("NextElapseUSecRealtime") or "").strip(),
                         str(props.get("NextElapseUSecMonotonic") or "").strip())
             if v.lower() not in never),
            None)
        entry["next_elapse"] = next_elapse
        # "enabled and active but with nothing scheduled" is the silent-death
        # state; an intentionally stopped timer is not an issue.
        entry["armed"] = next_elapse is not None
        result["watchdogs"].append(entry)
        if (props.get("UnitFileState") == "enabled"
                and props.get("ActiveState") == "active" and not entry["armed"]):
            result["issues"].append(
                f"WARN: {unit} is enabled and active but has no next elapse (disarmed)")

    # supervisor presence
    try:
        out = subprocess.check_output(["pgrep", "-af", "supervisor_runtime.py"],
                                      text=True, stderr=subprocess.DEVNULL).strip()
        pids = [int(line.split()[0]) for line in out.splitlines()
                if "supervisor_runtime.py" in line and "grep" not in line
                and "claude -p" not in line]
        if pids:
            pid = pids[0]
            try:
                with open(f"/proc/{pid}/status") as f:
                    for ln in f:
                        if ln.startswith("VmRSS:"):
                            result["supervisor"]["rss_kb"] = int(ln.split()[1])
                with open(f"/proc/{pid}/stat") as f:
                    stat = f.read().split()
                starttime_ticks = int(stat[21])
                clk_tck = os.sysconf("SC_CLK_TCK")
                with open("/proc/uptime") as f:
                    uptime_seconds = float(f.read().split()[0])
                result["supervisor"]["uptime_seconds"] = int(
                    uptime_seconds - (starttime_ticks / clk_tck))
            except Exception:
                pass
            result["supervisor"]["pid"] = pid
            result["supervisor"]["running"] = True
    except subprocess.CalledProcessError:
        pass
    except FileNotFoundError:
        result["issues"].append("WARN: pgrep not available")

    if not result["supervisor"]["running"]:
        result["issues"].append("CRITICAL: supervisor not running")

    # state.json metrics
    try:
        with open(STATE_FILE) as f:
            s = json.load(f)
        tasks = canonical_task_map()
        if not tasks:
            result["issues"].append(f"CRITICAL: canonical task status not found at {STATUS_FILE}")
        workers = s.get("workers", {}) or {}

        for wid, w in workers.items():
            if w.get("status") not in ACTIVE_WORKER_STATUSES:
                continue
            started = (w.get("started_at") or w.get("claimed_at")
                       or w.get("dispatched_at") or w.get("created_at") or "")
            age = None
            if started:
                try:
                    sdt = datetime.fromisoformat(started.replace("Z", "+00:00"))
                    age = int((now_dt - sdt).total_seconds())
                except Exception:
                    pass
            result["workers"]["running"].append({
                "id": wid,
                "status": w.get("status"),
                "provider": w.get("provider"),
                "task_id": w.get("task_id"),
                "age_seconds": age,
            })
        result["workers"]["count"] = len(result["workers"]["running"])

        # velocity from done tasks with timestamp
        def task_ts(t):
            for k in ("last_update", "updated_at", "completed_at"):
                v = t.get(k)
                if v:
                    return v
            return ""

        done_dts = []
        for t in tasks.values():
            if t.get("status") != "done":
                continue
            ts = task_ts(t)
            if not ts:
                continue
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                done_dts.append((dt, t.get("id")))
            except Exception:
                pass

        result["velocity"]["done_last_1h"] = sum(
            1 for dt, _ in done_dts if (now_dt - dt).total_seconds() < 3600)
        result["velocity"]["done_last_24h"] = sum(
            1 for dt, _ in done_dts if (now_dt - dt).total_seconds() < 86400)
        if done_dts:
            latest_dt, latest_id = max(done_dts, key=lambda x: x[0])
            gap = int((now_dt - latest_dt).total_seconds())
            result["velocity"]["last_done_at"] = latest_dt.isoformat()
            result["velocity"]["last_done_id"] = latest_id
            result["velocity"]["seconds_since_last_done"] = gap
            if gap > DONE_GAP_WARN:
                result["issues"].append(f"WARN: no task completed in {gap // 60} min")

        result["failures"]["dispatch_pauses"] = len(s.get("dispatch_pauses", {}) or {})
        result["failures"]["blockers"] = sum(
            1 for t in tasks.values() if t.get("status") == "blocked")
        for lane, p in (s.get("provider_pauses", {}) or {}).items():
            kind = p.get("kind")
            result["failures"]["provider_pauses"].append(
                {"lane": lane, "kind": kind})
            if kind == "auth":
                result["issues"].append(f"WARN: provider {lane} auth paused")

        # A chair review that keeps failing is not the same as an idle one, but
        # until the runtime started counting the streak the two were
        # indistinguishable here: the supervisor heartbeat stayed green, the
        # queue read empty every tick, and the retry loop was visible only as
        # repeated lines in the activity log that nothing consumed.
        chair = s.get("chair_review", {}) or {}
        streak = int(chair.get("failure_streak") or 0)
        result["failures"]["chair_review_failure_streak"] = streak
        if streak > 0:
            retry_after = chair.get("cooldown_until") or "unknown"
            result["issues"].append(
                f"WARN: chair review failing ({streak} consecutive), backing off until {retry_after}")

        # heartbeat from supervisor field, else fall back to state.json mtime
        sup_state = s.get("supervisor", {}) or {}
        hb_str = (sup_state.get("last_heartbeat_at") or sup_state.get("heartbeat_at") or sup_state.get("last_heartbeat")
                  or sup_state.get("last_tick_at") or sup_state.get("last_run_at") or "")
        if hb_str:
            try:
                hb_dt = datetime.fromisoformat(hb_str.replace("Z", "+00:00"))
                lag = int((now_dt - hb_dt).total_seconds())
                result["supervisor"]["heartbeat_lag_seconds"] = lag
                result["supervisor"]["heartbeat_source"] = "supervisor.state"
                if lag > HEARTBEAT_LAG_WARN:
                    result["issues"].append(f"WARN: supervisor heartbeat lag {lag}s")
            except Exception:
                pass
        if result["supervisor"]["heartbeat_lag_seconds"] is None:
            try:
                mt = STATE_FILE.stat().st_mtime
                hb_dt = datetime.fromtimestamp(mt, timezone.utc)
                lag = int((now_dt - hb_dt).total_seconds())
                result["supervisor"]["heartbeat_lag_seconds"] = lag
                result["supervisor"]["heartbeat_source"] = "state.json mtime"
                if lag > HEARTBEAT_LAG_WARN:
                    result["issues"].append(
                        f"WARN: state.json untouched for {lag}s (supervisor likely stalled)")
            except Exception:
                pass

    except FileNotFoundError:
        result["issues"].append(f"CRITICAL: state.json not found at {STATE_FILE}")
    except Exception as e:
        result["issues"].append(f"WARN: failed to parse state.json: {e}")

    # supersede rate from supervisor log (last 1h)
    try:
        if SUPERSEDE_RATE_WARN >= 0 and SUPERVISOR_LOG.exists():
            # supervisor-bg.log timestamps are written with the hardcoded
            # Asia/Taipei tz (supervisor runtime LOCAL_TZ). Stamp them with that
            # zone before comparing to a UTC cutoff so we don't over/under
            # count by the host tz offset.
            cutoff_dt = now_dt - timedelta(seconds=3600)
            n_super = 0
            with open(SUPERVISOR_LOG, "rb") as f:
                f.seek(0, 2)
                size = f.tell()
                f.seek(max(0, size - 200_000))
                tail = f.read().decode("utf-8", "replace").splitlines()
            for ln in tail:
                if "worker superseded" not in ln:
                    continue
                m = re.match(r"\[(\S+ \S+)\]", ln)
                if not m:
                    continue
                try:
                    dt = datetime.fromisoformat(m.group(1).replace(" ", "T"))
                    if dt.tzinfo is None and SUPERVISOR_LOG_TZ is not None:
                        dt = dt.replace(tzinfo=SUPERVISOR_LOG_TZ)
                    elif dt.tzinfo is None:
                        # ZoneInfo unavailable (pre-3.9 python); best-effort
                        # naive comparison.
                        dt = dt.replace(tzinfo=timezone.utc)
                    if dt >= cutoff_dt:
                        n_super += 1
                except Exception:
                    pass
            result["failures"]["supersedes_last_1h"] = n_super
            if n_super > SUPERSEDE_RATE_WARN:
                result["issues"].append(
                    f"WARN: {n_super} supersedes in last 1h (>{SUPERSEDE_RATE_WARN} threshold)")
    except Exception as e:
        result["issues"].append(f"WARN: failed to scan supervisor log: {e}")

    # The supervisor projection is the canonical live view. Legacy lane-health
    # logs are diagnostic history and must not create false outages when stale.
    try:
        projection = json.loads(CONTROL_PLANE_SUMMARY.read_text(encoding="utf-8"))
        for lane in projection.get("lanes", []):
            if not isinstance(lane, dict):
                continue
            result["lanes"].append({
                "lane": lane.get("id") or lane.get("name"),
                "status": "enabled" if lane.get("enabled", True) else "disabled",
                "load": lane.get("load"),
                "as_of": projection.get("generated_at"),
            })
    except Exception as e:
        result["issues"].append(f"WARN: failed to read canonical control-plane summary: {e}")

    # keepalive probe results are stronger evidence than access-token TTL.
    try:
        keepalive = latest_keepalive_status(CLAUDE_KEEPALIVE_LOG)
        if keepalive:
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
                    result["issues"].append(
                        f"WARN: lane {lane} keepalive failed"
                        + (
                            f" rc={entry.get('rc')}"
                            if entry.get("rc") is not None
                            else ""
                        )
                        + (
                            f" msg={entry.get('message')}"
                            if entry.get("message")
                            else ""
                        )
                    )
    except Exception as e:
        result["issues"].append(f"WARN: failed to read keepalive log: {e}")

    crit = any(i.startswith("CRITICAL") for i in result["issues"])
    warn = any(i.startswith("WARN") for i in result["issues"])
    # Health warnings are observability signals, not a failed systemd unit.
    # Callers inspect `issues`; only a genuine critical condition is non-zero.
    result["exit_code"] = 2 if crit else 0
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
            sc = c(GREEN if st == "ok" else YELLOW if st == "warn" else RED, st)
            ttl = fmt_dur(ln.get("ttl_seconds"))
            keepalive = ""
            if ln.get("keepalive_result"):
                keepalive_status = str(ln.get("keepalive_result"))
                keepalive_color = GREEN if keepalive_status == "OK" else RED
                keepalive = f" keepalive={c(keepalive_color, keepalive_status.lower())}"
            print(f"  {ln.get('lane', '?'):10s} {sc:20s} ttl={ttl}{keepalive}")

    watchdogs = s.get("watchdogs") or []
    if watchdogs:
        print(f"\n{c(BOLD, 'watchdogs')}:")
        for wd in watchdogs:
            armed = wd.get("armed")
            state = "armed" if armed else "DISARMED" if armed is False else "unknown"
            print(f"  {wd.get('unit', '?'):32s} {c(GREEN if armed else RED, state)}"
                  f"  ({wd.get('active_state') or '?'})")

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
