#!/usr/bin/env python3
"""Register the callcenter multi-order DAG for supervisor execution.

This script writes machine truth only through the canonical ai-status command.
It does not start workers itself; the supervisor dispatches dependency-ready
tasks into isolated worktrees.

Usage:
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-callcenter-multi-order-20260819.py --dry-run
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-callcenter-multi-order-20260819.py
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-callcenter-multi-order-20260819.py --allow-existing
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
PHASE = "callcenter-multi-order-20260819"
GAP_REF = "PHASE1_OPEN_QUESTIONS.md"
EXECUTION_REF = (
    "docs/03-runbooks/callcenter-multi-order-execution-tasks-20260819.md"
)


def default_status_root() -> Path:
    configured = os.environ.get("AI_STATUS_ROOT") or os.environ.get("ORCH_STATUS_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()

    result = subprocess.run(
        [
            "git",
            "-C",
            str(REPO),
            "rev-parse",
            "--path-format=absolute",
            "--git-common-dir",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode == 0:
        common_dir = Path(result.stdout.strip()).resolve()
        if common_dir.name == ".git":
            return common_dir.parent
    return REPO


STATUS_ROOT = default_status_root()
STATUS_FILE = STATUS_ROOT / "ai-status.json"


@dataclass(frozen=True)
class Task:
    task_id: str
    owner: str
    reviewer: str
    title: str
    summary: str
    depends_on: tuple[str, ...]
    artifacts: tuple[str, ...]
    acceptance: tuple[str, ...]
    priority: str
    wave: str
    workstream: str
    gap_ids: tuple[str, ...]
    gates: tuple[str, ...]
    task_class: str = "implementation"
    required_acceptance: tuple[str, ...] = ()


TASKS = (
    Task(
        "CC-MULTI-001",
        "Codex",
        "Claude2",
        "Make one call hold many orders end to end below the UI",
        "Change the session-to-order relationship from one to many across the contract, the service, and the persisted record jsonb, in one change. Reads must tolerate the old scalar linkedOrderId. createCallCenterOrder appends rather than replaces. Do not add a server-side linked_order_exists rejection; the server never had one.",
        (),
        (
            "packages/contracts/src/index.ts",
            "apps/api/src/modules/callcenter/",
            "apps/api/src/modules/owned-mobility/",
            "tests/unit/",
            "tests/integration/",
        ),
        (
            "One call session holds two or more order references returned in creation order",
            "A session persisted with the old scalar shape reads back as a one-element collection, pinned by a test against a literal old-shape row",
            "Creating a second order leaves the first link intact proven by readback",
            "The single-order flow is unchanged for callers that create exactly one",
            "No server-side linked_order_exists rejection is introduced",
            "Focused callcenter and owned-mobility tests pass and contracts typecheck",
        ),
        "P1",
        "A",
        "callcenter-cardinality",
        ("Q-001",),
        ("one-call-many-orders",),
    ),
    Task(
        "CC-MULTI-002",
        "Gemini2",
        "Codex2",
        "Give the callcenter console the multi-order journey",
        "Remove the linked_order_exists disable reason and the guard producing it, render the call's orders as a list, and let an agent create a further order without closing the session. Keep the single-order path exactly as short as it is today. Each listed order keeps its dispatch intent link.",
        ("CC-MULTI-001",),
        (
            "apps/ops-console-web/app/callcenter/",
            "apps/ops-console-web/tests/",
            "i18n message catalogues for strings this adds or retires",
        ),
        (
            "An agent can create a second order on an open session and both appear in creation order",
            "Creating one order still takes the same number of actions as today",
            "Every listed order offers the dispatch intent link",
            "The retired linked_order_exists string is gone from every locale catalogue",
            "A browser test covers create-one and create-two asserting server state by readback",
            "Existing callcenter console tests pass",
        ),
        "P1",
        "B",
        "callcenter-console",
        ("Q-001",),
        ("one-call-many-orders",),
    ),
)


EXPECTED_ROOTS = {"CC-MULTI-001"}


def load_existing_tasks() -> dict[str, dict[str, object]]:
    if not STATUS_FILE.exists():
        return {}
    payload = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    return {
        str(item.get("id")): item
        for item in payload.get("tasks", [])
        if isinstance(item, dict) and item.get("id")
    }


def validate_graph() -> None:
    valid_agents = {"Claude", "Claude2", "Gemini", "Gemini2", "Codex", "Codex2"}
    seen: set[str] = set()
    errors: list[str] = []
    for item in TASKS:
        if item.task_id in seen:
            errors.append(f"duplicate task id: {item.task_id}")
        if item.owner not in valid_agents or item.reviewer not in valid_agents:
            errors.append(f"unsupported lane on {item.task_id}")
        if item.owner == item.reviewer:
            errors.append(f"owner equals reviewer on {item.task_id}")
        late = [dep for dep in item.depends_on if dep not in seen]
        if late:
            errors.append(
                f"{item.task_id} dependencies missing or not topological: "
                + ", ".join(late)
            )
        if not item.artifacts or not item.acceptance:
            errors.append(f"{item.task_id} has incomplete execution detail")
        if not item.gap_ids or not item.gates:
            errors.append(f"{item.task_id} is not traceable to a GAP and a gate")
        seen.add(item.task_id)

    roots = {item.task_id for item in TASKS if not item.depends_on}
    if roots != EXPECTED_ROOTS:
        errors.append(f"unexpected roots: {sorted(roots)}")

    if errors:
        raise RuntimeError(
            "Invalid callcenter multi-order task graph:\n- " + "\n- ".join(errors)
        )


def _transitive_deps(task_id: str) -> set[str]:
    by_id = {item.task_id: item for item in TASKS}
    resolved: set[str] = set()
    pending = list(by_id[task_id].depends_on)
    while pending:
        current = pending.pop()
        if current in resolved or current not in by_id:
            continue
        resolved.add(current)
        pending.extend(by_id[current].depends_on)
    return resolved


def metadata_for(item: Task) -> dict[str, object]:
    return {
        "planning_ref": GAP_REF,
        "execution_ref": EXECUTION_REF,
        "priority": item.priority,
        "wave": item.wave,
        "workstream": item.workstream,
        "task_class": item.task_class,
        "gap_ids": list(item.gap_ids),
        "completion_gates": list(item.gates),
        "callcenter_multi_order": True,
        "mutates_canonical": True,
        "required_acceptance": list(item.required_acceptance),
        "registered_by": "dispatch-callcenter-multi-order-20260819.py",
    }


def register(item: Task) -> None:
    env = os.environ.copy()
    env.setdefault("AI_NAME", "Claude")
    env["AI_STATUS_ROOT"] = str(STATUS_ROOT)
    env["ORCH_STATUS_ROOT"] = str(STATUS_ROOT)
    env.update(
        {
            "TASK_PHASE": PHASE,
            "TASK_TITLE": item.title,
            "TASK_SUMMARY_ZH": (
                f"[GAP: {GAP_REF}; Execution: {EXECUTION_REF}] {item.summary}"
            ),
            "TASK_DEPENDS_ON": ",".join(item.depends_on),
            "TASK_ARTIFACTS": ",".join(item.artifacts),
            "TASK_ACCEPTANCE": ",".join(item.acceptance),
            "TASK_REQUIRED_ACCEPTANCE": ",".join(item.required_acceptance),
            "TASK_METADATA_JSON": json.dumps(metadata_for(item), ensure_ascii=False),
            "TASK_MUTATES_CANONICAL": "true",
        }
    )
    result = subprocess.run(
        [
            "bash",
            "tools/development-orchestrator/bin/ai-status.sh",
            "assign",
            item.task_id,
            item.owner,
            item.reviewer,
            item.title,
        ],
        cwd=REPO,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "unknown assignment error").strip()
        raise RuntimeError(f"{item.task_id} registration failed: {detail}")


def verify_materialized(expected_ids: set[str]) -> None:
    current = load_existing_tasks()
    missing = sorted(expected_ids - current.keys())
    if missing:
        raise RuntimeError("Tasks missing after registration: " + ", ".join(missing))

    expected = {item.task_id: item for item in TASKS}
    errors: list[str] = []
    for task_id in sorted(expected_ids):
        wanted = expected[task_id]
        actual = current[task_id]
        checks = (
            (tuple(actual.get("depends_on") or ()), wanted.depends_on, "dependencies"),
            (actual.get("priority"), wanted.priority, "priority"),
            (actual.get("phase"), PHASE, "phase"),
            (
                tuple(actual.get("required_acceptance") or ()),
                wanted.required_acceptance,
                "required acceptance",
            ),
        )
        for observed, target, label in checks:
            if observed != target:
                errors.append(f"{task_id} {label} mismatch")
        if not actual.get("artifacts") or not actual.get("acceptance"):
            errors.append(f"{task_id} missing artifacts or acceptance")
        if actual.get("owner") == actual.get("reviewer"):
            errors.append(f"{task_id} owner equals reviewer")
    if errors:
        raise RuntimeError(
            "Materialized task verification failed:\n- " + "\n- ".join(errors)
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print the DAG without changing machine truth.",
    )
    parser.add_argument(
        "--allow-existing",
        action="store_true",
        help="Skip existing task IDs after verifying materialized fields.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    validate_graph()
    roots = [item.task_id for item in TASKS if not item.depends_on]
    print(
        f"Validated {len(TASKS)} callcenter multi-order tasks; "
        f"status_root={STATUS_ROOT}; roots={','.join(roots)}"
    )
    for item in TASKS:
        deps = ",".join(item.depends_on) or "<root>"
        print(
            f"{item.task_id:16s} P={item.priority} W={item.wave} "
            f"{item.owner:7s}->{item.reviewer:7s} "
            f"gap={'/'.join(item.gap_ids):24s} deps={deps}"
        )
    if args.dry_run:
        return 0

    existing = load_existing_tasks()
    collisions = sorted(item.task_id for item in TASKS if item.task_id in existing)
    if collisions and not args.allow_existing:
        print(
            "Refusing to overwrite existing machine-truth tasks: "
            + ", ".join(collisions)
            + ". Re-run with --allow-existing only after verifying the partial wave.",
            file=os.sys.stderr,
        )
        return 2

    registered: set[str] = set()
    for item in TASKS:
        if item.task_id in existing:
            registered.add(item.task_id)
            print(f"SKIP {item.task_id}: already present")
            continue
        register(item)
        registered.add(item.task_id)
        print(f"ASSIGNED {item.task_id}: {item.owner} -> {item.reviewer}")

    verify_materialized(registered)
    print(
        f"Materialized and verified {len(registered)}/{len(TASKS)} tasks. "
        "The supervisor may dispatch CC-MULTI-001; CC-MULTI-002 waits for it to merge."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
