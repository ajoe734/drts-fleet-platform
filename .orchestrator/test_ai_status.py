#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("ai_status", ROOT / "scripts" / "ai_status.py")
assert SPEC is not None and SPEC.loader is not None
ai_status = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ai_status)


class TaskTransitionProvenanceTest(unittest.TestCase):
    def test_changed_task_gets_revision_and_worker_provenance(self) -> None:
        before = {
            "tasks": [
                {"id": "TASK-001", "status": "todo", "revision": 4}
            ]
        }
        after = {
            "tasks": [
                {"id": "TASK-001", "status": "in_progress", "revision": 4}
            ]
        }
        entries: list[dict] = []

        with (
            mock.patch.dict(
                os.environ,
                {"AI_NAME": "Codex", "ORCH_RUN_ID": "run-123"},
                clear=True,
            ),
            mock.patch.object(ai_status, "append_log", side_effect=entries.append),
        ):
            transitions = ai_status.prepare_task_transitions(
                before,
                after,
                "progress",
                ["TASK-001", "Implementation started."],
            )
            ai_status.commit_task_transitions(transitions)

        self.assertEqual(after["tasks"][0]["revision"], 5)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["from_status"], "todo")
        self.assertEqual(entries[0]["to_status"], "in_progress")
        self.assertEqual(entries[0]["producer"], "worker")
        self.assertEqual(entries[0]["worker_run_id"], "run-123")

    def test_unchanged_task_does_not_increment_revision(self) -> None:
        before = {"tasks": [{"id": "TASK-001", "status": "todo"}]}
        after = {"tasks": [{"id": "TASK-001", "status": "todo"}]}

        with mock.patch.object(ai_status, "append_log") as append_log:
            transitions = ai_status.prepare_task_transitions(before, after, "sync", [])
            ai_status.commit_task_transitions(transitions)

        self.assertNotIn("revision", after["tasks"][0])
        append_log.assert_not_called()


