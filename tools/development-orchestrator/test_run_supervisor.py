from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RUNNER = ROOT / "tools" / "development-orchestrator" / "bin" / "run-supervisor.sh"


class RunSupervisorTests(unittest.TestCase):
    def test_user_local_bin_is_available_to_supervisor(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            status_root = root / "status"
            home = root / "home"
            fake_bin = status_root / ".orchestrator" / "bin"
            fake_bin.mkdir(parents=True)
            (home / ".local" / "bin").mkdir(parents=True)
            fake_python = fake_bin / "python3"
            fake_python.write_text(
                "#!/bin/sh\n"
                "printf 'cwd=%s\\n' \"$PWD\"\n"
                "printf 'path=%s\\n' \"$PATH\"\n",
                encoding="utf-8",
            )
            fake_python.chmod(0o755)
            env = os.environ.copy()
            env.update({"HOME": str(home), "ORCH_STATUS_ROOT": str(status_root)})

            result = subprocess.run(
                [str(RUNNER), "--config", str(status_root / ".orchestrator" / "config.json")],
                check=True,
                capture_output=True,
                text=True,
                env=env,
            )

        lines = dict(line.split("=", 1) for line in result.stdout.splitlines())
        self.assertEqual(lines["cwd"], str(status_root))
        path_entries = lines["path"].split(os.pathsep)
        self.assertEqual(path_entries[0], str(status_root / ".orchestrator" / "bin" / "node_modules" / ".bin"))
        self.assertEqual(path_entries[1], str(status_root / ".orchestrator" / "bin"))
        self.assertEqual(path_entries[2], str(home / ".local" / "bin"))


if __name__ == "__main__":
    unittest.main()
