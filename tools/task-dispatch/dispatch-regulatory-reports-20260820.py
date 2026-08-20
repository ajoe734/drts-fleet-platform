#!/usr/bin/env python3
"""Register the PRD 9.10.1 regulatory report DAG for supervisor execution.

This script writes machine truth only through the canonical ai-status command.
It does not start workers itself; the supervisor dispatches dependency-ready
tasks into isolated worktrees.

Usage:
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-regulatory-reports-20260820.py --dry-run
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-regulatory-reports-20260820.py
    AI_NAME=Claude python3 tools/task-dispatch/dispatch-regulatory-reports-20260820.py --allow-existing
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
PHASE = "regulatory-reports-20260820"
GAP_REF = "phase1_prd_detailed_v1.md#9101"
EXECUTION_REF = (
    "docs/03-runbooks/regulatory-reports-execution-tasks-20260820.md"
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
        "REG-RPT-001",
        "Codex",
        "Claude2",
        "Make an unimplemented regulatory report say so",
        "Reject a report job whose type has no row builder, at creation, naming the type. Today createReportJob checks only non-blank and eight of nine declared types complete with rows: []. Derive the accepted set from the builders that exist, not a second hand-maintained list. Fix the six_month_statistics / six_month_operations_summary mismatch in the same change. Eight types will return errors until REG-RPT-002 and 003 land; that is intended, do not soften it to a warning.",
        (),
        (
            "apps/api/src/modules/reporting-filing/",
            "packages/contracts/src/index.ts",
            "tests/unit/",
            "tests/integration/",
        ),
        (
            "A job type with no builder is rejected at creation with an error naming it",
            "The accepted set derives from builders present, not a parallel list",
            "six_month_statistics and six_month_operations_summary resolve to one report and the code states which name is canonical",
            "dispatch_recording_index and operational report types are unchanged",
            "No job type reaches completed with empty rows because its builder is absent",
        ),
        "P1", "A", "report-integrity", ("PRD-9.10.1",), ("no-silent-empty-report",),
    ),
    Task(
        "REG-RPT-002",
        "Gemini",
        "Codex2",
        "Build the four regulatory rosters",
        "Row builders for vehicle_roster, driver_roster, contract_roster, insurance_roster against regulatory-registry, which already owns all four master records. The roster is that data as a report, not a new model. Honour job filters. If a field PRD 9.10.1 implies is absent from the registry, stop and report: that is a registry gap, not a reporting one.",
        ("REG-RPT-001",),
        (
            "apps/api/src/modules/reporting-filing/",
            "tests/unit/",
            "tests/integration/",
        ),
        (
            "Each of the four returns rows from the registry proven against seeded data",
            "Job filters are honoured; a period or status filter changes the row set",
            "Each row carries enough identity to trace back to its registry record",
            "An empty result still succeeds and is distinguishable from an unimplemented type",
            "No field is added to regulatory-registry by this task",
        ),
        "P1", "B", "report-rosters", ("PRD-9.10.1",), ("no-silent-empty-report",),
    ),
    Task(
        "REG-RPT-003",
        "Codex2",
        "Gemini2",
        "Complaint detail, six-month statistics, and the two with no source",
        "Build complaint_case_detail against complaint.listComplaintCases and getComplaintExportView. Confirm six_month_statistics reports the four figures PRD 9.10.1 names, not merely what the existing provider returns. vehicle_monthly_delta and fare_version_history have no source: vehicle lifecycle history is not stored and no module owns published pricing-template versions. Do not derive either from current state -- a monthly delta computed from today's rows looks correct and is wrong. Report what each needs and stop.",
        ("REG-RPT-001",),
        (
            "apps/api/src/modules/reporting-filing/",
            "tests/unit/",
            "tests/integration/",
        ),
        (
            "complaint_case_detail returns rows from the complaint module honouring filters",
            "six_month_statistics returns all four PRD-named figures and a test names each",
            "vehicle_monthly_delta and fare_version_history stay rejected with a written statement of the source each needs",
            "Neither unsourced report is faked from current state",
        ),
        "P1", "B", "report-crossmodule", ("PRD-9.10.1",), ("no-silent-empty-report",),
    ),
    Task(
        "REG-RPT-004",
        "Claude2",
        "Codex",
        "One test that outlives the tenth report",
        "Enumerate REGULATORY_REPORT_JOB_TYPES at runtime and assert for every entry either that a job produces rows against seeded data or that creation is rejected with a named reason. Neither silence nor empty success is acceptable for any member. The point is the enumeration: a hand-listed test passes forever and says nothing about the tenth type.",
        ("REG-RPT-002", "REG-RPT-003"),
        (
            "tests/integration/",
            "tests/security/",
            "docs/04-uat/",
        ),
        (
            "The test derives cases from the exported enum not a literal list",
            "A temporary tenth type with no builder makes it fail naming the type",
            "Every implemented report is asserted to return rows not merely to complete",
            "The two unsourced reports are asserted rejected so their absence is pinned",
        ),
        "P1", "C", "report-acceptance", ("PRD-9.10.1",), ("no-silent-empty-report",),
    ),
)


EXPECTED_ROOTS = {"REG-RPT-001"}


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
            "Invalid regulatory report task graph:\n- " + "\n- ".join(errors)
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
        "regulatory_reports": True,
        "mutates_canonical": True,
        "required_acceptance": list(item.required_acceptance),
        "registered_by": "dispatch-regulatory-reports-20260820.py",
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
        f"Validated {len(TASKS)} regulatory report tasks; "
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
        "The supervisor may dispatch REG-RPT-001; everything else waits for it."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
