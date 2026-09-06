#!/usr/bin/env python3
"""Validate or atomically register the reviewed unattended-voice execution wave.

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
SCRIPT_REF = "tools/task-dispatch/dispatch-unattended-voice-booking-20260906.py"
MANIFEST_REF = "tools/task-dispatch/manifests/unattended-voice-booking-20260906.json"
ELIGIBLE_AGENTS = ["Gemini", "Gemini2", "Claude", "Claude2"]
REFERENCE_FIELDS = ("planning_ref", "system_design_ref", "audit_ref", "decision_ref", "execution_ref")
FR_IDS = {f"UV-FR-{index:03d}" for index in range(1, 33)}
AC_IDS = {f"UV-AC-{index:03d}" for index in range(1, 49)}
TASK_FIELDS = (
    "title", "summary_zh", "depends_on", "artifacts", "acceptance", "fr_ids",
    "ac_ids", "workstream", "external_gate", "required_acceptance", "task_class",
    "mutates_canonical", "priority", "test_commands",
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
    if not isinstance(manifest, dict) or not isinstance(manifest.get("wave_id"), str) or not manifest["wave_id"].strip():
        raise ValueError("Manifest requires wave_id")
    for field in REFERENCE_FIELDS:
        if not isinstance(manifest.get(field), str):
            raise ValueError(f"Missing {field}")
        safe_file(repo, manifest[field])
    tasks = manifest.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("Manifest requires a nonempty tasks array")
    by_id: dict[str, dict[str, Any]] = {}
    seen_fr: set[str] = set()
    seen_ac: set[str] = set()
    for task in tasks:
        if not isinstance(task, dict) or not re.fullmatch(r"UV-EXEC-\d{3}", str(task.get("id", ""))):
            raise ValueError("Every task requires a UV-EXEC-NNN id")
        task_id = task["id"]
        if task_id in by_id:
            raise ValueError(f"Duplicate task id: {task_id}")
        by_id[task_id] = task
        for key in ("title", "summary_zh", "workstream", "priority"):
            if not isinstance(task.get(key), str) or not task[key].strip():
                raise ValueError(f"{task_id}: missing {key}")
        for key in ("owner", "reviewer"):
            if task.get(key) not in ELIGIBLE_AGENTS:
                raise ValueError(f"{task_id}: {key} must use an agy/Gemini or Claude lane")
        if task["owner"] == task["reviewer"]:
            raise ValueError(f"{task_id}: owner equals reviewer")
        if "eligible_agents" in task and task["eligible_agents"] != ELIGIBLE_AGENTS:
            raise ValueError(f"{task_id}: eligible_agents must match the wave lanes")
        for key in ("depends_on", "required_acceptance", "fr_ids", "ac_ids"):
            string_list(task, key)
        for key in ("artifacts", "acceptance", "test_commands"):
            string_list(task, key, nonempty=True)
        for key in ("external_gate", "mutates_canonical"):
            if not isinstance(task.get(key), bool):
                raise ValueError(f"{task_id}: {key} must be boolean")
        if task.get("task_class") not in {"implementation", "verification", "documentation", "release"}:
            raise ValueError(f"{task_id}: unsupported task_class")
        if task.get("initial_status") not in {"backlog", "blocked"}:
            raise ValueError(f"{task_id}: initial_status must be backlog or blocked")
        if task["external_gate"] and not task["required_acceptance"]:
            raise ValueError(f"{task_id}: external gate requires acceptance evidence keys")
        if task["initial_status"] == "blocked":
            if not task["external_gate"] or not isinstance(task.get("gate_reason"), str) or not task["gate_reason"].strip():
                raise ValueError(f"{task_id}: blocked task requires explicit external gate_reason")
            if task.get("waiting_for", task["owner"]) not in ELIGIBLE_AGENTS:
                raise ValueError(f"{task_id}: waiting_for must name a supported worker lane")
        unknown_fr = set(task["fr_ids"]) - FR_IDS
        unknown_ac = set(task["ac_ids"]) - AC_IDS
        if unknown_fr or unknown_ac:
            raise ValueError(f"{task_id}: unknown coverage IDs {sorted(unknown_fr | unknown_ac)}")
        seen_fr.update(task["fr_ids"])
        seen_ac.update(task["ac_ids"])
    if seen_fr != FR_IDS or seen_ac != AC_IDS:
        raise ValueError(f"Coverage missing: {sorted((FR_IDS - seen_fr) | (AC_IDS - seen_ac))}")
    visiting: set[str] = set()
    visited: set[str] = set()
    ordered: list[dict[str, Any]] = []

    def visit(task_id: str) -> None:
        if task_id in visiting:
            raise ValueError(f"Dependency cycle at {task_id}")
        if task_id in visited:
            return
        if task_id not in by_id:
            raise ValueError(f"Missing dependency: {task_id}; archived/missing tasks are not accepted")
        visiting.add(task_id)
        for dependency in by_id[task_id]["depends_on"]:
            visit(dependency)
        visiting.remove(task_id)
        visited.add(task_id)
        ordered.append(by_id[task_id])

    for task_id in by_id:
        visit(task_id)
    return ordered


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
    for relative in {SCRIPT_REF, manifest_ref, *(manifest[field] for field in REFERENCE_FIELDS)}:
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


def verify_materialized(manifest: dict[str, Any], state: dict[str, Any], *, require_all: bool = True) -> None:
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
    script = repo / "tools/development-orchestrator/bin/ai_status.py"
    name = "_voice_wave_task_board_" + sha256(str(status_root).encode()).hexdigest()[:12]
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
    commands["materialize-voice-wave"] = wave_handler(board, manifest, ordered, source)
    return board.TaskBoardCommandExecutor(replace(runtime, mutation_commands=commands)).execute_with_result("materialize-voice-wave", [])


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
    if args.apply or args.verify:
        if not (status_root / "ai-status.json").is_file():
            raise ValueError("Existing canonical ai-status.json is required; refusing to initialize another board")
        board = load_board(REPO, status_root)
        if args.apply:
            result = apply_wave(board, manifest, ordered, str(source))
            print(json.dumps(result, ensure_ascii=False))
        runtime = board._command_runtime()
        readers = dict(runtime.read_only_commands)
        readers["verify-voice-wave"] = lambda state, _args: verify_materialized(manifest, state)
        board.TaskBoardCommandExecutor(replace(runtime, read_only_commands=readers)).execute_with_result("verify-voice-wave", [])
        print(f"Verified {len(ordered)} materialized tasks; existing lifecycle state and evidence preserved.")
    else:
        print(f"DRY RUN: {len(ordered)} tasks; FR coverage={len(FR_IDS)}; AC coverage={len(AC_IDS)}; status_root={status_root}")
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
