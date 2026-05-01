#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ai_status", ROOT / "scripts" / "ai_status.py")
assert SPEC is not None and SPEC.loader is not None
ai_status = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ai_status)


class CompletionMetadataTest(unittest.TestCase):
    def _canonical_task(self) -> dict[str, str]:
        return {
            "id": "TASK-001",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "review_approved",
        }

    def test_canonical_done_requires_push_metadata(self) -> None:
        env = {
            "COMMIT_HASH": "abc123",
            "COMMIT_SUBJECT": "feat(task-001): deliver slice",
        }

        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "git_commit_exists", return_value=True):
            with self.assertRaisesRegex(SystemExit, "PUSH_REMOTE and PUSH_BRANCH"):
                ai_status.completion_metadata_from_env(self._canonical_task(), "Codex")

    def test_canonical_done_records_commit_and_push_metadata(self) -> None:
        env = {
            "COMMIT_HASH": "abc123",
            "COMMIT_SUBJECT": "feat(task-001): deliver slice",
            "PUSH_REMOTE": "origin",
            "PUSH_BRANCH": "feat/task-001",
        }

        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "git_commit_exists", return_value=True):
            metadata = ai_status.completion_metadata_from_env(self._canonical_task(), "Codex")

        self.assertEqual(metadata["commit_hash"], "abc123")
        self.assertEqual(metadata["push_remote"], "origin")
        self.assertEqual(metadata["push_branch"], "feat/task-001")
        self.assertEqual(metadata["push_ref"], "origin/feat/task-001")
        self.assertEqual(metadata["push_commit"], "abc123")

    def test_sidecar_no_commit_closeout_does_not_require_push_metadata(self) -> None:
        task = {
            "id": "TASK-001-SIDECAR-ACCEPTANCE",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "review_approved",
            "task_class": "sidecar",
        }

        with mock.patch.dict(os.environ, {"NO_COMMIT_REQUIRED": "1"}, clear=True):
            metadata = ai_status.completion_metadata_from_env(task, "Codex")

        self.assertEqual(metadata["commit_hash"], "-")
        self.assertEqual(metadata["commit_subject"], "no-commit closeout")


if __name__ == "__main__":
    unittest.main()
