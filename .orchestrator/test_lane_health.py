import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPT = ROOT_DIR / "scripts" / "lane-health.sh"


class LaneHealthScriptTests(unittest.TestCase):
    def run_script(self, env_overrides):
        env = os.environ.copy()
        env.update(env_overrides)
        return subprocess.run(
            [str(SCRIPT)],
            cwd=ROOT_DIR,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_warn_exit_code_can_be_suppressed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            creds = tmp / "creds.json"
            log_file = tmp / "lane-health.jsonl"
            creds.write_text(
                json.dumps(
                    {
                        "claudeAiOauth": {
                            "expiresAt": int((time.time() + 60) * 1000),
                        }
                    }
                ),
                encoding="utf-8",
            )

            result = self.run_script(
                {
                    "LANE_HEALTH_LANES": f"testlane={creds}",
                    "LANE_HEALTH_LOG_FILE": str(log_file),
                    "LANE_HEALTH_WARN_SECONDS": "1800",
                    "LANE_HEALTH_WARN_EXIT_CODE": "0",
                }
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            entries = [
                json.loads(line)
                for line in log_file.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["lane"], "testlane")
            self.assertEqual(entries[0]["status"], "warn")

    def test_missing_credentials_still_fail_even_when_warns_are_suppressed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            missing = tmp / "missing.json"
            log_file = tmp / "lane-health.jsonl"

            result = self.run_script(
                {
                    "LANE_HEALTH_LANES": f"testlane={missing}",
                    "LANE_HEALTH_LOG_FILE": str(log_file),
                    "LANE_HEALTH_WARN_EXIT_CODE": "0",
                }
            )

            self.assertEqual(result.returncode, 2, result.stderr)
            entries = [
                json.loads(line)
                for line in log_file.read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["status"], "missing")


if __name__ == "__main__":
    unittest.main()
