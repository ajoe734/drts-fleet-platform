"""Does a completed task's recorded delivery actually exist on the trunk?

Twenty of fifty recorded delivery SHAs were not ancestors of `dev`. Most were
squash-merge, which rewrites the SHA and is fine. At least one task was `done`
with nothing on any branch at all, and `git_commit_exists` could not tell the
difference: a commit on a deleted branch still exists as an object.

`unknown` is deliberately not a failure. A worker worktree frequently has no
trunk ref, and stalling a completion on a ref that was never fetched would trade
a bookkeeping problem for an outage.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "ai_status", ROOT / "tools" / "development-orchestrator" / "bin" / "ai_status.py"
)
assert SPEC is not None and SPEC.loader is not None
ai_status = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ai_status
SPEC.loader.exec_module(ai_status)


class MergeReachabilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.path = Path(self._tmp.name)
        self._git("init", "-q", "-b", "dev")
        self._git("config", "user.email", "t@example.com")
        self._git("config", "user.name", "t")
        (self.path / "a.txt").write_text("1\n", encoding="utf-8")
        self._git("add", "-A")
        self._git("commit", "-q", "-m", "one")
        self.on_trunk = self._git("rev-parse", "HEAD").strip()
        self._original_root = ai_status.ROOT
        ai_status.ROOT = self.path

    def tearDown(self) -> None:
        ai_status.ROOT = self._original_root
        self._tmp.cleanup()

    def _git(self, *args: str) -> str:
        return subprocess.run(
            ["git", *args], cwd=str(self.path), capture_output=True, text=True, check=True
        ).stdout

    def test_a_commit_on_the_trunk_is_verified(self) -> None:
        self.assertEqual(ai_status.merge_reachability(self.on_trunk), "verified")

    def test_a_commit_on_an_abandoned_branch_is_unreachable(self) -> None:
        """The case `git_commit_exists` cannot see: the object is there, the work is not."""
        self._git("checkout", "-q", "-b", "side")
        (self.path / "b.txt").write_text("2\n", encoding="utf-8")
        self._git("add", "-A")
        self._git("commit", "-q", "-m", "two")
        orphan = self._git("rev-parse", "HEAD").strip()
        self._git("checkout", "-q", "dev")
        self._git("branch", "-q", "-D", "side")
        self.assertTrue(ai_status.git_commit_exists(orphan))
        self.assertEqual(ai_status.merge_reachability(orphan), "unreachable")

    def test_a_missing_trunk_ref_is_unknown_not_failure(self) -> None:
        self._git("branch", "-m", "dev", "somewhere-else")
        self.assertEqual(ai_status.merge_reachability(self.on_trunk), "unknown")

    def test_an_unknown_object_is_unknown(self) -> None:
        self.assertEqual(ai_status.merge_reachability("0" * 40), "unknown")

    def test_not_applicable_and_blank_are_unknown(self) -> None:
        self.assertEqual(ai_status.merge_reachability("not_applicable"), "unknown")
        self.assertEqual(ai_status.merge_reachability("   "), "unknown")


if __name__ == "__main__":
    unittest.main()
