import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
KEEPALIVE = ROOT / "tools" / "development-orchestrator" / "bin" / "claude-lane-keepalive.sh"
AUTOSTART = ROOT / "tools" / "development-orchestrator" / "bin" / "cf-tunnel-autostart.sh"
INSTALLER = ROOT / "tools" / "development-orchestrator" / "bin" / "install-supervisor-systemd.sh"
SERVICE = ROOT / "tools" / "development-orchestrator" / "systemd" / "drts-supervisor.service"
POINTER = ROOT / "tools" / "development-orchestrator" / "systemd" / "drts-supervisor-release-pointer.conf"


class CliPathScriptTests(unittest.TestCase):
    def test_keepalive_uses_path_claude_without_legacy_wrapper(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            bin_dir = tmp / "bin"
            config_dir = tmp / "claude"
            status_root = tmp / "status"
            log_file = status_root / ".orchestrator" / "logs" / "claude-lane-keepalive.log"
            bin_dir.mkdir()
            config_dir.mkdir()
            fake_claude = bin_dir / "claude"
            fake_claude.write_text("#!/bin/sh\necho ok\n", encoding="utf-8")
            fake_claude.chmod(0o755)
            env = os.environ.copy()
            env.update({
                "PATH": f"{bin_dir}{os.pathsep}{env['PATH']}",
                "ORCH_CLAUDE_LANES": "claude",
                "ORCH_CLAUDE_CONFIG_DIR": str(config_dir),
                "ORCH_STATUS_ROOT": str(status_root),
            })
            result = subprocess.run([str(KEEPALIVE)], cwd=ROOT, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("refresh ok", log_file.read_text(encoding="utf-8"))

    def test_autostart_rejects_missing_cloudflared(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["CLOUDFLARED_BIN"] = str(Path(tmpdir) / "missing")
            result = subprocess.run([str(AUTOSTART)], cwd=ROOT, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 127)
            self.assertIn("cloudflared executable unavailable", result.stderr)

    def test_supervisor_install_uses_merged_release_pointer(self) -> None:
        installer = INSTALLER.read_text(encoding="utf-8")
        service = SERVICE.read_text(encoding="utf-8")
        pointer = POINTER.read_text(encoding="utf-8")

        self.assertIn("merge-base --is-ancestor HEAD origin/dev", installer)
        self.assertIn("release-lifecycle.py", installer)
        self.assertIn("10-release-pointer.conf", installer)
        self.assertNotIn("@REPO_ROOT@/tools/development-orchestrator/bin/run-supervisor.sh", service)
        self.assertIn(".artifacts/releases/current/tools/development-orchestrator/bin/run-supervisor.sh", service)
        self.assertIn("KillMode=control-group", service)
        self.assertNotIn("\nKillMode=mixed\n", service)
        self.assertIn("ExecStart=", pointer)
        self.assertIn(".artifacts/releases/current/tools/development-orchestrator/bin/run-supervisor.sh", pointer)


if __name__ == "__main__":
    unittest.main()
