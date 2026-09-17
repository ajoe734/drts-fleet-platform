#!/usr/bin/env python3
"""Re-apply task lifecycle state to a freshly materialized board, from Git.

Why this exists
---------------
The previous orchestrator host was lost, and `ai-status.json` has not been
tracked in Git since `OPS-UNTRACK-TASK-REGISTRY-001` (2026-05-31). The wave
dispatchers can re-materialize the task *definitions* from their manifests, but
they deliberately refuse to invent lifecycle state, so a rebuilt board starts
with all 101 tasks in `backlog`. Handing that to the supervisor would dispatch
workers to redo merged work and stomp on live branches.

What it does NOT claim
----------------------
`ai_status.py` states the rule plainly: "Git history is deliberately not a
source of truth for task completion." That rule is right for a running board —
a merge is not an acceptance. This script is a one-time disaster
reconstruction, not an inference loop, and it is written to keep the
distinction visible:

  - merged tasks get `status: done` and the real `merge_sha`, and a
    `reconstruction` record saying the evidence came from Git history.
  - `candidate_sha`, `reviewed_sha`, `ci_sha` and `ci_status` are left ABSENT.
    Those artefacts died with the old host. Filling them in would manufacture
    review and CI evidence that no one produced, which is worse than a gap.
  - in-flight tasks get `status: in_progress` plus the branch and head SHA that
    actually exist on the remote, so the owner resumes instead of restarting.

Anything the script cannot evidence, it leaves in `backlog`.

Usage:
  python3 tools/task-dispatch/reconstruct-lifecycle-from-git.py --plan
  python3 tools/task-dispatch/reconstruct-lifecycle-from-git.py --apply
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TRUNK = "origin/dev"
LANES = {
    "claude": "Claude",
    "claude2": "Claude2",
    "codex": "Codex",
    "codex2": "Codex2",
    "gemini": "Gemini",
    "gemini2": "Gemini2",
}


def git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(REPO), *args], capture_output=True, text=True, check=True
    ).stdout.strip()


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def merged_tasks() -> dict[str, dict[str, str]]:
    """Task-ID -> merge commit, from trunk history.

    Only an exact `Task-ID:` trailer counts. Subject-line mentions are not
    evidence: an unblock helper or a WIP commit names the parent task without
    completing it.
    """
    raw = git("log", TRUNK, "--format=%H%x01%cI%x01%B%x02")
    found: dict[str, dict[str, str]] = {}
    for entry in raw.split("\x02"):
        if not entry.strip():
            continue
        sha, when, body = entry.strip().split("\x01", 2)
        ids = re.findall(r"^Task-ID:\s*([A-Za-z0-9._-]+)\s*$", body, re.MULTILINE)
        agent = re.search(r"^LLM-Agent:\s*(\S+)\s*$", body, re.MULTILINE)
        subject = body.strip().splitlines()[0]
        for task_id in ids:
            record = {
                "merge_sha": sha,
                "merged_at": when,
                "agent": (agent.group(1) if agent else ""),
                "subject": subject,
                # A ReviewBus commit can carry several Task-ID trailers while
                # delivering only the one it names in its subject. Prefer the
                # commit that actually announces the task; a trailer-only
                # mention is a weaker claim and loses to it.
                "named_in_subject": task_id in subject,
            }
            prior = found.get(task_id)
            if prior is None or (record["named_in_subject"] and not prior["named_in_subject"]):
                found[task_id] = record
    return found


def live_branches() -> dict[str, list[dict[str, str]]]:
    """Task-ID -> every unmerged lane branch that names it, newest first."""
    out: dict[str, list[dict[str, str]]] = {}
    listing = git("branch", "-r", "--no-merged", TRUNK, "--format=%(refname:short)%01%(objectname)%01%(committerdate:iso-strict)")
    for line in listing.splitlines():
        if not line.strip():
            continue
        ref, sha, when = line.split("\x01")
        if "/" not in ref:
            continue
        _, _, lane_and_task = ref.partition("/")
        lane, _, slug = lane_and_task.partition("/")
        owner = LANES.get(lane.lower())
        if not owner or not slug:
            continue
        out.setdefault(slug.upper(), []).append(
            {"branch": ref, "head_sha": sha, "updated_at": when, "owner": owner}
        )
    for entries in out.values():
        entries.sort(key=lambda entry: entry["updated_at"], reverse=True)
    return out


def branch_assignment(ref: str) -> tuple[str, str]:
    """(owner, reviewer) as recorded by the branch tip's own trailers."""
    body = git("log", "-1", ref, "--format=%B")
    owner = re.search(r"^LLM-Agent:\s*(\S+)\s*$", body, re.MULTILINE)
    reviewer = re.search(r"^Reviewer:\s*(\S+)\s*$", body, re.MULTILINE)
    canonical = {name.lower(): name for name in LANES.values()}
    return (
        canonical.get(owner.group(1).lower(), "") if owner else "",
        canonical.get(reviewer.group(1).lower(), "") if reviewer else "",
    )


