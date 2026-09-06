#!/usr/bin/env python3
"""Validate or atomically register the reviewed system-remediation execution wave.

Default is read-only dry-run. --apply requires an immutable source commit already
merged into the fresh origin/dev tracking ref, with matching local source blobs.
All tasks are assembled and checked while held inside one canonical task-board
transaction; only the complete graph is published. Existing tasks are checked,
never reassigned, resumed, or stripped of lifecycle evidence by a retry.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from dataclasses import replace
from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from typing import Any, Iterator

REPO = Path(__file__).resolve().parents[2]
SCRIPT_REF = "tools/task-dispatch/dispatch-system-remediation-20260906.py"
MANIFEST_REF = "tools/task-dispatch/manifests/system-remediation-20260906.json"
ELIGIBLE_AGENTS = ["Codex", "Claude", "Gemini", "Codex2", "Claude2", "Gemini2"]
INITIAL_OWNERS = ELIGIBLE_AGENTS
INITIAL_REVIEWERS = ELIGIBLE_AGENTS
REFERENCE_FIELDS = ("planning_ref", "audit_ref", "gap_ref", "coverage_ref", "execution_ref")
TASK_FIELDS = (
    "title", "summary_zh", "depends_on", "artifacts", "acceptance", "gap_ids",
    "capability_ids", "workstream", "external_gate", "required_acceptance", "task_class",
    "mutates_canonical", "priority", "test_commands", "write_scopes", "read_dependencies",
    "validation_plan", "serial_resources", "integration_notes", "estimated_size", "task_spec_ref",
)


def git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], text=True, capture_output=True, check=False)
    if result.returncode:
        raise ValueError(f"git {args[0]} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def safe_file(repo: Path, relative: str) -> Path:
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts or not path.parts or path.as_posix() != relative:
        raise ValueError(f"Expected a repository-relative file: {relative!r}")
    local = repo / relative
    if not local.is_file() or not local.resolve().is_relative_to(repo.resolve()):
        raise ValueError(f"Missing or escaping source file: {relative}")
    return local


def string_list(task: dict[str, Any], key: str, *, nonempty: bool = False) -> list[str]:
    value = task.get(key)
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
        raise ValueError(f"{task.get('id', '<manifest>')}: {key} must be a string array")
    if nonempty and not value:
        raise ValueError(f"{task.get('id')}: {key} must not be empty")
    if len(value) != len(set(value)):
        raise ValueError(f"{task.get('id')}: duplicate {key}")
    return value


def validate_manifest(manifest: dict[str, Any], repo: Path) -> list[dict[str, Any]]:
    if manifest.get("wave_id") != "system-remediation-20260906":
        raise ValueError("Unexpected wave_id")
    for field in REFERENCE_FIELDS:
        safe_file(repo, manifest[field])
    for relative in manifest.get("source_refs", []):
        safe_file(repo, relative)
    tasks = manifest.get("tasks", [])
    if not tasks:
        raise ValueError("Empty task graph")
    by_id: dict[str, dict[str, Any]] = {}
    expected_gaps = set(manifest["expected_issue_ids"])
    expected_caps = set(manifest["expected_capability_ids"])
    if expected_gaps != {f"R{i:02d}" for i in range(1, 31)} | {f"N{i:02d}" for i in range(1, 15)}:
        raise ValueError("Issue inventory drift")
    source_caps = json.loads(safe_file(repo, manifest["planning_ref"]).read_text())
    if expected_caps != {row["ID"] for row in source_caps} or len(expected_caps) != 134:
        raise ValueError("Capability inventory drift")
    external = set(manifest.get("external_dependencies", {}))
    covered_gaps: set[str] = set()
    covered_caps: set[str] = set()
    for task in tasks:
        task_id = task.get("id", "")
        safe_file(repo, task["task_spec_ref"])
        if not re.fullmatch(r"SR-[A-Z]+(?:-[A-Z]+)?-\d{3}", task_id) or task_id in by_id:
            raise ValueError(f"Invalid or duplicate task id {task_id}")
        by_id[task_id] = task
        if task.get("owner") not in ELIGIBLE_AGENTS or task.get("reviewer") not in ELIGIBLE_AGENTS or task["owner"] == task["reviewer"]:
            raise ValueError(f"{task_id}: invalid owner/reviewer")
        for key in TASK_FIELDS:
            if key not in task:
                raise ValueError(f"{task_id}: missing {key}")
        for key in ("title", "summary_zh", "workstream", "priority"):
            if not isinstance(task[key], str) or not task[key].strip():
                raise ValueError(f"{task_id}: invalid {key}")
        for key in ("depends_on", "required_acceptance", "gap_ids", "capability_ids", "read_dependencies", "serial_resources"):
            string_list(task, key)
        for key in ("artifacts", "acceptance", "test_commands", "write_scopes", "validation_plan"):
            string_list(task, key, nonempty=True)
        for field in ("write_scopes", "artifacts"):
            for relative in task[field]:
                path = PurePosixPath(relative)
                if path.is_absolute() or ".." in path.parts:
                    raise ValueError(f"{task_id}: escaping {field}")
                if relative in {"ai-status.json", "current-work.md", "pnpm-lock.yaml"} and task_id != "SR-DEPS-001":
                    raise ValueError(f"{task_id}: forbidden shared write {relative}")
        if task["task_class"] not in {"implementation", "verification", "documentation", "release"}:
            raise ValueError(f"{task_id}: invalid class")
        if not isinstance(task["external_gate"], bool) or not isinstance(task["mutates_canonical"], bool):
            raise ValueError(f"{task_id}: invalid boolean")
        if task["initial_status"] not in {"backlog", "blocked"}:
            raise ValueError(f"{task_id}: invalid initial state")
        if task["initial_status"] == "blocked" and (not task["external_gate"] or not task.get("gate_reason") or not task["required_acceptance"]):
            raise ValueError(f"{task_id}: missing external gate evidence requirements")
        if task["external_gate"] and task["initial_status"] != "blocked":
            raise ValueError(f"{task_id}: external gate must initially be held")
        if set(task["gap_ids"]) - expected_gaps or set(task["capability_ids"]) - expected_caps:
            raise ValueError(f"{task_id}: unknown coverage IDs")
        covered_gaps.update(task["gap_ids"])
        covered_caps.update(task["capability_ids"])
    if covered_gaps != expected_gaps or covered_caps != expected_caps:
        raise ValueError(f"Coverage gaps: {sorted(expected_gaps-covered_gaps)} {sorted(expected_caps-covered_caps)}")
    if external & by_id.keys():
        raise ValueError("Internal IDs declared as external dependencies")
    visiting: set[str] = set()
    ordered: list[dict[str, Any]] = []
    ancestors: dict[str, set[str]] = {}
    def visit(task_id: str) -> set[str]:
        if task_id in external:
            return {task_id}
        if task_id not in by_id:
            raise ValueError(f"Missing dependency {task_id}")
        if task_id in visiting:
            raise ValueError(f"Cycle at {task_id}")
        if task_id in ancestors:
            return ancestors[task_id]
        visiting.add(task_id)
        parents: set[str] = set()
        for dep in by_id[task_id]["depends_on"]:
            parents.add(dep)
            parents.update(visit(dep))
        visiting.remove(task_id)
        ancestors[task_id] = parents
        ordered.append(by_id[task_id])
        return parents
    for tid in by_id:
        visit(tid)
    def overlaps(a: str, b: str) -> bool:
        # Concrete file and directory scopes. Task-specific migration suffix globs
        # are disjoint; identical glob expressions still conflict.
        return a == b or a.endswith("/") and b.startswith(a) or b.endswith("/") and a.startswith(b)
    import itertools
    for left, right in itertools.combinations(tasks, 2):
        shared = set(left["serial_resources"]) & set(right["serial_resources"])
        files = [(a, b) for a in left["write_scopes"] for b in right["write_scopes"] if overlaps(a, b)]
        if (shared or files) and left["id"] not in ancestors[right["id"]] and right["id"] not in ancestors[left["id"]]:
            raise ValueError(f"Unordered shared writes {left['id']} / {right['id']}: {files or shared}")
    coverage = json.loads(safe_file(repo, manifest["coverage_ref"]).read_text())
    if set(coverage) != expected_caps:
        raise ValueError("Coverage table must have all 134 capabilities")
    for cid, row in coverage.items():
        if not row["verification_tasks"]:
            raise ValueError(f"{cid}: missing verification owner")
        for tid in row["implementation_tasks"] + row["verification_tasks"]:
            if tid not in by_id and tid not in external:
                raise ValueError(f"{cid}: unknown mapped task {tid}")
        if cid in manifest["excluded_capability_ids"] and (row["implementation_tasks"] or row["verification_tasks"] != ["SR-SCOPE-001"]):
            raise ValueError(f"{cid}: excluded scope must not become implementation")
    return ordered


def verify_external_dependencies(manifest: dict[str, Any], state: dict[str, Any]) -> None:
    current = tasks_by_id(state)
    for dep in manifest["external_dependencies"]:
        if dep not in current:
            raise ValueError(f"External dependency {dep} missing/archived; resolve canonical archive evidence before dispatch, never assume missing means done")



def verify_source(repo: Path, manifest_path: Path, manifest: dict[str, Any], source_ref: str) -> str:
    """Fail closed on unmerged, dirty, stale-tracking, or different source artifacts."""
    source = git(repo, "rev-parse", "--verify", "--end-of-options", f"{source_ref}^{{commit}}")
    if not re.fullmatch(r"[0-9a-f]{40}", source):
        raise ValueError("Source must resolve to a full Git commit")
    remote_lines = git(repo, "ls-remote", "--exit-code", "origin", "refs/heads/dev").splitlines()
    advertised = remote_lines[0].split()[0] if len(remote_lines) == 1 else ""
    tracked = git(repo, "rev-parse", "--verify", "refs/remotes/origin/dev")
    if tracked != advertised:
        raise ValueError("origin/dev is stale; fetch origin dev, then retry source verification")
    git(repo, "merge-base", "--is-ancestor", source, tracked)
    manifest_ref = manifest_path.resolve().relative_to(repo.resolve()).as_posix()
    for relative in {SCRIPT_REF, manifest_ref, *(manifest[field] for field in REFERENCE_FIELDS), *manifest.get("source_refs", []), *(t["task_spec_ref"] for t in manifest["tasks"])}:
        local = safe_file(repo, relative)
        expected = git(repo, "rev-parse", "--verify", f"{source}:{relative}")
        observed = git(repo, "hash-object", "--", str(local))
        if expected != observed:
            raise ValueError(f"Source blob differs from merged commit {source}: {relative}")
    return source


def spec_digest(manifest: dict[str, Any], task: dict[str, Any]) -> str:
    contract = {"wave_id": manifest["wave_id"], **{key: manifest[key] for key in REFERENCE_FIELDS}, "task": task}
    return sha256(json.dumps(contract, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def metadata_for(manifest: dict[str, Any], task: dict[str, Any], source: str) -> dict[str, Any]:
    external_hold = task["initial_status"] == "blocked"
    return {
        **{key: task[key] for key in TASK_FIELDS},
        **{key: manifest[key] for key in REFERENCE_FIELDS},
        "phase": manifest["wave_id"], "wave_id": manifest["wave_id"],
        "eligible_agents": list(ELIGIBLE_AGENTS), "registered_by": SCRIPT_REF,
        "task_spec_sha256": spec_digest(manifest, task), "source_commit": source,
        "status": "blocked", "materialization_hold": not external_hold,
        "gate_reason": task["gate_reason"] if external_hold else "materialization_hold",
        "waiting_for": task.get("waiting_for", task["owner"]),
        "next": task["gate_reason"] if external_hold else "materialization_hold: awaiting complete DAG validation",
    }


def tasks_by_id(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    tasks: dict[str, dict[str, Any]] = {}
    for task in state.get("tasks", []):
        if not isinstance(task, dict) or not isinstance(task.get("id"), str):
            raise ValueError("Malformed task board record")
        if task["id"] in tasks:
            raise ValueError(f"Duplicate task-board id: {task['id']}")
        tasks[task["id"]] = task
    return tasks


def verify_materialized(manifest: dict[str, Any], state: dict[str, Any], *, require_all: bool = True) -> list[str]:
    notices: list[str] = []
    verify_external_dependencies(manifest, state)
    actual_tasks = tasks_by_id(state)
    archived_ids = set(state.get("archived_task_ids") or [])
    for expected in manifest["tasks"]:
        task_id = expected["id"]
        actual = actual_tasks.get(task_id)
        if actual is None:
            if task_id in archived_ids:
                raise ValueError(f"Task {task_id} is archived; inspect the canonical archive, never recreate it")
            if require_all:
                raise ValueError(f"Missing materialized task: {task_id}")
            continue
        checks = {
            **{key: expected[key] for key in TASK_FIELDS},
            **{key: manifest[key] for key in REFERENCE_FIELDS},
            "phase": manifest["wave_id"], "wave_id": manifest["wave_id"],
            "registered_by": SCRIPT_REF, "task_spec_sha256": spec_digest(manifest, expected),
            "eligible_agents": ELIGIBLE_AGENTS,
        }
        for key, wanted in checks.items():
            if actual.get(key) != wanted:
                raise ValueError(f"Existing task {task_id} has conflicting {key}; refusing to overwrite")
        if actual.get("owner") not in ELIGIBLE_AGENTS or actual.get("reviewer") not in ELIGIBLE_AGENTS or actual.get("owner") == actual.get("reviewer"):
            raise ValueError(f"Existing task {task_id} has unsupported assignment")
        if not re.fullmatch(r"[0-9a-f]{40}", str(actual.get("source_commit", ""))):
            raise ValueError(f"Existing task {task_id} has missing source provenance")
        if actual["owner"] not in INITIAL_OWNERS or actual["reviewer"] not in INITIAL_REVIEWERS:
            notices.append(f"{task_id}: preserving supervisor assignment {actual['owner']} -> {actual['reviewer']}; differs from initial owner/reviewer preference")
    return notices


@contextmanager
def task_environment(values: dict[str, str]) -> Iterator[None]:
    # Ambient TASK_* values must not reopen or override a reviewed specification.
    keys = {key for key in os.environ if key.startswith("TASK_")} | set(values)
    previous = {key: os.environ.get(key) for key in keys}
    for key in keys:
        os.environ.pop(key, None)
    os.environ.update(values)
    try:
        yield
    finally:
        for key in keys:
            os.environ.pop(key, None)
        for key, value in previous.items():
            if value is not None:
                os.environ[key] = value


def wave_handler(board: Any, manifest: dict[str, Any], ordered: list[dict[str, Any]], source: str):
    def handler(state: dict[str, Any], _args: list[str]) -> dict[str, Any]:
        if state.get("execution_mode") != "supervisor_managed_execution":
            raise ValueError("Task board must already be in supervisor_managed_execution mode")
        verify_materialized(manifest, state, require_all=False)
        existing = tasks_by_id(state)
        created = []
        for task in ordered:
            if task["id"] in existing:
                continue
            with task_environment({
                "AI_NAME": "Supervisor", "TASK_PHASE": manifest["wave_id"],
                "TASK_METADATA_JSON": json.dumps(metadata_for(manifest, task, source), ensure_ascii=False),
            }):
                board.command_assign(state, [task["id"], task["owner"], task["reviewer"], task["title"]])
            created.append(task)
        # No state is published yet: the full dependency graph must be present.
        verify_materialized(manifest, state)
        current = tasks_by_id(state)
        for task in created:
            record = current[task["id"]]
            if task["initial_status"] == "backlog":
                with task_environment({"AI_NAME": "Supervisor"}):
                    board.command_resume_blocked(state, [task["id"], "backlog", f"Execution wave validated; follow {manifest['execution_ref']}"])
                record.pop("gate_reason", None)
            record.pop("materialization_hold", None)
        verify_materialized(manifest, state)
        return {"created": [task["id"] for task in created], "preserved": [task["id"] for task in ordered if task["id"] in existing]}
    return handler


def load_board(repo: Path, status_root: Path) -> Any:
    active = status_root / ".artifacts/releases/active/tools/development-orchestrator/bin/ai_status.py"
    script = active.resolve() if active.is_file() else repo / "tools/development-orchestrator/bin/ai_status.py"
    name = "_system_remediation_task_board_" + sha256(str(status_root).encode()).hexdigest()[:12]
    spec = importlib.util.spec_from_file_location(name, script)
    if spec is None or spec.loader is None:
        raise ValueError("Cannot load the canonical task-board command module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    with task_environment({"AI_STATUS_ROOT": str(status_root), "ORCH_STATUS_ROOT": str(status_root)}):
        spec.loader.exec_module(module)
    return module


def apply_wave(board: Any, manifest: dict[str, Any], ordered: list[dict[str, Any]], source: str) -> dict[str, Any]:
    runtime = board._command_runtime()
    commands = dict(runtime.mutation_commands)
    commands["materialize-system-remediation-wave"] = wave_handler(board, manifest, ordered, source)
    return board.TaskBoardCommandExecutor(replace(runtime, mutation_commands=commands)).execute_with_result("materialize-system-remediation-wave", [])


def default_status_root(repo: Path) -> Path:
    configured = os.environ.get("AI_STATUS_ROOT") or os.environ.get("ORCH_STATUS_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    common = Path(git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir"))
    return common.parent if common.name == ".git" else repo


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--dry-run", action="store_true", help="Validate and print the plan (default)")
    actions.add_argument("--apply", action="store_true", help="Atomically register from verified merged source")
    actions.add_argument("--verify", action="store_true", help="Read and verify the materialized task board")
    parser.add_argument("--manifest", type=Path, default=REPO / MANIFEST_REF)
    parser.add_argument("--source-ref", help="Commit merged into fresh origin/dev; mandatory for --apply")
    parser.add_argument("--status-root", type=Path, help="Canonical shared status root; defaults to common Git root")
    args = parser.parse_args(argv)
    manifest_path = args.manifest.expanduser().resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    ordered = validate_manifest(manifest, REPO)
    if args.apply and not args.source_ref:
        parser.error("--apply requires --source-ref pointing to merged source")
    source = verify_source(REPO, manifest_path, manifest, args.source_ref) if args.source_ref else None
    status_root = args.status_root.expanduser().resolve() if args.status_root else default_status_root(REPO)
    if (status_root / "ai-status.json").is_file():
        verify_external_dependencies(manifest, json.loads((status_root / "ai-status.json").read_text()))
    if args.apply or args.verify:
        if not (status_root / "ai-status.json").is_file():
            raise ValueError("Existing canonical ai-status.json is required; refusing to initialize another board")
        board = load_board(REPO, status_root)
        if args.apply:
            result = apply_wave(board, manifest, ordered, str(source))
            print(json.dumps(result, ensure_ascii=False))
        runtime = board._command_runtime()
        readers = dict(runtime.read_only_commands)
        readers["verify-system-remediation-wave"] = lambda state, _args: verify_materialized(manifest, state)
        notices = board.TaskBoardCommandExecutor(replace(runtime, read_only_commands=readers)).execute_with_result("verify-system-remediation-wave", [])
        for notice in notices:
            print(f"PREFERENCE NOTICE: {notice}")
        print(f"Verified {len(ordered)} materialized tasks; existing lifecycle state and evidence preserved.")
    else:
        print(f"DRY RUN: {len(ordered)} tasks; issues=44; capabilities=134; status_root={status_root}")
        for task in ordered:
            dependencies = ",".join(task["depends_on"]) or "<root>"
            print(f"{task['id']} {task['owner']} -> {task['reviewer']} {task['initial_status']} deps={dependencies}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
