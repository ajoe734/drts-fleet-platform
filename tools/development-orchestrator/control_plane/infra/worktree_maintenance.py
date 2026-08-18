"""Worktree cleanup, archival, and disk-maintenance operations."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from common import config_path, parse_iso_utc, utc_now, write_activity_log
from control_plane.domain.worker_lifecycle import ACTIVE_WORKER_STATUSES as ACTIVE_RUNTIME_STATUSES

REPO_ROOT = Path(__file__).resolve().parents[4]


def _git_capture(repo_root: Path, args: list[str], *, timeout: float = 30.0) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        text=True,
        capture_output=True,
        check=False,
        timeout=timeout,
    )


def _path_is_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _worker_worktrees_enabled(config: dict[str, Any]) -> bool:
    strategy = config.get("branch_strategy", {}) if isinstance(config.get("branch_strategy"), dict) else {}
    settings = strategy.get("worker_worktrees", {}) if isinstance(strategy.get("worker_worktrees"), dict) else {}
    return bool(settings.get("enabled", False))


def _pid_is_alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(int(pid), 0)
    except (OSError, ValueError, TypeError):
        return False
    return True


def disk_guard_settings(config: dict[str, Any]) -> dict[str, Any]:
    supervisor_settings = config.get("supervisor", {}) if isinstance(config.get("supervisor"), dict) else {}
    raw = supervisor_settings.get("disk_guard")
    settings = dict(raw) if isinstance(raw, dict) else {}
    # Keep disabled unless the deployment config opts in, so small unit-test
    # configs and ad-hoc local runs are not coupled to host disk pressure.
    settings.setdefault("enabled", bool(raw))
    settings.setdefault("path", ".")
    settings.setdefault("warn_usage_percent", 80.0)
    settings.setdefault("cleanup_usage_percent", 85.0)
    settings.setdefault("block_dispatch_usage_percent", 85.0)
    settings.setdefault("min_free_gb", 5.0)
    settings.setdefault("cleanup_interval_seconds", 3600.0)
    settings.setdefault("worktree_retention_days", 3.0)
    settings.setdefault("max_worktrees_removed_per_tick", 200)
    settings.setdefault("remove_dirty_worktrees", False)
    return settings

def worktree_cleanup_settings(config: dict[str, Any], overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    supervisor_settings = config.get("supervisor", {}) if isinstance(config.get("supervisor"), dict) else {}
    raw = supervisor_settings.get("worker_workspace_cleanup")
    settings = dict(raw) if isinstance(raw, dict) else {}
    if isinstance(overrides, dict):
        settings.update(overrides)
    settings.setdefault("enabled", True)
    settings.setdefault("archive_dirty_worktrees", True)
    settings.setdefault("force_remove_dirty_worktrees_after_archive", True)
    settings.setdefault("archive_root", str(Path(tempfile.gettempdir()) / f"{REPO_ROOT.name}-worktree-archive"))
    settings.setdefault("max_worktrees_removed_per_tick", 200)
    settings.setdefault("worktree_retention_days", 3.0)
    settings.setdefault("remove_dirty_worktrees", False)
    settings.setdefault("max_copied_files_per_archive", 200)
    settings.setdefault("max_copied_file_bytes", 2 * 1024 * 1024)
    settings.setdefault("max_copied_bytes_per_archive", 20 * 1024 * 1024)
    # Bound the dirty-worktree archive so it cannot grow without limit and fill
    # the disk (which would trip the disk guard and block ALL dispatch).
    settings.setdefault("archive_retention_days", 1.0)
    settings.setdefault("archive_max_total_bytes", 2 * 1024 * 1024 * 1024)
    settings.setdefault("release_interval_seconds", 60.0)
    # `git worktree add` holds its own `locked: initializing` marker only for
    # the duration of the add, which this codebase caps at 90s. Anything still
    # wearing that marker an hour later is residue from an add that died.
    settings.setdefault("initializing_lock_stale_seconds", 3600.0)
    return settings


def _disk_guard_path(config: dict[str, Any], settings: dict[str, Any]) -> Path:
    raw_path = Path(str(settings.get("path") or ".")).expanduser()
    if raw_path.is_absolute():
        return raw_path
    try:
        root = config_path(config, "status_file").parent
    except KeyError:
        root = REPO_ROOT
    return (root / raw_path).resolve()


def disk_usage_snapshot(path: Path) -> dict[str, Any] | None:
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return None
    usage_percent = (usage.used / usage.total * 100.0) if usage.total else 0.0
    return {
        "path": str(path),
        "total_bytes": usage.total,
        "used_bytes": usage.used,
        "free_bytes": usage.free,
        "usage_percent": round(usage_percent, 2),
        "free_gb": round(usage.free / (1024**3), 2),
    }


def active_worker_workspace_roots(state: dict[str, Any]) -> set[str]:
    active_statuses = ACTIVE_RUNTIME_STATUSES
    roots: set[str] = set()
    for worker in (state.get("workers", {}) or {}).values():
        if not isinstance(worker, dict):
            continue
        if str(worker.get("status") or "") not in active_statuses and not _pid_is_alive(worker.get("pid")):
            continue
        for key in ("workspace_root", "cwd", "worktree", "worktree_path"):
            value = worker.get(key)
            if value:
                roots.add(str(Path(str(value)).expanduser().resolve()))
        command = worker.get("command") or []
        if isinstance(command, list):
            for index, token in enumerate(command[:-1]):
                if token == "-C":
                    roots.add(str(Path(str(command[index + 1])).expanduser().resolve()))
    return roots


def _registered_worktrees(repo_root: Path) -> list[dict[str, Any]]:
    result = _git_capture(repo_root, ["worktree", "list", "--porcelain"], timeout=30.0)
    if result.returncode != 0:
        return []
    records: list[dict[str, Any]] = []
    current: dict[str, Any] = {}
    for line in (result.stdout or "").splitlines():
        if line.startswith("worktree "):
            if current:
                records.append(current)
            current = {"path": line[len("worktree "):]}
        elif line.startswith("branch "):
            current["branch"] = line[len("branch "):]
        elif line.startswith("HEAD "):
            current["head"] = line[len("HEAD "):]
        elif line.startswith("locked"):
            current["locked"] = True
            current["locked_reason"] = line[len("locked"):].strip() or None
    if current:
        records.append(current)
    return records


GIT_INITIALIZING_LOCK_REASON = "initializing"


def _worktree_admin_dir(repo_root: Path, worktree: Path) -> Path | None:
    """Locate git's per-worktree admin directory (.git/worktrees/<name>)."""
    pointer = worktree / ".git"
    try:
        text = pointer.read_text(encoding="utf-8").strip()
    except OSError:
        text = ""
    if text.startswith("gitdir:"):
        return Path(text[len("gitdir:"):].strip())
    # The worktree directory may already be gone while git still lists it.
    common = _git_capture(repo_root, ["rev-parse", "--git-common-dir"], timeout=10.0)
    if common.returncode != 0:
        return None
    root = Path((common.stdout or "").strip())
    if not root.is_absolute():
        root = (repo_root / root).resolve()
    candidate = root / "worktrees" / worktree.name
    return candidate if candidate.is_dir() else None