def pick_branch(entries: list[dict[str, str]], reviewer: str) -> dict[str, str] | None:
    """The branch that represents the owner's work in progress.

    Two things make this less obvious than "newest branch wins":

    1. Both lanes of a family show up on the same task, because the reviewer
       pushes fix-up commits too and theirs are often newest. Handing ownership
       to the reviewer would misdirect the resume and is rejected outright by
       the wave validator (owner may not equal reviewer).
    2. The supervisor legitimately reassigns tasks at runtime, so the manifest's
       reviewer is not always the current one. The branch tip's own
       `LLM-Agent`/`Reviewer` trailers outrank the manifest when they disagree.
    """
    for entry in entries:
        trailer_owner, trailer_reviewer = branch_assignment(entry["branch"])
        if trailer_owner and trailer_reviewer and trailer_owner != trailer_reviewer:
            return {**entry, "owner": trailer_owner, "reviewer": trailer_reviewer}
    for entry in entries:
        if entry["owner"] != reviewer:
            return entry
    return None


def classify(board: dict) -> tuple[list, list]:
    merged = merged_tasks()
    branches = live_branches()
    branch_ids = sorted(branches, key=len, reverse=True)

    done, active = [], []
    for task in board["tasks"]:
        task_id = task["id"]
        if task_id in merged:
            done.append((task, merged[task_id]))
            continue
        # An exact slug match is the implementation branch and always wins. A
        # suffixed branch (`...-unblock-planning-decision`) is a helper that
        # only documents the parent, so it stands in for the parent's resume
        # point solely when no implementation branch survives.
        reviewer = task.get("reviewer", "")
        hit = pick_branch(branches.get(task_id, []), reviewer)
        if hit is None:
            for candidate in branch_ids:
                if candidate.startswith(task_id + "-"):
                    hit = pick_branch(branches[candidate], reviewer)
                    if hit:
                        break
        if hit:
            active.append((task, hit))
    return done, active


def apply(board: dict, done: list, active: list) -> None:
    stamp = iso_now()
    for task, evidence in done:
        task["status"] = "done"
        task["merge_sha"] = evidence["merge_sha"]
        task["last_update"] = stamp
        task["next"] = f"Merged into dev as {evidence['merge_sha'][:12]}."
        task.pop("waiting_for", None)
        task.pop("gate_reason", None)
        task["reconstruction"] = {
            "source": "git-history",
            "rebuilt_at": stamp,
            "merged_at": evidence["merged_at"],
            "delivered_by": evidence["agent"] or "unrecorded",
            "subject": evidence["subject"],
            "evidence_gap": (
                "Candidate SHA, same-SHA review and CI evidence were lost with the "
                "previous orchestrator host and are deliberately not reconstructed."
            ),
        }
    for task, evidence in active:
        task["status"] = "in_progress"
        task["owner"] = evidence["owner"]
        if evidence.get("reviewer") and evidence["reviewer"] != evidence["owner"]:
            task["reviewer"] = evidence["reviewer"]
        task["waiting_for"] = evidence["owner"]
        task["candidate_branch"] = evidence["branch"]
        task["last_update"] = stamp
        task["next"] = (
            f"Resume from {evidence['branch']} (head {evidence['head_sha'][:12]}); "
            "rebase onto fresh origin/dev and re-verify before handing off a candidate."
        )
        task["reconstruction"] = {
            "source": "git-remote-branch",
            "rebuilt_at": stamp,
            "branch_head": evidence["head_sha"],
            "branch_updated_at": evidence["updated_at"],
            "evidence_gap": (
                "Prior review state and CI results are unavailable; the branch head "
                "is the only surviving evidence."
            ),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--plan", action="store_true")
    action.add_argument("--apply", action="store_true")
    parser.add_argument("--board", type=Path, default=REPO / "ai-status.json")
    args = parser.parse_args()

    board = json.loads(args.board.read_text(encoding="utf-8"))
    done, active = classify(board)

    print(f"merged -> done      : {len(done)}")
    for task, evidence in sorted(done, key=lambda pair: pair[0]["id"]):
        print(f"  {task['id']:28} {evidence['merge_sha'][:12]}  {evidence['agent'] or '-'}")
    print(f"live branch -> in_progress: {len(active)}")
    for task, evidence in sorted(active, key=lambda pair: pair[0]["id"]):
        print(f"  {task['id']:28} {evidence['branch']:42} {evidence['head_sha'][:12]}")
    untouched = len(board["tasks"]) - len(done) - len(active)
    print(f"left in backlog/blocked   : {untouched}")

    if args.apply:
        apply(board, done, active)
        args.board.write_text(
            json.dumps(board, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"\nwrote {args.board}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
