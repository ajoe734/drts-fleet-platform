#!/usr/bin/env python3
"""Acceptance tests for what an idle supervisor costs.

Measured on an idle fleet (empty queue, zero workers, every task done), the
supervisor burned 20.3% of a core and 172 KB/s of block writes -- 14.2 GB/day.
The cause was not the tick rate. It was that a 274 KB runtime-state document
was rewritten to record a handful of telemetry samples:

    28 changed lines out of ~3300 between consecutive writes, all of it
    last_check_at stamps and drifting disk/memory byte counts

Two things had to be true for that to happen, and each is pinned below:

- maintain_disk_guard sampled on every 2s tick, stamping a fresh last_check_at
  and fresh free-byte counts that nothing acts on below an 80/85% threshold.
  maintain_resource_guard, defined immediately above it, has always had the
  throttle it lacked.
- save_runtime_state wrote unconditionally, so a document nobody changed still
  cost a full-size temp file and a rename every tick.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

import common
from control_plane.runtime import supervisor_runtime as supervisor


class ConditionalWriteTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.path = Path(self._tmp.name) / "state.json"

    def test_first_write_creates_the_file(self) -> None:
        self.assertTrue(common.write_json_if_changed(self.path, {"a": 1}))
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), {"a": 1})

    def test_identical_payload_does_not_touch_the_file(self) -> None:
        common.write_json_if_changed(self.path, {"a": 1})
        before = self.path.stat().st_mtime_ns

        self.assertFalse(common.write_json_if_changed(self.path, {"a": 1}))
        self.assertEqual(self.path.stat().st_mtime_ns, before)

    def test_changed_payload_is_written(self) -> None:
        common.write_json_if_changed(self.path, {"a": 1})

        self.assertTrue(common.write_json_if_changed(self.path, {"a": 2}))
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), {"a": 2})

    def test_unreadable_existing_file_is_overwritten_rather_than_trusted(self) -> None:
        self.path.write_bytes(b"\xff\xfe not utf-8")

        self.assertTrue(common.write_json_if_changed(self.path, {"a": 1}))
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), {"a": 1})


class DiskGuardSamplingCadenceTests(unittest.TestCase):
    """Disk readings are a sample, not an event. They must not dirty state."""

    def _config(self, **guard: object) -> dict:
        settings = {"enabled": True, "path": ".", **guard}
        return {"supervisor": {"disk_guard": settings}}

    def _snapshot(self, free_gb: float = 100.0) -> dict:
        return {
            "total_bytes": 1000,
            "used_bytes": 100,
            "free_bytes": 900,
            "usage_percent": 10.0,
            "free_gb": free_gb,
        }

    def test_a_second_tick_inside_the_interval_takes_no_sample(self) -> None:
        state: dict = {}
        config = self._config(check_interval_seconds=30.0)

        with mock.patch.object(
            supervisor, "disk_usage_snapshot", return_value=self._snapshot()
        ) as snapshot:
            with mock.patch.object(supervisor, "maintain_resource_guard", return_value=False):
                supervisor.maintain_disk_guard(config, state)
                # The first call also runs the initial cleanup, which re-samples;
                # the claim here is about the *second* tick, so measure the delta.
                after_first = snapshot.call_count
                first_stamp = state["disk_guard"]["last_check_at"]
                supervisor.maintain_disk_guard(config, state)

        self.assertEqual(
            snapshot.call_count - after_first,
            0,
            "the throttle did not suppress the syscall on the next tick",
        )
        self.assertEqual(
            state["disk_guard"]["last_check_at"],
            first_stamp,
            "an unchanged reading still restamped the state document",
        )

    def test_the_sample_is_taken_again_once_the_interval_elapses(self) -> None:
        state: dict = {}
        config = self._config(check_interval_seconds=0.0)

        with mock.patch.object(
            supervisor, "disk_usage_snapshot", return_value=self._snapshot()
        ) as snapshot:
            with mock.patch.object(supervisor, "maintain_resource_guard", return_value=False):
                supervisor.maintain_disk_guard(config, state)
                supervisor.maintain_disk_guard(config, state)

        self.assertEqual(snapshot.call_count, 2)

    def test_throttling_does_not_suppress_the_resource_guard(self) -> None:
        """The two guards keep their own cadences."""
        state: dict = {}
        config = self._config(check_interval_seconds=30.0)

        with mock.patch.object(
            supervisor, "disk_usage_snapshot", return_value=self._snapshot()
        ):
            with mock.patch.object(
                supervisor, "maintain_resource_guard", return_value=True
            ) as resource:
                supervisor.maintain_disk_guard(config, state)
                changed = supervisor.maintain_disk_guard(config, state)

        self.assertEqual(resource.call_count, 2)
        self.assertTrue(changed, "a throttled disk check swallowed the resource guard's change")


class IdleTickWriteCostTests(unittest.TestCase):
    """The regression this whole file exists for: an idle tick that writes."""

    def test_resaving_unchanged_state_writes_nothing(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            state_path = root / ".orchestrator" / "state.json"
            state_path.parent.mkdir(parents=True)
            config = {"paths": {"state_file": str(state_path)}}

            from control_plane.infra import runtime_repo

            state = {"supervisor": {"lifecycle": "running"}, "workers": {}}
            runtime_repo.save_runtime_state(config, dict(state))
            mtime = state_path.stat().st_mtime_ns
            digest_path = state_path.parent / "state-digest.json"
            digest_mtime = digest_path.stat().st_mtime_ns

            for _ in range(5):
                runtime_repo.save_runtime_state(config, dict(state))

            self.assertEqual(
                state_path.stat().st_mtime_ns,
                mtime,
                "an idle tick rewrote the runtime state document",
            )
            self.assertEqual(
                digest_path.stat().st_mtime_ns,
                digest_mtime,
                "an idle tick rewrote the state digest",
            )


if __name__ == "__main__":
    unittest.main()