def _initializing_lock_age_seconds(repo_root: Path, worktree: Path) -> float | None:
    """Seconds since git wrote the `locked` marker, or None if unknowable."""
    admin = _worktree_admin_dir(repo_root, worktree)
    if admin is None:
        return None
    try:
        return max(0.0, time.time() - (admin / "locked").stat().st_mtime)
    except OSError:
        return None


def _release_dead_initializing_lock(
    repo_root: Path,
    worktree: Path,
    record: dict[str, Any],
    settings: dict[str, Any],
) -> tuple[bool, str | None]:
    """Unlock a worktree stranded by an interrupted `git worktree add`.

    A lock is normally an explicit ownership signal and must be respected. But
    git sets `locked: initializing` itself, for the duration of the add only,
    and a supervisor killed mid-add leaves it behind forever. This skip had no
    age bound, so 21 such worktrees accumulated 13 GB, the oldest stranded on
    2026-08-05. Only git's own transient reason is eligible, and only once it
    is far older than an add could possibly take -- a human `git worktree lock
    --reason ...` still means hands off.

    Returns (released, detail-for-logging).
    """
    reason = str(record.get("locked_reason") or "").strip().lower()
    if reason != GIT_INITIALIZING_LOCK_REASON:
        return False, None
    threshold = max(0.0, float(settings.get("initializing_lock_stale_seconds", 3600.0)))
    age = _initializing_lock_age_seconds(repo_root, worktree)
    if age is None or age < threshold:
        return False, None
    result = _git_capture(repo_root, ["worktree", "unlock", str(worktree)], timeout=30.0)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip().replace("\n", " | ")
        return False, f"unlock failed: {detail[:160]}"
    return True, f"released dead initializing lock after {age / 3600.0:.1f}h"


