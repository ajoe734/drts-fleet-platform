import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "tools" / "development-orchestrator" / "bin" / "reconcile-canonical-root.py"


class ReconcileCanonicalRootTests(unittest.TestCase):
    def test_clean_repository_produces_empty_inventory(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = Path(tmpdir) / "repo"
            repo.mkdir()
            shutil.copy(ROOT / "repo-classification.json", repo / "repo-classification.json")
            subprocess.run(["git", "init", "-q", str(repo)], check=True)
            subprocess.run(["git", "-C", str(repo), "add", "repo-classification.json"], check=True)
            subprocess.run(
                ["git", "-C", str(repo), "-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "initial"],
                check=True,
            )
            output = Path(tmpdir) / "inventory.json"
            result = subprocess.run(
                [str(SCRIPT), "--repo-root", str(repo), "--output", str(output)],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(payload["change_count"], 0)


if __name__ == "__main__":
    unittest.main()
