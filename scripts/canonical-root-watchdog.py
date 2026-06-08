#!/usr/bin/env python3
"""
canonical-root-watchdog.py — periodic check that the canonical workspace
root is parked on an allow-listed branch.

When supervisor-spawned workers misbehave and `git switch` on the
canonical root instead of inside their assigned worktree, the canonical
root's HEAD drifts to a worker branch that doesn't contain the active
dispatch state. The dashboard appears to "lose work." This watchdog
detects that drift before the operator does.

Modes:
  --observe (default)  : log the drift to a JSONL file, exit non-zero.
                         The systemd timer's exit code then surfaces in
                         `systemctl --user status drts-canonical-root-watch`.
  --enforce            : same as --observe, plus auto-`git switch` back to
                         the configured "expected" branch IF the working
                         tree is clean (no uncommitted changes). Refuses
                         to act on a dirty tree.

Allow list (set via env or CLI args, in priority order):
  --branch=<name>          (CLI override, highest priority)
  ORCH_CANONICAL_BRANCH    (env)
  Fallback: "main", "dev" always allowed

The "expected" branch for enforce mode is the first value from:
  --expected=<name> CLI, then ORCH_CANONICAL_EXPECTED env, then "dev".
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
LOG_FILE = ROOT_DIR / ".orchestrator/logs/canonical-root-watchdog.jsonl"
DEFAULT_ALLOWED = {"main", "dev"}


def current_branch(repo: Path) -> str:
    r = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True, text=True, check=False,
    )
    return r.stdout.strip() if r.returncode == 0 else "?"


def is_clean(repo: Path) -> bool:
    r = subprocess.run(
        ["git", "-C", str(repo), "status", "--porcelain"],
        capture_output=True, text=True, check=False,
    )
    return r.returncode == 0 and not r.stdout.strip()


def main(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--observe", action="store_true", default=True)
    p.add_argument("--enforce", action="store_true",
                   help="auto-switch back to --expected if tree is clean")
    p.add_argument("--branch", action="append", default=[],
                   help="extra allow-listed branch (may repeat)")
    p.add_argument("--expected", default=os.environ.get("ORCH_CANONICAL_EXPECTED", "dev"),
                   help="branch to auto-switch to in --enforce mode")
    args = p.parse_args(argv)

    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

    allowed = set(DEFAULT_ALLOWED)
    env_branch = os.environ.get("ORCH_CANONICAL_BRANCH")
    if env_branch:
        for b in env_branch.split(","):
            b = b.strip()
            if b:
                allowed.add(b)
    for b in args.branch:
        allowed.add(b)

    branch = current_branch(ROOT_DIR)
    ts = datetime.now(timezone.utc).isoformat()
    clean = is_clean(ROOT_DIR)

    record = {
        "ts": ts,
        "current_branch": branch,
        "allowed": sorted(allowed),
        "expected": args.expected,
        "clean_tree": clean,
        "drift": branch not in allowed,
        "action": "none",
    }

    if record["drift"]:
        if args.enforce and clean:
            r = subprocess.run(
                ["git", "-C", str(ROOT_DIR), "switch", args.expected],
                capture_output=True, text=True, check=False,
            )
            if r.returncode == 0:
                record["action"] = f"switched_to_{args.expected}"
            else:
                record["action"] = f"switch_failed: {r.stderr.strip()[:200]}"
        elif args.enforce and not clean:
            record["action"] = "refused_enforce_dirty_tree"
        # observe-only: just emit the record

    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")

    # exit code: 0 if no drift, 1 if drift, 2 if drift on dirty tree
    if not record["drift"]:
        return 0
    if not clean and args.enforce:
        # Critical: drifted AND can't be auto-recovered
        print(f"CRITICAL: canonical root drifted to '{branch}' (not in {sorted(allowed)})"
              f" and tree is dirty — manual intervention required", file=sys.stderr)
        return 2
    print(f"WARN: canonical root on '{branch}' (allowed: {sorted(allowed)}). "
          f"action={record['action']}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
