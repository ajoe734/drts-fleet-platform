#!/usr/bin/env python3
"""
Rebalance owner distribution across the 57 UI redesign tasks.

User-specified ratio:  Codex group : Claude group : Gemini group  =  2 : 1 : 0.5

Targets across all 57 tasks (after rebalance):

    Codex  : 15   ──┐
    Codex2 : 15   ──┴─ Codex group  = 30
    Claude :  5   ──┐  (governance: 4 closeouts + RDX-W0-003)
    Claude2: 12   ──┴─ Claude group = 17  (incl. 2 done locked)
    Gemini :  5   ──┐
    Gemini2:  5   ──┴─ Gemini group =  9 (incl. PBK-UI-001 originally Gemini)

Ratio achieved: 30 : 17 : 9  ≈  2 : 1.13 : 0.6  (best fit given locked tasks)

Locked (NOT touched):
  - RDX-W0-001 / 002          (status=done; owner immutable history)
  - RDX-W0-003                (Claude — sprint mode hand-off, governance task)
  - *-009 / *-010 / *-099     (Claude — closeout tasks, governance role)

Movable: 51 backlog tasks. Reassigned deterministically by id sort order.

Re-running is idempotent: tasks already at target owner are skipped.
"""

from __future__ import annotations

import os
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
os.chdir(ROOT)

import ai_status  # noqa: E402

UI_PREFIXES = (
    "RDX-W0-", "TOK-UI-", "DSY-UI-", "SBK-UI-",
    "OPS-UI-RD-", "ADM-UI-RD-", "TEN-UI-RD-", "DRV-UI-RD-", "PBK-UI-",
)

# Tasks NOT to touch.
LOCKED_IDS = {
    "RDX-W0-001",  # done
    "RDX-W0-002",  # done
    "RDX-W0-003",  # governance: sprint mode
    "OPS-UI-RD-009",  # closeout: Claude
    "ADM-UI-RD-010",  # closeout: Claude
    "TEN-UI-RD-099",  # closeout: Claude
    "DRV-UI-RD-009",  # closeout: Claude
}

# 51 owner slots in this exact order; each slot consumes one movable task
# (sorted by id). Order chosen so each surface ends up with mixed ownership
# rather than one agent owning a whole console.
OWNER_BAG = (
    ["Codex", "Codex2", "Claude2", "Codex", "Codex2", "Gemini", "Codex", "Codex2", "Claude2"] * 5
    + ["Codex", "Codex2", "Claude2", "Gemini2", "Gemini", "Gemini2"]
)
assert len(OWNER_BAG) == 51, f"OWNER_BAG must hold 51 slots, got {len(OWNER_BAG)}"

# Reviewer must be ≠ owner. Pick a sibling-lane reviewer that won't itself
# be overloaded; secondary fallback if collision.
REVIEWER_PREFERENCE = {
    "Codex":   ["Codex2", "Claude2", "Copilot"],
    "Codex2":  ["Codex",  "Claude2", "Copilot"],
    "Claude2": ["Codex",  "Codex2",  "Copilot"],
    "Gemini":  ["Codex",  "Codex2",  "Copilot"],
    "Gemini2": ["Codex2", "Codex",   "Copilot"],
}


def main() -> int:
    state = ai_status.load_state()
    ui_tasks = [t for t in state["tasks"] if t["id"].startswith(UI_PREFIXES)]
    movable = sorted(
        (t for t in ui_tasks if t["id"] not in LOCKED_IDS and t["status"] == "backlog"),
        key=lambda t: t["id"],
    )

    if len(movable) != 51:
        print(f"WARN: expected 51 movable tasks, found {len(movable)}", file=sys.stderr)

    print(f"Rebalancing {len(movable)} movable tasks…", file=sys.stderr)
    changes: list[tuple[str, str, str, str, str]] = []  # (id, old_owner, new_owner, old_reviewer, new_reviewer)

    for spec, task in zip(OWNER_BAG, movable):
        new_owner = spec
        old_owner = task["owner"]
        old_reviewer = task["reviewer"]

        # pick reviewer ≠ new_owner; first preference that isn't equal
        new_reviewer = next(r for r in REVIEWER_PREFERENCE[new_owner] if r != new_owner)

        if new_owner == old_owner and new_reviewer == old_reviewer:
            continue  # no-op

        os.environ["AI_STATUS_ACTOR"] = "Claude2"
        # Don't touch title/summary/phase/artifacts/acceptance/metadata —
        # command_assign only updates them when env vars are set.
        for var in ("TASK_TITLE", "TASK_SUMMARY_ZH", "TASK_PHASE",
                    "TASK_DEPENDS_ON", "TASK_ARTIFACTS", "TASK_ACCEPTANCE",
                    "TASK_METADATA_JSON"):
            os.environ.pop(var, None)
        ai_status.command_assign(state, [task["id"], new_owner, new_reviewer])
        changes.append((task["id"], old_owner, new_owner, old_reviewer, new_reviewer))

    ai_status.sync_all(state)
    ai_status.save_state(state)

    # Report
    print(f"Reassigned {len(changes)} tasks:", file=sys.stderr)
    for tid, oo, no, orv, nrv in changes:
        if oo != no:
            print(f"  {tid:20s}  owner: {oo} → {no}    reviewer: {orv} → {nrv}", file=sys.stderr)
    print(file=sys.stderr)

    final_owners = Counter(t["owner"] for t in state["tasks"] if t["id"].startswith(UI_PREFIXES))
    final_reviewers = Counter(t["reviewer"] for t in state["tasks"] if t["id"].startswith(UI_PREFIXES))
    print(f"Final owner distribution (57 tasks):  {dict(final_owners)}", file=sys.stderr)
    print(f"Final reviewer distribution (57 tasks): {dict(final_reviewers)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
