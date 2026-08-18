#!/usr/bin/env python3
"""The watchdog records a change, not a tick.

The timer fires every minute whether or not anything moved. Writing the
observation each time produced 24,739 lines carrying 271 distinct observations
-- 98.9% duplication, one state repeated 1,770 times in a row, 16.4 MB.

Adding rotation would have kept trimming a file that should never have grown,
which is why the fix is upstream of the file's size.
"""

from __future__ import annotations

import importlib.util
import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock


SCRIPT = Path(__file__).resolve().parent / "bin" / "canonical-root-watchdog.py"


def _load():
    spec = importlib.util.spec_from_file_location("canonical_root_watchdog", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


watchdog = _load()


def _record(ts: datetime, **overrides) -> dict:
    base = {
        "ts": ts.isoformat(),
        "current_branch": "dev",
        "clean_tree": False,
        "drift": False,
        "behind_count": 0,
        "residue_file_count": 67,
        "residue_sample": ["a.yml", "b.yml"],
        "has_residue": True,
        "action": "none",
    }
    base.update(overrides)
    return base


class RecordOnChangeTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.log = Path(self._tmp.name) / "watchdog.jsonl"
        patcher = mock.patch.object(watchdog, "LOG_FILE", self.log)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.now = datetime(2026, 8, 18, 12, 0, tzinfo=timezone.utc)

    def _append(self, record: dict) -> None:
        with self.log.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record) + "\n")

    def test_the_first_observation_is_always_recorded(self) -> None:
        self.assertTrue(watchdog._should_record(_record(self.now)))

    def test_an_unchanged_observation_a_minute_later_is_not(self) -> None:
        self._append(_record(self.now))

        later = _record(self.now + timedelta(minutes=1))

        self.assertFalse(
            watchdog._should_record(later),
            "the same state was recorded again; this is the 98.9% duplication",
        )

    def test_a_changed_observation_is_recorded(self) -> None:
        self._append(_record(self.now))

        changed = _record(self.now + timedelta(minutes=1), residue_file_count=68)

        self.assertTrue(watchdog._should_record(changed))

    def test_drift_is_recorded_even_one_minute_later(self) -> None:
        """The event this watchdog exists for must never be suppressed."""
        self._append(_record(self.now))

        drifted = _record(self.now + timedelta(minutes=1), drift=True, current_branch="wip")

        self.assertTrue(watchdog._should_record(drifted))

    def test_an_unchanged_observation_still_heartbeats(self) -> None:
        """Silence must stay distinguishable from a dead watchdog."""
        self._append(_record(self.now))

        due = _record(self.now + timedelta(seconds=watchdog.HEARTBEAT_SECONDS + 1))

        self.assertTrue(watchdog._should_record(due))

    def test_a_malformed_tail_does_not_suppress_the_record(self) -> None:
        self.log.write_text("not json\n", encoding="utf-8")

        self.assertTrue(watchdog._should_record(_record(self.now)))

    def test_the_timestamp_alone_never_counts_as_a_change(self) -> None:
        first = _record(self.now)
        second = _record(self.now + timedelta(seconds=30))

        self.assertEqual(watchdog._observation(first), watchdog._observation(second))


if __name__ == "__main__":
    unittest.main()
