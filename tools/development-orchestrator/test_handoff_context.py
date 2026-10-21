"""Current handoffs stay bounded without discarding legacy findings or contracts."""
from __future__ import annotations

import copy
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from common import build_task_brief
from control_plane.domain.handoff_context import MAX_NEXT_CHARACTERS, validate_next_text


SCRIPT = Path(__file__).parent / "bin" / "ai_status.py"
SPEC = importlib.util.spec_from_file_location("handoff_status", SCRIPT)
assert SPEC and SPEC.loader
status_cli = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(status_cli)


class HandoffContextTests(unittest.TestCase):
    def task(self):
        return {
            "id": "TEST-HANDOFF", "owner": "Codex", "reviewer": "Claude",
            "status": "in_progress", "next": "Current action",
            "task_spec_ref": "spec/full-requirements.json", "candidate_sha": "a" * 40,
            "candidate_generation": "generation-a", "required_acceptance": ["original-proof"],
            "acceptance": ["Preserve the complete product requirement"],
            "write_scopes": ["apps/example/"], "evidence_refs": ["evidence/full-findings.txt"],
        }

    def test_legacy_preview_identifies_exact_full_source_and_preserves_contract(self):
        text = "  原始開頭\n" + "x" * 9000 + "critical middle finding" + "y" * 9000 + "\n原始結尾  "
        task = {**self.task(), "next": text}
        original = copy.deepcopy(task)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "ai-status.json"
            canonical = json.dumps({"tasks": [task]}, ensure_ascii=False).encode("utf-8")
            path.write_bytes(canonical)
            brief = build_task_brief({"paths": {"status_file": str(path)}}, task)
            self.assertLess(len(brief), 5000)
            self.assertIn("preview only", brief)
            self.assertIn(str(path), brief)
            self.assertIn("task id `TEST-HANDOFF`, field `next`", brief)
            self.assertIn(hashlib.sha256(text.encode("utf-8")).hexdigest(), brief)
            self.assertIn("原始開頭", brief)
            self.assertIn("原始結尾", brief)
            self.assertNotIn("critical middle finding", brief)
            self.assertEqual(path.read_bytes(), canonical)
            self.assertEqual(json.loads(path.read_bytes())["tasks"][0]["next"], text)
        self.assertEqual(task, original)
        for value in ("spec/full-requirements.json", "a" * 40, "generation-a", "original-proof",
                      "Preserve the complete product requirement", "apps/example/", "evidence/full-findings.txt"):
            self.assertIn(value, brief)

    def test_limit_counts_characters_and_keeps_all_normal_feedback(self):
        text = "界" * (MAX_NEXT_CHARACTERS - 16) + " critical ending"
        self.assertEqual(len(text), MAX_NEXT_CHARACTERS)
        validate_next_text(text)
        self.assertIn(text, build_task_brief({}, {**self.task(), "next": text}))
        with self.assertRaisesRegex(ValueError, "Preserve the full findings"):
            validate_next_text(text + "界")

    def test_metadata_append_is_rejected_before_task_or_log_changes(self):
        task = self.task()
        state = {"tasks": [task], "agents": [], "handoffs": [], "blockers": []}
        original = copy.deepcopy(state)
        for field in ("next", "resolved_parent_next"):
            with self.subTest(field=field), mock.patch.dict(os.environ, {
                "TASK_METADATA_JSON": json.dumps({field: "x" * 4001})
            }, clear=True), mock.patch.object(status_cli, "append_log") as log:
                with self.assertRaisesRegex(ValueError, "next exceeds 4000"):
                    status_cli.command_assign(state, [task["id"], "Codex", "Claude"])
                self.assertEqual(state, original)
                log.assert_not_called()

    def test_lifecycle_rejects_oversized_input_before_any_mutation(self):
        message = "x" * 4001
        tid = self.task()["id"]
        cases = {
            "reassign": [tid, "Codex", "Claude", message],
            "resume_blocked": [tid, "todo", message],
            "start": [tid, message], "progress": [tid, message], "note": [tid, message],
            "reopen": [tid, message], "handoff": [tid, "Claude", message],
            "blocker": [tid, message, "Claude"], "system_block": [tid, message],
            "approve": [tid, message], "reconcile_candidate": [tid, message],
            "record_acceptance": [tid, message],
        }
        for command, args in cases.items():
            with self.subTest(command=command), mock.patch.object(status_cli, "append_log") as log:
                state = {"tasks": [self.task()], "agents": [], "handoffs": [], "blockers": []}
                original = copy.deepcopy(state)
                with self.assertRaisesRegex(ValueError, "No handoff text was truncated"):
                    getattr(status_cli, "command_" + command)(state, args)
                self.assertEqual(state, original)
                log.assert_not_called()

    def test_short_note_preserves_existing_evidence_and_execution_contract(self):
        task = {**self.task(), "next": "legacy" * 2000}
        state = {"tasks": [task]}
        original = copy.deepcopy(task)
        with mock.patch.object(status_cli, "append_log") as log:
            status_cli.command_note(state, [task["id"], "Fix the rejection path; see evidence/full-findings.txt"])
        self.assertEqual({k: v for k, v in task.items() if k not in {"next", "last_update"}},
                         {k: v for k, v in original.items() if k not in {"next", "last_update"}})
        self.assertEqual(log.call_args.args[0]["message"], task["next"])

    def test_unrelated_metadata_update_does_not_require_rewriting_legacy_handoff(self):
        task = {**self.task(), "next": "legacy" * 2000}
        state = {"tasks": [task], "agents": [], "handoffs": [], "blockers": []}
        with mock.patch.dict(os.environ, {
            "TASK_METADATA_JSON": json.dumps({"evidence_refs": ["evidence/history.txt"]})
        }, clear=True), mock.patch.object(status_cli, "append_log"):
            status_cli.command_assign(state, [task["id"], task["owner"], task["reviewer"]])
        self.assertEqual(task["next"], "legacy" * 2000)
        self.assertEqual(task["evidence_refs"], ["evidence/history.txt"])

    def completion_fixture(self, command):
        helper = {**self.task(), "task_class": "unblock", "helper_parent": "PARENT", "required_acceptance": []}
        parent = {"id": "PARENT", "owner": "Gemini", "reviewer": "Claude", "status": "blocked", "next": "Waiting"}
        environment = {"AI_NAME": "Claude"}
        if command == "approve":
            helper.update(status="review", mutates_canonical=False, candidate_sha="not_applicable")
        elif command == "reconcile_candidate":
            helper.update(status="integrating", reviewed_sha="a" * 40, ci_sha="a" * 40, ci_status="running")
            environment.update(CANDIDATE_CI_STATUS="success", MERGE_SHA="b" * 40, PR_URL="https://example.test/new-pr")
        else:
            helper.update(status="acceptance", merge_sha="b" * 40, required_acceptance=["proof"], acceptance_evidence={})
            environment["ACCEPTANCE_EVIDENCE_JSON"] = json.dumps({"proof": "evidence/new-proof.json"})
        state = {"tasks": [helper, parent], "agents": [],
                 "handoffs": [{"task_id": helper["id"], "status": "pending"}],
                 "blockers": [{"task_id": helper["id"], "status": "open"}]}
        return state, helper, parent, environment

    def test_parent_handoff_rejected_before_completion_entrypoint_mutations(self):
        for command in ("approve", "reconcile_candidate", "record_acceptance"):
            for source in ("PARENT_NEXT", "resolved_parent_next"):
                with self.subTest(command=command, source=source):
                    state, helper, parent, environment = self.completion_fixture(command)
                    if source == "PARENT_NEXT":
                        environment[source] = "x" * 4001
                    else:
                        helper[source] = "x" * 4001
                    original = copy.deepcopy(state)
                    with (mock.patch.dict(os.environ, environment, clear=True),
                          mock.patch.object(status_cli, "append_log") as log,
                          mock.patch.object(status_cli, "merge_reachability") as reachability):
                        with self.assertRaisesRegex(ValueError, "next exceeds 4000"):
                            getattr(status_cli, "command_" + command)(state, [helper["id"], "Short completion"])
                    self.assertEqual(state, original)
                    log.assert_not_called()
                    reachability.assert_not_called()

    def test_unused_parent_handoff_does_not_block_other_lifecycle_changes(self):
        for command in ("approve", "reconcile_candidate", "record_acceptance"):
            for reason in ("not_unblock", "absent_parent", "external_gate", "parent_ready", "incomplete_acceptance"):
                with self.subTest(command=command, reason=reason):
                    state, helper, parent, environment = self.completion_fixture(command)
                    environment["PARENT_NEXT"] = "x" * 4001
                    if reason == "not_unblock":
                        helper["task_class"] = "implementation"
                    elif reason == "absent_parent":
                        state["tasks"].remove(parent)
                    elif reason == "external_gate":
                        parent["external_gate"] = True
                    elif reason == "parent_ready":
                        parent["status"] = "todo"
                    else:
                        helper["required_acceptance"].append("future-proof")
                    original_parent = copy.deepcopy(parent)
                    with (mock.patch.dict(os.environ, environment, clear=True),
                          mock.patch.object(status_cli, "append_log"),
                          mock.patch.object(status_cli, "merge_reachability", return_value="unknown")):
                        getattr(status_cli, "command_" + command)(state, [helper["id"], "Short completion"])
                    self.assertEqual(parent, original_parent)
                    self.assertEqual(helper["status"], "acceptance" if reason == "incomplete_acceptance" else "done")

    def test_direct_completion_validates_parent_before_reachability_and_state_changes(self):
        state, helper, parent, environment = self.completion_fixture("approve")
        environment["PARENT_NEXT"] = "x" * 4001
        original = copy.deepcopy(state)
        with (mock.patch.dict(os.environ, environment, clear=True),
              mock.patch.object(status_cli, "merge_reachability") as reachability):
            with self.assertRaisesRegex(ValueError, "next exceeds 4000"):
                status_cli.transition_after_merge(state, helper, message="Short completion", timestamp="2026-10-18T00:00:00Z")
        self.assertEqual(state, original)
        reachability.assert_not_called()


if __name__ == "__main__":
    unittest.main()
