from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "repair-claude-symlinks.sh"


class RepairClaudeSymlinksTests(unittest.TestCase):
    def run_script(self, home: Path) -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env["HOME"] = str(home)
        return subprocess.run(
            ["bash", str(SCRIPT)],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_repairs_primary_autoworker_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            source = home / ".claude" / ".credentials.json"
            dest = home / ".claude-autoworker" / ".credentials.json"
            source.parent.mkdir(parents=True)
            dest.parent.mkdir(parents=True)
            source.write_text("primary-token\n", encoding="utf-8")
            dest.write_text("stale-token\n", encoding="utf-8")

            result = self.run_script(home)

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            self.assertTrue(dest.is_symlink())
            self.assertEqual(dest.resolve(), source.resolve())
            backups = list(dest.parent.glob(".credentials.json.bak-pre-symlink-*"))
            self.assertEqual(len(backups), 1)

    def test_unifies_claude2_pair_using_newer_runtime_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            root_creds = home / ".claude2-home" / ".credentials.json"
            runtime_creds = home / ".claude2-home" / ".claude" / ".credentials.json"
            root_creds.parent.mkdir(parents=True)
            runtime_creds.parent.mkdir(parents=True)
            root_creds.write_text("root-old\n", encoding="utf-8")
            runtime_creds.write_text("runtime-new\n", encoding="utf-8")
            os.utime(root_creds, (1, 1))
            os.utime(runtime_creds, (2, 2))

            result = self.run_script(home)

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            self.assertTrue(root_creds.is_symlink())
            self.assertEqual(root_creds.resolve(), runtime_creds.resolve())
            self.assertEqual(runtime_creds.read_text(encoding="utf-8"), "runtime-new\n")
            backups = list(root_creds.parent.glob(".credentials.json.bak-pre-symlink-*"))
            self.assertEqual(len(backups), 1)

    def test_unifies_claude2_pair_using_newer_root_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            root_creds = home / ".claude2-home" / ".credentials.json"
            runtime_creds = home / ".claude2-home" / ".claude" / ".credentials.json"
            root_creds.parent.mkdir(parents=True)
            runtime_creds.parent.mkdir(parents=True)
            root_creds.write_text("root-new\n", encoding="utf-8")
            runtime_creds.write_text("runtime-old\n", encoding="utf-8")
            os.utime(root_creds, (2, 2))
            os.utime(runtime_creds, (1, 1))

            result = self.run_script(home)

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            self.assertTrue(runtime_creds.is_symlink())
            self.assertEqual(runtime_creds.resolve(), root_creds.resolve())
            self.assertEqual(root_creds.read_text(encoding="utf-8"), "root-new\n")
            backups = list(runtime_creds.parent.glob(".credentials.json.bak-pre-symlink-*"))
            self.assertEqual(len(backups), 1)


if __name__ == "__main__":
    unittest.main()
