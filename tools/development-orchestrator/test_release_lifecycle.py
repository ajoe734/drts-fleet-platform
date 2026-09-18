import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "tools" / "development-orchestrator" / "bin" / "release-lifecycle.py"


class ReleaseLifecycleTests(unittest.TestCase):
    def run_script(self, artifact_root: Path, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([str(SCRIPT), "--repo-root", str(ROOT), "--artifact-root", str(artifact_root), *args], capture_output=True, text=True, check=False)

    def test_bare_activate_moves_the_pointer_systemd_reads(self) -> None:
        """The default has to be the pointer that decides what runs.

        `activate` used to take --pointer-name defaulting to `current`, so the
        bare command printed a manifest naming the new release and exited 0
        while systemd -- which reads `active` -- stayed on the old code. A
        deploy could be reported complete without changing anything running.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "releases" / "orchestrator-one").mkdir(parents=True)
            result = self.run_script(root, "activate", "--skip-verify", "orchestrator-one")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root / "releases" / "active").resolve().name, "orchestrator-one")
            self.assertFalse((root / "releases" / "current").exists())
            self.assertEqual(json.loads((root / "orchestrator-release.json").read_text())["active"], "orchestrator-one")
            self.assertEqual(json.loads(result.stdout)["active"], "orchestrator-one")

    def test_pointer_name_option_is_gone(self) -> None:
        """A second selector cannot come back by way of the old flag."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "releases" / "orchestrator-one").mkdir(parents=True)
            result = self.run_script(root, "activate", "--skip-verify", "--pointer-name", "current", "orchestrator-one")
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("--pointer-name", result.stderr)
            self.assertFalse((root / "releases" / "current").exists())
            self.assertFalse((root / "releases" / "active").exists())

    def test_prune_protects_whatever_a_live_pointer_resolves_to(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            for name in ("orchestrator-old", "orchestrator-live"):
                (root / "releases" / name).mkdir(parents=True)
            activated = self.run_script(root, "activate", "--skip-verify", "orchestrator-live")
            self.assertEqual(activated.returncode, 0, activated.stderr)

            result = self.run_script(root, "--keep", "1", "prune")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("orchestrator-live", json.loads(result.stdout)["protected"])

    def test_prune_defaults_to_dry_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            for name in ("orchestrator-old", "orchestrator-new"):
                (root / "releases" / name).mkdir(parents=True)
            self.run_script(root, "activate", "--skip-verify", "orchestrator-new")
            result = self.run_script(root, "--keep", "1", "prune")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((root / "releases" / "orchestrator-old").exists())
            self.assertEqual(json.loads(result.stdout)["mode"], "dry_run")

    def test_registered_worktree_is_reported_as_safe_removal_candidate(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = Path(tmpdir) / "repo"
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            (repo / "README").write_text("release test\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(repo), "add", "README"], check=True)
            subprocess.run(["git", "-C", str(repo), "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"], check=True)
            artifact_root = repo / ".artifacts"
            release = artifact_root / "releases" / "orchestrator-old"
            active_release = artifact_root / "releases" / "orchestrator-new"
            release.parent.mkdir(parents=True)
            subprocess.run(["git", "-C", str(repo), "worktree", "add", "--detach", str(release), "HEAD"], check=True)
            subprocess.run(["git", "-C", str(repo), "worktree", "add", "--detach", str(active_release), "HEAD"], check=True)
            old_timestamp = release.stat().st_mtime - 2 * 86400
            os.utime(release, (old_timestamp, old_timestamp))
            subprocess.run([str(SCRIPT), "--repo-root", str(repo), "--artifact-root", str(artifact_root), "activate", "--skip-verify", "orchestrator-new"], check=True)
            result = subprocess.run([str(SCRIPT), "--repo-root", str(repo), "--artifact-root", str(artifact_root), "--keep", "1", "prune"], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            entry = next(item for item in json.loads(result.stdout)["releases"] if item["release"] == "orchestrator-old")
            self.assertTrue(entry["eligible"])
            self.assertEqual(entry["cleanup_action"], "git_worktree_remove")

    def _repo_with_release(self, tmpdir: str, name: str, *, on_integration_branch: bool = True,
                           tests_pass: bool = True) -> tuple[Path, Path]:
        """A real repo whose release worktree is on, or off, the integration branch."""
        repo = Path(tmpdir) / "repo"
        git = ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid"]
        subprocess.run(["git", "init", "-q", "-b", "dev", str(repo)], check=True)
        (repo / "README").write_text("base\n", encoding="utf-8")
        subprocess.run([*git, "add", "README"], check=True)
        subprocess.run([*git, "commit", "-qm", "base"], check=True)
        if not on_integration_branch:
            # The production shape: a local refactor branch that was pinned as a
            # release and never merged back.
            subprocess.run([*git, "checkout", "-q", "-b", "chore/local-refactor"], check=True)
            (repo / "README").write_text("diverged\n", encoding="utf-8")
            subprocess.run([*git, "commit", "-qam", "local refactor"], check=True)
            subprocess.run([*git, "checkout", "-q", "dev"], check=True)
            target_ref = "chore/local-refactor"
        else:
            target_ref = "dev"
        artifact_root = repo / ".artifacts"
        release = artifact_root / "releases" / name
        release.parent.mkdir(parents=True)
        subprocess.run([*git, "worktree", "add", "-q", "--detach", str(release), target_ref], check=True)
        tests_dir = release / "tools" / "development-orchestrator"
        tests_dir.mkdir(parents=True, exist_ok=True)
        body = "self.assertTrue(True)" if tests_pass else "self.assertTrue(False)"
        (tests_dir / "test_stub.py").write_text(
            "import unittest\n\n\nclass StubTests(unittest.TestCase):\n"
            f"    def test_stub(self) -> None:\n        {body}\n",
            encoding="utf-8")
        return repo, artifact_root

    def test_activate_refuses_a_release_that_is_not_on_the_integration_branch(self) -> None:
        """The release pointer walked off dev and nobody could see it.

        On 2026-08-15 the pointer moved through a local refactor series and
        stopped on a commit reachable only from a branch named
        chore/backup-before-dev-sync. For two days what ran in production and
        what was reviewed were different code, every fix had to be written
        twice, and one port was silently mis-merged. Nothing checked.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, artifact_root = self._repo_with_release(tmpdir, "orchestrator-offdev", on_integration_branch=False)
            result = subprocess.run(
                [str(SCRIPT), "--repo-root", str(repo), "--artifact-root", str(artifact_root),
                 "activate", "--integration-ref", "dev", "orchestrator-offdev"],
                capture_output=True, text=True, check=False)

            self.assertEqual(result.returncode, 3, result.stdout)
            self.assertIn("not reachable from", result.stderr)
            self.assertFalse((artifact_root / "releases" / "active").exists())

    def test_activate_accepts_a_release_on_the_integration_branch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, artifact_root = self._repo_with_release(tmpdir, "orchestrator-ondev", on_integration_branch=True)
            result = subprocess.run(
                [str(SCRIPT), "--repo-root", str(repo), "--artifact-root", str(artifact_root),
                 "activate", "--integration-ref", "dev", "orchestrator-ondev"],
                capture_output=True, text=True, check=False)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((artifact_root / "releases" / "active").resolve().name, "orchestrator-ondev")

    def test_skip_verify_still_allows_an_off_branch_rollback(self) -> None:
        """One gate, one bypass: emergency rollback to an older pinned release
        must not be blocked by either check."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, artifact_root = self._repo_with_release(tmpdir, "orchestrator-offdev", on_integration_branch=False)
            result = subprocess.run(
                [str(SCRIPT), "--repo-root", str(repo), "--artifact-root", str(artifact_root),
                 "activate", "--skip-verify", "orchestrator-offdev"],
                capture_output=True, text=True, check=False)

            self.assertEqual(result.returncode, 0, result.stderr)

    def test_activate_refuses_a_release_whose_tests_fail(self) -> None:
        """Activation was a pure symlink flip, so nothing stood between a broken
        refactor and the live control plane. Verification is the gate that the
        chair-review spin outage went through unimpeded."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, artifact_root = self._repo_with_release(tmpdir, "orchestrator-broken", tests_pass=False)
            result = subprocess.run(
                [str(SCRIPT), "--repo-root", str(repo), "--artifact-root", str(artifact_root),
                 "activate", "--integration-ref", "dev", "orchestrator-broken"],
                capture_output=True, text=True, check=False)

            self.assertEqual(result.returncode, 3, result.stdout)
            self.assertIn("orchestrator tests failed", result.stderr)
            self.assertFalse((artifact_root / "releases" / "active").exists())

    def test_skip_verify_allows_rollback_to_a_release_that_cannot_be_verified(self) -> None:
        """Emergency rollback must never be blocked by a failing test suite."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo, artifact_root = self._repo_with_release(tmpdir, "orchestrator-broken", tests_pass=False)
            result = subprocess.run(
                [str(SCRIPT), "--repo-root", str(repo), "--artifact-root", str(artifact_root),
                 "activate", "--skip-verify", "orchestrator-broken"],
                capture_output=True, text=True, check=False)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((artifact_root / "releases" / "active").resolve().name, "orchestrator-broken")


if __name__ == "__main__":
    unittest.main()
