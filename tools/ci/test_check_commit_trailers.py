"""Tests for the commit-trailer gate.

The gate is required on every PR and had no tests at all, which is how it came
to reject a commit shape the workflow depends on.
"""
from __future__ import annotations

import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "check_commit_trailers", ROOT / "tools" / "ci" / "git" / "check_commit_trailers.py"
)
checker = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(checker)

COMPLIANT = (
    "TASK-001: do the thing\n\nTask-ID: TASK-001\nLLM-Agent: Claude\nReviewer: someone\n"
)


class ValidateMessageTests(unittest.TestCase):
    def test_a_compliant_message_passes(self) -> None:
        self.assertEqual(checker.validate_message(COMPLIANT), [])

    def test_a_missing_trailer_is_reported(self) -> None:
        errors = checker.validate_message("TASK-001: do the thing\n\nTask-ID: TASK-001\n")
        self.assertTrue([e for e in errors if "LLM-Agent" in e])

    def test_a_conventional_prefix_is_accepted(self) -> None:
        message = COMPLIANT.replace("TASK-001: do", "fix(TASK-001): do", 1)
        self.assertEqual(checker.validate_message(message), [])


class MergeCommitTests(unittest.TestCase):
    """A merge commit authors nothing, and the gate must not demand it does.

    Keeping a branch current means `git merge origin/dev`, which writes a
    subject no author chose, carrying no trailers and reachable by no
    commit-msg hook. Checking merges anyway made keeping a branch current a
    policy violation: the branch went red on a required check with no way back
    to green. `dev` already carries such commits -- 'merge(dev): bring
    origin/dev into codex/elig-be-004 before integration closeout' among them.

    Content is not skipped by skipping the merge: each parent is validated on
    its own when it is in range.
    """

    def _repo(self, tmpdir: str) -> Path:
        repo = Path(tmpdir) / "repo"
        git = ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid"]
        subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
        (repo / "f").write_text("base\n", encoding="utf-8")
        subprocess.run([*git, "add", "f"], check=True)
        subprocess.run([*git, "commit", "-qm", COMPLIANT], check=True)
        subprocess.run([*git, "checkout", "-q", "-b", "side"], check=True)
        (repo / "g").write_text("side\n", encoding="utf-8")
        subprocess.run([*git, "add", "g"], check=True)
        subprocess.run([*git, "commit", "-qm", COMPLIANT.replace("TASK-001", "TASK-002")], check=True)
        subprocess.run([*git, "checkout", "-q", "main"], check=True)
        (repo / "f").write_text("moved on\n", encoding="utf-8")
        subprocess.run([*git, "commit", "-qam", COMPLIANT.replace("TASK-001", "TASK-003")], check=True)
        subprocess.run([*git, "checkout", "-q", "side"], check=True)
        # exactly what `git merge origin/dev` writes: no trailers, no chosen subject
        subprocess.run([*git, "merge", "--no-edit", "main"], check=True, capture_output=True)
        return repo

    def _run(self, repo: Path, base: str, head: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["python3", str(ROOT / "tools" / "ci" / "git" / "check_commit_trailers.py"),
             "--base", base, "--head", head],
            cwd=repo, capture_output=True, text=True, check=False)

    def test_a_branch_that_merged_its_base_still_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = self._repo(tmpdir)
            result = self._run(repo, "main", "HEAD")
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_a_non_compliant_authored_commit_still_fails(self) -> None:
        """Skipping merges must not skip anything an author wrote."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = self._repo(tmpdir)
            git = ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid"]
            (repo / "h").write_text("bad\n", encoding="utf-8")
            subprocess.run([*git, "add", "h"], check=True)
            subprocess.run([*git, "commit", "-q", "--no-verify", "-m", "no task id here"], check=True)
            result = self._run(repo, "main", "HEAD")
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertIn("no task id here", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