class LoadLogsRecoveryTest(unittest.TestCase):
    def test_load_logs_ignores_nul_padding_and_salvages_later_valid_entries(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "ai-activity-log.jsonl"
            log_path.write_text(
                '\n'.join([
                    '{"ts":"2026-06-02T16:34:50Z","type":"healthy","message":"ok"}',
                    '\x00\x00\x00\x00',
                    '{"ts":"2026-06-02T17:05:11Z","type":"broken","hook_payload":{"cwd"'
                    '{"ts":"2026-06-02T23:24:47Z","type":"recovered","message":"still usable"}',
                ])
                + "\n",
                encoding="utf-8",
            )
            stderr = io.StringIO()
            with (
                mock.patch.object(ai_status, "LOG_FILE", log_path),
                redirect_stderr(stderr),
            ):
                logs = ai_status.load_logs()

        self.assertEqual([entry["type"] for entry in logs], ["healthy", "recovered"])
        self.assertEqual(stderr.getvalue(), "")


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

    def test_release_gate_noncanonical_done_still_requires_commit_metadata(self) -> None:
        task = {
            "id": "TASK-001-RELEASE",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "review_approved",
            "mutates_canonical": False,
            "release_gate": True,
        }

        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(SystemExit, "done requires COMMIT_HASH"):
                ai_status.completion_metadata_from_env(task, "Codex")

    def test_required_integration_noncanonical_done_still_requires_commit_metadata(self) -> None:
        task = {
            "id": "TASK-001-DEPLOY",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "review_approved",
            "mutates_canonical": False,
            "required_integration_status": "dev_deployed",
        }

        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(SystemExit, "done requires COMMIT_HASH"):
                ai_status.completion_metadata_from_env(task, "Codex")


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


class GitMergeReconciliationTest(unittest.TestCase):
    def _state(self) -> dict[str, object]:
        return {
            "tasks": [
                {
                    "id": "PH1GC-E2E-010",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "status": "backlog",
                    "next": "Waiting on dispatch.",
                },
                {
                    "id": "PH1GC-COM-001",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "status": "in_progress",
                },
                {
                    "id": "PH1GC-DONE-EXAMPLE",
                    "owner": "Codex2",
                    "reviewer": "Codex",
                    "status": "done",
                },
                {
                    "id": "REL-REF-EMBED-001",
                    "owner": "Codex2",
                    "reviewer": "Codex",
                    "status": "review_approved",
                    "required_integration_status": "dev_deployed",
                },
            ],
            "blockers": [
                {
                    "task_id": "PH1GC-E2E-010",
                    "owner": "Codex",
                    "waiting_for": "Claude",
                    "message": "Waiting on dispatch.",
                    "status": "open",
                    "created_at": "2026-05-18T00:00:00Z",
                }
            ],
            "handoffs": [
                {
                    "task_id": "PH1GC-E2E-010",
                    "from": "Claude",
                    "to": "Codex",
                    "message": "Owner finalize",
                    "status": "pending",
                    "created_at": "2026-05-18T00:00:00Z",
                }
            ],
        }

    def test_reconcile_marks_merged_task_done(self) -> None:
        state = self._state()
        closeouts = {
            "PH1GC-E2E-010": {
                "sha": "49b49a25002a611c5b3433e3ee36c11a73fb7b83",
                "subject": "PH1GC-E2E-010: governance-aware billing/reporting E2E script (#256)",
                "commit_date": "2026-05-23T13:48:47+00:00",
            }
        }
        with mock.patch.object(ai_status, "_git_log_closeouts", return_value=closeouts), mock.patch.object(ai_status, "append_log"):
            reconciled = ai_status.apply_git_merge_reconciliation(state)

        self.assertEqual(len(reconciled), 1)
        self.assertEqual(reconciled[0]["task_id"], "PH1GC-E2E-010")
        self.assertEqual(reconciled[0]["prior_status"], "backlog")

        task = next(t for t in state["tasks"] if t["id"] == "PH1GC-E2E-010")
        self.assertEqual(task["status"], "done")
        self.assertEqual(task["commit_hash"], "49b49a25002a611c5b3433e3ee36c11a73fb7b83")
        self.assertEqual(task["push_remote"], "origin")
        self.assertEqual(task["push_branch"], "dev")
        self.assertEqual(task["push_ref"], "origin/dev")
        self.assertEqual(task["reconciled_from_git_prior_status"], "backlog")
        self.assertEqual(state["blockers"][0]["status"], "resolved")
        self.assertEqual(state["handoffs"][0]["status"], "done")

    def test_reconcile_skips_already_done_tasks(self) -> None:
        state = self._state()
        closeouts = {
            "PH1GC-DONE-EXAMPLE": {
                "sha": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
                "subject": "PH1GC-DONE-EXAMPLE: already shipped",
                "commit_date": "2026-05-23T13:48:47+00:00",
            }
        }
        with mock.patch.object(ai_status, "_git_log_closeouts", return_value=closeouts), mock.patch.object(ai_status, "append_log"):
            reconciled = ai_status.apply_git_merge_reconciliation(state)

        self.assertEqual(reconciled, [])

    def test_reconcile_skips_tasks_without_closeout_commit(self) -> None:
        state = self._state()
        with mock.patch.object(ai_status, "_git_log_closeouts", return_value={}), mock.patch.object(ai_status, "append_log"):
            reconciled = ai_status.apply_git_merge_reconciliation(state)

        self.assertEqual(reconciled, [])
        task = next(t for t in state["tasks"] if t["id"] == "PH1GC-E2E-010")
        self.assertEqual(task["status"], "backlog")

    def test_reconcile_skips_dev_deploy_required_tasks(self) -> None:
        state = self._state()
        closeouts = {
            "REL-REF-EMBED-001": {
                "sha": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
                "subject": "REL-REF-EMBED-001: preserve release evidence gate",
                "commit_date": "2026-08-02T03:48:47+00:00",
            }
        }
        with mock.patch.object(ai_status, "_git_log_closeouts", return_value=closeouts), mock.patch.object(ai_status, "append_log"):
            reconciled = ai_status.apply_git_merge_reconciliation(state)

        self.assertEqual(reconciled, [])
        task = next(t for t in state["tasks"] if t["id"] == "REL-REF-EMBED-001")
        self.assertEqual(task["status"], "review_approved")

    def test_reconcile_skips_any_required_integration_task(self) -> None:
        state = self._state()
        state["tasks"].append(
            {
                "id": "REL-MERGE-ONLY-001",
                "owner": "Codex2",
                "reviewer": "Codex",
                "status": "review_approved",
                "required_integration_status": "merged_to_dev",
            }
        )
        closeouts = {
            "REL-MERGE-ONLY-001": {
                "sha": "feedfacefeedfacefeedfacefeedfacefeedface",
                "subject": "REL-MERGE-ONLY-001: requires explicit integration evidence",
                "commit_date": "2026-08-02T03:48:47+00:00",
            }
        }
        with mock.patch.object(ai_status, "_git_log_closeouts", return_value=closeouts), mock.patch.object(ai_status, "append_log"):
            reconciled = ai_status.apply_git_merge_reconciliation(state)

        self.assertEqual(reconciled, [])
        task = next(t for t in state["tasks"] if t["id"] == "REL-MERGE-ONLY-001")
        self.assertEqual(task["status"], "review_approved")

    def test_closeout_regex_excludes_anchor_commits(self) -> None:
        self.assertIsNotNone(
            ai_status.CLOSEOUT_SUBJECT_RE.match("PH1GC-E2E-010: governance-aware E2E script (#256)")
        )
        # Anchor commits with `wip(TASK):` prefix must NOT be treated as closeouts.
        self.assertIsNone(
            ai_status.CLOSEOUT_SUBJECT_RE.match("wip(PH1GC-E2E-010): in-flight anchor")
        )




class CommandArchiveCompletedTests(unittest.TestCase):
    def test_archives_done_task_and_preserves_body(self) -> None:
        state = {
            "tasks": [
                {"id": "OLD-1", "status": "done", "owner": "Codex", "summary": "historical"},
                {"id": "DONE-2", "status": "done", "depends_on": ["OLD-1"]},
            ],
            "handoffs": [],
            "blockers": [],
        }
        archived_lines: list[str] = []
        with (
            mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True),
            mock.patch.object(
                ai_status,
                "_append_jsonl_line",
                side_effect=lambda _path, line: archived_lines.append(line),
            ),
            mock.patch.object(ai_status, "append_log"),
        ):
            ai_status.command_archive_completed(state, ["OLD-1", "assembled into final release"])

        self.assertNotIn("OLD-1", [task["id"] for task in state["tasks"]])
        self.assertIn("OLD-1", state["archived_task_ids"])
        archived = json.loads(archived_lines[0])
        self.assertEqual(archived["summary"], "historical")
        self.assertEqual(archived["_archive_reason"], "assembled into final release")

    def test_refuses_non_done_task(self) -> None:
        state = {"tasks": [{"id": "LIVE-1", "status": "review"}]}
        with self.assertRaisesRegex(SystemExit, "Only done tasks"):
            ai_status.command_archive_completed(state, ["LIVE-1"])

    def test_refuses_task_with_active_dependent(self) -> None:
        state = {
            "tasks": [
                {"id": "OLD-1", "status": "done"},
                {"id": "LIVE-1", "status": "todo", "depends_on": ["OLD-1"]},
            ]
        }
        with self.assertRaisesRegex(SystemExit, "active dependents: LIVE-1"):
            ai_status.command_archive_completed(state, ["OLD-1"])