def _worktree_archive_root(settings: dict[str, Any]) -> Path:
    raw_value = settings.get("archive_root")
    if raw_value:
        root = Path(str(raw_value)).expanduser()
    else:
        root = Path(tempfile.gettempdir()) / f"{REPO_ROOT.name}-worktree-archive"
    if not root.is_absolute():
        root = Path(tempfile.gettempdir()) / root
    return root.resolve()


def _prune_worktree_archive(settings: dict[str, Any]) -> dict[str, Any]:
    """Keep the dirty-worktree archive bounded.

    Each disk-guard cleanup archives dirty worktrees into a timestamped subdir
    under the archive root, but nothing ever removed those subdirs, so the
    archive grew without limit (observed at 90GB) and eventually filled the
    disk — which trips the disk guard and blocks ALL dispatch. The archived
    snapshots are only a best-effort recovery aid (the real work lives on the
    pushed branches/PRs), so we cap them by age then by total size.
    """
    root = _worktree_archive_root(settings)
    if not root.exists():
        return {"removed": 0, "freed_bytes": 0}
    retention_days = max(0.0, float(settings.get("archive_retention_days", 1.0) or 0.0))
    max_total_bytes = max(0, int(settings.get("archive_max_total_bytes", 2 * 1024 * 1024 * 1024) or 0))

    def _dir_size(path: Path) -> int:
        total = 0
        for dirpath, _dirs, files in os.walk(path):
            for name in files:
                try:
                    total += os.path.getsize(os.path.join(dirpath, name))
                except OSError:
                    pass
        return total

    entries: list[tuple[Path, float, int]] = []
    try:
        children = list(root.iterdir())
    except OSError:
        return {"removed": 0, "freed_bytes": 0}
    for child in children:
        try:
            mtime = child.stat().st_mtime
        except OSError:
            continue
        entries.append((child, mtime, _dir_size(child)))

    removed = 0
    freed = 0
    now = time.time()
    cutoff = now - retention_days * 86400.0
    survivors: list[tuple[Path, float, int]] = []
    for child, mtime, size in entries:
        if retention_days > 0 and mtime < cutoff:
            shutil.rmtree(child, ignore_errors=True)
            removed += 1
            freed += size
        else:
            survivors.append((child, mtime, size))

    if max_total_bytes > 0:
        total = sum(size for _child, _mtime, size in survivors)
        survivors.sort(key=lambda item: item[1])  # oldest first
        for child, _mtime, size in survivors:
            if total <= max_total_bytes:
                break
            shutil.rmtree(child, ignore_errors=True)
            removed += 1
            freed += size
            total -= size
    return {"removed": removed, "freed_bytes": freed}


def _worktree_changed_paths_for_archive(worktree: Path) -> list[str]:
    commands = (
        ["diff", "--name-only"],
        ["diff", "--cached", "--name-only"],
        ["ls-files", "--others", "--exclude-standard"],
    )
    seen: set[str] = set()
    paths: list[str] = []
    for args in commands:
        result = _git_capture(worktree, args, timeout=30.0)
        if result.returncode != 0:
            continue
        for line in (result.stdout or "").splitlines():
            candidate = line.strip()
            if not candidate or candidate in seen:
                continue
            seen.add(candidate)
            paths.append(candidate)
    return paths


