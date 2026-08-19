#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from control_plane.infra import worktree_maintenance
from control_plane.runtime import supervisor_runtime as supervisor


def _git(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        text=True,
        capture_output=True,
        check=True,
    )


class DiskGuardTests(unittest.TestCase):
    def _repo_config(self, root: Path) -> dict:
        (root / "ai-status.json").write_text('{"tasks":[]}\n', encoding="utf-8")
        return {
            "paths": {
                "status_file": str(root / "ai-status.json"),
                "activity_log": str(root / "ai-activity-log.jsonl"),
                "state_file": str(root / ".orchestrator/state.json"),
            },
            "branch_strategy": {
                "worker_worktrees": {
                    "enabled": True,
                    "root": ".artifacts/worktrees/auto",
                }
            },
            "supervisor": {
                "disk_guard": {
                    "enabled": True,
                    "worktree_retention_days": 3,
                    "max_worktrees_removed_per_tick": 20,
                    "remove_dirty_worktrees": False,
                }
            },
        }

    def _init_repo(self, root: Path) -> None:
        _git(root, "init", "-b", "dev")
        _git(root, "config", "user.email", "test@example.com")
        _git(root, "config", "user.name", "Test User")
        (root / "README.md").write_text("test\n", encoding="utf-8")
        _git(root, "add", "README.md")
        _git(root, "commit", "-m", "init")

    def test_prunes_only_stale_clean_inactive_auto_worktrees(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            base = root / ".artifacts/worktrees/auto"
            clean = base / "codex-old-clean"
            dirty = base / "codex-old-dirty"
            active = base / "codex-old-active"
            _git(root, "worktree", "add", "-b", "codex/old-clean", str(clean), "dev")
            _git(root, "worktree", "add", "-b", "codex/old-dirty", str(dirty), "dev")
            _git(root, "worktree", "add", "-b", "codex/old-active", str(active), "dev")
            (dirty / "scratch.txt").write_text("untracked work\n", encoding="utf-8")
            old = time.time() - 4 * 86400
            for path in (clean, dirty, active):
                os.utime(path, (old, old))

            result = supervisor.prune_stale_worker_worktrees(
                self._repo_config(root),
                {
                    "workers": {
                        "active-run": {
                            "status": "running",
                            "workspace_root": str(active),
                        }
                    }
                },
                {
                    "worktree_retention_days": 3,
                    "max_worktrees_removed_per_tick": 20,
                    "remove_dirty_worktrees": False,
                    "archive_dirty_worktrees": False,
                    "force_remove_dirty_worktrees_after_archive": False,
                },
            )

            self.assertEqual(result["removed"], 1)
            self.assertFalse(clean.exists())
            self.assertTrue(dirty.exists())
            self.assertTrue(active.exists())

    def test_prunes_stale_dirty_worktree_after_archiving_changes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            archive_root = Path(tmpdir) / "archive"
            root.mkdir()
            self._init_repo(root)
            base = root / ".artifacts/worktrees/auto"
            dirty = base / "codex-old-dirty"
            _git(root, "worktree", "add", "-b", "codex/old-dirty", str(dirty), "dev")
            dirty_path = str(dirty.resolve())
            (dirty / "scratch.txt").write_text("untracked work\n", encoding="utf-8")
            old = time.time() - 4 * 86400
            os.utime(dirty, (old, old))

            result = supervisor.prune_stale_worker_worktrees(
                self._repo_config(root),
                {"workers": {}},
                {
                    "worktree_retention_days": 3,
                    "max_worktrees_removed_per_tick": 20,
                    "archive_root": str(archive_root),
                },
            )

            self.assertEqual(result["removed"], 1)
            self.assertEqual(result["archived"], 1)
            self.assertFalse(dirty.exists())
            bundles = sorted(archive_root.iterdir())
            self.assertEqual(len(bundles), 1)
            manifest = json.loads((bundles[0] / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["worktree_path"], dirty_path)
            self.assertEqual((bundles[0] / "files" / "scratch.txt").read_text(encoding="utf-8"), "untracked work\n")

    def test_releases_inactive_auto_worktrees_without_waiting_for_retention(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            archive_root = Path(tmpdir) / "archive"
            root.mkdir()
            self._init_repo(root)
            base = root / ".artifacts/worktrees/auto"
            completed = base / "codex-completed"
            running = base / "codex-running"
            _git(root, "worktree", "add", "-b", "codex/completed", str(completed), "dev")
            _git(root, "worktree", "add", "-b", "codex/running", str(running), "dev")
            (completed / "scratch.txt").write_text("left behind\n", encoding="utf-8")

            result = worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root),
                {
                    "workers": {
                        "completed-run": {
                            "status": "completed",
                            "workspace_root": str(completed),
                        },
                        "running-run": {
                            "status": "running",
                            "workspace_root": str(running),
                        },
                    }
                },
                {"archive_root": str(archive_root)},
            )

            self.assertEqual(result["removed"], 1)
            self.assertEqual(result["archived"], 1)
            self.assertFalse(completed.exists())
            self.assertTrue(running.exists())

    def _locked_marker(self, root: Path, worktree: Path) -> Path:
        gitdir = (worktree / ".git").read_text(encoding="utf-8").strip()
        return Path(gitdir[len("gitdir:"):].strip()) / "locked"

    def _age_the_lock(self, root: Path, worktree: Path, seconds: float) -> None:
        marker = self._locked_marker(root, worktree)
        old = time.time() - seconds
        os.utime(marker, (old, old))

    def test_release_skips_worktree_whose_add_is_still_in_progress(self) -> None:
        """A live `git worktree add` holds `initializing`; do not race it."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            archive_root = Path(tmpdir) / "archive"
            root.mkdir()
            self._init_repo(root)
            locked = root / ".artifacts/worktrees/auto/claude-initializing"
            _git(root, "worktree", "add", "--detach", str(locked), "dev")
            _git(root, "worktree", "lock", "--reason", "initializing", str(locked))
            (locked / "scratch.txt").write_text("unfinished\n", encoding="utf-8")

            result = worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root),
                {"workers": {}},
                {"archive_root": str(archive_root)},
            )

            self.assertEqual(result["removed"], 0)
            self.assertEqual(result["archived"], 0)
            self.assertEqual(result["skipped"], 1)
            self.assertEqual(result["unlocked"], 0)
            self.assertTrue(locked.exists())
            self.assertFalse(archive_root.exists())
            self.assertIn("initializing", " ".join(result["warnings"]))

    def test_release_reclaims_worktree_stranded_by_an_interrupted_add(self) -> None:
        """The leak this used to assert as correct behaviour.

        `git worktree add` sets `locked: initializing` and clears it when the
        add finishes. A supervisor SIGKILLed mid-add never clears it, and the
        old unconditional skip meant the worktree was pinned forever: 21 of
        them held 13 GB, the oldest stranded since 2026-08-05, while the disk
        guard reported `{"checked": 23, "removed": 0, "skipped": 23}`.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            archive_root = Path(tmpdir) / "archive"
            root.mkdir()
            self._init_repo(root)
            stranded = root / ".artifacts/worktrees/auto/claude-stranded"
            _git(root, "worktree", "add", "--detach", str(stranded), "dev")
            _git(root, "worktree", "lock", "--reason", "initializing", str(stranded))
            self._age_the_lock(root, stranded, seconds=48 * 3600)

            result = worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root),
                {"workers": {}},
                {"archive_root": str(archive_root)},
            )

            self.assertEqual(result["unlocked"], 1)
            self.assertEqual(result["removed"], 1)
            self.assertFalse(stranded.exists())
            self.assertIn("dead initializing lock", " ".join(result["warnings"]))

    def test_release_respects_a_deliberate_lock_however_old(self) -> None:
        """Only git's own transient reason expires; `lock --reason` means hands off."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            archive_root = Path(tmpdir) / "archive"
            root.mkdir()
            self._init_repo(root)
            held = root / ".artifacts/worktrees/auto/claude-held"
            _git(root, "worktree", "add", "--detach", str(held), "dev")
            _git(root, "worktree", "lock", "--reason", "keeping for postmortem", str(held))
            self._age_the_lock(root, held, seconds=90 * 24 * 3600)

            result = worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root),
                {"workers": {}},
                {"archive_root": str(archive_root)},
            )

            self.assertEqual(result["unlocked"], 0)
            self.assertEqual(result["removed"], 0)
            self.assertEqual(result["skipped"], 1)
            self.assertTrue(held.exists())

    def test_inactive_worktree_cleanup_is_throttled_between_ticks(self) -> None:
        state: dict = {}
        result = {
            "checked": 1,
            "removed": 0,
            "skipped": 1,
            "failed": 0,
            "archived": 0,
            "errors": [],
        }
        config = {
            "supervisor": {
                "worker_workspace_cleanup": {"release_interval_seconds": 60}
            }
        }

        with mock.patch.object(
            worktree_maintenance, "release_inactive_worker_worktrees", return_value=result
        ) as release:
            self.assertTrue(supervisor.cleanup_inactive_worker_worktrees(config, state))
            self.assertFalse(supervisor.cleanup_inactive_worker_worktrees(config, state))

        release.assert_called_once()
        self.assertEqual(
            state["maintenance"]["worker_workspace_cleanup"]["last_result"],
            result,
        )


def _claim_filename() -> str:
    """The claim file's name, tolerating a build that has no such concept.

    Written this way so the guard fails on the *behaviour* against a parent
    commit -- the tree gets reclaimed -- rather than erroring on a missing
    attribute, which would prove only that the constant is new.
    """
    return getattr(worktree_maintenance, "SESSION_CLAIM_FILENAME", ".orchestrator-session")


class ReclaimCoversEveryWorktreeTests(unittest.TestCase):
    """Reclamation asks which worktrees are load-bearing, not where they live.

    Scoping it to .artifacts/worktrees/auto meant that of 86 registered
    worktrees exactly one was in scope. Workers create review and verification
    trees wherever they are standing -- .artifacts/worktrees/review/,
    .artifacts/review-tmp/, /tmp/<task>-review -- and none of those could ever
    be reclaimed. Enumerating more paths would only move the boundary; the next
    ad-hoc location escapes it again.
    """

    def _repo_config(self, root: Path) -> dict:
        (root / "ai-status.json").write_text('{"tasks":[]}\n', encoding="utf-8")
        return {
            "paths": {
                "status_file": str(root / "ai-status.json"),
                "activity_log": str(root / "ai-activity-log.jsonl"),
                "state_file": str(root / ".orchestrator/state.json"),
            },
            "branch_strategy": {"worker_worktrees": {"enabled": True}},
        }

    def _init_repo(self, root: Path) -> None:
        _git(root, "init", "--quiet", "--initial-branch=dev")
        _git(root, "config", "user.email", "t@example.com")
        _git(root, "config", "user.name", "t")
        (root / "seed.txt").write_text("seed\n", encoding="utf-8")
        _git(root, "add", "seed.txt")
        _git(root, "commit", "--quiet", "-m", "seed")

    def test_a_worktree_outside_the_managed_directory_is_reclaimed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            # The shape workers actually produce: a review tree beside the
            # managed directory rather than inside it.
            stray = root / ".artifacts" / "worktrees" / "review" / "task-verify"
            _git(root, "worktree", "add", "--detach", str(stray), "dev")

            result = worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root), {"workers": {}},
                {"archive_root": str(Path(tmpdir) / "archive")},
            )

            self.assertEqual(result["removed"], 1, "a worktree outside auto/ was left forever")
            self.assertFalse(stray.exists())

    def test_a_worktree_a_session_claimed_is_never_reclaimed(self) -> None:
        """A session standing in a tree is load-bearing too.

        Only dispatched workers register a workspace, so an interactive
        session's tree was reclaimed out from under it -- which left the
        canonical checkout as the only place such a session could safely work,
        and that is how four sessions came to share one working tree and move
        each other's HEAD.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            session = root / ".artifacts" / "worktrees" / "session-chatbox"
            _git(root, "worktree", "add", "--detach", str(session), "dev")
            (session / _claim_filename()).write_text(
                "chatbox\n", encoding="utf-8"
            )

            result = worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root), {"workers": {}},
                {"archive_root": str(Path(tmpdir) / "archive")},
            )

            self.assertTrue(session.exists(), "reclamation removed a session's working tree")
            self.assertEqual(result["removed"], 0)

    def test_releasing_the_claim_returns_the_worktree_to_the_sweep(self) -> None:
        """The claim is a file, so giving the tree back needs no bookkeeping."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            session = root / ".artifacts" / "worktrees" / "session-done"
            _git(root, "worktree", "add", "--detach", str(session), "dev")
            claim = session / _claim_filename()
            claim.write_text("done\n", encoding="utf-8")
            claim.unlink()

            result = worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root), {"workers": {}},
                {"archive_root": str(Path(tmpdir) / "archive")},
            )

            self.assertEqual(result["removed"], 1)
            self.assertFalse(session.exists())

    def test_a_release_snapshot_is_never_reclaimed(self) -> None:
        """The supervisor executes from one of these."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            release = root / ".artifacts" / "releases" / "orchestrator-abc123"
            _git(root, "worktree", "add", "--detach", str(release), "dev")

            result = worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root), {"workers": {}},
                {"archive_root": str(Path(tmpdir) / "archive")},
            )

            self.assertTrue(release.exists(), "reclamation removed the running release")
            self.assertEqual(result["removed"], 0)

    def test_the_canonical_checkout_is_never_reclaimed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)

            worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root), {"workers": {}},
                {"archive_root": str(Path(tmpdir) / "archive")},
            )

            self.assertTrue((root / "seed.txt").exists())

    def test_an_active_workers_tree_is_never_reclaimed_wherever_it_sits(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            live = root / ".artifacts" / "review-tmp" / "in-use"
            _git(root, "worktree", "add", "--detach", str(live), "dev")
            state = {"workers": {"r1": {"status": "running", "workspace_root": str(live.resolve())}}}

            result = worktree_maintenance.release_inactive_worker_worktrees(
                self._repo_config(root), state,
                {"archive_root": str(Path(tmpdir) / "archive")},
            )

            self.assertTrue(live.exists(), "reclamation removed a tree a worker is using")
            self.assertEqual(result["removed"], 0)
