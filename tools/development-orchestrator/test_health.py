from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
SCRIPT_PATH = ROOT_DIR / "tools" / "development-orchestrator" / "bin" / "health.py"
SPEC = importlib.util.spec_from_file_location("health_script", SCRIPT_PATH)
health = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(health)


class HealthScriptTests(unittest.TestCase):
    def test_latest_keepalive_status_prefers_latest_entry_per_lane(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "claude-lane-keepalive.log"
            log_path.write_text(
                "\n".join(
                    [
                        "2026-06-06T14:27:17Z OK lane=claude2 refresh ok",
                        "2026-06-06T14:35:51Z FAIL lane=claude2 rc=1 msg=Failed to authenticate. API Error: 401 Invalid authentication credentials",
                        "2026-06-06T14:36:00Z OK lane=claude refresh ok",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            latest = health.latest_keepalive_status(log_path)

        self.assertEqual(latest["claude"]["result"], "OK")
        self.assertEqual(latest["claude"]["message"], "refresh ok")
        self.assertEqual(latest["claude2"]["result"], "FAIL")
        self.assertEqual(latest["claude2"]["rc"], 1)
        self.assertIn("401", latest["claude2"]["message"])


if __name__ == "__main__":
    unittest.main()