def _archive_dirty_worktree(worktree: Path, settings: dict[str, Any]) -> tuple[Path | None, list[str]]:
    warnings: list[str] = []
    archive_root = _worktree_archive_root(settings)
    try:
        archive_root.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        return None, [f"archive root unavailable: {exc}"]

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", worktree.name).strip("-") or "worktree"
    archive_dir = archive_root / f"{stamp}-{slug}-{time.time_ns()}"
    try:
        archive_dir.mkdir(parents=True, exist_ok=False)
    except OSError as exc:
        return None, [f"archive directory unavailable: {exc}"]

    snapshots = (
        (["status", "--short", "--branch", "--untracked-files=all"], "git-status.txt"),
        (["diff", "--binary", "--full-index"], "git-diff.patch"),
        (["diff", "--cached", "--binary", "--full-index"], "git-diff-cached.patch"),
        (["ls-files", "--others", "--exclude-standard"], "untracked.txt"),
    )
    for args, filename in snapshots:
        result = _git_capture(worktree, args, timeout=60.0)
        try:
            (archive_dir / filename).write_text(result.stdout or result.stderr or "", encoding="utf-8")
        except OSError as exc:
            warnings.append(f"{filename}: {exc}")
        if result.returncode != 0:
            warnings.append(f"{' '.join(args)} exited {result.returncode}")

    max_files = max(0, int(settings.get("max_copied_files_per_archive", 200)))
    max_file_bytes = max(0, int(settings.get("max_copied_file_bytes", 2 * 1024 * 1024)))
    max_total_bytes = max(0, int(settings.get("max_copied_bytes_per_archive", 20 * 1024 * 1024)))
    copied_entries = 0
    copied_bytes = 0
    manifest: dict[str, Any] = {
        "worktree_path": str(worktree),
        "archived_at": utc_now(),
        "copied_files": [],
        "skipped_files": [],
        "warnings": warnings,
    }
    files_root = archive_dir / "files"

    for rel_path in _worktree_changed_paths_for_archive(worktree):
        source = worktree / rel_path
        if not _path_is_within(source.parent, worktree):
            manifest["skipped_files"].append({"path": rel_path, "reason": "outside_worktree"})
            continue
        if source.is_symlink():
            try:
                target = os.readlink(source)
            except OSError as exc:
                target = f"<unreadable: {exc}>"
            manifest["copied_files"].append({"path": rel_path, "kind": "symlink", "target": target})
            copied_entries += 1
            continue
        if not source.exists():
            manifest["skipped_files"].append({"path": rel_path, "reason": "missing"})
            continue
        if source.is_dir():
            manifest["skipped_files"].append({"path": rel_path, "reason": "directory"})
            continue
        resolved = source.resolve()
        if not _path_is_within(resolved, worktree):
            manifest["skipped_files"].append({"path": rel_path, "reason": "outside_worktree"})
            continue
        if max_files and copied_entries >= max_files:
            manifest["skipped_files"].append({"path": rel_path, "reason": "max_files"})
            continue
        try:
            size = source.stat().st_size
        except OSError as exc:
            manifest["skipped_files"].append({"path": rel_path, "reason": f"stat_failed: {exc}"})
            continue
        if max_file_bytes and size > max_file_bytes:
            manifest["skipped_files"].append({"path": rel_path, "reason": f"file_too_large:{size}"})
            continue
        if max_total_bytes and copied_bytes + size > max_total_bytes:
            manifest["skipped_files"].append({"path": rel_path, "reason": "archive_budget_exceeded"})
            continue
        destination = files_root / rel_path
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        except OSError as exc:
            manifest["skipped_files"].append({"path": rel_path, "reason": f"copy_failed: {exc}"})
            continue
        manifest["copied_files"].append({"path": rel_path, "kind": "file", "size": size})
        copied_entries += 1
        copied_bytes += size

    manifest["copied_bytes"] = copied_bytes
    try:
        (archive_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except OSError as exc:
        warnings.append(f"manifest.json: {exc}")
    return archive_dir, warnings


def _cleanup_registered_worktree(
    repo_root: Path,
    worktree: Path,
    settings: dict[str, Any],
) -> dict[str, Any]:
    status = _git_capture(worktree, ["status", "--porcelain", "--untracked-files=all"], timeout=30.0)
    if status.returncode != 0:
        message = (status.stderr or status.stdout or "").strip().replace("\n", " | ")
        return {"removed": False, "archived": None, "warning": None, "error": message[:240]}

    dirty = bool((status.stdout or "").strip())
    archive_dir: Path | None = None
    warnings: list[str] = []
    if dirty and bool(settings.get("archive_dirty_worktrees", True)):
        archive_dir, warnings = _archive_dirty_worktree(worktree, settings)

    command = ["worktree", "remove"]
    force_remove = bool(
        settings.get("force_remove_dirty_worktrees_after_archive", True)
        or settings.get("remove_dirty_worktrees", False)
    )
    if dirty and force_remove:
        command.append("--force")
    command.append(str(worktree))
    result = _git_capture(repo_root, command, timeout=60.0)
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "").strip().replace("\n", " | ")
        if warnings:
            message = f"{message} | archive: {' | '.join(warnings[:2])}"
        return {
            "removed": False,
            "archived": str(archive_dir) if archive_dir else None,
            "warning": None,
            "error": message[:240],
        }

    warning_message = " | ".join(warnings[:2])[:240] if warnings else None
    return {
        "removed": True,
        "archived": str(archive_dir) if archive_dir else None,
        "warning": warning_message,
        "error": None,
    }


