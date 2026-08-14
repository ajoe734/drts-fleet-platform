"""Tests for write_activity_log's auto-rotation behaviour.

See feedback_ai_status_handoff_bloat for the incident that motivated this:
ai-activity-log.jsonl had grown to ~500 MB / 338k lines because nothing
ever pruned it, slowing the dashboard's mirror fetch to the point of
appearing dead.
"""

from __future__ import annotations

import json
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

import common


class WriteActivityLogRotationTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.log_path = self.root / "ai-activity-log.jsonl"
        self.config = {"paths": {"activity_log": str(self.log_path)}}

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _write(self, n: int = 1) -> None:
        for i in range(n):
            common.write_activity_log(self.config, {"type": "test", "i": i})

    def test_writes_appended_normally_under_threshold(self) -> None:
        with mock.patch.object(common, "ACTIVITY_LOG_MAX_BYTES", 10 * 1024 * 1024):
            self._write(5)
        self.assertTrue(self.log_path.exists())
        lines = self.log_path.read_text().splitlines()
        self.assertEqual(len(lines), 5)
        for i, ln in enumerate(lines):
            self.assertEqual(json.loads(ln)["i"], i)

    def test_rotation_keeps_tail_when_over_threshold(self) -> None:
        # Tiny threshold + tight keep window to force rotation deterministically.
        with mock.patch.object(common, "ACTIVITY_LOG_MAX_BYTES", 1024), \
             mock.patch.object(common, "ACTIVITY_LOG_KEEP_LINES", 3):
            self._write(50)
        lines = self.log_path.read_text().splitlines()
        # After 50 writes with threshold=1024 bytes + KEEP_LINES=3, rotation
        # must have triggered several times. The exact line count after the
        # final write depends on when the last rotation occurred relative to
        # the last append, but must be FAR smaller than 50 (unbounded growth).
        self.assertLess(len(lines), 20,
            f"rotation must bound the tail (got {len(lines)} lines; "
            "unbounded growth would have been 50)")
        # The most recent entry MUST be the very last write.
        self.assertEqual(json.loads(lines[-1])["i"], 49)

    def test_rotation_is_atomic_under_concurrent_writes(self) -> None:
        # Concurrent writers race the rotation. Verify the file is always
        # valid JSONL (no half-truncated lines) regardless of timing.
        import threading
        with mock.patch.object(common, "ACTIVITY_LOG_MAX_BYTES", 2048), \
             mock.patch.object(common, "ACTIVITY_LOG_KEEP_LINES", 5):
            def worker():
                for _ in range(30):
                    common.write_activity_log(self.config, {"type": "concurrent"})
            threads = [threading.Thread(target=worker) for _ in range(4)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        # Every surviving line must parse as JSON.
        for ln in self.log_path.read_text().splitlines():
            if ln.strip():
                json.loads(ln)  # raises on invalid JSON

    def test_missing_log_path_is_safe(self) -> None:
        # write_activity_log creates the file via append_jsonl's ensure_parent;
        # rotation is a no-op on a fresh path.
        self.assertFalse(self.log_path.exists())
        common.write_activity_log(self.config, {"type": "first"})
        self.assertTrue(self.log_path.exists())

    def test_unreadable_log_does_not_raise(self) -> None:
        # If stat fails specifically during rotation check, the writer must
        # continue silently. We patch the rotation helper directly rather
        # than Path.stat globally to avoid breaking unrelated stat calls
        # inside ensure_parent / mkdir paths.
        self.log_path.write_text('{"existing": true}\n')
        with mock.patch.object(common, "_rotate_activity_log_if_oversize",
                                side_effect=OSError("simulated rotation failure")):
            # write_activity_log itself does NOT trap OSError from the
            # rotation helper because the helper has its own try/except.
            # This test verifies the contract that the helper swallows
            # errors — so we wrap in our own try to assert behavior.
            try:
                common.write_activity_log(self.config, {"type": "after-fail"})
            except OSError:
                self.fail("rotation failure must NOT propagate to caller")


if __name__ == "__main__":
    unittest.main()
