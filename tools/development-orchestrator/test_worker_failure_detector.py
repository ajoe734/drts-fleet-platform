import json
import unittest

from control_plane.infra.worker_failure_detector import detect_failure_signal_in_lines


class CodexFailureProvenanceTests(unittest.TestCase):
    error = (
        "2026-09-08T23:53:27.154685Z ERROR "
        "codex_api::endpoint::responses_websocket: failed to connect to websocket: "
        "HTTP error: 401 Unauthorized"
    )

    def test_captured_other_lane_failure_does_not_pause_reader(self):
        digest = "DIGEST " + json.dumps({
            "provider_pauses": {"codex": {"reason": self.error}},
        })
        for event in ("item.started", "item.updated", "item.completed"):
            for item_type in ("command_execution", "agent_message", "reasoning", "mcp_tool_call"):
                with self.subTest(event=event, item_type=item_type):
                    line = json.dumps({"type": event, "item": {
                        "type": item_type, "aggregated_output": digest,
                        "text": "Failed to authenticate. API Error: 401",
                    }})
                    self.assertIsNone(detect_failure_signal_in_lines([line]))

    def test_real_runtime_failure_after_tool_output_still_pauses(self):
        line = json.dumps({"type": "item.completed", "item": {
            "type": "command_execution", "aggregated_output": self.error,
        }})
        signal = detect_failure_signal_in_lines([line, self.error])
        self.assertIsNotNone(signal)
        self.assertEqual(signal.reason, self.error)
        self.assertTrue(signal.provider_pause_authorized)

    def test_explicit_error_events_remain_detectable(self):
        for payload in (
            {"type": "error", "message": "Error: authentication token has been invalidated"},
            {"type": "turn.failed", "error": {"message": "reason: refresh_token_reused"}},
            {"type": "item.completed", "item": {
                "type": "error", "message": "Error: authentication token has been invalidated",
            }},
        ):
            with self.subTest(payload=payload):
                signal = detect_failure_signal_in_lines([json.dumps(payload)])
                self.assertIsNotNone(signal)
                self.assertTrue(signal.provider_pause_authorized)


if __name__ == "__main__":
    unittest.main()