def _protected_worktree(path: Path, repo_root: Path, active_roots: set[str]) -> str | None:
    """Why this worktree must not be reclaimed, or None if it may be.

    Reclamation used to ask "is this under .artifacts/worktrees/auto?" and skip
    everything else. Workers create review and verification worktrees wherever
    they happen to be standing -- .artifacts/worktrees/review/,
    .artifacts/review-tmp/, /tmp/<task>-review -- so of 86 registered worktrees
    exactly one was in scope, and 80 could never be reclaimed at all.

    Asking the inverse question covers every one of them without enumerating
    paths that the next ad-hoc location would escape anyway. git already knows
    where every worktree is; the only thing worth writing down is which ones
    are load-bearing.

    The protected set stays small because removal is not destructive to
    history: `git worktree remove` keeps the branch and its commits, so only
    uncommitted work is at stake, and that is archived before removal.
    """
    if path == repo_root:
        return "canonical checkout"
    if str(path) in active_roots:
        return "active worker workspace"
    # The supervisor executes from a release worktree. Removing one pulls the
    # code out from under the running process.
    if _path_is_within(path, repo_root / ".artifacts" / "releases"):
        return "release snapshot"
    return None


def _cleanup_registered_worker_worktrees(
    config: dict[str, Any],
    state: dict[str, Any],
    settings: dict[str, Any] | None,
    *,
    respect_retention: bool,
) -> dict[str, Any]:
    try:
        repo_root = config_path(config, "status_file").parent.resolve()
    except KeyError:
        return {
            "checked": 0,
            "removed": 0,
            "skipped": 0,
            "failed": 0,
            "archived": 0,
            "unlocked": 0,
            "errors": ["missing status_file path"],
        }
    if not _worker_worktrees_enabled(config):
        return {
            "checked": 0,
            "removed": 0,
            "skipped": 0,
            "failed": 0,
            "archived": 0,
            "unlocked": 0,
            "errors": ["worker worktrees disabled"],
        }

    cleanup_settings = worktree_cleanup_settings(config, settings)
    if not cleanup_settings.get("enabled", True):
        return {
            "checked": 0,
            "removed": 0,
            "skipped": 0,
            "failed": 0,
            "archived": 0,
            "unlocked": 0,
            "errors": ["worker workspace cleanup disabled"],
        }

    cutoff = None
    if respect_retention:
        retention_seconds = max(0.0, float(cleanup_settings.get("worktree_retention_days", 3.0))) * 86400.0
        cutoff = time.time() - retention_seconds

    max_removed = max(0, int(cleanup_settings.get("max_worktrees_removed_per_tick", 200)))
    active_roots = active_worker_workspace_roots(state)
    checked = removed = skipped = failed = archived = unlocked = 0
    errors: list[str] = []
    warnings: list[str] = []

    for record in sorted(_registered_worktrees(repo_root), key=lambda item: str(item.get("path") or "")):
        if max_removed and removed >= max_removed:
            break
        raw_path = str(record.get("path") or "").strip()
        if not raw_path:
            continue
        path = Path(raw_path).expanduser().resolve()
        if _protected_worktree(path, repo_root, active_roots) is not None:
            continue
        checked += 1
        # A lock is an explicit ownership signal from Git, so it is respected --
        # except for git's own `initializing` marker, which only ever means "an
        # add is in progress" and outlives the add when the supervisor is killed
        # mid-worktree-add. Reclaim those once they are far too old to be real.
        if record.get("locked"):
            released, detail = _release_dead_initializing_lock(
                repo_root, path, record, cleanup_settings
            )
            if released:
                unlocked += 1
                if len(warnings) < 10:
                    warnings.append(f"{path}: {detail}")
            else:
                skipped += 1
                if len(warnings) < 10:
                    reason = str(record.get("locked_reason") or "locked")
                    warnings.append(f"{path}: skipped locked worktree ({reason})")
                    if detail:
                        warnings[-1] += f" [{detail}]"
                continue
        try:
            stat = path.stat()
        except OSError:
            skipped += 1
            continue
        if cutoff is not None and stat.st_mtime > cutoff:
            skipped += 1
            continue
        outcome = _cleanup_registered_worktree(repo_root, path, cleanup_settings)
        if outcome.get("removed"):
            removed += 1
            if outcome.get("archived"):
                archived += 1
            warning = outcome.get("warning")
            if warning and len(warnings) < 10:
                warnings.append(f"{path}: {warning}")
            continue
        failed += 1
        if len(errors) < 10:
            errors.append(f"{path}: {outcome.get('error') or 'cleanup failed'}")

    prune = _git_capture(repo_root, ["worktree", "prune"], timeout=30.0)
    if prune.returncode != 0 and len(errors) < 10:
        errors.append(f"git worktree prune: {(prune.stderr or prune.stdout or '').strip()[:240]}")
    result = {
        "checked": checked,
        "removed": removed,
        "skipped": skipped,
        "failed": failed,
        "archived": archived,
        # Surfaced so a reclaim that only ever unlocks (and never removes) is
        # visible in the disk-guard record instead of reading as "did nothing".
        "unlocked": unlocked,
        "errors": errors,
    }
    if warnings:
        result["warnings"] = warnings
    return result


