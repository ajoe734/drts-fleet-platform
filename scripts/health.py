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

# --- config / tunables ---
ROOT_DIR = Path(__file__).resolve().parent.parent
STATE_FILE = ROOT_DIR / ".orchestrator/state.json"
SUPERVISOR_LOG = ROOT_DIR / ".orchestrator/logs/supervisor-bg.log"
LANE_HEALTH_LOG = ROOT_DIR / ".orchestrator/logs/lane-health.jsonl"

HEARTBEAT_LAG_WARN = int(os.environ.get("HEALTH_HEARTBEAT_LAG_WARN", "300"))
DONE_GAP_WARN = int(os.environ.get("HEALTH_DONE_GAP_WARN", "1800"))
SUPERSEDE_RATE_WARN = int(os.environ.get("HEALTH_SUPERSEDE_RATE_WARN", "8"))

# Supervisor writes log timestamps via `datetime.now(ZoneInfo("Asia/Taipei"))`
# regardless of host tz (see supervisor.py LOCAL_TZ). Parse with that explicit
# zone so cutoff math is correct on hosts in UTC (or any other tz).
SUPERVISOR_LOG_TZ = ZoneInfo("Asia/Taipei") if ZoneInfo else None


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
                     "blockers": 0, "provider_pauses": []},
        "lanes": [],
        "issues": [],
    }

    # supervisor presence
    try:
        out = subprocess.check_output(["pgrep", "-af", "supervisor.py"],
                                      text=True, stderr=subprocess.DEVNULL).strip()
        pids = [int(line.split()[0]) for line in out.splitlines()
                if "supervisor.py" in line and "grep" not in line
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
        tasks = s.get("tasks", {}) or {}
        workers = s.get("workers", {}) or {}

        for wid, w in workers.items():
            if w.get("status") != "running":
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
            result["failures"]["provider_pauses"].append(
                {"lane": lane, "kind": p.get("kind")})

        # heartbeat from supervisor field, else fall back to state.json mtime
        sup_state = s.get("supervisor", {}) or {}
        hb_str = (sup_state.get("heartbeat_at") or sup_state.get("last_heartbeat")
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
            # Asia/Taipei tz (supervisor.py LOCAL_TZ). Stamp them with that
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

    # lane health from lane-health.jsonl
    try:
        if LANE_HEALTH_LOG.exists():
            latest = {}
            with open(LANE_HEALTH_LOG) as f:
                for ln in f:
                    ln = ln.strip()
                    if not ln:
                        continue
                    try:
                        e = json.loads(ln)
                        latest[e["lane"]] = e
                    except Exception:
                        pass
            for lane, e in latest.items():
                result["lanes"].append({
                    "lane": lane,
                    "status": e.get("status"),
                    "ttl_seconds": e.get("ttl_seconds"),
                    "as_of": e.get("ts"),
                })
                if e.get("status") in ("warn", "expired", "unreadable", "missing"):
                    result["issues"].append(
                        f"WARN: lane {lane} status={e.get('status')} "
                        f"ttl={e.get('ttl_seconds')}")
    except Exception as e:
        result["issues"].append(f"WARN: failed to read lane-health.jsonl: {e}")

    crit = any(i.startswith("CRITICAL") for i in result["issues"])
    warn = any(i.startswith("WARN") for i in result["issues"])
    result["exit_code"] = 2 if crit else (1 if warn else 0)
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
            print(f"  {ln.get('lane', '?'):10s} {sc:20s} ttl={ttl}")

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
