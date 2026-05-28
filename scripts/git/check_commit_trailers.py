#!/usr/bin/env python3
"""Commit-message trailers gate (used by husky commit-msg AND by CI).

Each commit between `--base` and `--head` (default origin/main..HEAD) must:
- Have a subject matching one of:
  * `<TASK-ID>: <summary>`  (canonical closeout pattern)
  * `wip(<TASK-ID>): <summary>`  (anchor commit pattern; see
    `.orchestrator/skills/worker-anchor-commit.md` §4)
  where TASK-ID matches `[A-Z][A-Z0-9-]*[A-Z0-9]`.
- Include trailers `Task-ID:`, `LLM-Agent:`, and `Reviewer:`.

Exit 0 if all pass. Exit 1 with a list of offenses if any commit fails.

Bypass: COMMIT_TRAILER_BYPASS=1 (use only for explicit emergency hotfix
commits; CI logs the bypass).
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys

# Accept both the canonical closeout subject `<TASK-ID>: ...` AND the anchor
# pattern `wip(<TASK-ID>): ...` that workers are instructed to use during
# in-progress commits (see .orchestrator/skills/worker-anchor-commit.md §4).
# Both carry the TASK-ID and the required trailers; the wip prefix is a
# human-readable signal that the commit is an anchor, not a closeout.
SUBJECT_RE = re.compile(r"^(?:wip\()?[A-Z][A-Z0-9-]*[A-Z0-9]\)?: \S")
REQUIRED_TRAILERS = ("Task-ID", "LLM-Agent", "Reviewer")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Validate commit trailers in a range.")
    p.add_argument("--base", default="origin/main", help="Base ref (default: origin/main)")
    p.add_argument("--head", default="HEAD", help="Head ref (default: HEAD)")
    p.add_argument(
        "--single-commit",
        help="Validate a single commit-msg file (path) instead of a range. Used by husky commit-msg hook.",
    )
    return p.parse_args()


def commits_in_range(base: str, head: str) -> list[str]:
    out = subprocess.run(
        ["git", "rev-list", f"{base}..{head}"],
        check=False,
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        # If base doesn't exist locally (CI runs sometimes don't fetch it),
        # silently treat as empty rather than fail.
        return []
    return [sha for sha in out.stdout.splitlines() if sha.strip()]


def commit_message(sha: str) -> str:
    out = subprocess.run(
        ["git", "log", "--format=%B", "-n", "1", sha],
        check=True,
        capture_output=True,
        text=True,
    )
    return out.stdout


def validate_message(msg: str) -> list[str]:
    """Return list of validation errors for one message; empty = pass."""
    errors: list[str] = []
    lines = msg.splitlines()
    subject = lines[0] if lines else ""
    if not SUBJECT_RE.match(subject):
        errors.append(f"subject must be `<TASK-ID>: <summary>`, got: {subject!r}")
    # Trailers are key:value lines, conventionally at the bottom.
    present = {key for line in lines for key in REQUIRED_TRAILERS if line.startswith(f"{key}:")}
    for key in REQUIRED_TRAILERS:
        if key not in present:
            errors.append(f"missing required trailer: {key}: <value>")
    return errors


def main() -> int:
    args = parse_args()
    if os.environ.get("COMMIT_TRAILER_BYPASS"):
        print(f"::warning::COMMIT_TRAILER_BYPASS set; skipping trailer validation.")
        return 0

    if args.single_commit:
        with open(args.single_commit) as fh:
            msg = fh.read()
        errors = validate_message(msg)
        if errors:
            print("check_commit_trailers: commit message rejected", file=sys.stderr)
            for e in errors:
                print(f"  - {e}", file=sys.stderr)
            print(
                "\nReference: docs/ops/branch-strategy.md, "
                ".orchestrator/skills/task-closeout-finalization.md",
                file=sys.stderr,
            )
            print("To bypass (emergency only): COMMIT_TRAILER_BYPASS=1 git commit ...", file=sys.stderr)
            return 1
        return 0

    shas = commits_in_range(args.base, args.head)
    if not shas:
        print(f"check_commit_trailers: no commits in {args.base}..{args.head}; nothing to check.")
        return 0

    fails: list[tuple[str, list[str]]] = []
    for sha in shas:
        errs = validate_message(commit_message(sha))
        if errs:
            fails.append((sha, errs))

    if fails:
        print(f"::error::check_commit_trailers: {len(fails)} commit(s) failed trailer validation.")
        for sha, errs in fails:
            print(f"  commit {sha[:12]}:")
            for e in errs:
                print(f"    - {e}")
        print("\nReference: docs/ops/branch-strategy.md §5.")
        return 1
    print(f"check_commit_trailers: {len(shas)} commit(s) OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
