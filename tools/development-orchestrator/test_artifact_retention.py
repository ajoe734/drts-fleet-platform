#!/usr/bin/env python3
"""Acceptance tests for ageing out orchestrator run artifacts.

The disk guard reclaimed worktrees and nothing else, so everything else the
fleet writes per run grew without a ceiling -- 491 MB across 3917 worker logs,
7099 chair-review files, 895 worker results, oldest 17 days, none of it
referenced once its run ended.

The interesting cases are not "did it delete old files". They are the two ways
a retention sweep does damage: deleting something the control plane still
points at, and deleting the acceptance record a task's `done` was derived from.
"""

from __future__ import annotations

import json
import time
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from control_plane.infra import artifact_retention


class ArtifactRetentionTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.root = Path(self._tmp.name)
        self.state_dir = self.root / ".orchestrator"
        for directory in ("logs", "chair-reviews", "worker-results", "evidence"):
            (self.state_dir / directory).mkdir(parents=True)
        self.config = {"paths": {"state_file": str(self.state_dir / "state.json")}}

    def _write(self, relative: str, *, age_days: float) -> Path:
        path = self.state_dir / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("x" * 128, encoding="utf-8")
        stamp = time.time() - age_days * 86400
        import os

        os.utime(path, (stamp, stamp))
        return path

    def test_old_unreferenced_artifacts_are_removed(self) -> None:
        old_log = self._write("logs/20260801-codex-run.log", age_days=30)
        old_review = self._write("chair-reviews/run-1/report.md", age_days=30)
        old_result = self._write("worker-results/run-1.json", age_days=30)

        result = artifact_retention.prune_runtime_artifacts(self.config, {})

        self.assertEqual(result["removed"], 3)
        for path in (old_log, old_review, old_result):
            self.assertFalse(path.exists(), f"{path.name} survived retention")

    def test_recent_artifacts_are_kept(self) -> None:
        fresh = self._write("logs/today.log", age_days=1)

        result = artifact_retention.prune_runtime_artifacts(self.config, {})

        self.assertTrue(fresh.exists())
        self.assertEqual(result["removed"], 0)

    def test_a_path_the_live_state_points_at_is_never_removed(self) -> None:
        """The failure mode that matters: deleting a file about to be read."""
        referenced = self._write("logs/20260801-claude-active.log", age_days=90)
        state = {
            "workers": {
                "run-7": {"status": "running", "log_path": str(referenced)},
            }
        }

        result = artifact_retention.prune_runtime_artifacts(self.config, state)

        self.assertTrue(referenced.exists(), "retention deleted a referenced worker log")
        self.assertEqual(result["directories"]["logs"]["skipped_referenced"], 1)

    def test_references_are_found_wherever_they_live_in_the_state(self) -> None:
        """Not an allowlist of known field names -- nested and unusual keys too."""
        buried = self._write("worker-results/buried.json", age_days=90)
        state = {
            "chair_review": {
                "interrupted_review": {"artifacts": [{"some_future_field": str(buried)}]}
            }
        }

        artifact_retention.prune_runtime_artifacts(self.config, state)

        self.assertTrue(buried.exists(), "a nested reference was not protected")

    def test_evidence_is_never_a_retention_target(self) -> None:
        """Acceptance evidence is what `done` was derived from."""
        evidence = self._write("evidence/run-1.json", age_days=365)

        artifact_retention.prune_runtime_artifacts(self.config, {})

        self.assertTrue(evidence.exists(), "retention aged out acceptance evidence")
        self.assertNotIn("evidence", artifact_retention.prune_runtime_artifacts(self.config, {})["directories"])

    def test_disabled_retention_removes_nothing(self) -> None:
        old = self._write("logs/old.log", age_days=90)

        result = artifact_retention.prune_runtime_artifacts(
            self.config, {}, {"enabled": False}
        )

        self.assertTrue(old.exists())
        self.assertFalse(result["enabled"])

    def test_an_empty_sweep_reports_zeros_rather_than_nothing(self) -> None:
        """"Ran and found nothing" must be distinguishable from "never ran"."""
        result = artifact_retention.prune_runtime_artifacts(self.config, {})

        self.assertTrue(result["enabled"])
        self.assertEqual(result["removed"], 0)
        self.assertEqual(sorted(result["directories"]), ["chair-reviews", "logs", "worker-results"])

    def test_removal_budget_is_respected(self) -> None:
        for index in range(10):
            self._write(f"logs/old-{index}.log", age_days=90)

        result = artifact_retention.prune_runtime_artifacts(
            self.config, {}, {"max_removed_per_sweep": 4}
        )

        self.assertEqual(result["removed"], 4)
        self.assertEqual(len(list((self.state_dir / "logs").glob("*.log"))), 6)

    def test_emptied_chair_review_directories_are_collapsed(self) -> None:
        self._write("chair-reviews/run-9/report.md", age_days=90)

        artifact_retention.prune_runtime_artifacts(self.config, {})

        self.assertFalse((self.state_dir / "chair-reviews" / "run-9").exists())
        self.assertTrue((self.state_dir / "chair-reviews").is_dir())

    def test_retention_window_is_configurable(self) -> None:
        five_days = self._write("logs/five.log", age_days=5)

        artifact_retention.prune_runtime_artifacts(
            self.config, {}, {"worker_log_retention_days": 3.0}
        )

        self.assertFalse(five_days.exists())


    def test_a_config_without_paths_is_reported_not_raised(self) -> None:
        """Housekeeping must never take down the disk guard that calls it.

        The disk guard is a dispatch-safety mechanism. It does not get to fail
        because a log directory could not be located.
        """
        result = artifact_retention.prune_runtime_artifacts({}, {})

        self.assertEqual(result["removed"], 0)
        self.assertTrue(result["errors"])

    def test_release_prune_reports_a_broken_config_instead_of_raising(self) -> None:
        result = artifact_retention.prune_stale_releases({})

        self.assertFalse(result["ok"])
        self.assertIn("state_file", result["error"])

    def test_release_prune_can_be_switched_off(self) -> None:
        self.assertFalse(
            artifact_retention.prune_stale_releases(self.config, {"prune_releases": False})["enabled"]
        )


class ReferencedPathScanTests(unittest.TestCase):
    def test_only_path_shaped_strings_are_collected(self) -> None:
        found = artifact_retention.referenced_paths(
            {"a": "not-a-path", "b": "/tmp/x.log", "c": [{"d": "runs/9/report.md"}], "e": 7}
        )

        self.assertEqual(found, {"/tmp/x.log", "runs/9/report.md"})

    def test_a_state_document_without_paths_yields_nothing(self) -> None:
        self.assertEqual(artifact_retention.referenced_paths({"n": 1, "s": "done"}), set())


if __name__ == "__main__":
    unittest.main()
