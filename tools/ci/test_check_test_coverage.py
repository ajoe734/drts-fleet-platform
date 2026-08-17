import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "tools" / "ci" / "check_test_coverage.py"

WORKFLOW = """jobs:
  checks:
    steps:
      - run: |
          python3 -m unittest tools/ci/test_named_directly.py
      - run: python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py'
"""

CASE = """import unittest


class Covered(unittest.TestCase):
    def test_ok(self) -> None:
        self.assertTrue(True)
"""


class CheckTestCoverageTests(unittest.TestCase):
    def fixture(self, tmpdir: str) -> Path:
        """A tree whose workflow runs one named file and one discovery root."""
        root = Path(tmpdir)
        workflows = root / ".github" / "workflows"
        workflows.mkdir(parents=True)
        (workflows / "ci.yml").write_text(WORKFLOW, encoding="utf-8")
        (root / "tools" / "ci").mkdir(parents=True)
        (root / "tools" / "ci" / "test_named_directly.py").write_text(CASE, encoding="utf-8")
        (root / "tools" / "development-orchestrator").mkdir(parents=True)
        (root / "tools" / "development-orchestrator" / "test_discovered.py").write_text(CASE, encoding="utf-8")
        return root

    def run_check(self, root: Path) -> subprocess.CompletedProcess:
        return subprocess.run([str(SCRIPT), "--repo-root", str(root)],
                              capture_output=True, text=True, check=False)

    def test_a_covered_tree_passes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            result = self.run_check(self.fixture(tmpdir))
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_a_test_file_on_no_discovery_path_fails(self) -> None:
        """The `tools/ci/git/` shape.

        check_commit_trailers.py lives in tools/ci/git/, which no discover -s
        root covers. A test written beside it would have sat there reading as
        coverage while never executing once. Found by hand on 2026-08-17.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            (root / "tools" / "ci" / "git").mkdir()
            (root / "tools" / "ci" / "git" / "test_stranded.py").write_text(CASE, encoding="utf-8")

            result = self.run_check(root)

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("tools/ci/git/test_stranded.py", result.stderr)
            self.assertIn("on no path CI runs", result.stderr)

    def test_bare_test_functions_without_a_testcase_fail(self) -> None:
        """The `control_plane/tests/test_lane_health.py` shape.

        Three pytest-style functions in a unittest-discovered tree. The module
        imported cleanly, discovery reported no tests, the suite stayed green,
        and the only tests for the predicate at the centre of the lane-pause
        fault had never run.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            (root / "tools" / "development-orchestrator" / "test_silent.py").write_text(
                "def test_one() -> None:\n    assert True\n\n\n"
                "def test_two() -> None:\n    assert True\n",
                encoding="utf-8")

            result = self.run_check(root)

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("test_silent.py", result.stderr)
            self.assertIn("2 bare test function", result.stderr)

    def test_a_workflow_that_runs_no_tests_fails_loudly(self) -> None:
        """The checker reads CI's own definition of what it runs. If that read
        comes back empty the answer is not `everything is covered`."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            (root / ".github" / "workflows" / "ci.yml").write_text("jobs: {}\n", encoding="utf-8")

            result = self.run_check(root)

            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertIn("no unittest invocation", result.stderr)

    def test_worktree_and_release_copies_are_not_scanned(self) -> None:
        """The repo carries release worktrees and extracted bundles under
        .artifacts/ and workspace/. Counting those copies once flooded a scan
        with 892 files from 26 trees."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = self.fixture(tmpdir)
            copy = root / "tools" / "development-orchestrator" / "node_modules" / "pkg"
            copy.mkdir(parents=True)
            (copy / "test_vendored.py").write_text(CASE, encoding="utf-8")

            result = self.run_check(root)

            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