class CommandShowTests(unittest.TestCase):
    """OPS-CONTEXT-BLOAT-SLIM-001: `show <task-id>` prints ONE task slice
    so workers don't have to Read the 2MB ai-status.json wholesale (which
    burns ~500K input tokens every read)."""

    def test_show_prints_matching_task_json(self) -> None:
        state = {"tasks": [
            {"id": "T1", "status": "todo", "owner": "Codex2"},
            {"id": "T2", "status": "done", "owner": "Claude"},
        ]}
        buf = io.StringIO()
        with redirect_stdout(buf):
            ai_status.command_show(state, ["T2"])
        out = buf.getvalue()
        self.assertIn('"id": "T2"', out)
        self.assertIn('"status": "done"', out)
        self.assertNotIn('"id": "T1"', out, "must NOT leak other tasks")

    def test_show_missing_task_exits_nonzero(self) -> None:
        state = {"tasks": [{"id": "T1", "status": "todo"}]}
        with self.assertRaises(SystemExit) as cm:
            ai_status.command_show(state, ["DOES-NOT-EXIST"])
        self.assertNotEqual(cm.exception.code, 0)

    def test_show_no_args_exits_nonzero(self) -> None:
        with self.assertRaises(SystemExit):
            ai_status.command_show({"tasks": []}, [])


