#!/usr/bin/env python3
"""Deterministic steps for the Claude cloud relay.

A relay session (see adapters/claude_cloud_relay.py) runs under ``claude -p``:
Claude Code refuses a foreground ``sleep`` and a background job dies with the
turn, so the relay waits here between RemoteTrigger polls. Landing the cloud
candidate also happens here, so the write-scope check is a prefix comparison
instead of the model's reading of a file list. The routines a task started are
recorded here too: RemoteTrigger ``list`` returns every routine on the account
with its full prompt, too large to read in a relay turn.

  wait --branch B [--baseline SHA] --seconds N
      Return as soon as origin/B points at a commit other than SHA, or after
      N seconds. ``--seconds 0`` just reports the current head.
  land --branch B --base BASE --sha SHA [--scope S ...]
      Fetch, check that origin/B is SHA and that every file it changes against
      origin/BASE is inside a scope, then fast-forward the local task branch.

  record --state-dir D --task T --trigger ID --run RUN
      Remember that the relay run RUN started routine ID for task T.
  lookup --state-dir D --task T --hours H
      The routines recorded for task T in the last H hours, newest first.

Each command prints one JSON line; ``land`` exits 1 when it refuses.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

POLL_INTERVAL_SECONDS = 20


def _git(*args: str, timeout: float = 120.0) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], text=True, capture_output=True, timeout=timeout)


def remote_head(branch: str) -> str | None:
    try:
        result = _git("ls-remote", "origin", f"refs/heads/{branch}", timeout=60.0)
    except subprocess.TimeoutExpired:
        return None
    if result.returncode != 0:
        return None
    line = (result.stdout or "").strip().splitlines()
    return line[0].split()[0] if line else None


def in_scope(path: str, scope: str) -> bool:
    scope = scope.strip()
    if not scope:
        return False
    if any(char in scope for char in "*?["):
        if scope.endswith("/**") and path.startswith(scope[:-2]):
            return True
        return fnmatch.fnmatchcase(path, scope)
    if scope.endswith("/"):
        return path.startswith(scope)
    return path == scope or path.startswith(scope + "/")


def wait(branch: str, baseline: str, seconds: int) -> dict[str, Any]:
    deadline = time.monotonic() + max(0, seconds)
    while True:
        head = remote_head(branch)
        if head and head != baseline:
            return {"branch": branch, "branch_head": head, "changed": True}
        if time.monotonic() >= deadline:
            return {"branch": branch, "branch_head": head, "changed": False}
        time.sleep(min(POLL_INTERVAL_SECONDS, max(1.0, deadline - time.monotonic())))


def _refuse(reason: str, **extra: Any) -> dict[str, Any]:
    return {"ok": False, "reason": reason, **extra}


def land(branch: str, base: str, sha: str, scopes: list[str]) -> dict[str, Any]:
    sha = sha.strip().lower()
    fetch = _git(
        "fetch",
        "origin",
        f"+refs/heads/{branch}:refs/remotes/origin/{branch}",
        f"+refs/heads/{base}:refs/remotes/origin/{base}",
        timeout=180.0,
    )
    if fetch.returncode != 0:
        return _refuse("git fetch failed", stderr=(fetch.stderr or "").strip()[-800:])
    head = _git("rev-parse", f"refs/remotes/origin/{branch}").stdout.strip().lower()
    if head != sha:
        return _refuse(f"origin/{branch} is {head or 'missing'}, not {sha}")

    diff = _git("diff", "--name-only", f"refs/remotes/origin/{base}...{sha}")
    if diff.returncode != 0:
        return _refuse("git diff failed", stderr=(diff.stderr or "").strip()[-800:])
    changed = [line for line in diff.stdout.splitlines() if line.strip()]
    if not changed:
        return _refuse(f"{sha} changes nothing against origin/{base}")
    outside = [path for path in changed if scopes and not any(in_scope(path, s) for s in scopes)]
    if outside:
        return _refuse("files outside write_scopes", outside=outside, changed=changed)

    current = _git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if current == branch:
        moved = _git("merge", "--ff-only", sha)
        if moved.returncode != 0:
            return _refuse(
                "local task branch cannot fast-forward to the cloud commit",
                stderr=(moved.stderr or moved.stdout or "").strip()[-800:],
            )
    else:
        local = _git("rev-parse", "--verify", "--quiet", f"refs/heads/{branch}").stdout.strip()
        if local and _git("merge-base", "--is-ancestor", local, sha).returncode != 0:
            return _refuse(f"local {branch} ({local}) is not an ancestor of {sha}")
        updated = _git("update-ref", f"refs/heads/{branch}", sha, *([local] if local else []))
        if updated.returncode != 0:
            return _refuse("git update-ref failed", stderr=(updated.stderr or "").strip()[-800:])
    return {"ok": True, "branch": branch, "sha": sha, "changed": changed, "scopes_checked": bool(scopes)}


def _record_path(state_dir: str, task: str) -> Path:
    safe = "".join(char if char.isalnum() or char in "-_." else "_" for char in task)
    return Path(state_dir) / f"{safe}.json"


def _read_records(path: Path) -> list[dict[str, Any]]:
    try:
        records = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    return [item for item in records if isinstance(item, dict)] if isinstance(records, list) else []


def record(state_dir: str, task: str, trigger: str, run: str) -> dict[str, Any]:
    path = _record_path(state_dir, task)
    records = _read_records(path)
    if not any(item.get("trigger_id") == trigger for item in records):
        records.append(
            {"trigger_id": trigger, "run_id": run, "created_at": datetime.now(timezone.utc).isoformat()}
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(records[-20:], indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    return {"task": task, "trigger_id": trigger, "recorded": len(records[-20:])}


def lookup(state_dir: str, task: str, hours: float) -> dict[str, Any]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    recent = []
    for item in _read_records(_record_path(state_dir, task)):
        try:
            created = datetime.fromisoformat(str(item.get("created_at")))
        except ValueError:
            continue
        if created >= cutoff:
            recent.append(item)
    recent.sort(key=lambda item: str(item.get("created_at")), reverse=True)
    return {"task": task, "routines": recent}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    wait_parser = sub.add_parser("wait")
    wait_parser.add_argument("--branch", required=True)
    wait_parser.add_argument("--baseline", default="")
    wait_parser.add_argument("--seconds", type=int, default=180)
    land_parser = sub.add_parser("land")
    land_parser.add_argument("--branch", required=True)
    land_parser.add_argument("--base", required=True)
    land_parser.add_argument("--sha", required=True)
    land_parser.add_argument("--scope", action="append", default=[])
    record_parser = sub.add_parser("record")
    record_parser.add_argument("--state-dir", required=True)
    record_parser.add_argument("--task", required=True)
    record_parser.add_argument("--trigger", required=True)
    record_parser.add_argument("--run", required=True)
    lookup_parser = sub.add_parser("lookup")
    lookup_parser.add_argument("--state-dir", required=True)
    lookup_parser.add_argument("--task", required=True)
    lookup_parser.add_argument("--hours", type=float, default=6)
    args = parser.parse_args(argv)

    if args.command == "wait":
        baseline = "" if args.baseline.strip().lower() in {"", "none"} else args.baseline.strip()
        print(json.dumps(wait(args.branch, baseline, args.seconds)))
        return 0
    if args.command == "record":
        print(json.dumps(record(args.state_dir, args.task, args.trigger, args.run)))
        return 0
    if args.command == "lookup":
        print(json.dumps(lookup(args.state_dir, args.task, args.hours)))
        return 0
    result = land(args.branch, args.base, args.sha, args.scope)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
