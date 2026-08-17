#!/usr/bin/env python3
"""Manage immutable orchestrator releases without deleting live evidence."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


SOURCE_ROOT = Path(__file__).resolve().parents[3]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return {"schema_version": 1, "active": None, "previous": []}
    return json.loads(path.read_text(encoding="utf-8"))


def release_dirs(releases_dir: Path) -> list[Path]:
    return sorted(
        # Pointers such as `current` and `active` resolve as directories, but
        # are selectors rather than releasable worktrees.
        (entry for entry in releases_dir.iterdir() if entry.is_dir() and not entry.is_symlink()),
        key=lambda entry: entry.stat().st_mtime,
        reverse=True,
    ) if releases_dir.exists() else []


def registered_worktree_paths(repo_root: Path) -> set[Path]:
    result = subprocess.run(
        ["git", "-C", str(repo_root), "worktree", "list", "--porcelain"],
        check=False, capture_output=True, text=True,
    )
    return {
        Path(line.removeprefix("worktree ")).resolve()
        for line in result.stdout.splitlines() if line.startswith("worktree ")
    }


def protected_names(manifest: dict, releases_dir: Path, keep: int) -> set[str]:
    names = {name for name in [manifest.get("active"), *manifest.get("previous", [])] if name}
    # Multiple pointers can coexist during the migration from the legacy
    # `current` selector. Preserve every pointed-to release, not just the one
    # named in the mutable manifest.
    if releases_dir.exists():
        for pointer in releases_dir.iterdir():
            if pointer.is_symlink():
                names.add(pointer.resolve().name)
    names.update(entry.name for entry in release_dirs(releases_dir)[:keep])
    return names


def write_manifest(path: Path, manifest: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temp.replace(path)


def activation_lock(releases_dir: Path):
    releases_dir.mkdir(parents=True, exist_ok=True)
    return (releases_dir / ".activation.lock").open("a+", encoding="utf-8")


def release_is_on_integration_branch(target: Path, repo_root: Path, integration_ref: str) -> tuple[bool, str]:
    """Is the commit this release runs reachable from the branch we review?

    A release is a git worktree pinned at a SHA, and nothing required that SHA
    to be on the integration branch. On 2026-08-15 the pointer walked through a
    local refactor series and stopped on a commit reachable only from a branch
    named chore/backup-before-dev-sync. For two days what ran in production and
    what got reviewed were different code: every control-plane fix had to be
    written twice against structurally different trees, and one port was
    silently mis-merged into the wrong function while git reported success.

    "What runs" and "what is reviewed" have to be one answer, so this asks the
    question at the only moment it can still be cheap -- before activation.
    """
    head = subprocess.run(
        ["git", "-C", str(target), "rev-parse", "HEAD"],
        check=False, capture_output=True, text=True,
    )
    if head.returncode != 0:
        return False, f"release is not a git worktree: {(head.stderr or '').strip()}"
    sha = head.stdout.strip()
    resolved = subprocess.run(
        ["git", "-C", str(repo_root), "rev-parse", "--verify", "--quiet", integration_ref],
        check=False, capture_output=True, text=True,
    )
    if resolved.returncode != 0:
        return False, f"integration ref {integration_ref} could not be resolved"
    reachable = subprocess.run(
        ["git", "-C", str(repo_root), "merge-base", "--is-ancestor", sha, integration_ref],
        check=False, capture_output=True, text=True,
    )
    if reachable.returncode != 0:
        return False, (
            f"release commit {sha[:12]} is not reachable from {integration_ref}; "
            "merge it there first, or pass --skip-verify for an emergency rollback"
        )
    return True, f"{sha[:12]} is on {integration_ref}"


def verify_release(target: Path, repo_root: Path, integration_ref: str) -> tuple[bool, str]:
    """Check a candidate release is fit to activate, before it goes live.

    Activation used to be a pure symlink flip, so a release was only ever as
    good as whatever ran before the worktree was built. That is how a refactor
    that deleted a load-bearing dispatch guard reached production: it was pinned
    from a local branch, and the first thing to exercise the chair-review path
    afterwards was the live control plane, which then spun on it for three days.
    The tests live inside the release tree, so this checks the artifact being
    activated rather than the developer's checkout.
    """
    tests_dir = target / "tools" / "development-orchestrator"
    if not tests_dir.is_dir():
        return False, f"release has no orchestrator tree at {tests_dir}"
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", ".", "-p", "test_*.py"],
        cwd=tests_dir, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        tail = "\n".join((proc.stderr or proc.stdout or "").strip().splitlines()[-15:])
        return False, f"orchestrator tests failed in the candidate release:\n{tail}"
    summary = [ln for ln in (proc.stderr or "").splitlines() if ln.startswith("Ran ")]
    on_branch, branch_detail = release_is_on_integration_branch(target, repo_root, integration_ref)
    if not on_branch:
        return False, branch_detail
    return True, f"{summary[0] if summary else 'tests passed'}; {branch_detail}"


def activate(args: argparse.Namespace) -> int:
    target = args.releases_dir / args.release
    if not target.is_dir() or not target.name.startswith("orchestrator-"):
        print(f"ERROR: release does not exist: {target}", file=sys.stderr)
        return 2
    if args.skip_verify:
        # Kept for emergency rollback: reverting to a known-good release must
        # never be blocked by its test suite failing to run.
        print("WARNING: skipping release verification (--skip-verify)", file=sys.stderr)
    else:
        ok, detail = verify_release(target, args.repo_root, args.integration_ref)
        if not ok:
            print(f"ERROR: refusing to activate {target.name}: {detail}", file=sys.stderr)
            return 3
        print(f"verified {target.name}: {detail}")
    with activation_lock(args.releases_dir) as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        manifest = load_manifest(args.manifest)
        old_active = manifest.get("active")
        previous = [name for name in [old_active, *manifest.get("previous", [])] if name and name != target.name]
        manifest.update({"schema_version": 1, "active": target.name, "previous": previous[:2], "activated_at": now()})
        pointer = args.releases_dir / args.pointer_name
        temporary = args.releases_dir / f".{args.pointer_name}.tmp"
        if temporary.exists() or temporary.is_symlink():
            temporary.unlink()
        temporary.symlink_to(target.name)
        temporary.replace(pointer)
        write_manifest(args.manifest, manifest)
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


def prune(args: argparse.Namespace) -> int:
    manifest = load_manifest(args.manifest)
    protected = protected_names(manifest, args.releases_dir, args.keep)
    worktrees = registered_worktree_paths(args.repo_root)
    candidates = []
    for release in release_dirs(args.releases_dir):
        reason = None
        cleanup_action = "none"
        age_seconds = max(0, datetime.now(timezone.utc).timestamp() - release.stat().st_mtime)
        if release.name in protected:
            reason = "retained_by_policy"
        elif age_seconds < args.min_age_hours * 3600:
            reason = "grace_period"
        else:
            release_path = release.resolve()
            nested_worktrees = [path for path in worktrees if release_path in path.parents]
            is_worktree = release_path in worktrees
            status = subprocess.run(
                ["git", "-C", str(release), "status", "--porcelain"],
                check=False, capture_output=True, text=True,
            )
            if nested_worktrees:
                reason = "nested_git_worktree"
            elif status.returncode != 0:
                reason = "unreadable_git_worktree"
            elif status.stdout.strip():
                reason = "dirty_git_worktree"
            elif is_worktree:
                cleanup_action = "git_worktree_remove"
            else:
                reason = "unregistered_directory"
        candidates.append({"release": release.name, "path": str(release), "age_seconds": int(age_seconds), "eligible": reason is None, "reason": reason, "cleanup_action": cleanup_action})

    payload = {"ts": now(), "mode": "apply" if args.apply else "dry_run", "protected": sorted(protected), "releases": candidates}
    args.audit_log.parent.mkdir(parents=True, exist_ok=True)
    with args.audit_log.open("a", encoding="utf-8") as audit:
        audit.write(json.dumps(payload, sort_keys=True) + "\n")
    print(json.dumps(payload, indent=2, sort_keys=True))

    if args.apply:
        for candidate in candidates:
            if candidate["eligible"]:
                result = subprocess.run(
                    ["git", "-C", str(args.repo_root), "worktree", "remove", candidate["path"]],
                    check=False, capture_output=True, text=True,
                )
                if result.returncode != 0:
                    print(f"ERROR: failed to remove {candidate['release']}: {result.stderr.strip()}", file=sys.stderr)
                    return result.returncode
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--artifact-root", type=Path)
    parser.add_argument("--keep", type=int, default=3, help="active/rollback releases retained by recency")
    parser.add_argument("--min-age-hours", type=float, default=24, help="never remove a release newer than this grace period")
    parser.add_argument("--apply", action="store_true", help="delete eligible releases; default is dry-run")
    subparsers = parser.add_subparsers(dest="command", required=True)
    activate_parser = subparsers.add_parser("activate", help="atomically select an existing release")
    activate_parser.add_argument(
        "--pointer-name",
        default="current",
        choices=("active", "current"),
        help="release selector to update; `active` is reserved for the live systemd service",
    )
    activate_parser.add_argument(
        "--integration-ref",
        default="origin/dev",
        help="branch the release must be reachable from; keeps what runs and what is reviewed identical",
    )
    activate_parser.add_argument(
        "--skip-verify",
        action="store_true",
        help="activate without running the candidate release's tests (emergency rollback only)",
    )
    activate_parser.add_argument("release")
    subparsers.add_parser("prune", help="list or remove releases no longer protected")
    args = parser.parse_args()
    args.repo_root = args.repo_root.resolve()
    args.artifact_root = (args.artifact_root or Path(os.environ.get("ORCH_ARTIFACT_ROOT", args.repo_root / ".artifacts"))).resolve()
    args.releases_dir = args.artifact_root / "releases"
    args.manifest = args.artifact_root / "orchestrator-release.json"
    args.audit_log = args.artifact_root / ".orchestrator" / "release-lifecycle.jsonl"
    if args.keep < 1:
        parser.error("--keep must be at least 1")
    if args.min_age_hours < 0:
        parser.error("--min-age-hours cannot be negative")
    return activate(args) if args.command == "activate" else prune(args)


if __name__ == "__main__":
    raise SystemExit(main())
