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


if __name__ == "__main__":
    unittest.main()
