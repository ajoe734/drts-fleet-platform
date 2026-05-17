#!/usr/bin/env python3
"""Task-scoped worker commit with Shared-Index isolation.

Solves two recurring problems on multi-worker worktrees:

1. Concurrent `git add` from other workers leaks unrelated files into a
   worker's staging area.
2. `.git/index.lock` contention between parallel commits causes silent retries
   that may include files staged moments later by a sibling worker.

Usage:

    python3 scripts/git/worker_commit.py \
        --task-id BE-CC-001 \
        --message-file /tmp/BE-CC-001-msg.txt \
        --scope path/a path/b \
        --index-file /tmp/git-index-$WORKER_RUN_ID

The `--index-file` is a private staging index. Git is told to use it via the
GIT_INDEX_FILE environment variable, so the shared `.git/index` is never
touched until `git commit` flips it atomically.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import Sequence


def repo_root() -> Path:
    out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        capture_output=True,
        text=True,
    )
    return Path(out.stdout.strip())


def run(cmd: Sequence[str], env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=False, capture_output=True, text=True, env=env)


def fail(msg: str, *, code: int = 2) -> None:
    print(f"worker_commit: {msg}", file=sys.stderr)
    sys.exit(code)


def main() -> int:
    parser = argparse.ArgumentParser(description="Task-scoped worker commit with Shared-Index isolation.")
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--message-file", required=True, type=Path)
    parser.add_argument("--scope", required=True, nargs="+", help="Paths to stage (relative to repo root).")
    parser.add_argument("--index-file", type=Path, help="Private staging index (defaults to .git/index).")
    parser.add_argument("--allow-empty-scope-match", action="store_true",
                        help="Permit scope paths that match no tracked changes (default: error).")
    args = parser.parse_args()

    if not args.message_file.exists():
        fail(f"message file not found: {args.message_file}")

    root = repo_root()
    env = dict(os.environ)
    if args.index_file:
        idx = args.index_file
        idx.parent.mkdir(parents=True, exist_ok=True)
        env["GIT_INDEX_FILE"] = str(idx)
        seed = run(["git", "read-tree", "HEAD"], env=env)
        if seed.returncode != 0:
            fail(f"git read-tree HEAD failed: {seed.stderr.strip()}")

    cleared = run(["git", "restore", "--staged", "--", ":/"], env=env)
    if cleared.returncode != 0:
        fail(f"git restore --staged failed: {cleared.stderr.strip()}")

    for p in args.scope:
        abs_p = (root / p).resolve()
        try:
            abs_p.relative_to(root)
        except ValueError:
            fail(f"scope path escapes repo root: {p}")
        if not abs_p.exists():
            ls = run(["git", "ls-files", "--error-unmatch", "--", p], env=env)
            if ls.returncode != 0 and not args.allow_empty_scope_match:
                fail(f"scope path missing on disk and not in HEAD: {p}")

    add = run(["git", "add", "--", *args.scope], env=env)
    if add.returncode != 0:
        fail(f"git add failed: {add.stderr.strip()}")

    staged = run(["git", "diff", "--cached", "--name-only"], env=env)
    if staged.returncode != 0:
        fail(f"git diff --cached failed: {staged.stderr.strip()}")
    staged_files = [line for line in staged.stdout.splitlines() if line.strip()]
    if not staged_files and not args.allow_empty_scope_match:
        fail("scope produced no staged changes; refusing to create empty commit")

    scope_norm = [s.rstrip("/") for s in args.scope]
    out_of_scope: list[str] = []
    for f in staged_files:
        if not any(f == s or f.startswith(s + "/") for s in scope_norm):
            out_of_scope.append(f)
    if out_of_scope:
        fail(
            "staged files outside declared --scope:\n  " + "\n  ".join(out_of_scope)
            + "\nrun with explicit --scope entries, or clean those files first."
        )

    commit = run(["git", "commit", "-F", str(args.message_file)], env=env)
    sys.stdout.write(commit.stdout)
    sys.stderr.write(commit.stderr)
    if commit.returncode != 0:
        return commit.returncode

    sha = run(["git", "rev-parse", "HEAD"], env=env).stdout.strip()
    subject = run(["git", "log", "-1", "--pretty=%s"], env=env).stdout.strip()
    print(f"worker_commit: ok task={args.task_id} sha={sha} subject={subject!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
