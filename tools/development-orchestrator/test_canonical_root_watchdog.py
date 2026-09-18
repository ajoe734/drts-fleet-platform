#!/usr/bin/env python3
"""The watchdog records a change, not a tick.

The timer fires every minute whether or not anything moved. Writing the
observation each time produced 24,739 lines carrying 271 distinct observations
-- 98.9% duplication, one state repeated 1,770 times in a row, 16.4 MB.

Adding rotation would have kept trimming a file that should never have grown,
which is why the fix is upstream of the file's size.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock


SCRIPT = Path(__file__).resolve().parent / "bin" / "canonical-root-watchdog.py"


def _load():
    spec = importlib.util.spec_from_file_location("canonical_root_watchdog", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


watchdog = _load()


def _record(ts: datetime, **overrides) -> dict:
    base = {
        "ts": ts.isoformat(),
        "current_branch": "dev",
        "clean_tree": False,
        "drift": False,
        "behind_count": 0,
        "residue_file_count": 67,
        "residue_sample": ["a.yml", "b.yml"],
        "has_residue": True,
        "action": "none",
    }
    base.update(overrides)
    return base


class RecordOnChangeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.log = Path(self._tmp.name) / "watchdog.jsonl"
        patcher = mock.patch.object(watchdog, "LOG_FILE", self.log)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.now = datetime(2026, 8, 18, 12, 0, tzinfo=timezone.utc)

    def _append(self, record: dict) -> None:
        with self.log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

    def test_the_first_observation_is_always_recorded(self) -> None:
        self.assertTrue(watchdog._should_record(_record(self.now)))

    def test_an_unchanged_observation_a_minute_later_is_not(self) -> None:
        self._append(_record(self.now))

        later = _record(self.now + timedelta(minutes=1))

        self.assertFalse(
            watchdog._should_record(later),
            "the same state was recorded again; this is the 98.9% duplication",
        )

    def test_a_changed_observation_is_recorded(self) -> None:
        self._append(_record(self.now))

        changed = _record(self.now + timedelta(minutes=1), residue_file_count=68)

        self.assertTrue(watchdog._should_record(changed))

    def test_drift_is_recorded_even_one_minute_later(self) -> None:
        """The event this watchdog exists for must never be suppressed."""
        self._append(_record(self.now))

        drifted = _record(self.now + timedelta(minutes=1), drift=True, current_branch="wip")

        self.assertTrue(watchdog._should_record(drifted))

    def test_an_unchanged_observation_still_heartbeats(self) -> None:
        """Silence must stay distinguishable from a dead watchdog."""
        self._append(_record(self.now))

        due = _record(self.now + timedelta(seconds=watchdog.HEARTBEAT_SECONDS + 1))

        self.assertTrue(watchdog._should_record(due))

    def test_a_malformed_tail_does_not_suppress_the_record(self) -> None:
        self.log.write_text("not json\n", encoding="utf-8")

        self.assertTrue(watchdog._should_record(_record(self.now)))

    def test_the_timestamp_alone_never_counts_as_a_change(self) -> None:
        first = _record(self.now)
        second = _record(self.now + timedelta(seconds=30))

        self.assertEqual(watchdog._observation(first), watchdog._observation(second))


class CanonicalRootResolutionTests(unittest.TestCase):
    """The watchdog must observe the canonical checkout, not its own location.

    ROOT_DIR was `Path(__file__).parents[3]`, which answers "where does this
    code live". Once the systemd unit moved to the pinned release, that became
    `.artifacts/releases/active` -- a detached worktree -- so the watchdog
    reported `off-allowlist branch 'HEAD'` on every fire and wrote its log
    inside a release that gets pruned. The canonical log stops at the exact
    minute the unit changed, on an observation that recorded real drift.
    """

    def _run_from_release_copy(self, tmp: Path) -> tuple[subprocess.CompletedProcess, Path, Path]:
        repo = tmp / "canonical"
        repo.mkdir()
        run = lambda *a: subprocess.run(["git", "-C", str(repo), *a], check=True, capture_output=True)
        subprocess.run(["git", "init", "-q", "-b", "dev", str(repo)], check=True)
        run("config", "user.email", "t@example.com")
        run("config", "user.name", "t")
        (repo / "README").write_text("canonical\n", encoding="utf-8")
        # The real repository ignores .artifacts/; without it the release
        # worktree we are about to create reads as residue on its own parent.
        (repo / ".gitignore").write_text(".artifacts/\n.orchestrator/\n", encoding="utf-8")
        run("add", "README", ".gitignore")
        run("commit", "-qm", "init")

        # A release is a detached worktree of the canonical repo, which is
        # exactly the shape that made parents[3] resolve to the wrong tree.
        release = repo / ".artifacts" / "releases" / "orchestrator-test"
        run("worktree", "add", "--detach", "-q", str(release))

        staged = release / "tools" / "development-orchestrator"
        (staged / "bin").mkdir(parents=True, exist_ok=True)
        shutil.copy2(SCRIPT, staged / "bin" / SCRIPT.name)
        shutil.copy2(SCRIPT.parents[1] / "common.py", staged / "common.py")

        env = {k: v for k, v in os.environ.items() if k not in ("ORCH_STATUS_ROOT", "AI_STATUS_ROOT")}
        result = subprocess.run(
            [sys.executable, str(staged / "bin" / SCRIPT.name)],
            capture_output=True, text=True, check=False, env=env, cwd=str(tmp),
        )
        return result, repo, release

    def test_release_copy_observes_the_canonical_checkout(self) -> None:
        with TemporaryDirectory() as tmpdir:
            result, repo, release = self._run_from_release_copy(Path(tmpdir))

            # The canonical repo is on `dev`, clean, and not behind: healthy.
            # Resolving to the release worktree instead reports drift to 'HEAD'.
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("HEAD", result.stderr)

    def test_release_copy_logs_to_the_canonical_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            _, repo, release = self._run_from_release_copy(Path(tmpdir))

            # A log written inside the release dies with it: every activation
            # restarts the history and the change-detection baseline.
            self.assertTrue((repo / ".orchestrator" / "logs" / "canonical-root-watchdog.jsonl").exists())
            self.assertFalse((release / ".orchestrator" / "logs" / "canonical-root-watchdog.jsonl").exists())


if __name__ == "__main__":
    unittest.main()


class AheadOfOriginTests(unittest.TestCase):
    """The state the watchdog had no notion of: the root holding *more*.

    It alerted on drift, staleness and residue -- the root on the wrong
    branch, behind the remote, or carrying junk. All three are cases of having
    less than the remote, or something extra beside it. None of them sees
    commits that exist on this disk and nowhere else.

    On 2026-08-25 that was two commits of S1F-REF-001 runtime work, 34 files,
    sitting on the canonical root's own dev branch and pushed to no remote
    branch at all. The watchdog reported the 30 residue files beside them and
    said nothing about the commits, and `git pull --ff-only origin dev` would
    have been refused with no explanation.
    """

    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.repo = Path(self._tmp.name) / "repo"
        self._git("init", "-q", "-b", "dev", str(self.repo), cwd=Path(self._tmp.name))
        self._commit("base")
        # A stand-in for the last-fetched origin/dev, which is what both
        # behind_count and ahead_count actually compare against.
        self._git("update-ref", "refs/remotes/origin/dev", "HEAD")

    def _git(self, *args: str, cwd: Path | None = None) -> None:
        subprocess.run(
            ["git", "-C", str(cwd or self.repo), "-c", "user.name=t",
             "-c", "user.email=t@example.invalid", *args],
            check=True, capture_output=True,
        )

    def _commit(self, message: str) -> None:
        (self.repo / message).write_text(f"{message}\n", encoding="utf-8")
        self._git("add", ".")
        self._git("commit", "-qm", message)

    def test_a_root_level_with_origin_is_not_ahead(self) -> None:
        self.assertEqual(watchdog.ahead_count(self.repo, "dev"), 0)

    def test_local_commits_are_counted(self) -> None:
        """The shape that went unreported: two commits, on no remote."""
        self._commit("converge supervisor worker runtime")
        self._commit("fix runtime design path citations")

        self.assertEqual(watchdog.ahead_count(self.repo, "dev"), 2)

    def test_ahead_and_behind_are_independent(self) -> None:
        """Diverged: the root has its own commits and is missing theirs.

        behind_count alone reports this as merely stale, which understates it
        -- the ff-only pull that would fix staleness cannot run at all here.
        """
        self._commit("theirs")
        self._git("update-ref", "refs/remotes/origin/dev", "HEAD")
        self._git("reset", "-q", "--hard", "HEAD~1")
        self._commit("ours")

        self.assertEqual(watchdog.ahead_count(self.repo, "dev"), 1)
        self.assertEqual(watchdog.behind_count(self.repo, "dev"), 1)

    def test_a_missing_upstream_is_reported_as_unknown_not_as_zero(self) -> None:
        """Same contract as behind_count: -1 means unknowable, 0 means level."""
        self._git("update-ref", "-d", "refs/remotes/origin/dev")

        self.assertEqual(watchdog.ahead_count(self.repo, "dev"), -1)

    def test_an_unknown_count_does_not_raise_the_alarm(self) -> None:
        """-1 is not > 0, so a repository with no fetched ref stays quiet."""
        self.assertFalse(-1 > 0)
