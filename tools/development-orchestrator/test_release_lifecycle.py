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

    def test_activate_creates_manifest_and_current_pointer(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "releases" / "orchestrator-one").mkdir(parents=True)
            result = self.run_script(root, "activate", "orchestrator-one")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((root / "releases" / "current").resolve().name, "orchestrator-one")
            self.assertEqual(json.loads((root / "orchestrator-release.json").read_text())["active"], "orchestrator-one")

    def test_active_pointer_is_isolated_from_legacy_current_pointer(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            for name in ("orchestrator-current", "orchestrator-active"):
                (root / "releases" / name).mkdir(parents=True)
            legacy = self.run_script(root, "activate", "orchestrator-current")
            active = self.run_script(root, "activate", "--pointer-name", "active", "orchestrator-active")
            self.assertEqual(legacy.returncode, 0, legacy.stderr)
            self.assertEqual(active.returncode, 0, active.stderr)
            self.assertEqual((root / "releases" / "current").resolve().name, "orchestrator-current")
            self.assertEqual((root / "releases" / "active").resolve().name, "orchestrator-active")

            result = self.run_script(root, "--keep", "1", "prune")
            self.assertEqual(result.returncode, 0, result.stderr)
            protected = json.loads(result.stdout)["protected"]
            self.assertIn("orchestrator-current", protected)
            self.assertIn("orchestrator-active", protected)

    def test_prune_defaults_to_dry_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            for name in ("orchestrator-old", "orchestrator-new"):
                (root / "releases" / name).mkdir(parents=True)
            self.run_script(root, "activate", "orchestrator-new")
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
            subprocess.run([str(SCRIPT), "--repo-root", str(repo), "--artifact-root", str(artifact_root), "activate", "orchestrator-new"], check=True)
            result = subprocess.run([str(SCRIPT), "--repo-root", str(repo), "--artifact-root", str(artifact_root), "--keep", "1", "prune"], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            entry = next(item for item in json.loads(result.stdout)["releases"] if item["release"] == "orchestrator-old")
            self.assertTrue(entry["eligible"])
            self.assertEqual(entry["cleanup_action"], "git_worktree_remove")


if __name__ == "__main__":
    unittest.main()
