import json
import unittest
from control_plane.infra.worker_failure_detector import detect_failure_signal_in_lines


class AntigravityFailureProvenanceTests(unittest.TestCase):
    quota = "........[2026-09-12 00:39:52] quota pause: agent=codex2 reset_in=14400s reason=You've hit your usage limit. Resets in 96h."

    def step(self, step_type, state="DONE"):
        return json.dumps({"event": "step_update", "step_update": {
            "step_type": step_type, "state": state, "tool_name": "run_command",
            "tool_info": {"parameters": {"CommandLine": "python3 -m unittest test_chair_review"},
                          "output": self.quota},
            "text": "API Error: 401 Unauthorized",
        }})

    def test_in_flight_tool_output_never_pauses_reader(self):
        # Live scans happen before a terminal result; test stdout is task data.
        for state in ("ACTIVE", "DONE", "ERROR"):
            with self.subTest(state=state):
                self.assertIsNone(detect_failure_signal_in_lines([self.step("tool", state)]))

    def test_prompts_and_responses_are_not_provider_errors(self):
        for kind in ("user_input", "agent_response"):
            with self.subTest(kind=kind):
                self.assertIsNone(detect_failure_signal_in_lines([self.step(kind)]))

    def test_native_rejection_after_tool_output_still_pauses(self):
        for error in ("Error: Individual quota reached. Resets in 61h.", "API Error: 401 Unauthorized"):
            with self.subTest(error=error):
                event = json.dumps({"event": "result", "result": {"status": "ERROR", "error": error}})
                signal = detect_failure_signal_in_lines([self.step("tool"), event])
                self.assertIsNotNone(signal)
                self.assertEqual(signal.reason, error)
                self.assertTrue(signal.provider_pause_authorized)

    def test_stream_error_step_still_detected(self):
        event = json.dumps({"event": "step_update", "step_update": {
            "step_type": "error_message", "error_message": "Error: Individual quota reached"}})
        signal = detect_failure_signal_in_lines([self.step("tool"), event])
        self.assertIsNotNone(signal)
        self.assertTrue(signal.provider_pause_authorized)

    def test_raw_rejection_after_tool_output_still_detected(self):
        signal = detect_failure_signal_in_lines([self.step("tool"), "Error: Individual quota reached"])
        self.assertIsNotNone(signal)
        self.assertEqual(signal.source, "raw_process_line")
        self.assertTrue(signal.provider_pause_authorized)
