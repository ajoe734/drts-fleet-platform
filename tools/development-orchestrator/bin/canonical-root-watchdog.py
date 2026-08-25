#!/usr/bin/env python3
"""
canonical-root-watchdog.py — periodic health check on the canonical
workspace root.

Originally this watchdog only caught *branch drift* — a worker that
`git switch`-es on the canonical root instead of inside its assigned
worktree, moving HEAD to a branch that doesn't carry the active dispatch
state ("the dashboard loses work").

That caught only one of the two ways the canonical root rots. The other,
observed 2026-06-21, is more insidious: the root stays on the *right*
branch name (`dev`) but silently

  (a) falls many commits behind origin/dev (stale ref — nobody pulled
      after landing PRs), and/or
  (b) accumulates uncommitted residue (the root gets used as a manual
      integration / test scratchpad and never reset back to a clean
      trunk).

Neither (a) nor (b) trips the branch-name check, so they went unnoticed
for weeks. This watchdog now alerts on all three: drift, staleness, and
residue. Detection only for (a)/(b) — auto-recovery stays limited to the
branch-drift case on a clean tree, because clobbering a dirty live tree
is exactly the hazard we are trying to surface, not automate.

Modes:
  --observe (default)  : log status to a JSONL file, exit non-zero on any
                         drift / staleness / residue. The systemd timer's
                         exit code then surfaces in
                         `systemctl --user status drts-canonical-root-watch`.
  --enforce            : same as --observe, plus auto-`git switch` back to
                         the configured "expected" branch IF the working
                         tree is clean AND the problem is branch drift.
                         Never auto-acts on a dirty tree.

Allow list (set via env or CLI args, in priority order):
  --branch=<name>          (CLI override, highest priority)
  ORCH_CANONICAL_BRANCH    (env)
  Fallback: "main", "dev" always allowed

The "expected" branch for enforce mode is the first value from:
  --expected=<name> CLI, then ORCH_CANONICAL_EXPECTED env, then "dev".

Staleness threshold (commits behind upstream before alerting):
  --stale-threshold=<n> CLI, then ORCH_CANONICAL_STALE_THRESHOLD env,
  then default 5. Comparison is against origin/<branch> using the
  last-fetched remote-tracking ref (no network fetch — kept cheap so the
  timer can run every minute). A separate process is expected to keep
  origin refs fresh; if nothing fetches, staleness simply reports against
  the last-known origin ref.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# The subject of the observation is the canonical checkout, which is not the
# same question as where this file lives. parents[3] answered the second and
# was used for the first, so once the systemd unit moved to the pinned release
# the watchdog began inspecting `.artifacts/releases/active` -- a detached
# worktree. It has reported `off-allowlist branch 'HEAD'` on every fire since
# 2026-08-19 01:12, and the canonical log stops at that exact minute; its last
# real observation recorded the canonical root sitting on
# docs/l1-freeze-controlled-sync-20260817. It went blind on a drift.
#
# The unit already carries `WorkingDirectory=<canonical root>` with a comment
# saying machine truth is read where it lives -- a mitigation that was written
# and was inert, because nothing here ever read the working directory.
#
# common.ROOT is the resolver the rest of the control plane uses (env, then the
# checkout that owns .orchestrator/, then the git common dir), so a release copy
# resolves back to the repository it was cut from.
_SOURCE_ROOT = Path(__file__).resolve().parents[3]
_TOOL_ROOT = _SOURCE_ROOT / "tools" / "development-orchestrator"
if str(_TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(_TOOL_ROOT))

from common import ROOT as ROOT_DIR  # noqa: E402

LOG_FILE = ROOT_DIR / ".orchestrator/logs/canonical-root-watchdog.jsonl"

# The timer fires every minute whether or not anything moved. Writing the
# observation each time produced 24,739 lines carrying 271 distinct
# observations -- 98.9% duplication, one state repeated 1,770 times in a row,
# 16.4 MB. Rotation would have trimmed a file that should never have grown.
#
# So: record a change. A heartbeat still lands periodically, because a log that
# goes quiet must stay distinguishable from a watchdog that died.
HEARTBEAT_SECONDS = 3600.0


def _observation(record: dict) -> str:
    """The record minus the fields that differ on every run by construction."""
    return json.dumps({k: v for k, v in record.items() if k != "ts"}, sort_keys=True)


def _should_record(record: dict) -> bool:
    """Is this worth a line: a changed observation, or a due heartbeat?"""
    try:
        with open(LOG_FILE, "rb") as handle:
            handle.seek(0, 2)
            size = handle.tell()
            handle.seek(max(0, size - 65536))
            tail = handle.read().decode("utf-8", "replace").splitlines()
    except OSError:
        return True
    for line in reversed(tail):
        line = line.strip()
        if not line:
            continue
        try:
            previous = json.loads(line)
        except json.JSONDecodeError:
            continue
        if _observation(previous) != _observation(record):
            return True
        last = _parse_ts(previous.get("ts"))
        now = _parse_ts(record.get("ts"))
        if last is None or now is None:
            return True
        return (now - last).total_seconds() >= HEARTBEAT_SECONDS
    return True


def _parse_ts(value: object) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
DEFAULT_ALLOWED = {"main", "dev"}
DEFAULT_STALE_THRESHOLD = 5

# Paths under the canonical root that are *expected* to carry live edits
# (the running supervisor's own runtime/config) and therefore must NOT be
# counted as code residue. Everything else dirty on the canonical root is
# residue worth surfacing.
RESIDUE_EXEMPT_PREFIXES = (".orchestrator/",)


def _git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True, check=False,
    )


def current_branch(repo: Path) -> str:
    r = _git(repo, "rev-parse", "--abbrev-ref", "HEAD")
    return r.stdout.strip() if r.returncode == 0 else "?"


def porcelain(repo: Path) -> list[str]:
    r = _git(repo, "status", "--porcelain")
    if r.returncode != 0:
        return []
    return [ln for ln in r.stdout.splitlines() if ln.strip()]


def residue_files(repo: Path) -> list[str]:
    """Dirty/untracked files that are NOT exempt live-runtime paths."""
    out = []
    for ln in porcelain(repo):
        # porcelain format: "XY <path>" (path starts at col 3)
        path = ln[3:].strip().strip('"')
        # handle rename "old -> new"
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        if not any(path.startswith(p) for p in RESIDUE_EXEMPT_PREFIXES):
            out.append(path)
    return out


def behind_count(repo: Path, branch: str) -> int:
    """Commits HEAD is behind origin/<branch>, using last-fetched ref.

    Returns -1 if there is no such upstream ref to compare against.
    """
    upstream = f"origin/{branch}"
    if _git(repo, "rev-parse", "--verify", "--quiet", upstream).returncode != 0:
        return -1
    r = _git(repo, "rev-list", "--count", f"HEAD..{upstream}")
    if r.returncode != 0:
        return -1
    try:
        return int(r.stdout.strip())
    except ValueError:
        return -1


def ahead_count(repo: Path, branch: str) -> int:
    """Commits on HEAD that origin/<branch> does not have, last-fetched ref.

    The mirror of behind_count, and the case this watchdog could not see. It
    alerted on drift, staleness and residue -- all states where the root has
    less than the remote, or junk beside it. It had no notion of the root
    holding *more*: commits that exist on this disk and nowhere else.

    On 2026-08-25 that was two commits of S1F-REF-001 runtime work, 34 files,
    on the canonical root's own dev branch, pushed to no remote branch at all.
    Nothing reported it, and the usual `git pull --ff-only origin dev` would
    have been refused with no explanation of why.

    Ahead is not by itself data loss -- the same commits may be safe on a
    feature branch. `git rev-list HEAD --not --remotes` would say which, but
    this repository fetches `+refs/heads/dev:refs/remotes/origin/dev` and
    nothing else, so remote-tracking refs for other branches are absent or
    stale and that question cannot be answered offline. Reporting ahead is
    the honest signal available without a network call every 60s.
    """
    upstream = f"origin/{branch}"
    if _git(repo, "rev-parse", "--verify", "--quiet", upstream).returncode != 0:
        return -1
    r = _git(repo, "rev-list", "--count", f"{upstream}..HEAD")
    if r.returncode != 0:
        return -1
    try:
        return int(r.stdout.strip())
    except ValueError:
        return -1


def main(argv):
    p = argparse.ArgumentParser()
    p.add_argument("--observe", action="store_true", default=True)
    p.add_argument("--enforce", action="store_true",
                   help="auto-switch back to --expected if tree is clean")
    p.add_argument("--branch", action="append", default=[],
                   help="extra allow-listed branch (may repeat)")
    p.add_argument("--expected", default=os.environ.get("ORCH_CANONICAL_EXPECTED", "dev"),
                   help="branch to auto-switch to in --enforce mode")
    p.add_argument("--stale-threshold", type=int,
                   default=int(os.environ.get("ORCH_CANONICAL_STALE_THRESHOLD",
                                              DEFAULT_STALE_THRESHOLD)),
                   help="commits behind origin/<branch> before alerting")
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
    pc = porcelain(ROOT_DIR)
    clean = not pc
    residue = residue_files(ROOT_DIR)
    behind = behind_count(ROOT_DIR, branch)
    ahead = ahead_count(ROOT_DIR, branch)

    drift = branch not in allowed
    stale = behind > args.stale_threshold
    has_residue = bool(residue)
    has_unpushed = ahead > 0

    record = {
        "ts": ts,
        "current_branch": branch,
        "allowed": sorted(allowed),
        "expected": args.expected,
        "clean_tree": clean,
        "drift": drift,
        "behind_count": behind,
        "ahead_count": ahead,
        "has_unpushed": has_unpushed,
        "stale": stale,
        "stale_threshold": args.stale_threshold,
        "residue_file_count": len(residue),
        "residue_sample": residue[:10],
        "has_residue": has_residue,
        "action": "none",
    }

    if drift:
        if args.enforce and clean:
            r = _git(ROOT_DIR, "switch", args.expected)
            record["action"] = (
                f"switched_to_{args.expected}" if r.returncode == 0
                else f"switch_failed: {r.stderr.strip()[:200]}"
            )
        elif args.enforce and not clean:
            record["action"] = "refused_enforce_dirty_tree"

    if _should_record(record):
        with open(LOG_FILE, "a") as f:
            f.write(json.dumps(record) + "\n")

    # exit codes:
    #   0 = healthy
    #   1 = drift / staleness / residue (operator should look)
    #   2 = drift on a dirty tree under --enforce (can't auto-recover)
    if not (drift or stale or has_residue or has_unpushed):
        return 0

    if drift and not clean and args.enforce:
        print(f"CRITICAL: canonical root drifted to '{branch}' (not in "
              f"{sorted(allowed)}) and tree is dirty — manual intervention "
              f"required", file=sys.stderr)
        return 2

    problems = []
    if drift:
        problems.append(f"off-allowlist branch '{branch}'")
    if stale:
        problems.append(f"{behind} commits behind origin/{branch}")
    if has_residue:
        problems.append(f"{len(residue)} residue file(s) e.g. {residue[:3]}")
    if has_unpushed:
        problems.append(
            f"{ahead} commit(s) ahead of origin/{branch} — ff-only pull will refuse; "
            "confirm they are pushed somewhere"
        )
    print(f"WARN: canonical root unhealthy — {'; '.join(problems)}. "
          f"action={record['action']}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
