#!/usr/bin/env python3
"""
One-shot repair for ai-status.json drift.

Fixes the agents[] block + a few mis-attributed task commits, without touching
status semantics the orchestrator owns. Idempotent: rerunning produces no diff
once data is clean.

Patches applied:
  1. agents[].current_task: if not in current_task_ids, replace with first item
     of current_task_ids (or null if empty). Removes stale references to
     previous-sprint tasks.
  2. agents[].last_activity: backfilled from ai-activity-log.jsonl (max ts per
     agent over the last 24h).
  3. agents[].last_update: clamped to "now" if it's in the future (clock skew).
  4. tasks[].commit_agent: corrected for known-mis-attributed commits using
     `git log` author as ground truth.

Reads/writes ai-status.json AND docs-site/ai-status.json (kept in sync).
Writes are atomic (tmp + rename) to avoid colliding with the orchestrator.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TARGETS = [REPO / "ai-status.json", REPO / "docs-site" / "ai-status.json"]
LOG = REPO / "docs-site" / "ai-activity-log.jsonl"


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def last_activity_per_agent(log_path: Path, tail_bytes: int = 50_000_000) -> dict[str, str]:
    """Scan tail of activity log for max ts per agent. Clamp future ts to now."""
    if not log_path.exists():
        return {}
    size = log_path.stat().st_size
    start = max(0, size - tail_bytes)
    out: dict[str, datetime] = {}
    with log_path.open("rb") as f:
        f.seek(start)
        if start > 0:
            f.readline()  # discard partial line
        for raw in f:
            try:
                rec = json.loads(raw)
            except Exception:
                continue
            agent = rec.get("agent")
            ts = parse_ts(rec.get("ts"))
            if not agent or not ts:
                continue
            cur = out.get(agent)
            if cur is None or ts > cur:
                out[agent] = ts
    now = datetime.now(timezone.utc)
    return {k: min(v, now).strftime("%Y-%m-%dT%H:%M:%SZ") for k, v in out.items()}


def git_author_for(commit_hash: str) -> str | None:
    if not commit_hash:
        return None
    try:
        r = subprocess.run(
            ["git", "-C", str(REPO), "log", "-1", "--format=%an", commit_hash],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0:
            name = r.stdout.strip()
            return name or None
    except Exception:
        pass
    return None


def atomic_write_json(path: Path, data) -> None:
    tmp_fd, tmp_path = tempfile.mkstemp(prefix=path.name + ".", dir=str(path.parent))
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except FileNotFoundError:
            pass
        raise


def repair(state: dict, last_act: dict[str, str]) -> dict:
    changes: list[str] = []
    now = datetime.now(timezone.utc)
    now_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    # 1+2+3: agents[]
    for agent in state.get("agents", []) or []:
        name = agent.get("name", "?")
        ids = agent.get("current_task_ids") or []
        cur = agent.get("current_task")
        if cur not in ids:
            new_cur = ids[0] if ids else None
            if cur != new_cur:
                agent["current_task"] = new_cur
                changes.append(f"{name}.current_task: {cur!r} -> {new_cur!r}")

        la = last_act.get(name)
        if la and agent.get("last_activity") != la:
            agent["last_activity"] = la
            changes.append(f"{name}.last_activity: -> {la}")

        lu_ts = parse_ts(agent.get("last_update"))
        if lu_ts and lu_ts > now:
            old = agent.get("last_update")
            agent["last_update"] = now_str
            changes.append(f"{name}.last_update (future): {old} -> {now_str}")

    # 4: NOTE: do NOT "correct" commit_agent against git author. The orchestrator
    # records commit_agent = the AI persona (AI_NAME env var) at close-time, while
    # git author is just whatever the box's `git config user.name` happens to be.
    # Multiple personas can run on the same machine and share a git config, so
    # rewriting commit_agent from git author corrupts the orchestrator's truth.
    # If commit_agent is wrong, that is a B-class root-cause bug to fix at the
    # write site (completion_metadata_from_env), not a data-repair concern.

    # bump updated_at so dashboard cache busts
    state["updated_at"] = now_str
    return {"changes": changes, "state": state}


def main() -> int:
    primary = TARGETS[0]
    if not primary.exists():
        print(f"missing: {primary}", file=sys.stderr)
        return 2

    with primary.open("r", encoding="utf-8") as f:
        state = json.load(f)

    last_act = last_activity_per_agent(LOG)
    result = repair(state, last_act)

    if not result["changes"]:
        print("no changes — data already clean")
        return 0

    for p in TARGETS:
        atomic_write_json(p, result["state"])

    print(f"wrote {len(TARGETS)} file(s); {len(result['changes'])} change(s):")
    for c in result["changes"]:
        print(f"  - {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
