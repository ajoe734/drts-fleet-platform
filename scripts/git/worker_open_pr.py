#!/usr/bin/env python3
"""Open (or update) the worker's task PR against the routed integration trunk.

Run from a worker after `worker_commit.py` + a normal non-force push has
landed the task on `<lane>/<task-id-kebab>`. The PR is targeted at the base
branch chosen by `branch_routing.route_task()` so backend / frontend / docs
tasks land on the correct integration trunk automatically.

Idempotent: if a PR already exists from `<lane>/<task-id-kebab>` to the
routed base, prints the existing URL and exits 0 without duplicating it.

Usage:

    python3 scripts/git/worker_open_pr.py \
        --task-id BE-CC-001 \
        --lane codex \
        [--title "BE-CC-001: <override subject>"] \
        [--body-file /tmp/pr-body.md] \
        [--draft]

If --title is omitted, the latest commit's subject on the head branch is used.
If --body-file is omitted, a minimal body is generated from task metadata.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

THIS = Path(__file__).resolve()
ROOT = THIS.parents[2]
ORCH = ROOT / ".orchestrator"
if str(ORCH) not in sys.path:
    sys.path.insert(0, str(ORCH))

try:
    from branch_routing import route_task  # type: ignore
except Exception:  # pragma: no cover — defensive
    print("worker_open_pr: cannot import branch_routing — is .orchestrator/ present?", file=sys.stderr)
    sys.exit(2)


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=False, capture_output=True, text=True, cwd=str(ROOT))


def fail(msg: str, *, code: int = 2) -> None:
    print(f"worker_open_pr: {msg}", file=sys.stderr)
    sys.exit(code)


def kebab(task_id: str) -> str:
    return task_id.strip().lower().replace("_", "-")


def latest_commit_subject(branch: str) -> str:
    out = run(["git", "log", "-1", "--pretty=%s", branch])
    if out.returncode != 0:
        return ""
    return out.stdout.strip()


def pr_for_head(head: str) -> dict | None:
    """Return the first open PR with the given head branch, or None."""
    out = run([
        "gh", "pr", "list",
        "--head", head,
        "--state", "open",
        "--json", "number,url,baseRefName,headRefName,autoMergeRequest",
        "--limit", "5",
    ])
    if out.returncode != 0:
        fail(f"gh pr list failed: {out.stderr.strip()}")
    try:
        prs = json.loads(out.stdout or "[]")
    except json.JSONDecodeError as exc:
        fail(f"gh pr list returned invalid JSON: {exc}")
    return prs[0] if prs else None


def default_body(task_id: str, base: str, head: str) -> str:
    return (
        f"Task: `{task_id}`\n"
        f"Base: `{base}` (auto-routed by `.orchestrator/branch_routing.py`)\n"
        f"Head: `{head}`\n\n"
        "## Verification\n\n"
        "_See commit body `Verified:` trailer._\n\n"
        "## Closeout\n\n"
        "Reviewer approval and `done` are recorded via `scripts/ai-status.sh`. "
        "Gate 1 auto-merge (when enabled in `config.json::branch_strategy.gate1_auto_merge`) "
        "will squash this PR once all required checks are green.\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Open or update the worker task PR for a routed trunk.")
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--lane", required=True, help="Lowercase lane id, e.g. codex, claude, gemini2.")
    parser.add_argument("--title", default=None)
    parser.add_argument("--body-file", type=Path, default=None)
    parser.add_argument("--draft", action="store_true")
    parser.add_argument("--allow-dirty", action="store_true",
                        help="Skip the working-tree-clean check (default: refuse).")
    args = parser.parse_args()

    task_id = args.task_id.strip()
    lane = args.lane.strip().lower()
    if not task_id or not lane:
        fail("--task-id and --lane are required and non-empty")

    decision = route_task(task_id)
    base = decision.base_branch
    head = f"{lane}/{kebab(task_id)}"

    if not args.allow_dirty:
        status = run(["git", "status", "--porcelain"])
        if status.returncode != 0:
            fail(f"git status failed: {status.stderr.strip()}")
        if status.stdout.strip():
            fail(
                "working tree is dirty; commit and push before opening the PR, "
                "or pass --allow-dirty if you know what you're doing."
            )

    local = run(["git", "rev-parse", "--verify", head])
    remote = run(["git", "rev-parse", "--verify", f"refs/remotes/origin/{head}"])
    if local.returncode != 0 and remote.returncode != 0:
        fail(f"head branch not found locally or on origin: {head}")

    existing = pr_for_head(head)
    if existing:
        if existing.get("baseRefName") != base:
            print(
                f"worker_open_pr: existing PR #{existing['number']} targets "
                f"{existing['baseRefName']!r}, expected {base!r}. Not touching it.",
                file=sys.stderr,
            )
            print(existing["url"])
            return 0
        print(f"worker_open_pr: existing PR #{existing['number']} → {existing['url']}")
        return 0

    title = args.title or latest_commit_subject(head) or f"{task_id}: (no subject)"
    if not title.startswith(task_id + ":") and not title.startswith(task_id + " "):
        title = f"{task_id}: {title}"

    if args.body_file:
        if not args.body_file.exists():
            fail(f"--body-file not found: {args.body_file}")
        body = args.body_file.read_text(encoding="utf-8")
    else:
        body = default_body(task_id, base, head)

    cmd = ["gh", "pr", "create", "--base", base, "--head", head, "--title", title, "--body", body]
    if args.draft:
        cmd.append("--draft")
    create = subprocess.run(cmd, check=False, capture_output=True, text=True, cwd=str(ROOT))
    sys.stdout.write(create.stdout)
    sys.stderr.write(create.stderr)
    if create.returncode != 0:
        return create.returncode
    print(f"worker_open_pr: opened PR head={head} base={base}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
