import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "tools" / "ci" / "check_test_coverage.py"

WORKFLOW = """jobs:
  checks:
    steps:
      - run: python3 -m unittest tools/ci/test_named_directly.py
      - run: python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py'
"""

CASE = """import unittest


class Covered(unittest.TestCase):
    def test_ok(self) -> None:
        self.assertTrue(True)
"""


class CheckTestCoverageTests(unittest.TestCase):
    def fixture(self, tmpdir: str) -> Path:
        """A git repo whose workflow runs one named file and one discovery root."""
        root = Path(tmpdir) / "repo"
        (root / ".github" / "workflows").mkdir(parents=True)
        (root / ".github" / "workflows" / "ci.yml").write_text(WORKFLOW, encoding="utf-8")
        (root / "tools" / "ci").mkdir(parents=True)
        (root / "tools" / "ci" / "test_named_directly.py").write_text(CASE, encoding="utf-8")
        (root / "tools" / "development-orchestrator").mkdir(parents=True)
        (root / "tools" / "development-orchestrator" / "test_discovered.py").write_text(CASE, encoding="utf-8")
        self.commit(root)
        return root

    def commit(self, root: Path) -> None:
        if not (root / ".git").exists():
            subprocess.run(["git", "init", "-q", str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(root), "-c", "user.name=t", "-c",
                        "user.email=t@example.invalid", "commit", "-qm", "fixture"], check=True)

    def run_check(self, root: Path) -> subprocess.CompletedProcess:
        return subprocess.run([str(SCRIPT), "--repo-root", str(root)],
                              capture_output=True, text=True, check=False)

    def test_a_covered_tree_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            result = self.run_check(self.fixture(tmpdir))
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_a_test_file_on_no_discovery_path_fails(self) -> None:
        """The tools/ci/git/ shape: no discovery root covers it."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            (root / "tools" / "ci" / "git").mkdir()
            (root / "tools" / "ci" / "git" / "test_stranded.py").write_text(CASE, encoding="utf-8")
            self.commit(root)

            result = self.run_check(root)

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("tools/ci/git/test_stranded.py", result.stderr)
            self.assertIn("on no path CI runs", result.stderr)

    def test_bare_test_functions_without_a_testcase_fail(self) -> None:
        """The control_plane/tests/test_lane_health.py shape.

        Three pytest-style functions in a unittest-discovered tree. The module
        imported cleanly, discovery reported no tests, the suite stayed green,
        and the only tests for the predicate at the centre of the lane-pause
        fault had never run.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            (root / "tools" / "development-orchestrator" / "test_silent.py").write_text(
                "def test_one() -> None:\n    assert True\n\n\n"
                "def test_two() -> None:\n    assert True\n", encoding="utf-8")
            self.commit(root)

            result = self.run_check(root)

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("test_silent.py", result.stderr)
            self.assertIn("2 bare test function", result.stderr)

    def test_bare_functions_beside_a_non_testcase_class_still_fail(self) -> None:
        """A helper class is not a collector.

        The first version treated the presence of any class as proof the module
        was collected, so bare tests sharing a file with a plain helper passed
        silently -- a hand-written proxy for a fact that can be measured.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            (root / "tools" / "development-orchestrator" / "test_mixed.py").write_text(
                "class Helper:\n    pass\n\n\ndef test_never_runs() -> None:\n    assert True\n",
                encoding="utf-8")
            self.commit(root)

            result = self.run_check(root)

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("test_mixed.py", result.stderr)

    def test_a_directory_discovery_cannot_enter_fails(self) -> None:
        """Being under the discovery root is not the same as being reachable.

        unittest descends only into importable packages. A subdirectory with no
        __init__.py is skipped in silence, and a path-prefix rule cannot tell.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            nested = root / "tools" / "development-orchestrator" / "nested"
            nested.mkdir()
            (nested / "test_unreachable.py").write_text(CASE, encoding="utf-8")
            self.commit(root)

            result = self.run_check(root)

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("test_unreachable.py", result.stderr)
            self.assertIn("__init__.py", result.stderr)

    def test_a_real_test_file_is_not_dropped_by_its_name(self) -> None:
        """tools/development-orchestrator/test_node_modules_health.py.

        The first version excluded paths containing `node_modules` by substring,
        so this real, passing, tracked test file was dropped from its own scan.
        The checker built to catch silently skipped tests silently skipped one.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            target = root / "tools" / "development-orchestrator" / "test_node_modules_health.py"
            target.write_text("def test_bare() -> None:\n    assert True\n", encoding="utf-8")
            self.commit(root)

            result = self.run_check(root)

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("test_node_modules_health.py", result.stderr)

    def test_untracked_copies_are_not_scanned(self) -> None:
        """Release worktrees and extracted bundles are untracked, so git leaves
        them out and no exclusion list has to guess."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            copy = root / "tools" / "development-orchestrator" / "vendored"
            copy.mkdir()
            (copy / "test_vendored.py").write_text(CASE, encoding="utf-8")

            result = self.run_check(root)

            self.assertEqual(result.returncode, 0, result.stderr)

    def test_a_workflow_that_runs_no_tests_fails_loudly(self) -> None:
        """The checker reads CI's own definition of what it runs. If that read
        comes back empty the answer is not `everything is covered`."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            (root / ".github" / "workflows" / "ci.yml").write_text("jobs: {}\n", encoding="utf-8")
            self.commit(root)

            result = self.run_check(root)

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("no unittest invocation", result.stderr)


if __name__ == "__main__":
    unittest.main()
