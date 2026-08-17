"""Age out orchestrator run artifacts that nothing still points at.

The disk guard reclaims worktrees and nothing else, so everything the fleet
writes per run accumulated without a ceiling: 491 MB across 3917 worker logs,
7099 chair-review files, 895 worker results. None of it was ever pruned, and
none of it is referenced once the run that produced it is finished -- the
supervisor already treats a missing worker log as normal (`if not
log_path.exists()`).

Evidence is deliberately absent from the targets below. Acceptance evidence is
the record a task's `done` was derived from; ageing that out would quietly
weaken the gate that SUPERVISOR_OPERATING_MODEL.md describes. It is small
(1.5 MB), so there is nothing to trade for.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterable

from common import config_path


# (directory, glob, config key for retention days, default days)
RETENTION_TARGETS: tuple[tuple[str, str, str, float], ...] = (
    ("logs", "*.log", "worker_log_retention_days", 14.0),
    ("chair-reviews", "**/*", "chair_review_retention_days", 14.0),
    ("worker-results", "*", "worker_result_retention_days", 14.0),
)


def artifact_retention_settings(config: dict[str, Any]) -> dict[str, Any]:
    supervisor = config.get("supervisor") if isinstance(config.get("supervisor"), dict) else {}
    raw = supervisor.get("artifact_retention")
    settings = dict(raw) if isinstance(raw, dict) else {}
    settings.setdefault("enabled", True)
    for _directory, _glob, key, default in RETENTION_TARGETS:
        settings.setdefault(key, default)
    settings.setdefault("max_removed_per_sweep", 5000)
    return settings


def referenced_paths(state: dict[str, Any]) -> set[str]:
    """Every filesystem-looking string the live runtime state still points at.

    Deliberately not an allowlist of known fields (`log_path`, `result_path`,
    the chair review's report and decision paths, ...). That document is large
    and grows a new path-shaped field whenever a subsystem is added, so an
    enumeration would be wrong the first time someone forgets to extend it --
    and being wrong here means deleting a file something is about to read.
    """
    found: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, (list, tuple)):
            for value in node:
                walk(value)
        elif isinstance(node, str) and "/" in node:
            found.add(node)

    walk(state)
    return found


def _protected(path: Path, referenced: set[str]) -> bool:
    candidate = str(path)
    if candidate in referenced:
        return True
    resolved = str(path.resolve(strict=False))
    return resolved in referenced


def _candidates(root: Path, glob: str) -> Iterable[Path]:
    if not root.is_dir():
        return ()
    return (path for path in root.glob(glob) if path.is_file())


def prune_runtime_artifacts(
    config: dict[str, Any],
    state: dict[str, Any],
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Remove run artifacts older than their retention, keeping referenced ones.

    Returns a per-directory report; the caller decides whether it is worth
    logging. An empty sweep is reported as zeros rather than omitted, so
    "retention ran and found nothing" is distinguishable from "retention never
    ran" -- the ambiguity that let the disk guard look healthy while reclaiming
    nothing for two weeks.
    """
    resolved = artifact_retention_settings(config)
    if isinstance(settings, dict):
        resolved.update(settings)
    if not resolved.get("enabled", True):
        return {"enabled": False, "removed": 0, "bytes": 0, "directories": {}}

    try:
        base = config_path(config, "state_file").parent
    except KeyError as exc:
        # Housekeeping must never take down its caller. The disk guard is a
        # dispatch-safety mechanism; it does not get to fail because a log
        # directory could not be located.
        return {"enabled": True, "removed": 0, "bytes": 0, "directories": {}, "errors": [str(exc)]}
    referenced = referenced_paths(state)
    budget = max(0, int(resolved.get("max_removed_per_sweep", 5000)))
    now = time.time()

    removed_total = 0
    bytes_total = 0
    directories: dict[str, dict[str, int]] = {}
    errors: list[str] = []

    for directory, glob, key, _default in RETENTION_TARGETS:
        retention_days = max(0.0, float(resolved.get(key, 0.0)))
        cutoff = now - retention_days * 86400.0
        removed = kept = skipped_referenced = 0
        freed = 0
        for path in _candidates(base / directory, glob):
            if removed_total >= budget:
                break
            try:
                stat = path.stat()
            except OSError:
                continue
            if stat.st_mtime > cutoff:
                kept += 1
                continue
            if _protected(path, referenced):
                skipped_referenced += 1
                continue
            try:
                path.unlink()
            except OSError as exc:
                if len(errors) < 10:
                    errors.append(f"{path}: {exc}")
                continue
            removed += 1
            removed_total += 1
            freed += stat.st_size
            bytes_total += stat.st_size
        directories[directory] = {
            "removed": removed,
            "kept": kept,
            "skipped_referenced": skipped_referenced,
            "bytes": freed,
        }

    _prune_empty_dirs(base / "chair-reviews")

    return {
        "enabled": True,
        "removed": removed_total,
        "bytes": bytes_total,
        "directories": directories,
        "errors": errors,
    }


def prune_stale_releases(config: dict[str, Any], settings: dict[str, Any] | None = None) -> dict[str, Any]:
    """Run the release lifecycle's own prune, which nothing was scheduling.

    bin/release-lifecycle.py already implements this correctly -- it protects
    every pointed-to release, the manifest's rollback entries, the N most
    recent, anything with a dirty or nested worktree, and anything inside a
    grace period, and it appends an audit record either way. It defaults to a
    dry run, and no caller ever passed --apply, so 14 releases and 902 MB
    accumulated behind a working tool.

    Invoked as the CLI rather than imported so the audit log and the activation
    lock stay on the one path that has always owned them.
    """
    resolved = dict(settings or {})
    if not resolved.get("prune_releases", True):
        return {"enabled": False}
    keep = int(resolved.get("release_keep", 3))
    min_age_hours = float(resolved.get("release_min_age_hours", 24.0))
    script = Path(__file__).resolve().parents[2] / "bin" / "release-lifecycle.py"
    try:
        repo_root = config_path(config, "state_file").parent.parent
    except KeyError as exc:
        return {"enabled": True, "ok": False, "error": str(exc)[:240]}
    try:
        result = subprocess.run(
            [
                sys.executable,
                str(script),
                "--repo-root",
                str(repo_root),
                "--keep",
                str(keep),
                "--min-age-hours",
                str(min_age_hours),
                "--apply",
                "prune",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return {"enabled": True, "ok": False, "error": str(exc)[:240]}
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip().replace("\n", " | ")
        return {"enabled": True, "ok": False, "error": detail[:240]}
    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return {"enabled": True, "ok": True, "removed": None}
    removed = [entry["release"] for entry in payload.get("releases", []) if entry.get("eligible")]
    return {"enabled": True, "ok": True, "removed": len(removed), "releases": removed[:10]}


def _prune_empty_dirs(root: Path) -> None:
    """Chair reviews nest per run, so emptied parents would linger as inodes."""
    if not root.is_dir():
        return
    for path in sorted(root.rglob("*"), key=lambda item: len(item.parts), reverse=True):
        if not path.is_dir():
            continue
        try:
            next(path.iterdir())
        except StopIteration:
            try:
                path.rmdir()
            except OSError:
                continue
        except OSError:
            continue
