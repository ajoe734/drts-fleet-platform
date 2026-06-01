#!/usr/bin/env python3
"""Runtime-mirror guard: refuse commits/PRs that include generated runtime files.

Refuses the following paths from being part of any commit (pre-commit hook)
or PR diff (CI):

    docs-site/ai-status.json            ─┐  Files copied into docs-site/ by
    docs-site/ai-activity-log.jsonl      │  scripts/sync-state.sh
    docs-site/current-work.md            │  (ai_status.py::sync_docs_site).
    docs-site/orchestrator-state.json    │  Other files in docs-site/ (main.js,
    docs-site/approval-queue.json       ─┘  index.html, style.css, etc.) ARE
                                            source — they are not regenerated
                                            and must be editable in PRs.

    .orchestrator/runtime-logs/**
    .orchestrator/logs/**
    .orchestrator/event-queue.jsonl
    .orchestrator/state.json.bak-*
    .orchestrator/config.json.bak-*
    .orchestrator/ai-status.json.bak-*
    .orchestrator/approval-queue.lock
    .orchestrator/*.pid    (anything ending in .pid)
    *.pid                  (top-level .pid files)
    dashboard-bundle.json
    portable-orchestrator-bundle-*.tar.gz

Two modes:
  --staged          : check git diff --cached --name-only  (pre-commit hook)
  --range BASE HEAD : check git diff --name-only BASE..HEAD  (CI on a PR)

Bypass: ALLOW_GENERATED_FILES=1 (records the bypass on stderr).
Per AI_COLLABORATION_GUIDE.md §0.5, these are not commit evidence.
"""
from __future__ import annotations

import argparse
import fnmatch
import os
import subprocess
import sys

BLOCK_PATTERNS = (
    # Only the specific files that scripts/sync-state.sh regenerates inside
    # docs-site/. Everything else under docs-site/ (main.js, index.html,
    # style.css, *.js modules) is source code, editable in PRs.
    "docs-site/ai-status.json",
    "docs-site/ai-activity-log.jsonl",
    "docs-site/current-work.md",
    "docs-site/orchestrator-state.json",
    "docs-site/approval-queue.json",
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


def diff_names(args: list[str]) -> list[str]:
    out = subprocess.run(["git", "diff", *args], check=False, capture_output=True, text=True)
    if out.returncode != 0:
        print(f"check_staged_generated_files: git failed: {out.stderr.strip()}", file=sys.stderr)
        return []
    return [p for p in out.stdout.splitlines() if p.strip()]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Refuse runtime-mirror file commits.")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true", help="Check git index (pre-commit)")
    mode.add_argument("--range", nargs=2, metavar=("BASE", "HEAD"), help="Check diff between two refs (CI)")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if args.range:
        base, head = args.range
        names = diff_names(["--name-only", f"{base}..{head}"])
        mode_label = f"diff {base}..{head}"
    else:
        # default = pre-commit mode
        names = diff_names(["--cached", "--name-only"])
        mode_label = "staged index"

    hits = [(n, matches_block(n)) for n in names if matches_block(n)]
    if not hits:
        return 0

    bypass = os.environ.get("ALLOW_GENERATED_FILES", "").strip()
    if bypass and bypass != "0":
        print(
            f"check_staged_generated_files: BYPASS active "
            f"(ALLOW_GENERATED_FILES={bypass!r}); {len(hits)} blocked path(s) in {mode_label}.",
            file=sys.stderr,
        )
        return 0

    print(
        f"::error::check_staged_generated_files: generated/runtime mirrors in {mode_label}:",
        file=sys.stderr,
    )
    for path, pat in hits:
        print(f"  - {path}  (matches {pat})", file=sys.stderr)
    print(
        "\nThese are derived artifacts, not commit evidence.\n"
        "  - For staged hits: git restore --staged -- <path>\n"
        "  - For PR diff hits: revert the file changes on your branch and force-push.\n"
        "  - Regenerate docs-site via scripts/sync-state.sh after the source-of-truth commit.\n"
        "Emergency bypass: ALLOW_GENERATED_FILES=1 (CI logs it).",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
