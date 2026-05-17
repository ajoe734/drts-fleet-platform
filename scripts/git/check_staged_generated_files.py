#!/usr/bin/env python3
"""pre-commit hook helper: block staging of generated mirrors and runtime artifacts.

Refuses the commit when any of the following are staged:

    docs-site/**          - read-only mirror; regenerate via ./scripts/sync-state.sh
    .orchestrator/runtime-logs/**
    .orchestrator/logs/**
    .orchestrator/event-queue.jsonl
    .orchestrator/state.json.bak-*  (any timestamped backup)
    .orchestrator/config.json.bak-*
    .orchestrator/ai-status.json.bak-*
    .orchestrator/approval-queue.lock
    **/*.pid
    dashboard-bundle.json
    portable-orchestrator-bundle-*.tar.gz

Allow override via ALLOW_GENERATED_FILES=1 (records the bypass on stderr).
Per AI_COLLABORATION_GUIDE.md §0.5 these are not commit evidence.
"""
from __future__ import annotations

import fnmatch
import os
import subprocess
import sys

BLOCK_PATTERNS = (
    "docs-site/*",
    ".orchestrator/runtime-logs/*",
    ".orchestrator/logs/*",
    ".orchestrator/event-queue.jsonl",
    ".orchestrator/state.json.bak-*",
    ".orchestrator/config.json.bak-*",
    ".orchestrator/ai-status.json.bak-*",
    ".orchestrator/approval-queue.lock",
    ".orchestrator/*-bg.pid",
    ".orchestrator/*.pid",
    "*.pid",
    "dashboard-bundle.json",
    "portable-orchestrator-bundle-*.tar.gz",
)


def matches_block(path: str) -> str | None:
    for pat in BLOCK_PATTERNS:
        if fnmatch.fnmatch(path, pat):
            return pat
        if pat.endswith("/*") and path.startswith(pat[:-1]):
            return pat
    return None


def main() -> int:
    out = subprocess.run(
        ["git", "diff", "--cached", "--name-only"],
        check=False,
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        print(f"check_staged_generated_files: git failed: {out.stderr.strip()}", file=sys.stderr)
        return 2
    staged = [p for p in out.stdout.splitlines() if p.strip()]

    hits: list[tuple[str, str]] = []
    for f in staged:
        pat = matches_block(f)
        if pat:
            hits.append((f, pat))

    if not hits:
        return 0

    bypass = os.environ.get("ALLOW_GENERATED_FILES", "").strip()
    if bypass and bypass != "0":
        print(
            f"check_staged_generated_files: BYPASS active (ALLOW_GENERATED_FILES={bypass!r}); "
            f"{len(hits)} blocked path(s) staged anyway.",
            file=sys.stderr,
        )
        return 0

    print("check_staged_generated_files: refused — generated / runtime mirrors are staged:", file=sys.stderr)
    for path, pat in hits:
        print(f"  - {path}  (matches {pat})", file=sys.stderr)
    print(
        "\nThese are derived artifacts, not commit evidence. Unstage with:\n"
        "  git restore --staged -- <path>\n"
        "Regenerate mirrors via ./scripts/sync-state.sh after the source-of-truth commit.\n"
        "Emergency bypass: ALLOW_GENERATED_FILES=1 git commit ...",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
