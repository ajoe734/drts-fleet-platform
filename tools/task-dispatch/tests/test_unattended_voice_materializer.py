"""Hermetic registration tests; no live task board, network, or runtime writes."""
from __future__ import annotations

from copy import deepcopy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "tools/task-dispatch/dispatch-unattended-voice-booking-20260906.py"
SPEC = importlib.util.spec_from_file_location("voice_materializer", SCRIPT)
assert SPEC and SPEC.loader
wave = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(wave)
SOURCE = "1" * 40


class MaterializerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        refs = {}
        for field in wave.REFERENCE_FIELDS:
            relative = f"docs/{field}.md"
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(field, encoding="utf-8")
            refs[field] = relative
        base = {
            "id": "UV-EXEC-001", "title": "Implement, verify, preserve",
            "summary_zh": "逗號不應拆散驗收條件", "owner": "Claude2", "reviewer": "Codex",
            "depends_on": [], "artifacts": ["apps/api/", "docs/"],
            "acceptance": ["One transaction, no partially published graph"],
            "fr_ids": sorted(wave.FR_IDS), "ac_ids": sorted(wave.AC_IDS),
            "workstream": "voice-domain", "initial_status": "backlog",
            "external_gate": False, "required_acceptance": [],
            "task_class": "implementation", "mutates_canonical": True,
            "priority": "P1", "test_commands": ["python3 -m unittest"],
        }
        gate = {
            **deepcopy(base), "id": "UV-EXEC-002", "owner": "Gemini2", "reviewer": "Codex2",
            "depends_on": [base["id"]], "fr_ids": [], "ac_ids": [],
            "initial_status": "blocked", "external_gate": True,
            "required_acceptance": ["live_call_evidence"], "gate_reason": "Live test account and evidence required",
            "task_class": "verification", "mutates_canonical": False,
        }
        self.manifest = {"wave_id": "unattended-voice-test", **refs, "tasks": [base, gate]}
        self.board = wave.load_board(REPO, self.root)
        self.state = {"execution_mode": "supervisor_managed_execution", "tasks": [], "agents": [], "blockers": [], "handoffs": []}
        self.published = []
        self.logs = []
        self.board.append_log = lambda entry: self.logs.append(deepcopy(entry))
        runtime = self.board.TaskBoardCommandRuntime(
            status_file=self.root / "ai-status.json",
            load_state=lambda: deepcopy(self.state),
            save_state=self.save,
            sync_all=self.sync,
            read_only_commands={}, mutation_commands={},
        )
        self.board._command_runtime = lambda: runtime

    def tearDown(self):
        self.temp.cleanup()

    def save(self, state):
        self.state = deepcopy(state)

    def sync(self, state):
        self.board.validate_state(state)
        wave.verify_materialized(self.manifest, state)
        self.published.append(deepcopy(state))
        self.save(state)

    def apply(self):
        ordered = wave.validate_manifest(self.manifest, self.root)
        return wave.apply_wave(self.board, self.manifest, ordered, SOURCE)

    def test_single_publish_full_graph_and_external_gate(self):
        with patch.dict(os.environ, {"TASK_REASSIGN_REOPEN": "1", "TASK_ACCEPTANCE": "bad,ambient", "TASK_CLASS": "release"}):
            result = self.apply()
            self.assertEqual(os.environ["TASK_CLASS"], "release")
        self.assertEqual(result["created"], ["UV-EXEC-001", "UV-EXEC-002"])
        self.assertEqual(len(self.published), 1)
        first, second = self.state["tasks"]
        self.assertEqual(first["status"], "backlog")
        self.assertNotIn("waiting_for", first)
        self.assertNotIn("gate_reason", first)
        self.assertNotIn("materialization_hold", first)
        self.assertEqual(first["acceptance"], self.manifest["tasks"][0]["acceptance"])
        self.assertEqual(first["eligible_agents"], wave.ELIGIBLE_AGENTS)
        self.assertEqual(second["status"], "blocked")
        self.assertEqual(second["gate_reason"], self.manifest["tasks"][1]["gate_reason"])
        self.assertEqual(second["required_acceptance"], ["live_call_evidence"])
        self.assertNotIn("materialization_hold", second)

    def test_retry_preserves_active_done_blocked_evidence_and_reassignment(self):
        self.apply()
        self.state["tasks"][0].update({
            "status": "done", "candidate_sha": "2" * 40, "merge_sha": "3" * 40,
            "acceptance_evidence": {"actual": "evidence-url"},
            "owner": "Claude", "reviewer": "Gemini2", "next": "Completed through supervisor",
        })
        self.state["tasks"][1]["next"] = "New provider blocker discovered"
        before = deepcopy(self.state["tasks"])
        result = self.apply()
        self.assertEqual(result["created"], [])
        self.assertEqual(self.state["tasks"], before)

    def test_legal_six_lane_fallback_is_preserved_and_reported_honestly(self):
        self.apply()
        self.state["tasks"][0].update({
            "status": "in_progress", "owner": "Codex", "reviewer": "Gemini2",
            "candidate_sha": "2" * 40, "next": "Supervisor assigned available fallback lanes",
        })
        before = deepcopy(self.state["tasks"])
        self.assertEqual(self.apply()["created"], [])
        self.assertEqual(self.state["tasks"], before)
        notices = wave.verify_materialized(self.manifest, self.state)
        self.assertEqual(len(notices), 1)
        self.assertIn("preserving supervisor assignment Codex -> Gemini2", notices[0])
        self.assertIn("differs from initial", notices[0])
        self.state["tasks"][0]["reviewer"] = "Codex"
        with self.assertRaisesRegex(ValueError, "unsupported assignment"):
            wave.verify_materialized(self.manifest, self.state)

    def test_collision_fails_before_creating_missing_tasks(self):
        self.apply()
        self.state["tasks"] = self.state["tasks"][:1]
        self.state["tasks"][0]["acceptance"] = ["another task contract"]
        before = deepcopy(self.state)
        self.published.clear()
        with self.assertRaisesRegex(ValueError, "conflicting acceptance"):
            self.apply()
        self.assertEqual(self.state, before)
        self.assertFalse(self.published)

    def test_archived_completed_id_cannot_be_recreated_by_retry(self):
        self.state["archived_task_ids"] = ["UV-EXEC-002"]
        before = deepcopy(self.state)
        with self.assertRaisesRegex(ValueError, "is archived"):
            self.apply()
        self.assertEqual(self.state, before)
        self.assertFalse(self.published)
        self.assertFalse(self.logs)
        with self.assertRaisesRegex(ValueError, "is archived"):
            wave.verify_materialized(self.manifest, self.state, require_all=False)

    def test_assign_failure_never_publishes_partial_graph(self):
        assign = self.board.command_assign

        def fail_second(state, args):
            if args[0] == "UV-EXEC-002":
                raise RuntimeError("injected second registration failure")
            assign(state, args)
        with patch.object(self.board, "command_assign", fail_second):
            with self.assertRaisesRegex(RuntimeError, "injected"):
                self.apply()
        self.assertEqual(self.state["tasks"], [])
        self.assertFalse(self.published)
        self.assertEqual(len(self.apply()["created"]), 2)

    def test_full_graph_verified_before_any_resume(self):
        resume = self.board.command_resume_blocked

        def inspect(state, args):
            self.assertEqual(len(state["tasks"]), 2)
            self.assertTrue(all(task["status"] == "blocked" for task in state["tasks"]))
            wave.verify_materialized(self.manifest, state)
            resume(state, args)
        with patch.object(self.board, "command_resume_blocked", inspect):
            self.apply()

    def test_refuses_to_change_planning_mode(self):
        self.state["execution_mode"] = "discussion_planning"
        with self.assertRaisesRegex(ValueError, "execution mode|supervisor_managed_execution"):
            self.apply()
        self.assertFalse(self.published)

    def test_topologically_sorts_and_rejects_cycle_missing_and_duplicate_ids(self):
        self.manifest["tasks"].reverse()
        self.assertEqual(wave.validate_manifest(self.manifest, self.root)[0]["id"], "UV-EXEC-001")
        self.manifest["tasks"][1]["depends_on"] = ["UV-EXEC-002"]
        with self.assertRaisesRegex(ValueError, "cycle"):
            wave.validate_manifest(self.manifest, self.root)
        self.manifest["tasks"][1]["depends_on"] = ["UV-EXEC-999"]
        with self.assertRaisesRegex(ValueError, "Missing dependency"):
            wave.validate_manifest(self.manifest, self.root)
        self.manifest["tasks"][1]["depends_on"] = []
        self.manifest["tasks"].append(deepcopy(self.manifest["tasks"][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate task id"):
            wave.validate_manifest(self.manifest, self.root)

    def test_rejects_missing_coverage_wrong_lane_and_ungated_block(self):
        base = deepcopy(self.manifest)
        for mutate, message in (
            (lambda m: m["tasks"][0]["ac_ids"].remove("UV-AC-048"), "Coverage missing"),
            (lambda m: m["tasks"][0].update(owner="Codex"), "agy/Gemini or Claude"),
            (lambda m: m["tasks"][0].update(reviewer="Claude"), "initial reviewer must use Codex"),
            (lambda m: m["tasks"][1].update(required_acceptance=[]), "requires acceptance"),
            (lambda m: m["tasks"][1].update(gate_reason=""), "gate_reason"),
            (lambda m: m["tasks"][1].update(waiting_for="Supervisor"), "worker lane"),
        ):
            with self.subTest(message=message):
                manifest = deepcopy(base)
                mutate(manifest)
                with self.assertRaisesRegex(ValueError, message):
                    wave.validate_manifest(manifest, self.root)

    def test_readiness_external_task_can_start_in_backlog(self):
        self.manifest["tasks"][1]["initial_status"] = "backlog"
        self.apply()
        self.assertEqual(self.state["tasks"][1]["status"], "backlog")
        self.assertEqual(self.state["tasks"][1]["required_acceptance"], ["live_call_evidence"])

    def test_read_only_default_does_not_load_task_board(self):
        manifest_path = self.root / "manifest.json"
        manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")
        with patch.object(wave, "REPO", self.root), patch.object(wave, "load_board") as load:
            self.assertEqual(wave.main(["--manifest", str(manifest_path), "--status-root", str(self.root)]), 0)
            load.assert_not_called()


class SourceProofTests(unittest.TestCase):
    def test_merged_exact_blobs_required_with_local_bare_origin(self):
        # Local Git remote exercises ancestry and blob proof without network access.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            repo, origin = root / "checkout", root / "origin.git"
            subprocess.run(["git", "init", "--bare", "--quiet", str(origin)], check=True)
            subprocess.run(["git", "init", "--quiet", "-b", "dev", str(repo)], check=True)
            wave.git(repo, "config", "user.name", "Test")
            wave.git(repo, "config", "user.email", "test@example.invalid")
            manifest = {field: f"docs/{field}.md" for field in wave.REFERENCE_FIELDS}
            paths = [wave.SCRIPT_REF, wave.MANIFEST_REF, *manifest.values()]
            for relative in paths:
                path = repo / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(relative, encoding="utf-8")
            wave.git(repo, "add", ".")
            wave.git(repo, "commit", "--quiet", "-m", "merged source")
            wave.git(repo, "remote", "add", "origin", str(origin))
            wave.git(repo, "push", "--quiet", "-u", "origin", "dev")
            source = wave.git(repo, "rev-parse", "HEAD")
            manifest_path = repo / wave.MANIFEST_REF
            self.assertEqual(wave.verify_source(repo, manifest_path, manifest, source), source)
            (repo / manifest["planning_ref"]).write_text("uncommitted change", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "blob differs"):
                wave.verify_source(repo, manifest_path, manifest, source)
            wave.git(repo, "add", ".")
            wave.git(repo, "commit", "--quiet", "-m", "not merged")
            with self.assertRaisesRegex(ValueError, "merge-base failed"):
                wave.verify_source(repo, manifest_path, manifest, "HEAD")
            wave.git(repo, "update-ref", "refs/remotes/origin/dev", "HEAD")
            with self.assertRaisesRegex(ValueError, "origin/dev is stale"):
                wave.verify_source(repo, manifest_path, manifest, source)


if __name__ == "__main__":
    unittest.main()