class CommandListTests(unittest.TestCase):
    """`list [--status X] [--owner Y] ...` is the compact alternative for
    when a worker needs to enumerate tasks. One line per task vs 2 MB JSON.
    """

    def _state(self) -> dict:
        return {"tasks": [
            {"id": "A", "status": "todo", "owner": "Codex", "reviewer": "Codex2"},
            {"id": "B", "status": "in_progress", "owner": "Codex2", "reviewer": "Codex"},
            {"id": "C", "status": "todo", "owner": "Claude", "reviewer": "Claude2"},
        ]}

    def test_list_no_filter_prints_all(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            ai_status.command_list(self._state(), [])
        out = buf.getvalue()
        ids = sorted(ln.split()[0] for ln in out.splitlines() if ln.strip() and not ln.startswith("("))
        self.assertEqual(ids, ["A", "B", "C"])

    def test_list_filter_by_status(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            ai_status.command_list(self._state(), ["--status", "todo"])
        out = buf.getvalue()
        ids = sorted(ln.split()[0] for ln in out.splitlines() if ln.strip() and not ln.startswith("("))
        self.assertEqual(ids, ["A", "C"])

    def test_list_combine_filters(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            ai_status.command_list(self._state(), ["--status", "todo", "--owner", "Codex"])
        out = buf.getvalue()
        # Match task-id at column start to avoid colliding with 'Codex'/'Claude2'.
        ids_present = [ln.split()[0] for ln in out.splitlines() if ln.strip() and not ln.startswith("(")]
        self.assertEqual(ids_present, ["A"], f'expected only A, got {ids_present}')

    def test_list_no_matches_prints_placeholder(self) -> None:
        buf = io.StringIO()
        with redirect_stdout(buf):
            ai_status.command_list(self._state(), ["--status", "nothing"])
        out = buf.getvalue()
        self.assertIn("(no matches)", out)


# --- Integration gate (branch-strategy.md §11.6 enforcement) ---
_GATE_SPEC = importlib.util.spec_from_file_location(
    "integration_gate", ROOT / ".orchestrator" / "integration_gate.py"
)
assert _GATE_SPEC is not None and _GATE_SPEC.loader is not None
integration_gate = importlib.util.module_from_spec(_GATE_SPEC)
_GATE_SPEC.loader.exec_module(integration_gate)


class IntegrationGateUnitTest(unittest.TestCase):
    def _cfg(self, **gate) -> dict:
        return {"branch_strategy": {"integration_gate": {"enabled": True, **gate}}}

    def test_disabled_gate_allows_everything(self) -> None:
        cfg = {"branch_strategy": {"integration_gate": {"enabled": False}}}
        self.assertIsNone(
            integration_gate.check_integration_gate({"id": "X"}, "branch_pushed", cfg)
        )

    def test_branch_only_status_blocks_when_enabled(self) -> None:
        reason = integration_gate.check_integration_gate(
            {"id": "I18N-OPS-03"}, "branch_pushed", self._cfg()
        )
        self.assertIsNotNone(reason)
        self.assertIn("I18N-OPS-03", reason)
        self.assertIn("not integrated to dev", reason)

    def test_integrated_statuses_allow(self) -> None:
        for status in ("merged_to_dev", "dev_deployed", "not_applicable"):
            self.assertIsNone(
                integration_gate.check_integration_gate({"id": "X"}, status, self._cfg()),
                status,
            )

    def test_required_integration_status_blocks_unmatched_statuses(self) -> None:
        task = {"id": "REL-REF-EMBED-001", "required_integration_status": "dev_deployed"}
        for status in ("merged_to_dev", "not_applicable", "branch_pushed", "ci_failed"):
            reason = integration_gate.check_integration_gate(task, status, self._cfg())
            self.assertIsNotNone(reason, f"Expected block for status {status}")
            self.assertIn("REL-REF-EMBED-001", reason)
            self.assertIn("required_integration_status=dev_deployed", reason)
        self.assertIsNone(
            integration_gate.check_integration_gate(task, "dev_deployed", self._cfg())
        )

    def test_exempt_pattern_allows(self) -> None:
        cfg = self._cfg(exempt_task_patterns=[r"-SIDECAR-ACCEPTANCE$"])
        self.assertIsNone(
            integration_gate.check_integration_gate(
                {"id": "FOO-SIDECAR-ACCEPTANCE"}, "branch_pushed", cfg
            )
        )
        # non-matching id still blocks
        self.assertIsNotNone(
            integration_gate.check_integration_gate({"id": "FOO"}, "branch_pushed", cfg)
        )

    def test_malformed_exempt_pattern_does_not_crash(self) -> None:
        cfg = self._cfg(exempt_task_patterns=["[unclosed"])
        # malformed regex must not raise and must not exempt
        self.assertIsNotNone(
            integration_gate.check_integration_gate({"id": "FOO"}, "branch_pushed", cfg)
        )


class ProgressIntegrationMetadataTest(unittest.TestCase):
    def test_integration_repair_is_owner_only_and_explicit(self) -> None:
        task = {
            "id": "TASK-PR-REPAIR-001",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "blocked",
            "integration_status": "ci_failed",
            "ci_status": "failure",
            "pr_url": "https://github.com/example/repo/pull/42",
        }
        state = {"tasks": [task], "blockers": [], "handoffs": []}

        with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_integration_repair(state, [task["id"], "Repair commit trailer only."])

        self.assertEqual(task["status"], "in_progress")
        self.assertEqual(task["work_intent"]["kind"], "integration_repair")
        self.assertEqual(task["work_intent"]["state"], "pending")

    def test_progress_records_explicit_integration_metadata_without_completing_task(self) -> None:
        task = {"id": "TASK-PR-001", "owner": "Codex", "reviewer": "Claude", "status": "in_progress"}
        state = {"tasks": [task], "blockers": [], "handoffs": []}
        env = {
            "AI_NAME": "Codex",
            "INTEGRATION_STATUS": "ci_pending",
            "PR_URL": "https://github.com/example/repo/pull/42",
            "CI_STATUS": "pending",
        }

        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_progress(state, ["TASK-PR-001", "PR is awaiting CI."])

        self.assertEqual(task["status"], "in_progress")
        self.assertEqual(task["integration_status"], "ci_pending")
        self.assertEqual(task["pr_url"], env["PR_URL"])
        self.assertEqual(task["ci_status"], "pending")

    def test_progress_without_integration_env_preserves_existing_behavior(self) -> None:
        task = {"id": "TASK-PR-002", "owner": "Codex", "reviewer": "Claude", "status": "todo"}
        state = {"tasks": [task], "blockers": [], "handoffs": []}

        with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_progress(state, ["TASK-PR-002", "Implementation started."])

        self.assertEqual(task["status"], "in_progress")
        self.assertNotIn("integration_status", task)

    def test_reconciler_replacement_pr_clears_stale_terminal_evidence(self) -> None:
        task = {
            "id": "TASK-PR-REPLACEMENT-001",
            "owner": "Codex",
            "status": "done",
            "integration_status": "merged_to_dev",
            "merge_commit": "stale-merge",
            "merged_ref": "dev",
        }
        state = {"tasks": [task], "blockers": [], "handoffs": []}
        env = {
            "AI_NAME": "Supervisor",
            "AI_STATUS_RECONCILER": "github_bus",
            "INTEGRATION_STATUS": "pr_open",
            "PR_URL": "https://github.com/example/repo/pull/42",
            "CI_STATUS": "success",
            "EXECUTION_BRANCH": "codex/replacement",
        }

        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_observe_integration(state, [task["id"], "Replacement PR is authoritative."])

        self.assertEqual(task["integration_status"], "pr_open")
        self.assertEqual(task["execution_branch"], "codex/replacement")
        self.assertNotIn("merge_commit", task)
        self.assertNotIn("merged_ref", task)

    def test_reconciler_records_green_pr_without_advancing_to_review(self) -> None:
        task = {
            "id": "TASK-PR-READY-001",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "in_progress",
        }
        state = {"tasks": [task], "blockers": [], "handoffs": []}
        env = {
            "AI_NAME": "Supervisor",
            "AI_STATUS_RECONCILER": "github_bus",
            "RECONCILER_REVIEW_READY": "1",
            "INTEGRATION_STATUS": "pr_open",
            "PR_URL": "https://github.com/example/repo/pull/42",
            "CI_STATUS": "success",
        }

        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_observe_integration(state, [task["id"], "PR checks passed."])

        self.assertEqual(task["status"], "in_progress")
        self.assertNotIn("ci_run_url", task)

    def test_observation_replaces_stale_ci_url(self) -> None:
        task = {
            "id": "TASK-PR-URL-001",
            "owner": "Codex",
            "status": "in_progress",
            "ci_run_url": "https://example.invalid/old-run",
        }
        state = {"tasks": [task], "blockers": [], "handoffs": []}
        env = {
            "AI_NAME": "Supervisor",
            "AI_STATUS_RECONCILER": "github_bus",
            "INTEGRATION_STATUS": "pr_open",
            "PR_URL": "https://github.com/example/repo/pull/42",
            "CI_STATUS": "success",
            "CI_RUN_URL": "",
        }

        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_observe_integration(state, [task["id"], "Checks passed."])

        self.assertNotIn("ci_run_url", task)

    def test_reconciler_does_not_clear_product_blocker_for_green_pr(self) -> None:
        task = {
            "id": "TASK-PRODUCT-BLOCKED-001",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "blocked",
            "waiting_for": "Missing product contract",
        }
        state = {"tasks": [task], "blockers": [], "handoffs": []}
        env = {
            "AI_NAME": "Supervisor",
            "AI_STATUS_RECONCILER": "github_bus",
            "RECONCILER_REVIEW_READY": "1",
            "INTEGRATION_STATUS": "pr_open",
            "PR_URL": "https://github.com/example/repo/pull/43",
            "CI_STATUS": "success",
        }

        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_observe_integration(state, [task["id"], "PR checks passed."])

        self.assertEqual(task["status"], "blocked")
        self.assertEqual(task["waiting_for"], "Missing product contract")

    def test_reconciler_returns_failed_review_to_owner_repair(self) -> None:
        task = {
            "id": "TASK-PR-FAILED-001",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "review",
        }
        state = {"tasks": [task], "blockers": [], "handoffs": []}
        env = {
            "AI_NAME": "Supervisor",
            "AI_STATUS_RECONCILER": "github_bus",
            "INTEGRATION_STATUS": "ci_failed",
            "PR_URL": "https://github.com/example/repo/pull/44",
            "CI_STATUS": "failure",
        }

        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_observe_integration(state, [task["id"], "PR checks failed."])
            ai_status.command_reduce_integration(state, [task["id"], "PR checks failed."])

        self.assertEqual(task["status"], "in_progress")

    def test_reconciler_marks_protected_merge_done_after_worker_closeout_gap(self) -> None:
        task = {
            "id": "TASK-MERGED-001",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "blocked",
            "waiting_for": "Claude",
        }
        state = {"tasks": [task], "blockers": [], "handoffs": []}
        env = {
            "AI_NAME": "Supervisor",
            "AI_STATUS_RECONCILER": "github_bus",
            "INTEGRATION_STATUS": "merged_to_dev",
            "PR_URL": "https://github.com/example/repo/pull/42",
            "CI_STATUS": "success",
            "MERGED_REF": "dev",
            "MERGE_COMMIT": "a" * 40,
        }

        with mock.patch.dict(os.environ, env, clear=True), mock.patch.object(ai_status, "append_log"):
            ai_status.command_observe_integration(state, ["TASK-MERGED-001", "Protected PR merge reconciled."])
            ai_status.command_reduce_integration(state, ["TASK-MERGED-001", "Protected PR merge reconciled."])

        self.assertEqual(task["status"], "done")
        self.assertEqual(task["integration_status"], "merged_to_dev")
        self.assertNotIn("waiting_for", task)


class IntegrationGateCommandDoneTest(unittest.TestCase):
    def _task(self, **extra: object) -> dict:
        task = {"id": "I18N-OPS-03", "owner": "Codex", "reviewer": "Claude", "status": "review_approved"}
        task.update(extra)
        return task

    def _state(self, task: dict) -> dict:
        return {"tasks": [task], "blockers": [], "handoffs": []}

    def _done_env(self, **extra: str) -> dict:
        env = {
            "AI_NAME": "Codex",
            "COMMIT_HASH": "abc123",
            "COMMIT_SUBJECT": "I18N-OPS-03: centralize complaints i18n",
            "PUSH_REMOTE": "origin",
            "PUSH_BRANCH": "codex/i18n-ops-03",
        }
        env.update(extra)
        return env

    def test_branch_only_done_is_refused_when_enabled(self) -> None:
        task = self._task()
        state = self._state(task)
        cfg = {"branch_strategy": {"integration_gate": {"enabled": True}}}
        with (
            mock.patch.dict(os.environ, self._done_env(), clear=True),
            mock.patch.object(ai_status, "git_commit_exists", return_value=True),
            mock.patch.object(ai_status, "_load_orchestrator_config", return_value=cfg),
            mock.patch.object(ai_status, "append_log"),
        ):
            with self.assertRaisesRegex(SystemExit, "not integrated to dev"):
                ai_status.command_done(state, ["I18N-OPS-03", "branch work complete"])
        # task must NOT have advanced to done
        self.assertEqual(task["status"], "review_approved")

    def test_merged_to_dev_done_is_allowed_when_enabled(self) -> None:
        task = self._task()
        state = self._state(task)
        cfg = {"branch_strategy": {"integration_gate": {"enabled": True}}}
        env = self._done_env(INTEGRATION_STATUS="merged_to_dev", MERGED_REF="origin/dev")
        with (
            mock.patch.dict(os.environ, env, clear=True),
            mock.patch.object(ai_status, "git_commit_exists", return_value=True),
            mock.patch.object(ai_status, "_load_orchestrator_config", return_value=cfg),
            mock.patch.object(ai_status, "append_log"),
        ):
            ai_status.command_done(state, ["I18N-OPS-03", "merged to dev"])
        self.assertEqual(task["status"], "done")
        self.assertEqual(task["integration_status"], "merged_to_dev")

    def test_log_only_allows_branch_only_done_with_canary(self) -> None:
        task = self._task()
        state = self._state(task)
        cfg = {"branch_strategy": {"integration_gate": {"enabled": True, "log_only": True}}}
        stderr = io.StringIO()
        with (
            mock.patch.dict(os.environ, self._done_env(), clear=True),
            mock.patch.object(ai_status, "git_commit_exists", return_value=True),
            mock.patch.object(ai_status, "_load_orchestrator_config", return_value=cfg),
            mock.patch.object(ai_status, "append_log"),
            redirect_stderr(stderr),
        ):
            ai_status.command_done(state, ["I18N-OPS-03", "branch work complete"])
        self.assertEqual(task["status"], "done")
        self.assertIn("integration-gate canary", stderr.getvalue())

    def test_disabled_gate_allows_branch_only_done(self) -> None:
        task = self._task()
        state = self._state(task)
        cfg = {"branch_strategy": {"integration_gate": {"enabled": False}}}
        with (
            mock.patch.dict(os.environ, self._done_env(), clear=True),
            mock.patch.object(ai_status, "git_commit_exists", return_value=True),
            mock.patch.object(ai_status, "_load_orchestrator_config", return_value=cfg),
            mock.patch.object(ai_status, "append_log"),
        ):
            ai_status.command_done(state, ["I18N-OPS-03", "branch work complete"])
        self.assertEqual(task["status"], "done")

    def test_dev_deploy_required_task_rejects_not_applicable(self) -> None:
        task = self._task(required_integration_status="dev_deployed")
        state = self._state(task)
        cfg = {"branch_strategy": {"integration_gate": {"enabled": True}}}
        env = self._done_env(INTEGRATION_STATUS="not_applicable")
        with (
            mock.patch.dict(os.environ, env, clear=True),
            mock.patch.object(ai_status, "git_commit_exists", return_value=True),
            mock.patch.object(ai_status, "_load_orchestrator_config", return_value=cfg),
            mock.patch.object(ai_status, "append_log"),
        ):
            with self.assertRaisesRegex(SystemExit, "requires INTEGRATION_STATUS>=dev_deployed"):
                ai_status.command_done(state, ["I18N-OPS-03", "attempted support-only closeout"])
        self.assertEqual(task["status"], "review_approved")

    def test_dev_deploy_required_task_rejects_merge_only_done(self) -> None:
        task = self._task(required_integration_status="dev_deployed")
        state = self._state(task)
        cfg = {"branch_strategy": {"integration_gate": {"enabled": True}}}
        env = self._done_env(
            INTEGRATION_STATUS="merged_to_dev",
            PR_URL="https://example.test/pr/123",
            CI_STATUS="passed",
            CI_RUN_URL="https://example.test/ci/123",
            MERGED_REF="origin/dev",
            MERGE_COMMIT="abc123",
        )
        with (
            mock.patch.dict(os.environ, env, clear=True),
            mock.patch.object(ai_status, "git_commit_exists", return_value=True),
            mock.patch.object(ai_status, "_load_orchestrator_config", return_value=cfg),
            mock.patch.object(ai_status, "append_log"),
        ):
            with self.assertRaisesRegex(SystemExit, "requires INTEGRATION_STATUS>=dev_deployed"):
                ai_status.command_done(state, ["I18N-OPS-03", "merged but not deployed"])
        self.assertEqual(task["status"], "review_approved")

    def test_dev_deploy_required_task_requires_full_evidence(self) -> None:
        task = self._task(required_integration_status="dev_deployed")
        state = self._state(task)
        cfg = {"branch_strategy": {"integration_gate": {"enabled": True}}}
        env = self._done_env(
            INTEGRATION_STATUS="dev_deployed",
            PR_URL="https://example.test/pr/123",
            CI_STATUS="passed",
            CI_RUN_URL="https://example.test/ci/123",
            MERGED_REF="origin/dev",
            MERGE_COMMIT="abc123",
            DEV_DEPLOY_RUN_URL="https://example.test/deploy/123",
            DEV_DEPLOY_SHA="abc123",
        )
        with (
            mock.patch.dict(os.environ, env, clear=True),
            mock.patch.object(ai_status, "git_commit_exists", return_value=True),
            mock.patch.object(ai_status, "_load_orchestrator_config", return_value=cfg),
            mock.patch.object(ai_status, "append_log"),
        ):
            with self.assertRaisesRegex(SystemExit, "missing DEV_DEPLOY_SOURCE_REF"):
                ai_status.command_done(state, ["I18N-OPS-03", "deployed but source ref missing"])
        self.assertEqual(task["status"], "review_approved")

    def test_dev_deploy_required_task_accepts_full_evidence(self) -> None:
        task = self._task(required_integration_status="dev_deployed")
        state = self._state(task)
        cfg = {"branch_strategy": {"integration_gate": {"enabled": True}}}
        env = self._done_env(
            INTEGRATION_STATUS="dev_deployed",
            PR_URL="https://example.test/pr/123",
            CI_STATUS="passed",
            CI_RUN_URL="https://example.test/ci/123",
            MERGED_REF="origin/dev",
            MERGE_COMMIT="abc123",
            DEV_DEPLOY_RUN_URL="https://example.test/deploy/123",
            DEV_DEPLOY_SHA="abc123",
            DEV_DEPLOY_SOURCE_REF="publish/v2026.08.02.0",
        )
        with (
            mock.patch.dict(os.environ, env, clear=True),
            mock.patch.object(ai_status, "git_commit_exists", return_value=True),
            mock.patch.object(ai_status, "_load_orchestrator_config", return_value=cfg),
            mock.patch.object(ai_status, "append_log"),
        ):
            ai_status.command_done(state, ["I18N-OPS-03", "merged and deployed to dev"])
        self.assertEqual(task["status"], "done")
        self.assertEqual(task["integration_status"], "dev_deployed")

    def test_support_only_sidecar_still_allows_not_applicable(self) -> None:
        task = self._task(task_class="sidecar", mutates_canonical=False)
        state = self._state(task)
        cfg = {"branch_strategy": {"integration_gate": {"enabled": True}}}
        with (
            mock.patch.dict(os.environ, {"AI_NAME": "Codex", "NO_COMMIT_REQUIRED": "1"}, clear=True),
            mock.patch.object(ai_status, "_load_orchestrator_config", return_value=cfg),
            mock.patch.object(ai_status, "append_log"),
        ):
            ai_status.command_done(state, ["I18N-OPS-03", "support-only packet finalized"])
        self.assertEqual(task["status"], "done")
        self.assertEqual(task["integration_status"], "not_applicable")

    def test_status_authority_version_stamped_on_load(self) -> None:
        state = ai_status.default_state()
        self.assertEqual(state.get("status_authority_version"), "2026-08-02.v1")
        self.assertEqual(state.get("status_authority_handshake"), "ORCH-STATUS-AUTHORITY-003")

    def test_required_evidence_fields_enforcement(self) -> None:
        task = {
            "id": "REL-REF-EMBED-002",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "review_approved",
            "required_integration_status": "dev_deployed",
            "required_evidence_fields": [
                "pr_url",
                "ci_run_url",
                "merge_commit",
                "dev_deploy_run_url",
                "dev_deploy_sha",
                "live_verification_urls",
            ],
        }
        completion_metadata = {
            "integration_status": "dev_deployed",
            "pr_url": "https://github.com/test/pr/1",
            "ci_run_url": "https://github.com/test/ci/1",
            "merge_commit": "abc123",
            "dev_deploy_run_url": "https://github.com/test/deploy/1",
            "dev_deploy_sha": "abc123",
        }
        with self.assertRaisesRegex(SystemExit, "requires evidence fields: live_verification_urls"):
            ai_status.enforce_required_integration_closeout(task, completion_metadata)

    def test_delegation_to_canonical_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            canonical_root = Path(tmpdir) / "canonical"
            worktree_root = Path(tmpdir) / "worktree"
            (canonical_root / "scripts").mkdir(parents=True)
            (worktree_root / "scripts").mkdir(parents=True)

            canonical_script = canonical_root / "scripts" / "ai_status.py"
            canonical_script.write_text("# canonical\n", encoding="utf-8")

            with (
                mock.patch.object(ai_status, "ROOT", canonical_root),
                mock.patch.object(ai_status, "_LOCAL_ROOT", worktree_root),
                mock.patch.dict(os.environ, {}, clear=True),
                mock.patch.object(os, "execv") as mock_execv,
            ):
                ai_status.ensure_canonical_delegation(["ai_status.py", "show", "T1"])

            mock_execv.assert_called_once_with(
                sys.executable,
                [sys.executable, str(canonical_script), "show", "T1"],
            )
            self.assertTrue(canonical_script.exists())


if __name__ == "__main__":
    unittest.main()