def prune_stale_worker_worktrees(
    config: dict[str, Any],
    state: dict[str, Any],
    settings: dict[str, Any] | None,
) -> dict[str, Any]:
    return _cleanup_registered_worker_worktrees(
        config,
        state,
        settings,
        respect_retention=True,
    )


def release_inactive_worker_worktrees(
    config: dict[str, Any],
    state: dict[str, Any],
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return _cleanup_registered_worker_worktrees(
        config,
        state,
        settings,
        respect_retention=False,
    )


def cleanup_inactive_worker_worktrees(
    config: dict[str, Any],
    state: dict[str, Any],
) -> bool:
    """Run inactive-worktree cleanup as throttled maintenance, not per poll."""
    settings = worktree_cleanup_settings(config)
    interval = max(1.0, float(settings.get("release_interval_seconds", 60.0)))
    maintenance = state.setdefault("maintenance", {}).setdefault(
        "worker_workspace_cleanup", {}
    )
    now = datetime.now(timezone.utc)
    last_attempt = parse_iso_utc(maintenance.get("last_attempt_at"))
    if last_attempt is not None and (now - last_attempt).total_seconds() < interval:
        return False

    maintenance["last_attempt_at"] = now.replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )
    cleanup_result = release_inactive_worker_worktrees(config, state, settings)
    maintenance["last_result"] = cleanup_result
    unlocked = int(cleanup_result.get("unlocked") or 0)
    if int(cleanup_result.get("removed") or 0) > 0 or unlocked > 0:
        archived = int(cleanup_result.get("archived") or 0)
        message = f"Released {cleanup_result.get('removed')} inactive auto worktree(s)"
        if archived > 0:
            message += f" after archiving {archived} dirty worktree(s)"
        if unlocked > 0:
            message += (
                f"; reclaimed {unlocked} worktree(s) stranded by an interrupted "
                "`git worktree add`"
            )
        if int(cleanup_result.get("failed") or 0) > 0:
            message += f"; {cleanup_result.get('failed')} cleanup failure(s) remain"
        write_activity_log(
            config,
            {
                "type": "worker_workspace_cleanup",
                "message": message,
                "checked": cleanup_result.get("checked"),
                "removed": cleanup_result.get("removed"),
                "skipped": cleanup_result.get("skipped"),
                "failed": cleanup_result.get("failed"),
                "archived": cleanup_result.get("archived"),
                "unlocked": cleanup_result.get("unlocked"),
                "errors": cleanup_result.get("errors"),
            },
        )
    return True


def _disk_guard_should_cleanup(record: dict[str, Any], settings: dict[str, Any], snapshot: dict[str, Any]) -> bool:
    if float(snapshot.get("usage_percent") or 0.0) >= float(settings.get("cleanup_usage_percent", 85.0)):
        return True
    last_cleanup = parse_iso_utc(record.get("last_cleanup_at"))
    if last_cleanup is None:
        return True
    return (datetime.now(timezone.utc) - last_cleanup).total_seconds() >= float(
        settings.get("cleanup_interval_seconds", 3600.0)
    )
