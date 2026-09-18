"""Tests for write_activity_log's auto-rotation behaviour.

See feedback_ai_status_handoff_bloat for the incident that motivated this:
ai-activity-log.jsonl had grown to ~500 MB / 338k lines because nothing
ever pruned it, slowing the dashboard's mirror fetch to the point of
appearing dead.
"""

from __future__ import annotations

import gzip
import json
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


class RotationPreservesHistoryTests(unittest.TestCase):
    """Rotation must not be truncation.

    The tail-and-drop rotation discarded ~93% of the record at the configured
    50 MB / 10k lines, while SUPERVISOR_OPERATING_MODEL.md described the file
    as append-only history. These pin the archive that closes that gap.
    """

    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.log_path = self.root / "ai-activity-log.jsonl"
        self.config = {"paths": {"activity_log": str(self.log_path)}}

    def _write(self, n: int) -> None:
        for i in range(n):
            common.write_activity_log(self.config, {"type": "test", "i": i})

    def _archived_entries(self) -> list[dict]:
        # Deliberately discovered by globbing rather than by asking common for
        # the archive directory: this test must be able to run against a build
        # that has no archiving at all, and fail because entries are gone --
        # not because a symbol is missing.
        entries: list[dict] = []
        for archive in sorted(self.root.rglob("*.gz")):
            with gzip.open(archive, "rt", encoding="utf-8") as handle:
                entries.extend(json.loads(line) for line in handle if line.strip())
        return entries

    def test_every_entry_dropped_from_the_live_file_survives_in_an_archive(self) -> None:
        with mock.patch.object(common, "ACTIVITY_LOG_MAX_BYTES", 2000):
            with mock.patch.object(common, "ACTIVITY_LOG_KEEP_LINES", 5):
                self._write(60)

        live = [
            json.loads(line)
            for line in self.log_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        archived = self._archived_entries()
        seen = {entry["i"] for entry in live} | {entry["i"] for entry in archived}
        lost = sorted(set(range(60)) - seen)
        self.assertEqual(
            lost,
            [],
            f"{len(lost)} of 60 entries vanished: rotation dropped history "
            f"instead of archiving it (live={len(live)}, archived={len(archived)})",
        )
        self.assertTrue(archived, "rotation kept no archive at all")

    def test_live_file_is_still_bounded_after_rotation(self) -> None:
        """The ceiling is on bytes, and rotation runs before the append.

        So the live file settles just above the threshold rather than at
        KEEP_LINES: it refills to the ceiling, rotates, refills again.
        """
        threshold = 2000
        with mock.patch.object(common, "ACTIVITY_LOG_MAX_BYTES", threshold):
            with mock.patch.object(common, "ACTIVITY_LOG_KEEP_LINES", 5):
                self._write(60)

        size = self.log_path.stat().st_size
        self.assertLessEqual(
            size,
            threshold + 4096,
            "the size ceiling stopped working",
        )
        lines = self.log_path.read_text(encoding="utf-8").splitlines()
        self.assertLess(len(lines), 60, "nothing was ever rotated out of the live file")

    def test_archive_retention_is_bounded(self) -> None:
        with mock.patch.object(common, "ACTIVITY_LOG_MAX_BYTES", 500):
            with mock.patch.object(common, "ACTIVITY_LOG_KEEP_LINES", 2):
                with mock.patch.object(common, "ACTIVITY_LOG_ARCHIVE_KEEP", 3):
                    self._write(120)

        archives = list(common.activity_log_archive_dir(self.log_path).glob("*.gz"))
        self.assertLessEqual(len(archives), 3)
        self.assertTrue(archives, "retention pruned everything")

    def test_live_file_is_untouched_when_the_archive_cannot_be_written(self) -> None:
        """Growing past the ceiling beats destroying what could not be copied."""
        with mock.patch.object(common, "ACTIVITY_LOG_MAX_BYTES", 2000):
            with mock.patch.object(common, "ACTIVITY_LOG_KEEP_LINES", 5):
                self._write(40)
                before = self.log_path.read_text(encoding="utf-8")
                with mock.patch.object(
                    common, "_archive_activity_log", side_effect=OSError("disk full")
                ):
                    self._write(1)

        after = self.log_path.read_text(encoding="utf-8")
        self.assertTrue(after.startswith(before), "a failed archive still truncated the log")

    def test_no_archive_is_written_below_the_threshold(self) -> None:
        with mock.patch.object(common, "ACTIVITY_LOG_MAX_BYTES", 10 * 1024 * 1024):
            self._write(5)

        self.assertFalse(common.activity_log_archive_dir(self.log_path).exists())


if __name__ == "__main__":
    unittest.main()
