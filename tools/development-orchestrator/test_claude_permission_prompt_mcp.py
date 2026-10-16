from __future__ import annotations

import io
import json
import os
import selectors
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import claude_permission_prompt_mcp as bridge


BRIDGE = Path(bridge.__file__)


def frame(message: dict, legacy: bool = False) -> bytes:
    body = json.dumps(message, ensure_ascii=False).encode("utf-8")
    return (f"Content-Length: {len(body)}\r\n\r\n".encode() + body
            if legacy else body + b"\n")


class SubprocessTransportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.config = self.root / "config.json"
        self.config.write_text("{}")
        self.env = {**os.environ, "ORCH_STATUS_ROOT": str(self.root),
                    "AI_STATUS_ROOT": str(self.root)}

    def run_bridge(self, data: bytes):
        return subprocess.run([sys.executable, str(BRIDGE), "--config", str(self.config)],
                              input=data, capture_output=True, env=self.env, timeout=5)

    def decode_responses(self, data: bytes, legacy: bool) -> list[dict]:
        if not legacy:
            self.assertTrue(data.endswith(b"\n"), data)
            return [json.loads(line) for line in data.splitlines()]
        messages = []
        while data:
            header, data = data.split(b"\r\n\r\n", 1)
            self.assertTrue(header.startswith(b"Content-Length: "), header)
            length = int(header.split(b": ")[1])
            body, data = data[:length], data[length:]
            self.assertEqual(len(body), length)
            messages.append(json.loads(body))
        return messages

    def test_initialize_notification_ping_and_list_in_both_framings(self):
        messages = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
                "protocolVersion": "2025-06-18", "capabilities": {},
                "clientInfo": {"name": "hermetic-client", "version": "1"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": "測試🚦", "method": "ping"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/list"},
        ]
        for legacy in (False, True):
            with self.subTest(legacy=legacy):
                proc = self.run_bridge(b"".join(frame(m, legacy) for m in messages))
                self.assertEqual(proc.returncode, 0, proc.stderr)
                self.assertEqual(proc.stderr, b"")
                responses = self.decode_responses(proc.stdout, legacy)
                self.assertEqual([r["id"] for r in responses], [1, "測試🚦", 3])
                self.assertEqual(responses[0]["result"]["serverInfo"]["name"], bridge.SERVER_NAME)
                self.assertEqual(responses[1]["result"], {})
                self.assertEqual(responses[2]["result"]["tools"][0]["name"], bridge.TOOL_NAME)

    def test_response_arrives_before_stdin_eof(self):
        # A communicate()-only probe would miss buffering until EOF.
        with subprocess.Popen([sys.executable, str(BRIDGE), "--config", str(self.config)],
                              stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, env=self.env) as proc:
            try:
                proc.stdin.write(frame({"jsonrpc": "2.0", "id": 7, "method": "initialize"}))
                proc.stdin.flush()
                with selectors.DefaultSelector() as selector:
                    selector.register(proc.stdout, selectors.EVENT_READ)
                    self.assertTrue(selector.select(timeout=3), "initialize blocked with stdin open")
                response = proc.stdout.readline()
                self.assertEqual(json.loads(response)["id"], 7)
                proc.stdin.close()
                self.assertEqual(proc.wait(timeout=3), 0)
                self.assertEqual(proc.stderr.read(), b"")
            finally:
                if proc.poll() is None:
                    proc.kill()
                    proc.wait(timeout=3)

    def test_empty_input_exits_cleanly(self):
        proc = self.run_bridge(b"")
        self.assertEqual((proc.returncode, proc.stdout, proc.stderr), (0, b"", b""))

    def test_tools_call_preserves_allow_deny_and_defer_over_both_transports(self):
        self.config.write_text(json.dumps({
            "paths": {"activity_log": str(self.root / "activity.jsonl"),
                      "approval_queue": str(self.root / "queue.json")},
            "providers": {"claude": {"broker": {"approval_wait_seconds": 0}}}}))
        # Isolate policy lookup from the user's actual settings.
        self.env.update(ORCH_CANONICAL_ROOT=str(self.root), ORCH_WORKSPACE_ROOT=str(self.root))
        for legacy in (False, True):
            with self.subTest(legacy=legacy):
                messages = [{"jsonrpc": "2.0", "id": i, "method": "tools/call", "params": {
                    "name": bridge.TOOL_NAME, "arguments": arguments}}
                    for i, arguments in enumerate((
                        {"tool_name": "Read", "input": {"file_path": "測試.txt"}},
                        {"tool_name": "Edit", "input": {"file_path": "/outside-test-boundary/file"}},
                        {"tool_name": "UnknownTool", "input": {"once": True}}))]
                proc = self.run_bridge(b"".join(frame(m, legacy) for m in messages))
                self.assertEqual(proc.returncode, 0, proc.stderr)
                self.assertEqual(proc.stderr, b"")
                responses = self.decode_responses(proc.stdout, legacy)
                payloads = [json.loads(r["result"]["content"][0]["text"]) for r in responses]
                self.assertEqual([p["behavior"] for p in payloads], ["allow", "deny", "deny"])
                self.assertEqual(payloads[0]["updatedInput"], {"file_path": "測試.txt"})
                self.assertEqual(payloads[2]["message"], "Approval timed out")
                queued = json.loads((self.root / "queue.json").read_text())["pending"]
                self.assertEqual(len(queued), 1 + int(legacy))
                self.assertTrue(all(not item["remember"] for item in queued))

    def test_malformed_or_truncated_input_fails_closed(self):
        for data in (b"{oops}\n", b"\xff\n", b"[]\n", b"null\n",
                     b'{"method":"ping"}', b"Content-Length: nope\r\n\r\n",
                     b"Content-Length: -1\r\n\r\n", b"Content-Length: 0\r\n\r\n",
                     b"Content-Length: 5\r\n\r\n{}", b"Content-Length: 5\r\n",
                     b"Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}"):
            with self.subTest(data=data):
                proc = self.run_bridge(data)
                self.assertNotEqual(proc.returncode, 0)
                self.assertEqual(proc.stdout, b"")
                self.assertIn(b"Invalid MCP stdio input", proc.stderr)
                self.assertNotIn(b"Traceback", proc.stderr)

    def test_unknown_notifications_do_not_emit_responses(self):
        proc = self.run_bridge(frame({"jsonrpc": "2.0", "method": "notifications/cancelled"})
                               + frame({"jsonrpc": "2.0", "id": 4, "method": "ping"}))
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(self.decode_responses(proc.stdout, False),
                         [{"jsonrpc": "2.0", "id": 4, "result": {}}])


