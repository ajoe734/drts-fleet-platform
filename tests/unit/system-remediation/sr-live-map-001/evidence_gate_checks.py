import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[3] / "e2e/system-remediation/sr-live-map-001/gate-evidence.py"
spec = importlib.util.spec_from_file_location("map_evidence_gate", SCRIPT)
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
SHA = "a" * 40
OUTCOMES = {"runner": "success", "coverage": "success", "browser": "success"}


class EvidenceGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.write("evidence-deployment.json", {"candidate_sha": SHA, "deployed_sha": SHA, "effective_backend": "google", "status": "passed"})
        self.write("evidence-sessions.json", {"candidate_sha": SHA, "status": "passed", "sessions": [
            {"realm": "driver", "actor_type": "driver_user", "actor_id": "drv-demo-002", "scopes": ["driver:read"]},
            {"realm": "ops", "actor_type": "ops_user", "actor_id": "live-map-observer", "scopes": ["regulatory:read"]},
        ]})
        self.write("evidence-map.json", {"candidateSha": SHA, "status": "passed"})
        self.write("evidence-coverage.json", {
            "candidate_sha": SHA, "deployed_sha": SHA, "status": "passed",
            "service_area": [{"case": case, "address": "public landmark", "point": {"lat": 25, "lng": 121}, "basis": "V0049", "expected": {"decision": "serviceable"}, "actual": {"decision": "serviceable"}}
                             for case in ["taipei-core", "airport", "outside-taipei", "outside-airport", "pickup-policy"]],
            "location": [{"case": case, "actual": {"locationFreshness": case}, "waited_ms": 95_000 if case == "stale" else 0}
                         for case in ["fresh", "stale", "low_accuracy", "fresh"]],
        })
        self.write("evidence-browser.json", {
            "candidate_sha": SHA, "deployed_sha": SHA, "status": "passed", "browser": "chromium", "failures": [],
            "pages": [{"path": path, "ready": True, "imagery_decoded": True} for path in ["/dispatch", "/callcenter"]],
        })
        for path in ["map-dispatch.png", "map-callcenter.png"]:
            (self.root / path).write_bytes(b"test screenshot bytes")

    def write(self, path, value):
        (self.root / path).write_text(json.dumps(value))

    def change(self, filename, mutate):
        value = json.loads((self.root / filename).read_text())
        mutate(value)
        self.write(filename, value)

    def reject(self):
        with self.assertRaises((ValueError, OSError)):
            gate.verify(self.root, SHA, OUTCOMES, SHA)

    def test_complete_evidence_passes(self):
        gate.verify(self.root, SHA, OUTCOMES, SHA)

    def test_skip_cannot_pass(self):
        with self.assertRaises(ValueError):
            gate.verify(self.root, SHA, {**OUTCOMES, "browser": "skipped"}, SHA)

    def test_foreign_sha(self):
        self.change("evidence-browser.json", lambda value: value.update(candidate_sha="b" * 40))
        self.reject()

    def test_wrong_deployment(self):
        self.change("evidence-browser.json", lambda value: value.update(deployed_sha="b" * 40))
        self.reject()

    def test_other_runtime_cannot_pass_even_when_all_evidence_agrees(self):
        for filename in ["evidence-deployment.json", "evidence-coverage.json", "evidence-browser.json"]:
            self.change(filename, lambda value: value.update(deployed_sha="b" * 40))
        with self.assertRaises(ValueError):
            gate.verify(self.root, SHA, OUTCOMES, "b" * 40)

    def test_missing_health(self):
        (self.root / "evidence-deployment.json").unlink()
        self.reject()

    def test_unverified_sessions(self):
        self.change("evidence-sessions.json", lambda value: value.update(status="failed"))
        self.reject()

    def test_wrong_session_scope(self):
        self.change("evidence-sessions.json", lambda value: value["sessions"][1].update(scopes=["*"]))
        self.reject()

    def test_failed_status(self):
        self.change("evidence-coverage.json", lambda value: value.update(status="failed"))
        self.reject()

    def test_missing_evidence(self):
        (self.root / "evidence-coverage.json").unlink()
        self.reject()

    def test_missing_service_case(self):
        self.change("evidence-coverage.json", lambda value: value["service_area"].pop())
        self.reject()

    def test_no_real_wait(self):
        self.change("evidence-coverage.json", lambda value: value["location"][1].update(waited_ms=0))
        self.reject()

    def test_location_mismatch(self):
        self.change("evidence-coverage.json", lambda value: value["location"][1]["actual"].update(locationFreshness="fresh"))
        self.reject()

    def test_script_only_is_not_rendering(self):
        self.change("evidence-browser.json", lambda value: value["pages"][0].update(imagery_decoded=False))
        self.reject()

    def test_missing_screenshot(self):
        (self.root / "map-dispatch.png").unlink()
        self.reject()

    def test_google_error(self):
        self.change("evidence-browser.json", lambda value: value.update(failures=["InvalidKeyMapError"]))
        self.reject()


if __name__ == "__main__":
    unittest.main()
