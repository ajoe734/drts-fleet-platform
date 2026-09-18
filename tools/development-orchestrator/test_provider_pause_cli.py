from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
SCRIPT = ROOT_DIR / "tools" / "development-orchestrator" / "bin" / "provider-pause.py"
SPEC = importlib.util.spec_from_file_location("provider_pause_cli", SCRIPT)
cli = importlib.util.module_from_spec(SPEC)
assert SPEC is not None and SPEC.loader is not None
SPEC.loader.exec_module(cli)

FINGERPRINT = "a90ce4e4166b52db38f103ad"


class ProviderPauseCliTests(unittest.TestCase):
    """The repair flow expire_provider_pauses says exists.

    An auth pause is deliberately never cleared by a capability probe: `claude
    auth status` reads stored credentials and can answer "logged in" while the
    real call returns 401. The comment promises "a human or explicit repair
    flow" instead, and none shipped. On 2026-08-17 an expired token paused the
    account behind claude and claude2, the operator re-authenticated, and the
    fleet stayed down for a day because nothing in the tree could remove the
    record.
    """

    def _root(self, tmpdir: str, *, pauses: dict, report: dict | None) -> tuple[Path, Path]:
        root = Path(tmpdir)
        (root / ".orchestrator").mkdir(parents=True)
        config = {
            "agents": {"claude": {"provider": "claude"}, "claude2": {"provider": "claude2"},
                       "gemini": {"provider": "gemini"}},
            "providers": {},
            "paths": {
                "state_file": str(root / ".orchestrator" / "state.json"),
                "provider_capabilities": str(root / ".orchestrator" / "provider_capabilities.json"),
                "event_queue": str(root / ".orchestrator" / "event-queue.json"),
            },
        }
        config_file = root / ".orchestrator" / "config.json"
        config_file.write_text(json.dumps(config), encoding="utf-8")
        (root / ".orchestrator" / "state.json").write_text(
            json.dumps({"provider_pauses": pauses}), encoding="utf-8")
        if report is not None:
            (root / ".orchestrator" / "provider_capabilities.json").write_text(
                json.dumps(report), encoding="utf-8")
        return root, config_file

    def _identity_pause(self) -> dict:
        """The real entry: keyed by account, named after the lane that tripped."""
        return {f"identity:claude2:{FINGERPRINT}": {
            "schema": 3, "scope": "identity", "lane_id": "claude2", "kind": "auth",
            "identity_fingerprint": FINGERPRINT,
            "reason": "401 OAuth access token has expired.",
            "paused_at": "2026-08-17T23:54:59Z", "resume_at": None}}

    def _report(self) -> dict:
        return {"generated_at": "2026-08-19T00:00:00Z", "providers": {
            "claude": {"auth_ready": True, "installed": True,
                       "identity": {"fingerprint": FINGERPRINT}},
            "claude2": {"auth_ready": True, "installed": True,
                        "identity": {"fingerprint": FINGERPRINT}},
            "gemini": {"auth_ready": True, "installed": True,
                       "identity": {"fingerprint": "other"}}}}

    def _run(self, config_file: Path, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run([sys.executable, str(SCRIPT), "--config", str(config_file), *args],
                              capture_output=True, text=True, check=False)

    def test_list_names_every_lane_the_pause_stops(self) -> None:
        """Reading the lanes off the key is what hid this for a day."""
        with tempfile.TemporaryDirectory() as tmpdir:
            _, config_file = self._root(tmpdir, pauses=self._identity_pause(), report=self._report())

            result = self._run(config_file, "list")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("claude, claude2", result.stdout)
            self.assertIn("indefinite", result.stdout)

    def test_clearing_by_lane_name_removes_a_pause_named_after_another_lane(self) -> None:
        """The entry that stops claude is keyed identity:claude2:<fingerprint>.

        Matching on lane_id, as clear_provider_pause does, would report success
        and change nothing. Matching goes through pause_covers_lane instead --
        the predicate the dispatcher uses to refuse the lane in the first place.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root, config_file = self._root(tmpdir, pauses=self._identity_pause(),
                                           report=self._report())

            result = self._run(config_file, "clear", "claude")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("claude, claude2", result.stdout)
            written = json.loads((root / ".orchestrator" / "state.json").read_text())
            self.assertEqual(written.get("provider_pauses"), {})

    def test_a_lane_with_no_pause_is_reported_not_silently_accepted(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root, config_file = self._root(tmpdir, pauses=self._identity_pause(),
                                           report=self._report())

            result = self._run(config_file, "clear", "gemini")

            self.assertEqual(result.returncode, 1)
            self.assertIn("no pause covers gemini", result.stderr)
            written = json.loads((root / ".orchestrator" / "state.json").read_text())
            self.assertIn(f"identity:claude2:{FINGERPRINT}", written["provider_pauses"])

    def test_it_refuses_rather_than_answer_from_an_unreadable_report(self) -> None:
        """Without the report no fingerprint resolves, so every identity-scoped
        pause quietly stops matching and both commands answer confidently and
        wrongly. Refusing is the only honest option."""
        with tempfile.TemporaryDirectory() as tmpdir:
            root, config_file = self._root(tmpdir, pauses=self._identity_pause(), report=None)

            result = self._run(config_file, "clear", "claude")

            self.assertEqual(result.returncode, 2)
            self.assertIn("cannot read the provider capability report", result.stderr)
            written = json.loads((root / ".orchestrator" / "state.json").read_text())
            self.assertIn(f"identity:claude2:{FINGERPRINT}", written["provider_pauses"])


if __name__ == "__main__":
    unittest.main()
