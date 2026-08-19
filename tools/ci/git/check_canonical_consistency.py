#!/usr/bin/env python3
"""Canonical consistency checks: do the repository's documents agree with reality?

Every defect the 2026-08-17 conformance audit found had one shape -- two places
that must agree, and nothing checking that they agree. A contract requiring
idempotency on nine commands none of which read the header; an orchestrator
config naming five GitHub labels the repository did not have, failing every sync
for three days; a task marked done whose recorded commit was on no branch; four
L1 amendments landing unratified; a review question asking about a field name
that exists nowhere.

None of those came from carelessness. Every agent did exactly what its brief
said. The gap is structural: a task's definition of done is "the artifacts I was
told to touch are touched", and the relationships *between* artifacts are in
nobody's brief.

So this is deliberately one file with several assertions rather than one gate per
defect. Adding a new invariant means adding a function to CHECKS, not adding
another required status check for reviewers to learn.

Two modes, because the checks divide naturally:

  --ci     offline, scoped to the diff, exits non-zero. Prevents new drift
           without failing on the debt already in the tree.
  --audit  offline, repository-wide, always exits 0 and reports. Run on a
           schedule; the whole point is that finding this class of problem
           should not depend on a human thinking to ask.

Usage:
  python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD
  python3 tools/ci/git/check_canonical_consistency.py --audit

Bypass (CI mode only): CANONICAL_CONSISTENCY_BYPASS=1, logged loudly.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path


def _repo_root() -> Path:
    """The repository being inspected, resolved from the caller's cwd.

    Not from this file's location: the tests run it against a throwaway repo.
    """
    override = os.environ.get("CANONICAL_CONSISTENCY_ROOT")
    if override:
        return Path(override).resolve()
    proc = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=False
    )
    if proc.returncode == 0 and proc.stdout.strip():
        return Path(proc.stdout.strip()).resolve()
    return Path(__file__).resolve().parents[3]


REPO_ROOT = _repo_root()
MAP_FILE = "CANONICAL_DOCUMENT_MAP.md"
DECISIONS_DIR = "docs/01-decisions/"
ACCEPTED_STATUSES = {"accepted", "accepted-for-execution"}

STATUS_RE = re.compile(r"^-\s+`status`:\s*`([^`]+)`", re.MULTILINE)
BULLET_PATH_RE = re.compile(r"^-\s+`([^`]+)`\s*$", re.MULTILINE)
# Only repo-rooted paths. Relative ones like `modules/auth/auth.controller.ts`
# are written against a base this checker cannot know, and treating them as
# broken links produced a 19% false-positive rate on the first attempt.
CITED_PATH_RE = re.compile(
    r"`((?:docs|apps|packages|tools|infra|tests|operations|support|\.github)/"
    r"[A-Za-z0-9_./-]+\.(?:ts|tsx|py|sql|md|json|ya?ml|sh|mjs))`"
)
DECISION_REF_RE = re.compile(r"`?(SD-DP-\d{8}-\d{3})[A-Za-z0-9-]*`?")


@dataclass
class Finding:
    check: str
    where: str
    detail: str


@dataclass
class Context:
    mode: str
    base: str = ""
    head: str = "HEAD"
    changed: list[str] = field(default_factory=list)


def run(args: list[str]) -> str:
    proc = subprocess.run(
        args, cwd=str(REPO_ROOT), capture_output=True, text=True, check=False
    )
    if proc.returncode != 0:
        raise SystemExit(f"[consistency] command failed: {' '.join(args)}\n{proc.stderr.strip()}")
    return proc.stdout


def read(path: str) -> str:
    try:
        return (REPO_ROOT / path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def markdown_files(ctx: Context) -> list[str]:
    if ctx.mode == "ci":
        return [f for f in ctx.changed if f.endswith(".md") and (REPO_ROOT / f).exists()]
    return [f for f in run(["git", "ls-files", "*.md"]).split() if (REPO_ROOT / f).exists()]


# --------------------------------------------------------------------------
# check: an L1 edit needs an accepted decision packet naming the file
# --------------------------------------------------------------------------
def l1_files() -> set[str]:
    """The L1 list, read from the canonical map rather than hardcoded.

    A hardcoded copy is the defect that took `dev` red on 2026-08-17: a second
    place to update that nothing reminds you about.
    """
    section = re.search(
        r"^###\s+L1 Product Truth\s*$(.*?)^###\s", read(MAP_FILE), re.MULTILINE | re.DOTALL
    )
    if not section:
        raise SystemExit(
            f"[consistency] no 'L1 Product Truth' section in {MAP_FILE}; refusing to "
            "guess which files are protected."
        )
    return set(BULLET_PATH_RE.findall(section.group(1)))


def check_l1_edit_authority(ctx: Context) -> list[Finding]:
    if ctx.mode != "ci":
        return []
    touched = sorted(set(ctx.changed) & l1_files())
    if not touched:
        return []
    packets = {}
    for path in ctx.changed:
        if path.startswith(DECISIONS_DIR) and path.endswith(".md"):
            body = read(path)
            match = STATUS_RE.search(body)
            if match and match.group(1).strip().lower() in ACCEPTED_STATUSES:
                packets[path] = body
    return [
        Finding(
            "l1-edit-authority",
            path,
            "L1 product truth changed with no accepted decision packet naming it. "
            "SD-DP-20260422-003 reserves L1 rewrites for a controlled revision a human "
            "accepted; record the proposed wording instead, or include an accepted packet.",
        )
        for path in touched
        if not any(path in body for body in packets.values())
    ]


# --------------------------------------------------------------------------
# check: a repo-rooted path cited in a document exists
# --------------------------------------------------------------------------
def check_cited_paths(ctx: Context) -> list[Finding]:
    findings = []
    for doc in markdown_files(ctx):
        for cited in sorted(set(CITED_PATH_RE.findall(read(doc)))):
            if not (REPO_ROOT / cited).exists():
                findings.append(Finding("cited-paths", doc, f"cites missing path `{cited}`"))
    return findings


# --------------------------------------------------------------------------
# check: a decision packet cited by id exists
# --------------------------------------------------------------------------
def check_cited_decisions(ctx: Context) -> list[Finding]:
    # `SD-DP-20260422-001` is 18 characters. Slicing 19 caught the trailing
    # separator and made every correct citation in the repository look broken --
    # 83 findings, all false, on the first run.
    ids = {p.name[:18] for p in (REPO_ROOT / DECISIONS_DIR).glob("SD-DP-*.md")}
    findings = []
    for doc in markdown_files(ctx):
        if doc.startswith(DECISIONS_DIR):
            continue
        for ref in sorted(set(DECISION_REF_RE.findall(read(doc)))):
            if ref not in ids:
                findings.append(
                    Finding("cited-decisions", doc, f"cites decision `{ref}` that has no packet")
                )
    return findings


# --------------------------------------------------------------------------
# check: a completed task's recorded delivery is reachable on the trunk
# --------------------------------------------------------------------------
def check_completed_task_claims(ctx: Context) -> list[Finding]:
    """Audit-only: `ai-status.json` is gitignored runtime state, absent in CI.

    `ai_status.py` stamps `merge_reachability` at completion (ORCH-CLAIM-VERIFY-001).
    This reports the rows that came back `unreachable`, and counts the historical
    rows that predate the stamp -- those need one reconciliation pass, not a gate.
    """
    if ctx.mode != "audit":
        return []
    status_file = REPO_ROOT / "ai-status.json"
    if not status_file.exists():
        return []
    try:
        import json as _json

        tasks = _json.loads(status_file.read_text("utf-8")).get("tasks", [])
    except (ValueError, OSError):
        return []

    findings: list[Finding] = []
    unstamped = 0
    for task in tasks:
        if task.get("status") != "done":
            continue
        sha = str(task.get("commit_hash") or task.get("merge_sha") or "").strip()
        if len(sha) < 12 or sha in {"not_applicable", "-"}:
            continue
        stamped = task.get("merge_reachability")
        if stamped == "unreachable":
            findings.append(
                Finding("task-claims", str(task.get("id") or "?"),
                        f"done, but `{sha[:12]}` is not on the trunk")
            )
        elif stamped is None:
            unstamped += 1
    if unstamped:
        findings.append(
            Finding("task-claims", "ai-status.json",
                    f"{unstamped} completed task(s) predate merge_reachability and were "
                    "never verified; needs one reconciliation pass, not a gate")
        )
    return findings


CHECKS = {
    "l1-edit-authority": check_l1_edit_authority,
    "cited-paths": check_cited_paths,
    "cited-decisions": check_cited_decisions,
    "task-claims": check_completed_task_claims,
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--ci", action="store_true", help="diff-scoped, fails on new drift")
    mode.add_argument("--audit", action="store_true", help="repo-wide, reports, always exits 0")
    parser.add_argument("--base", default="origin/dev")
    parser.add_argument("--head", default="HEAD")
    args = parser.parse_args()

    if args.audit:
        ctx = Context(mode="audit")
    else:
        if os.environ.get("CANONICAL_CONSISTENCY_BYPASS") == "1":
            print("[consistency] BYPASSED via CANONICAL_CONSISTENCY_BYPASS=1; recorded in CI logs.")
            return 0
        changed = [
            line for line in run(
                ["git", "diff", "--name-only", f"{args.base}...{args.head}"]
            ).splitlines() if line.strip()
        ]
        ctx = Context(mode="ci", base=args.base, head=args.head, changed=changed)

    findings: list[Finding] = []
    for name, fn in CHECKS.items():
        found = fn(ctx)
        findings.extend(found)
        print(f"[consistency] {name}: {len(found)} finding(s)")

    if not findings:
        print("[consistency] OK")
        return 0

    print()
    by_check: dict[str, list[Finding]] = {}
    for f in findings:
        by_check.setdefault(f.check, []).append(f)
    for check, items in by_check.items():
        print(f"## {check} ({len(items)})")
        for f in items:
            print(f"  {f.where}: {f.detail}")
        print()

    if ctx.mode == "audit":
        print(f"[consistency] audit complete: {len(findings)} finding(s). Reporting only.")
        return 0
    print(f"[consistency] FAIL: {len(findings)} finding(s) introduced by this change.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