class CodecTests(unittest.TestCase):
    def test_fragmented_reads_and_unicode_byte_lengths(self):
        class FragmentedStream(io.RawIOBase):
            def __init__(self, data):
                self.data = io.BytesIO(data)

            def readable(self):
                return True

            def readinto(self, target):
                chunk = self.data.read(min(len(target), 3))
                target[:len(chunk)] = chunk
                return len(chunk)

        payload = {"jsonrpc": "2.0", "id": "中文🚦", "method": "ping"}
        response = {"jsonrpc": "2.0", "id": "中文🚦", "result": {"text": "a\nb"}}
        for legacy in (False, True):
            with self.subTest(legacy=legacy):
                output = io.BytesIO()
                codec = bridge.StdioCodec(io.BufferedReader(FragmentedStream(frame(payload, legacy) * 2)), output)
                self.assertEqual(codec.read_message(), payload)
                codec.write_message(response)
                self.assertEqual(codec.read_message(), payload)
                codec.write_message(response)
                self.assertIsNone(codec.read_message())
                self.assertEqual(output.getvalue(), frame(response, legacy) * 2)

    def test_size_limits_and_framing_cannot_switch_mid_session(self):
        for data in (b"x" * (bridge.StdioCodec.MAX_MESSAGE_BYTES + 1),
                     b"Content-Length: 1048577\r\n\r\n",
                     b"Content-Length: 2\r\nX: " + b"x" * 8192 + b"\r\n\r\n{}"):
            with self.subTest(prefix=data[:50]):
                with self.assertRaises(ValueError):
                    bridge.StdioCodec(io.BytesIO(data), io.BytesIO()).read_message()
        message = {"jsonrpc": "2.0", "id": 1, "method": "ping"}
        for legacy in (False, True):
            codec = bridge.StdioCodec(io.BytesIO(frame(message, legacy) + frame(message, not legacy)), io.BytesIO())
            self.assertEqual(codec.read_message(), message)
            with self.assertRaises(ValueError):
                codec.read_message()


class PermissionDecisionTests(unittest.TestCase):
    def test_original_decisions_and_deferred_request_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = {"paths": {"approval_queue": str(Path(tmp) / "queue.json"),
                                "activity_log": str(Path(tmp) / "activity.jsonl")},
                      "providers": {"claude": {"broker": {"approval_wait_seconds": 0}}}}
            # Only external local settings and waiting for an operator are mocked;
            # evaluate_tool_request, handle_tool_call and queue persistence are real.
            with mock.patch("permission_broker._check_claude_allow_rules", return_value=False), \
                    mock.patch.dict(os.environ, {"ORCH_TASK_ID": "TEST", "ORCH_RUN_ID": "run-test",
                                                 "ORCH_SESSION_ID": "session-test"}):
                for tool_input, expected in (({"command": "pwd"}, "allow"),
                                             ({"command": "git reset --hard"}, "deny")):
                    with mock.patch.object(bridge, "wait_for_decision") as wait:
                        result = bridge.handle_tool_call(config, {"tool_name": "Bash", "input": tool_input})
                        payload = json.loads(result["content"][0]["text"])
                        self.assertEqual(payload["behavior"], expected)
                        if expected == "allow":
                            self.assertEqual(payload["updatedInput"], tool_input)
                        wait.assert_not_called()
                self.assertFalse((Path(tmp) / "queue.json").exists())
                for resolution, expected in (({"decision": "allow"}, "allow"),
                                              ({"decision": "deny", "note": "operator拒絕"}, "deny"),
                                              ({"status": "timeout"}, "deny")):
                    with mock.patch.object(bridge, "wait_for_decision", return_value=resolution) as wait:
                        result = bridge.handle_tool_call(config, {"tool_name": "UnknownTool",
                                                                 "input": {"value": "一次性"}})
                        payload = json.loads(result["content"][0]["text"])
                        self.assertEqual(payload["behavior"], expected)
                        if expected == "allow":
                            self.assertEqual(payload["updatedInput"], {"value": "一次性"})
                        else:
                            self.assertEqual(payload["message"], resolution.get("note")
                                             or "Approval was denied or timed out.")
                        queued = json.loads((Path(tmp) / "queue.json").read_text())["pending"][-1]
                        self.assertFalse(queued["remember"])
                        self.assertEqual((queued["task_id"], queued["worker_run_id"], queued["session_id"]),
                                         ("TEST", "run-test", "session-test"))
                        self.assertEqual(queued["tool_input"], {"value": "一次性"})
                        wait.assert_called_once_with(config, queued["approval_id"], timeout_seconds=0)


if __name__ == "__main__":
    unittest.main()
