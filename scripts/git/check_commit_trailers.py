#!/usr/bin/env python3
"""commit-msg hook helper: enforce task-scoped commit subject + trailers.

Required (when the subject is not exempt):

    Subject: "<TASK-ID>: <imperative summary>"   (<=80 chars total)
    Trailer: LLM-Agent: <lane>
    Trailer: Task-ID: <task-id>
    Trailer: Reviewer: <reviewer> (must differ from LLM-Agent)

Exempt subject prefixes / patterns (the hook silently passes these through):

    Merge ..., Revert "...", fixup! ..., squash! ..., Initial commit
    wave-merge:, wave-close:, wave-open:, promote:, hotfix:
    OPS-GIT-WORKFLOW-, OPS-DOC-, OPS-REBASE-

To bypass during emergency or scripted backfill, set COMMIT_TRAILER_BYPASS=1
in the environment; the hook records the bypass to stderr but still allows
the commit. Do not use that in worker autoworker dispatch.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

EXEMPT_PREFIXES = (
    "Merge ",
    "Merge:",
    "Revert ",
    "Revert:",
    'Revert "',
    "fixup!",
    "squash!",
    "Initial commit",
    "wave-merge:",
    "wave-close:",
    "wave-open:",
    "promote:",
    "hotfix:",
    "OPS-GIT-WORKFLOW-",
    "OPS-DOC-",
    "OPS-REBASE-",
)

SUBJECT_RE = re.compile(r"^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+:\s+\S")

TRAILER_RE = re.compile(r"^([A-Za-z][A-Za-z0-9-]*):\s*(.+)$")


def is_exempt(subject: str) -> bool:
    return any(subject.startswith(prefix) for prefix in EXEMPT_PREFIXES)


def parse_trailers(body_lines: list[str]) -> dict[str, str]:
    """Parse the *last* contiguous block of `Key: Value` lines as trailers."""
    trailers: dict[str, str] = {}
    block: list[tuple[str, str]] = []
    for line in reversed(body_lines):
        stripped = line.rstrip()
        if not stripped:
            if block:
                break
            continue
        m = TRAILER_RE.match(stripped)
        if not m:
            block.clear()
            break
        block.append((m.group(1), m.group(2).strip()))
    for key, value in block:
        trailers.setdefault(key, value)
    return trailers


def main() -> int:
    if len(sys.argv) < 2:
        print("check_commit_trailers: missing commit-msg path", file=sys.stderr)
        return 2
    msg_path = Path(sys.argv[1])
    if not msg_path.exists():
        print(f"check_commit_trailers: not found: {msg_path}", file=sys.stderr)
        return 2

    raw = msg_path.read_text(encoding="utf-8", errors="replace")
    lines = [ln for ln in raw.splitlines() if not ln.startswith("#")]
    while lines and not lines[0].strip():
        lines.pop(0)
    if not lines:
        print("check_commit_trailers: empty commit message", file=sys.stderr)
        return 1

    subject = lines[0].rstrip()
    body = lines[1:]

    if is_exempt(subject):
        return 0

    bypass = os.environ.get("COMMIT_TRAILER_BYPASS", "").strip()
    if bypass and bypass != "0":
        print(f"check_commit_trailers: BYPASS active (COMMIT_TRAILER_BYPASS={bypass!r}), "
              f"subject={subject!r}", file=sys.stderr)
        return 0

    errors: list[str] = []

    if len(subject) > 80:
        errors.append(f"subject is {len(subject)} chars (max 80): {subject!r}")
    if not SUBJECT_RE.match(subject):
        errors.append(
            f"subject must be `<TASK-ID>: <summary>` (e.g. `BE-CC-001: fix promote detection`); got: {subject!r}"
        )

    trailers = parse_trailers(body)
    for key in ("LLM-Agent", "Task-ID", "Reviewer"):
        if key not in trailers or not trailers[key]:
            errors.append(f"missing required trailer: {key}: <value>")

    if "LLM-Agent" in trailers and "Reviewer" in trailers and \
            trailers["LLM-Agent"].lower() == trailers["Reviewer"].lower():
        errors.append(
            f"Reviewer must differ from LLM-Agent (both = {trailers['LLM-Agent']!r})"
        )

    if SUBJECT_RE.match(subject) and "Task-ID" in trailers:
        subject_task = subject.split(":", 1)[0].strip()
        if subject_task != trailers["Task-ID"].strip():
            errors.append(
                f"subject task-id {subject_task!r} does not match Task-ID trailer "
                f"{trailers['Task-ID']!r}"
            )

    if errors:
        print("check_commit_trailers: commit message rejected", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print(
            "\nTo bypass (emergency only): COMMIT_TRAILER_BYPASS=1 git commit ...\n"
            "Reference: docs/ops/branch-strategy.md, "
            ".orchestrator/skills/task-closeout-finalization.md",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
