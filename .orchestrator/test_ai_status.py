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


class UnblockParentResolutionTest(unittest.TestCase):
    def test_unblock_done_resumes_parent_to_todo(self) -> None:
        state = {
            "tasks": [
                {
                    "id": "ADM-UI-RD-006",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "status": "blocked",
                    "next": "Waiting on history repair.",
                    "waiting_for": "Claude",
                },
                {
                    "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                    "owner": "Claude2",
                    "reviewer": "Codex",
                    "status": "review_approved",
                    "task_class": "unblock",
                    "helper_parent": "ADM-UI-RD-006",
                    "helper_kind": "history_repair",
                    "mutates_canonical": False,
                },
            ],
            "blockers": [
                {
                    "task_id": "ADM-UI-RD-006",
                    "owner": "Codex",
                    "waiting_for": "Claude",
                    "message": "Waiting on history repair.",
                    "status": "open",
                    "created_at": "2026-05-18T00:00:00Z",
                }
            ],
            "handoffs": [],
        }

        with mock.patch.dict(os.environ, {"AI_NAME": "Claude2"}, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_done(
                state,
                ["ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR", "Repair packet complete and parent can resume."],
            )

        parent = next(task for task in state["tasks"] if task["id"] == "ADM-UI-RD-006")
        child = next(task for task in state["tasks"] if task["id"] == "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR")
        self.assertEqual(child["status"], "done")
        self.assertEqual(parent["status"], "todo")
        self.assertIn("ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR", parent["next"])
        self.assertEqual(child["resolved_parent_status"], "todo")
        self.assertEqual(state["blockers"][0]["status"], "resolved")
        self.assertEqual(len(state["handoffs"]), 1)
        self.assertEqual(state["handoffs"][0]["to"], "Codex")

    def test_unblock_done_can_keep_parent_blocked(self) -> None:
        state = {
            "tasks": [
                {
                    "id": "ADM-UI-RD-006",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "status": "blocked",
                    "next": "Waiting on history repair.",
                    "waiting_for": "Claude",
                },
                {
                    "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                    "owner": "Claude2",
                    "reviewer": "Codex",
                    "status": "review_approved",
                    "task_class": "unblock",
                    "helper_parent": "ADM-UI-RD-006",
                    "helper_kind": "history_repair",
                    "mutates_canonical": False,
                },
            ],
            "blockers": [],
            "handoffs": [],
        }

        env = {
            "AI_NAME": "Claude2",
            "PARENT_STATUS": "blocked",
            "PARENT_WAITING_FOR": "Codex",
            "PARENT_NEXT": "Artifact path still needs canonical reconciliation before owner resume.",
        }
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_done(
                state,
                ["ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR", "Repair packet complete but artifact reconcile remains."],
            )

        parent = next(task for task in state["tasks"] if task["id"] == "ADM-UI-RD-006")
        child = next(task for task in state["tasks"] if task["id"] == "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR")
        self.assertEqual(parent["status"], "blocked")
        self.assertEqual(parent["waiting_for"], "Codex")
        self.assertEqual(parent["next"], "Artifact path still needs canonical reconciliation before owner resume.")
        self.assertEqual(child["resolved_parent_status"], "blocked")
        self.assertEqual(child["resolved_parent_waiting_for"], "Codex")
        self.assertEqual(len(state["handoffs"]), 0)
        self.assertEqual(len(state["blockers"]), 1)
        self.assertEqual(state["blockers"][0]["status"], "open")

    def test_unblock_done_keeps_done_parent_done(self) -> None:
        state = {
            "tasks": [
                {
                    "id": "DOCS-STRATEGY-DECISION",
                    "owner": "Claude",
                    "reviewer": "Copilot",
                    "status": "done",
                    "next": "Q4 = C (hybrid: 5 substantive + 12 thin stubs). See phase1-v3-resolution-20260519.md §Q4.",
                },
                {
                    "id": "DOCS-STRATEGY-DECISION-UNBLOCK-PLANNING-DECISION",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "status": "review_approved",
                    "task_class": "unblock",
                    "helper_parent": "DOCS-STRATEGY-DECISION",
                    "helper_kind": "planning_decision",
                    "mutates_canonical": False,
                },
            ],
            "blockers": [],
            "handoffs": [],
        }

        with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_done(
                state,
                [
                    "DOCS-STRATEGY-DECISION-UNBLOCK-PLANNING-DECISION",
                    "Resolution already landed; closing stale helper without reopening the parent task.",
                ],
            )

        parent = next(task for task in state["tasks"] if task["id"] == "DOCS-STRATEGY-DECISION")
        child = next(task for task in state["tasks"] if task["id"] == "DOCS-STRATEGY-DECISION-UNBLOCK-PLANNING-DECISION")
        self.assertEqual(parent["status"], "done")
        self.assertEqual(
            parent["next"],
            "Q4 = C (hybrid: 5 substantive + 12 thin stubs). See phase1-v3-resolution-20260519.md §Q4.",
        )
        self.assertEqual(child["status"], "done")
        self.assertEqual(child["resolved_parent_status"], "done")
        self.assertEqual(len(state["handoffs"]), 0)
        self.assertEqual(len(state["blockers"]), 0)

    def test_unblock_done_cannot_promote_non_done_parent_to_done(self) -> None:
        state = {
            "tasks": [
                {
                    "id": "ADM-UI-RD-006",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "status": "blocked",
                    "next": "Waiting on history repair.",
                },
                {
                    "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                    "owner": "Claude2",
                    "reviewer": "Codex",
                    "status": "review_approved",
                    "task_class": "unblock",
                    "helper_parent": "ADM-UI-RD-006",
                    "helper_kind": "history_repair",
                    "mutates_canonical": False,
                },
            ],
            "blockers": [],
            "handoffs": [],
        }

        env = {
            "AI_NAME": "Claude2",
            "PARENT_STATUS": "done",
        }
        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "append_log"):
            with self.assertRaisesRegex(SystemExit, "only allowed when the parent task is already done"):
                ai_status.command_done(
                    state,
                    ["ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR", "Attempted invalid parent completion."],
                )


if __name__ == "__main__":
    unittest.main()
