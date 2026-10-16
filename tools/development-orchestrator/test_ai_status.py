#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import os
import subprocess
import pathlib
import tempfile
import unittest
from unittest import mock
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "ai_status", ROOT / "tools" / "development-orchestrator" / "bin" / "ai_status.py"
)
assert SPEC is not None and SPEC.loader is not None
ai_status = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ai_status)


# Complete sealed C073 task, not a reduced invented lifecycle fixture.
# Authority SHA256: 6d3dc0f114c637c44f38fcbe20d3f6e45ec6a0b19e8d115ba24f1c448aa8806b
FROZEN_C073_TASK = json.loads(r'''
{
  "id": "C073-OFFBOARDING-FINAL-EXIT-FLOW-20261015",
  "title": "原C073正式退場閉環綁定canonical資格並禁止已配對退場車回候選",
  "summary_zh": "完成原終止委託／下架／debranding最終退場的真canonical ACK與讀回、候選／派送拒絕；保留暫時除標識恢復與既有terminated guards，不把所有completed永久retired。",
  "phase": "remaining-original-functional-fixes-20261015",
  "owner": "Claude",
  "reviewer": "Claude2",
  "status": "in_progress",
  "depends_on": [
    "SR-QA-SUPPLY-001"
  ],
  "artifacts": [],
  "acceptance": [
    "Complete the original final commission termination/offboarding/debranding flow through the actual existing handlers and canonical registry state. A final-exit success must await its required canonical write, propagate pending/rejected storage honestly, and return a record/envelope only after success. Retain work-order reference/completion evidence and authoritative readback; a log-only catch, optimistic cache or local receipt is insufficient. Bind final exit to existing lifecycle/contract eligibility without silently inventing new financial, identity or re-entry policy. Scope a throwing/awaited persistence path to the actual affected C073 mutations; do not alter unrelated shared writers.",
    "Use an existing healthy vehicle with a real driver/vehicle supply pair, valid current commission/insurance/approved exclusivity and legitimate service/driver conditions. Demonstrate original-before failure and fixed-after that final exit remains excluded after pending→complete debranding and in the no-debranding final-exit branch. Exercise getVehicleDispatchability, actual getEligibleCandidates and real service-product/owned assignment/candidate consumers or their actual production guard entry points. A newly provisioned unpaired vehicle being absent proves nothing about retired candidate re-entry. Preserve final-exit state/evidence through existing persistence/readback, and test rejected/pending write behavior without starting a VM database/server.",
    "Preserve legitimate temporary/nonretired debranding/compliance recovery and independently valid commission semantics; do not make every completed work-order permanently retired. Preserve actual contract_terminated rejection, manual hold, insurance/exclusivity, vehicle/driver/product/tenant/auth guards, duplicate/no-pending completion refusal, original noDB/controlled mode and report monthly-removal evidence. The old Source QA restoration assertion must be qualified explicitly against final-exit versus nonretired behavior using original C073/SA/PRD authority, not silently deleted, skipped or weakened. No USER technical-method decision or new standalone authority report is required merely to bind this original final-exit rule.",
    "After normal shared-file serialization with the original Demo holder, adapt only the verified direct async callers in authorized hunks, add meaningful task-owned regressions using actual production methods/controllers and retain all original business/SQL/negative assertions. Run impacted repository unit/typecheck/lint and mandatory exact-candidate CI; record actual commands/exits, original-before/fixed-after, base/candidate, original assigned independent reviewer verdict and normal protected merge in task UAT and the four own Source keys. No VM product/dev/preview/HTTP/browser/E2E/PG/Docker server. Source DONE is scoped; original full C073 real-role/hosted and whole-goal/Final evidence is not inferred."
  ],
  "next": "CI unit job timed out at 20min amid heavy concurrent CI load, not a code failure. Reran failed job via gh run rerun --failed; monitoring for green.",
  "last_update": "2026-10-16T01:23:36Z",
  "candidate_lifecycle_version": 1,
  "task_class": "implementation",
  "mutates_canonical": true,
  "external_gate": false,
  "write_scopes": [
    "apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts",
    "apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts",
    "apps/api/tests/unit/regulatory-registry.service.test.ts",
    "tests/unit/system-remediation/sr-qa-supply-001/sr-qa-supply-001-registry-eligibility.test.ts",
    "tests/unit/reporting-filing.test.ts",
    "tests/unit/c073-final-offboarding-eligibility-20261015/",
    "docs/04-uat/system-remediation-20260906/C073-OFFBOARDING-FINAL-EXIT-FLOW-20261015.md"
  ],
  "required_acceptance": [
    "c073-final-exit_canonical-ack-and-readback",
    "c073-final-exit_paired-candidate-and-assignment-refusal",
    "c073-final-exit_temporary-recovery-and-existing-guards-preserved",
    "c073-final-exit_exact-candidate-validation"
  ],
  "priority": "P1",
  "eligible_agents": {
    "owner": [
      "Claude"
    ],
    "reviewer": [
      "Claude2"
    ]
  },
  "registered_by": "Supervisor original C073/C097/C109 accepted Source gaps; no new product capability",
  "read_dependencies": [
    "/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1114-internal-functional-root/C073-current-accepted-offboarding-debranding-dataflow-readonly-audit.json",
    "/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1114-internal-functional-root/C073-OFFBOARDING-FINAL-EXIT-FLOW-20261015.task-spec.json",
    "/home/lupin/workspace/drts-fleet-platform/docs/02-architecture/phase1-operational-complete-remediation-plan-20260430.md",
    "/home/lupin/workspace/drts-fleet-platform/docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md",
    "/home/lupin/workspace/drts-fleet-platform/docs/04-uat/system-remediation-20260906/SR-QA-SUPPLY-001.md",
    "/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T2159-original-remaining-work-and-safe-execution-root/ONE-current-original-remaining-frontier-and-writer-preflight.json",
    "/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T2159-original-remaining-work-and-safe-execution-root/Demo-original-acceptance-worker-and-two-Source-hunk-holder-metadata-readonly-evidence.json",
    "/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T2159-original-remaining-work-and-safe-execution-root/C073-OFFBOARDING-FINAL-EXIT-FLOW-20261015-R2.task-spec.json",
    "/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T2159-original-remaining-work-and-safe-execution-root/TENANT-PRIVILEGED-GRANT-SESSION-CONSUMER-FLOW-20261015-R2.task-spec.json",
    "/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/actual-E04-unstarted-R2-normal-source-capacity-assignment.json",
    "/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/E04-unstarted-source-capacity-routing-readonly-audit-20261016.json"
  ],
  "task_spec_ref": "/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T2159-original-remaining-work-and-safe-execution-root/C073-OFFBOARDING-FINAL-EXIT-FLOW-20261015-R2.task-spec.json",
  "task_spec_sha256": "d359621e4f3734f1fb02a1a95e0ffa3d1208ddbb2b7fac4674381ee1d8970190",
  "source_commit": "8e56ea2db5435d57834899fca8018634b0a9fac0",
  "branch": "claude/c073-offboarding-final-exit-flow-20261015",
  "integration_notes": "Original requirement continuation only. Preserve accepted narrow Source/QA/live credit and original task objects, no reopened DONE or added product denominator. Shared-file dependencies serialize the existing Demo/adapter and the new placard/notice writers; they do not redefine full capability or create global Source gates. No VM product/runtime, cloud/Operator, Root WIP or other-worker control.",
  "candidate_generation": "15e8a4dee19c4edba69678858407e8b4",
  "candidate_sha": "f86d772bf7e4c4fcc1c1cf7ea813ad29c1be22e1",
  "candidate_branch": "claude/c073-offboarding-final-exit-flow-20261015",
  "worker_outcomes": {
    "claude-20261015T233540Z-4e110351": {
      "outcome": "advanced",
      "command": "handoff",
      "agent": "Claude",
      "role": "owner",
      "candidate_sha": "f86d772bf7e4c4fcc1c1cf7ea813ad29c1be22e1",
      "candidate_generation": "15e8a4dee19c4edba69678858407e8b4",
      "summary": "Fixed C073 final-exit eligibility bug (completed offboarding, both debranding-required and no-debranding branches, never blocked dispatch/candidates/real assignment guard once offboarding closed out; now permanent). Added throwing/awaited canonical persistence for initiate/completeVehicleDebranding. Flipped and annotated pre-existing tests that encoded the bug; added tests/unit/c073-final-offboarding-eligibility-20261015/ with real RegulatoryRegistryService+VehicleEligibilityService wiring against a paired seed vehicle, incl. a reversible manual-hold control case. UAT doc at docs/04-uat/system-remediation-20260906/C073-OFFBOARDING-FINAL-EXIT-FLOW-20261015.md, including explicit supersession note over SR-QA-SUPPLY-001's stale C073 claim. All targeted vitest suites green; tsc/eslint show only pre-existing unrelated repo drift, verified zero new errors in touched files. Pushed to origin.",
      "at": "2026-10-16T00:02:16Z"
    },
    "claude-20261016T011916Z-9c7634f6": {
      "outcome": "progress",
      "command": "progress",
      "agent": "Claude",
      "role": "owner",
      "candidate_sha": "f86d772bf7e4c4fcc1c1cf7ea813ad29c1be22e1",
      "candidate_generation": "15e8a4dee19c4edba69678858407e8b4",
      "summary": "CI unit job timed out at 20min amid heavy concurrent CI load, not a code failure. Reran failed job via gh run rerun --failed; monitoring for green.",
      "at": "2026-10-16T01:23:36Z"
    }
  },
  "pr_url": "https://github.com/ajoe734/drts-fleet-platform/pull/2713",
  "ci_status": "failure",
  "ci_sha": "f86d772bf7e4c4fcc1c1cf7ea813ad29c1be22e1",
  "ci_run_url": "https://github.com/ajoe734/drts-fleet-platform/actions/runs/38827374690/job/116737961705"
}
''')


class CiRecoveryIndependentReviewTest(unittest.TestCase):
    def setUp(self) -> None:
        from control_plane.domain.dispatch_policy import ReadyDispatchPolicy, resolve_dispatch_target

        self.policy = ReadyDispatchPolicy()
        self.resolve = resolve_dispatch_target
        self.log = mock.patch.object(ai_status, "append_log").start()
        self.addCleanup(mock.patch.stopall)

    def state(self) -> dict:
        return {"tasks": [copy.deepcopy(FROZEN_C073_TASK)], "handoffs": [], "blockers": []}

    def reconcile(self, state: dict, ci: str, **observation: str) -> None:
        task = state["tasks"][0]
        env = {"AI_NAME": "Supervisor", "CANDIDATE_HEAD_SHA": task["candidate_sha"],
               "CANDIDATE_CI_STATUS": ci,
               "CI_RUN_URL": "https://github.com/ajoe734/drts-fleet-platform/actions/runs/38827374483",
               **observation}
        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_reconcile_candidate(state, [task["id"]])

    def decision(self, state: dict):
        task = state["tasks"][0]
        return self.resolve(task, {t["id"]: t for t in state["tasks"]}, self.policy)

    def assert_review(self, state: dict) -> None:
        task = state["tasks"][0]
        self.assertEqual(task["status"], "review")
        decision = self.decision(state)
        self.assertIsNotNone(decision)
        self.assertEqual((decision.target_agent, decision.reason.value), ("Claude2", "review_ready_dispatch"))
        self.assertNotIn("reviewed_sha", task)
        self.assertNotIn("merge_sha", task)
        self.assertNotIn("acceptance_evidence", task)

    def test_full_sealed_c073_each_ci_only_recovery_restores_original_reviewer(self) -> None:
        for ci in ("queued", "running", "success"):
            with self.subTest(ci=ci):
                state = self.state()
                before = copy.deepcopy(state["tasks"][0])
                # Include already-completed handoff routing and unrelated failure
                # evidence: recovery must neither clear nor fabricate them.
                state["handoffs"] = [{"task_id": before["id"], "from": "Claude", "to": "Claude2", "status": "done"}]
                state["blockers"] = [{"task_id": "OTHER", "status": "open"}]
                routing = copy.deepcopy((state["handoffs"], state["blockers"]))
                self.reconcile(state, ci)
                self.assert_review(state)
                task = state["tasks"][0]
                allowed = {"status", "ci_status", "ci_sha", "ci_run_url", "last_update", "next"}
                self.assertEqual({k: v for k, v in task.items() if k not in allowed},
                                 {k: v for k, v in before.items() if k not in allowed})
                self.assertEqual(task["ci_status"], ci)
                self.assertEqual(task["ci_sha"], before["candidate_sha"])
                self.assertEqual((state["handoffs"], state["blockers"]), routing)
                self.assertFalse(any(c.args[0]["type"] == "candidate_approved" for c in self.log.call_args_list))

    def handoff(self, state: dict) -> None:
        task = state["tasks"][0]
        with mock.patch.dict(os.environ, {"AI_NAME": "Claude", "CANDIDATE_SHA": FROZEN_C073_TASK["candidate_sha"],
                                         "CANDIDATE_BRANCH": FROZEN_C073_TASK["candidate_branch"]}, clear=True), \
                mock.patch.object(ai_status, "resolve_full_commit_sha", side_effect=lambda value: value):
            ai_status.command_handoff(state, [task["id"], "Claude2", "Original owner handoff"])

    def test_new_handoff_failure_then_ci_recovery_survives_receipt_pruning(self) -> None:
        for ci in ("queued", "running", "success"):
            state = self.state()
            self.handoff(state)
            task = state["tasks"][0]
            identity = {k: task[k] for k in ("owner", "reviewer", "candidate_sha", "candidate_branch", "candidate_generation")}
            self.assertEqual(task["candidate_review_handoff"], identity)
            task["worker_outcomes"] = {}
            self.reconcile(state, "failure")
            self.assertEqual(task["status"], "in_progress")
            self.reconcile(state, ci)
            self.assert_review(state)
            self.assertEqual(task["candidate_review_handoff"], identity)

    def test_review_phase_ci_updates_still_dispatch_reviewer(self) -> None:
        for ci in ("queued", "running", "success"):
            state = self.state()
            state["tasks"][0]["status"] = "review"
            state["tasks"][0].pop("worker_outcomes")
            self.reconcile(state, ci)
            self.assert_review(state)

    def test_legacy_integrating_without_approval_regains_review(self) -> None:
        state = self.state()
        state["tasks"][0]["status"] = "integrating"
        self.reconcile(state, "success")
        self.assert_review(state)

    def test_stale_or_foreign_handoff_requires_owner_continuation(self) -> None:
        for change in ({"candidate_sha": "b" * 40}, {"candidate_generation": "old"},
                       {"agent": "Codex"}, {"role": "reviewer"}, {"command": "progress"}, {"outcome": "progress"}):
            for ci in ("queued", "running", "success"):
                with self.subTest(change=change, ci=ci):
                    state = self.state()
                    receipt = next(iter(state["tasks"][0]["worker_outcomes"].values()))
                    receipt.update(change)
                    self.reconcile(state, ci)
                    self.assertEqual(state["tasks"][0]["status"], "in_progress")
                    self.assertEqual(self.decision(state).target_agent, "Claude")

    def test_new_snapshot_identity_drift_never_falls_back_to_legacy_receipt(self) -> None:
        for key in ("owner", "reviewer", "candidate_sha", "candidate_branch", "candidate_generation"):
            state = self.state()
            self.handoff(state)
            task = state["tasks"][0]
            task["status"] = "in_progress"
            task["candidate_review_handoff"][key] = "stale"
            self.reconcile(state, "success")
            self.assertEqual(task["status"], "in_progress", key)

    def test_explicit_owner_start_requires_rehandoff_even_with_old_receipt(self) -> None:
        state = self.state()
        task = state["tasks"][0]
        with mock.patch.dict(os.environ, {"AI_NAME": "Claude"}, clear=True):
            ai_status.command_start(state, [task["id"], "Repair source"])
        self.reconcile(state, "success")
        self.assertEqual(task["status"], "in_progress")
        self.assertEqual(self.decision(state).target_agent, "Claude")
        self.handoff(state)
        self.reconcile(state, "success")
        self.assert_review(state)

    def test_real_reopen_and_changed_source_cannot_revive_review(self) -> None:
        for action in ("reopen", "changed_head", "owner_progress"):
            state = self.state()
            self.handoff(state)
            task = state["tasks"][0]
            if action == "reopen":
                with mock.patch.dict(os.environ, {"AI_NAME": "Claude2"}, clear=True):
                    ai_status.command_reopen(state, [task["id"], "Actual repair required"])
            elif action == "changed_head":
                self.reconcile(state, "success", CANDIDATE_HEAD_SHA="b" * 40)
            else:
                task["status"] = "integrating"
                with mock.patch.dict(os.environ, {"AI_NAME": "Claude"}, clear=True):
                    ai_status.command_progress(state, [task["id"], "Owner repair"])
            self.assertNotIn("candidate_review_handoff", task)
            self.assertNotIn("candidate_sha", task)
            with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "CANDIDATE_CI_STATUS": "success",
                                             "CANDIDATE_HEAD_SHA": FROZEN_C073_TASK["candidate_sha"]}, clear=True):
                ai_status.command_reconcile_candidate(state, [task["id"]])
            self.assertEqual(task["status"], "in_progress")
            self.assertEqual(self.decision(state).target_agent, "Claude")

    def test_reviewed_same_sha_ci_paths_remain_integrating(self) -> None:
        for status in ("in_progress", "integrating"):
            for ci in ("queued", "running", "success"):
                state = self.state()
                task = state["tasks"][0]
                task.update(status=status, reviewed_sha=task["candidate_sha"], review_file="original-review.md")
                self.reconcile(state, ci)
                self.assertEqual(task["status"], "integrating")
                self.assertEqual(task["reviewed_sha"], task["candidate_sha"])
                self.assertEqual(task["review_file"], "original-review.md")
                self.assertIsNone(self.decision(state))

    def test_mismatched_approval_is_never_treated_as_same_sha(self) -> None:
        state = self.state()
        task = state["tasks"][0]
        task["reviewed_sha"] = "b" * 40
        self.reconcile(state, "success")
        self.assertEqual(task["status"], "in_progress")
        self.assertEqual(task["reviewed_sha"], "b" * 40)

    def test_failure_closed_and_conflict_keep_owner_guard(self) -> None:
        for status in ("review", "integrating", "in_progress"):
            for ci in ("failure", "closed", "merge_conflict"):
                state = self.state()
                task = state["tasks"][0]
                task["status"] = status
                self.reconcile(state, ci)
                self.assertEqual(task["status"], "in_progress")
                self.assertEqual(task["ci_status"], ci)
                self.assertEqual(self.decision(state).target_agent, "Claude")

    def test_done_is_unchanged_and_blocked_is_not_resumed_by_positive_ci(self) -> None:
        for status in ("done", "blocked"):
            state = self.state()
            task = state["tasks"][0]
            task.update(status=status, waiting_for="Supervisor")
            before = copy.deepcopy(task)
            self.reconcile(state, "success")
            self.assertEqual(task["status"], status)
            self.assertEqual(task["waiting_for"], "Supervisor")
            self.assertIsNone(self.decision(state))
            if status == "done":
                self.assertEqual(task, before)

    def test_closed_conflict_and_owner_repair_still_need_rehandoff_after_ci_or_merge(self) -> None:
        for invalidation in ("closed", "merge_conflict", "start"):
            for merge in ("", "c" * 40):
                state = self.state()
                task = state["tasks"][0]
                if invalidation == "start":
                    with mock.patch.dict(os.environ, {"AI_NAME": "Claude"}, clear=True):
                        ai_status.command_start(state, [task["id"], "Owner repair"])
                else:
                    self.reconcile(state, invalidation)
                self.reconcile(state, "success", MERGE_SHA=merge)
                self.assertEqual(task["status"], "in_progress")
                self.assertEqual(self.decision(state).target_agent, "Claude")
                self.assertNotIn("reviewed_sha", task)
                self.assertNotIn("merge_sha", task)

    def test_branch_observation_cannot_overwrite_frozen_identity(self) -> None:
        state = self.state()
        with self.assertRaisesRegex(SystemExit, "frozen handoff branch"):
            self.reconcile(state, "success", CANDIDATE_BRANCH="foreign/branch")
        self.assertEqual(state["tasks"][0]["candidate_branch"], FROZEN_C073_TASK["candidate_branch"])

    def test_unapproved_merge_never_completes_but_review_ci_merge_acceptance_still_works(self) -> None:
        state = self.state()
        task = state["tasks"][0]
        self.reconcile(state, "success", MERGE_SHA="c" * 40)
        self.assert_review(state)
        with mock.patch.dict(os.environ, {"AI_NAME": "Claude2", "REVIEWED_SHA": task["candidate_sha"]}, clear=True), \
                mock.patch.object(ai_status, "git_commit_exists", return_value=True):
            ai_status.command_approve(state, [task["id"], "Actual independent review test control"])
        self.reconcile(state, "success", MERGE_SHA="c" * 40)
        self.assertEqual(task["status"], "acceptance")
        self.assertNotIn("acceptance_evidence", task)
        evidence = {key: "isolated-test-evidence" for key in task["required_acceptance"]}
        with mock.patch.dict(os.environ, {"AI_NAME": "Claude", "ACCEPTANCE_EVIDENCE_JSON": json.dumps(evidence)}, clear=True), \
                mock.patch.object(ai_status, "merge_reachability", return_value="unknown"):
            ai_status.command_record_acceptance(state, [task["id"], "All isolated acceptance controls"])
        self.assertEqual(task["status"], "done")


class StatusCliBoundaryTest(unittest.TestCase):
    def test_release_wrapper_does_not_delegate_to_status_root_code(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            status_root = Path(temp)
            status_root.joinpath("ai-status.json").write_text(
                '{"tasks": [], "blockers": [], "handoffs": []}', encoding="utf-8"
            )
            stale_script = (
                status_root
                / "tools"
                / "development-orchestrator"
                / "bin"
                / "ai_status.py"
            )
            stale_script.parent.mkdir(parents=True)
            stale_script.write_text("raise SystemExit(47)\n", encoding="utf-8")
            env = os.environ.copy()
            env.pop("ORCH_STATUS_ROOT", None)
            env["AI_STATUS_ROOT"] = str(status_root)

            result = subprocess.run(
                [
                    "bash",
                    str(
                        ROOT
                        / "tools"
                        / "development-orchestrator"
                        / "bin"
                        / "ai-status.sh"
                    ),
                    "list",
                ],
                cwd=status_root,
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("(no matches)", result.stdout)

    def test_dashboard_projection_targets_status_root(self) -> None:
        self.assertEqual(
            ai_status.DASHBOARD_DIR,
            ai_status.ROOT / "tools" / "development-orchestrator" / "dashboard",
        )


class CandidateLifecycleTest(unittest.TestCase):
    def state(self, *, required_acceptance: list[str] | None = None, task_class: str | None = None) -> dict:
        task = {
            "id": "TASK-001",
            "owner": "Codex",
            "reviewer": "Claude",
            "status": "in_progress",
            "next": "Implementing",
        }
        if required_acceptance:
            task["required_acceptance"] = required_acceptance
        if task_class:
            task["task_class"] = task_class
        return {"tasks": [task], "blockers": [], "handoffs": []}

    def task(self, state: dict) -> dict:
        return state["tasks"][0]

    @mock.patch.object(ai_status, "append_log")
    @mock.patch.object(ai_status, "resolve_full_commit_sha", side_effect=lambda value: value)
    def test_canonical_handoff_locks_sha_and_branch(self, _exists: mock.Mock, _log: mock.Mock) -> None:
        state = self.state()
        env = {
            "AI_NAME": "Codex",
            "CANDIDATE_SHA": "abc123",
            "CANDIDATE_BRANCH": "codex/task-001",
            "PR_URL": "https://github.com/example/repo/pull/42",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_handoff(state, ["TASK-001", "Claude", "Ready for review"])

        task = self.task(state)
        self.assertEqual(task["status"], "review")
        self.assertEqual(task["candidate_sha"], "abc123")
        self.assertEqual(task["candidate_branch"], "codex/task-001")
        self.assertEqual(task["pr_url"], "https://github.com/example/repo/pull/42")
        self.assertEqual(state["handoffs"][0]["to"], "Claude")

    @mock.patch.object(ai_status, "append_log")
    def test_assign_refreshes_explicit_materialized_fields(self, _log: mock.Mock) -> None:
        state = self.state()
        state["agents"] = []
        task = self.task(state)
        task.update(
            {
                "depends_on": ["LEGACY-PREDEPLOY"],
                "artifacts": ["scripts/"],
                "acceptance": ["Legacy ancestry requirement"],
            }
        )
        env = {
            "AI_NAME": "Supervisor",
            "TASK_DEPENDS_ON": "UIX-001,DRV-001",
            "TASK_ARTIFACTS": "operations/verification/,tests/e2e/",
            "TASK_ACCEPTANCE": "Reviewed content is traceable through PR and CI",
        }

        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_assign(state, ["TASK-001", "Codex", "Claude", "Refreshed task"])

        self.assertEqual(task["depends_on"], ["UIX-001", "DRV-001"])
        self.assertEqual(task["artifacts"], ["operations/verification/", "tests/e2e/"])
        self.assertEqual(task["acceptance"], ["Reviewed content is traceable through PR and CI"])
        self.assertEqual(task["status"], "in_progress")

    FULL_SHA = "e343eb5824f657352fd51c2b4983032141f0a8ce"

    @mock.patch.object(ai_status, "append_log")
    def test_handoff_expands_an_abbreviated_candidate_sha(self, _log: mock.Mock) -> None:
        """The 2026-09-16 defect, at the point the short SHA entered the board.

        `git rev-parse --verify` accepts abbreviations, so a 9-character SHA
        passed validation and was stored verbatim. GitHub reports the full 40
        characters and every gate downstream compares exactly, so the task's
        own pull request stopped matching its candidate: reconciliation and
        auto-merge both skipped it and it sat in `integrating` with a blank
        `ci_status` while its CI had already run.
        """
        state = self.state()
        env = {
            "AI_NAME": "Codex",
            "CANDIDATE_SHA": self.FULL_SHA[:9],
            "CANDIDATE_BRANCH": "codex/task-001",
        }
        with (
            mock.patch.object(ai_status, "resolve_full_commit_sha", return_value=self.FULL_SHA),
            mock.patch.dict(os.environ, env, clear=True),
        ):
            ai_status.command_handoff(state, ["TASK-001", "Claude", "Ready for review"])

        self.assertEqual(self.task(state)["candidate_sha"], self.FULL_SHA)

    @mock.patch.object(ai_status, "append_log")
    def test_approve_accepts_an_abbreviation_of_the_same_commit(self, _log: mock.Mock) -> None:
        """A reviewer naming the candidate in short form is naming the same
        commit. What gets recorded stays byte-identical to candidate_sha,
        because the later gates compare the two with exact equality."""
        state = self.state()
        task = self.task(state)
        task.update({
            "status": "review",
            "candidate_sha": self.FULL_SHA,
            "candidate_branch": "codex/task-001",
        })
        env = {"AI_NAME": "Claude", "REVIEWED_SHA": self.FULL_SHA[:9]}
        with (
            mock.patch.object(ai_status, "resolve_full_commit_sha", return_value=self.FULL_SHA),
            mock.patch.dict(os.environ, env, clear=True),
        ):
            ai_status.command_approve(state, ["TASK-001", "Looks right"])

        self.assertEqual(task["reviewed_sha"], self.FULL_SHA)

    @mock.patch.object(ai_status, "append_log")
    def test_approve_still_rejects_a_different_commit(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update({
            "status": "review",
            "candidate_sha": self.FULL_SHA,
            "candidate_branch": "codex/task-001",
        })
        env = {"AI_NAME": "Claude", "REVIEWED_SHA": "0" * 40}
        with (
            mock.patch.object(ai_status, "resolve_full_commit_sha", side_effect=lambda value: value),
            mock.patch.dict(os.environ, env, clear=True),
        ):
            with self.assertRaisesRegex(SystemExit, "REVIEWED_SHA"):
                ai_status.command_approve(state, ["TASK-001", "Looks right"])

    def test_commit_sha_differs_refuses_to_decide_on_an_abbreviation(self) -> None:
        """A True here invalidates a completed review and clears its evidence.
        An abbreviation, or a commit this clone has not fetched, must never be
        what destroys an approval."""
        short = self.FULL_SHA[:9]
        with mock.patch.object(ai_status, "resolve_full_commit_sha", return_value=None):
            self.assertFalse(ai_status.commit_sha_differs(short, self.FULL_SHA))
            self.assertFalse(ai_status.commit_sha_differs(self.FULL_SHA, short))
            self.assertTrue(ai_status.commit_sha_differs(self.FULL_SHA, "b" * 40))
        self.assertFalse(ai_status.commit_sha_differs("", self.FULL_SHA))
        self.assertFalse(ai_status.commit_sha_differs(self.FULL_SHA, self.FULL_SHA))

    @mock.patch.object(ai_status, "append_log")
    def test_normalize_candidate_shas_expands_only_what_resolves(self, _log: mock.Mock) -> None:
        state = {
            "tasks": [
                {"id": "SHORT-1", "candidate_sha": self.FULL_SHA[:9], "reviewed_sha": self.FULL_SHA[:9]},
                {"id": "FULL-1", "candidate_sha": self.FULL_SHA},
                {"id": "NA-1", "candidate_sha": "not_applicable"},
                {"id": "GONE-1", "candidate_sha": "deadbee"},
            ],
            "blockers": [],
            "handoffs": [],
        }

        def resolve(value: str):
            return self.FULL_SHA if self.FULL_SHA.startswith(str(value)) else None

        with (
            mock.patch.object(ai_status, "resolve_full_commit_sha", side_effect=resolve),
            mock.patch.dict(os.environ, {"AI_NAME": "Supervisor"}, clear=True),
        ):
            ai_status.command_normalize_candidate_shas(state, [])

        by_id = {t["id"]: t for t in state["tasks"]}
        # The abbreviation expands, and two fields that were equal stay equal.
        self.assertEqual(by_id["SHORT-1"]["candidate_sha"], self.FULL_SHA)
        self.assertEqual(by_id["SHORT-1"]["reviewed_sha"], self.FULL_SHA)
        self.assertEqual(by_id["FULL-1"]["candidate_sha"], self.FULL_SHA)
        self.assertEqual(by_id["NA-1"]["candidate_sha"], "not_applicable")
        # Unresolvable in this clone: left exactly as found rather than guessed.
        self.assertEqual(by_id["GONE-1"]["candidate_sha"], "deadbee")

    @mock.patch.object(ai_status, "append_log")
    @mock.patch.object(ai_status, "resolve_full_commit_sha", side_effect=lambda value: value)
    def test_handoff_rejects_canonical_work_without_candidate_evidence(self, _exists: mock.Mock, _log: mock.Mock) -> None:
        with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True):
            with self.assertRaisesRegex(SystemExit, "CANDIDATE_SHA"):
                ai_status.command_handoff(self.state(), ["TASK-001", "Claude", "Ready"])

    @mock.patch.object(ai_status, "append_log")
    @mock.patch.object(ai_status, "resolve_full_commit_sha", side_effect=lambda value: value)
    def test_reviewer_approval_requires_same_sha(self, _exists: mock.Mock, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update({"status": "review", "candidate_sha": "abc123", "candidate_branch": "codex/task-001"})
        with mock.patch.dict(os.environ, {"AI_NAME": "Claude", "REVIEWED_SHA": "different"}, clear=True):
            with self.assertRaisesRegex(SystemExit, "exactly match"):
                ai_status.command_approve(state, ["TASK-001", "No"])

        with mock.patch.dict(os.environ, {"AI_NAME": "Claude", "REVIEWED_SHA": "abc123"}, clear=True):
            ai_status.command_approve(state, ["TASK-001", "Approved"])
        self.assertEqual(task["status"], "integrating")
        self.assertEqual(task["reviewed_sha"], "abc123")

    @mock.patch.object(ai_status, "append_log")
    @mock.patch.object(ai_status, "resolve_full_commit_sha", side_effect=lambda value: value)
    def test_merged_candidate_without_review_returns_to_existing_review_flow(self, _exists: mock.Mock, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update(status="integrating", candidate_sha="abc123", candidate_branch="codex/task-001")
        observation = {"AI_NAME": "Supervisor", "CANDIDATE_HEAD_SHA": "abc123",
                       "CANDIDATE_CI_STATUS": "success", "MERGE_SHA": "merge456"}
        with mock.patch.dict(os.environ, observation, clear=True):
            ai_status.command_reconcile_candidate(state, ["TASK-001"])
        self.assertEqual(task["status"], "review")
        self.assertEqual(task["candidate_sha"], "abc123")
        self.assertNotIn("reviewed_sha", task)
        self.assertNotIn("merge_sha", task)
        with mock.patch.dict(os.environ, {"AI_NAME": "Claude", "REVIEWED_SHA": "abc123"}, clear=True):
            ai_status.command_approve(state, ["TASK-001", "Independent review completed"])
        with mock.patch.dict(os.environ, observation, clear=True):
            ai_status.command_reconcile_candidate(state, ["TASK-001"])
        self.assertEqual(task["status"], "done")
        self.assertEqual(task["reviewed_sha"], "abc123")
        self.assertEqual(task["merge_sha"], "merge456")

    @mock.patch.object(ai_status, "append_log")
    def test_changed_head_invalidates_review_and_ci_evidence(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update(
            {
                "status": "integrating",
                "candidate_sha": "abc123",
                "candidate_branch": "codex/task-001",
                "reviewed_sha": "abc123",
                "ci_sha": "abc123",
                "ci_status": "success",
                "pr_url": "https://example.test/pr/1",
            }
        )
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "CANDIDATE_HEAD_SHA": "def456"}, clear=True):
            ai_status.command_reconcile_candidate(state, ["TASK-001"])

        self.assertEqual(task["status"], "in_progress")
        self.assertNotIn("candidate_sha", task)
        self.assertNotIn("reviewed_sha", task)
        self.assertNotIn("ci_sha", task)

    @mock.patch.object(ai_status, "append_log")
    def test_merge_waits_for_required_acceptance_before_done(self, _log: mock.Mock) -> None:
        state = self.state(required_acceptance=["staging_signoff"])
        task = self.task(state)
        task.update(
            {
                "status": "integrating",
                "candidate_sha": "abc123",
                "candidate_branch": "codex/task-001",
                "reviewed_sha": "abc123",
            }
        )
        env = {
            "AI_NAME": "Supervisor",
            "CANDIDATE_HEAD_SHA": "abc123",
            "CANDIDATE_CI_STATUS": "success",
            "MERGE_SHA": "fedcba",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_reconcile_candidate(state, ["TASK-001", "Merged"])
        self.assertEqual(task["status"], "acceptance")

        with mock.patch.dict(
            os.environ,
            {"AI_NAME": "Codex", "ACCEPTANCE_EVIDENCE_JSON": '{"staging_signoff":"run-42"}'},
            clear=True,
        ):
            ai_status.command_record_acceptance(state, ["TASK-001", "Staging accepted"])
        self.assertEqual(task["status"], "done")
        self.assertEqual(task["acceptance_evidence"]["staging_signoff"], "run-42")

    def test_release_task_requires_same_sha_acceptance_contract(self) -> None:
        with self.assertRaisesRegex(SystemExit, "same-SHA acceptance evidence"):
            ai_status.validate_task_spec(
                {
                    "id": "REL-001",
                    "task_class": "release",
                    "required_acceptance": ["dev_deploy_run_url"],
                }
            )

    def test_acceptance_sha_must_match_merge_sha(self) -> None:
        task = self.task(self.state())
        task["merge_sha"] = "merge-123"
        with self.assertRaisesRegex(SystemExit, "exactly match merge SHA"):
            ai_status.validate_acceptance_evidence(task, {"dev_deploy_sha": "candidate-123"})
        ai_status.validate_acceptance_evidence(
            task,
            {"dev_deploy_sha": "merge-123", "operational_acceptance_sha": "merge-123"},
        )
        task["acceptance_evidence"] = {"dev_deploy_sha": "candidate-123"}
        with self.assertRaisesRegex(SystemExit, "exactly match merge SHA"):
            ai_status.validate_acceptance_evidence(
                task,
                {"operational_acceptance_sha": "merge-123"},
            )

    def test_documentation_task_cannot_bypass_candidate_lifecycle(self) -> None:
        with self.assertRaisesRegex(SystemExit, "cannot set mutates_canonical=false"):
            ai_status.validate_task_spec(
                {
                    "id": "DOC-001",
                    "task_class": "documentation",
                    "mutates_canonical": False,
                }
            )

    @mock.patch.object(ai_status, "append_log")
    def test_unblock_merge_resumes_parent_without_supervisor_handoff(self, _log: mock.Mock) -> None:
        state = self.state(task_class="unblock")
        helper = self.task(state)
        helper.update(
            {
                "helper_parent": "PARENT-001",
                "status": "integrating",
                "candidate_sha": "abc123",
                "candidate_branch": "codex/task-001",
                "reviewed_sha": "abc123",
            }
        )
        state["tasks"].append(
            {
                "id": "PARENT-001",
                "owner": "Gemini",
                "reviewer": "Claude",
                "status": "blocked",
                "waiting_for": "Codex",
                "next": "Waiting for repair",
            }
        )
        state["blockers"].append(
            {
                "task_id": "PARENT-001",
                "owner": "Gemini",
                "waiting_for": "Codex",
                "status": "open",
            }
        )
        env = {
            "AI_NAME": "Supervisor",
            "CANDIDATE_HEAD_SHA": "abc123",
            "CANDIDATE_CI_STATUS": "success",
            "MERGE_SHA": "fedcba",
        }

        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_reconcile_candidate(state, ["TASK-001", "Repair merged"])
        ai_status.validate_state(state)

        parent = state["tasks"][1]
        self.assertEqual(helper["status"], "done")
        self.assertEqual(parent["status"], "todo")
        self.assertEqual(state["handoffs"][0]["from"], "Codex")
        self.assertEqual(state["handoffs"][0]["to"], "Gemini")

    @mock.patch.object(ai_status, "append_log")
    def test_late_unblock_merge_preserves_progressed_or_externally_gated_parent(self, _log: mock.Mock) -> None:
        parent_states = ["backlog", "todo", "in_progress", "review", "integrating", "acceptance", "done"]
        cases = [(value, False) for value in parent_states] + [("blocked", True)]
        for parent_status, external_gate in cases:
            with self.subTest(parent_status=parent_status, external_gate=external_gate):
                state = self.state(task_class="unblock")
                helper = self.task(state)
                helper.update(helper_parent="PARENT-001", status="integrating", candidate_sha="abc123",
                              candidate_branch="codex/task-001", reviewed_sha="abc123")
                parent = {"id": "PARENT-001", "owner": "Gemini", "reviewer": "Claude", "status": parent_status,
                          "external_gate": external_gate, "next": "Current parent disposition", "last_update": "2026-09-11T03:58:00Z",
                          "acceptance_evidence": {"operational": "existing independently reviewed evidence"}}
                state["tasks"].append(parent)
                before = copy.deepcopy(parent)
                env = {"AI_NAME": "Supervisor", "CANDIDATE_HEAD_SHA": "abc123", "CANDIDATE_CI_STATUS": "success", "MERGE_SHA": "fedcba"}
                with mock.patch.dict(os.environ, env, clear=True):
                    ai_status.command_reconcile_candidate(state, ["TASK-001", "Historical helper merged"])
                self.assertEqual(helper["status"], "done")
                self.assertEqual(parent, before)
                self.assertEqual(state["handoffs"], [])
                self.assertEqual(state["blockers"], [])

    @mock.patch.object(ai_status, "append_log")
    def test_supervisor_reassigns_through_candidate_writer(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update(
            {
                "candidate_sha": "abc123",
                "candidate_branch": "codex/task-001",
                "reviewed_sha": "abc123",
            }
        )
        state["handoffs"] = [{"task_id": "TASK-001", "to": "Codex", "status": "pending"}]
        env = {
            "AI_NAME": "Supervisor",
            "TASK_EXPECTED_OWNER": "Codex",
            "TASK_EXPECTED_REVIEWER": "Claude",
            "TASK_REASSIGN_REOPEN": "1",
            "TASK_HANDOFF_FROM": "Codex",
            "TASK_HANDOFF_TO": "Gemini",
            "TASK_EVIDENCE_REF": "support/reassign/TASK-001.json",
        }
        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_reassign(
                state,
                ["TASK-001", "Gemini", "Claude", "Move to the healthy lane"],
            )

        self.assertEqual(task["owner"], "Gemini")
        self.assertEqual(task["status"], "todo")
        self.assertNotIn("candidate_sha", task)
        self.assertEqual(task["evidence_refs"], ["support/reassign/TASK-001.json"])
        self.assertEqual(state["handoffs"][0]["status"], "done")
        self.assertEqual(state["handoffs"][1]["to"], "Gemini")

        with mock.patch.dict(
            os.environ,
            {
                "AI_NAME": "Supervisor",
                "TASK_EXPECTED_OWNER": "Gemini",
                "TASK_EXPECTED_REVIEWER": "Claude",
            },
            clear=True,
        ):
            ai_status.command_reassign(
                state,
                ["TASK-001", "Gemini", "Claude2", "Switch reviewer after owner move"],
            )
        self.assertEqual(task["owner"], "Gemini")
        self.assertEqual(task["reviewer"], "Claude2")

    @mock.patch.object(ai_status, "append_log")
    def test_supervisor_can_reassign_backlog_owner_and_reviewer_together(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task["status"] = "backlog"
        env = {"AI_NAME": "Supervisor", "TASK_EXPECTED_OWNER": "Codex", "TASK_EXPECTED_REVIEWER": "Claude"}
        with mock.patch.dict(os.environ, env, clear=True):
            ai_status.command_reassign(state, ["TASK-001", "Gemini", "Gemini2", "Claim from paused lanes"])
        self.assertEqual((task["owner"], task["reviewer"], task["status"]), ("Gemini", "Gemini2", "backlog"))
        self.assertNotIn("reviewed_sha", task)

    @mock.patch.object(ai_status, "append_log")
    def test_supervisor_resume_resolves_blocker_in_same_transaction(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update({"status": "blocked", "waiting_for": "Claude"})
        state["blockers"] = [{"task_id": "TASK-001", "status": "open"}]
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor"}, clear=True):
            ai_status.command_resume_blocked(state, ["TASK-001", "todo", "Unblock evidence is complete"])

        self.assertEqual(task["status"], "todo")
        self.assertNotIn("waiting_for", task)
        self.assertEqual(state["blockers"][0]["status"], "resolved")

    @mock.patch.object(ai_status, "append_log")
    def test_acceptance_progress_preserves_candidate_and_pending_gates(self, _log: mock.Mock) -> None:
        for status in ("acceptance", "done"):
            with self.subTest(status=status):
                state = self.state()
                task = self.task(state)
                task.update(status=status, candidate_sha="abc123", candidate_branch="codex/task-001",
                            reviewed_sha="abc123", ci_sha="abc123", ci_status="success",
                            ci_run_url="https://ci.example/1", pr_url="https://pr.example/1", merge_sha="def456",
                            required_acceptance=["live_probe", "another_gate"], acceptance_evidence={"another_gate": "verified"})
                if status == "done":
                    task["acceptance_evidence"]["live_probe"] = "verified"
                state["handoffs"] = [{"task_id": task["id"], "to": "Codex", "status": "pending"}]
                state["blockers"] = [{"task_id": task["id"], "status": "open", "message": "Live probe pending"}]
                before = copy.deepcopy(state)
                with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True):
                    ai_status.command_progress(state, [task["id"], "Read-only verification in progress"])
                self.assertEqual(task["next"], "Read-only verification in progress")
                for key in before["tasks"][0]:
                    if key not in {"next", "last_update"}:
                        self.assertEqual(task[key], before["tasks"][0][key], key)
                self.assertEqual(state["handoffs"], before["handoffs"])
                self.assertEqual(state["blockers"], before["blockers"])

    @mock.patch.object(ai_status, "append_log")
    def test_start_cannot_reopen_acceptance_or_completed_tasks(self, log: mock.Mock) -> None:
        for status in ("acceptance", "done"):
            with self.subTest(status=status):
                state = self.state()
                task = self.task(state)
                task.update(status=status, candidate_sha="abc123", reviewed_sha="abc123", merge_sha="def456")
                before = copy.deepcopy(state)
                with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True):
                    with self.assertRaisesRegex(SystemExit, "explicit reviewer reopen"):
                        ai_status.command_start(state, [task["id"], "Start stale owner dispatch"])
                self.assertEqual(state, before)
        log.assert_not_called()

    @mock.patch.object(ai_status, "append_log")
    def test_owner_cannot_reopen_acceptance_or_done_without_reviewer(self, log: mock.Mock) -> None:
        for status in ("acceptance", "done"):
            with self.subTest(status=status):
                state = self.state(required_acceptance=["live_probe"])
                task = self.task(state)
                task.update(status=status, candidate_sha="abc123", reviewed_sha="abc123",
                            ci_sha="abc123", ci_status="success", merge_sha="def456",
                            acceptance_evidence={"live_probe": "verified"}, waiting_for="Claude")
                state["blockers"] = [{"task_id": task["id"], "status": "open"}]
                state["handoffs"] = [{"task_id": task["id"], "status": "pending"}]
                before = copy.deepcopy(state)
                with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True):
                    with self.assertRaisesRegex(SystemExit, "Only the reviewer"):
                        ai_status.command_reopen(state, [task["id"], "Restart implementation"])
                self.assertEqual(state, before)
        log.assert_not_called()

    @mock.patch.object(ai_status, "append_log")
    def test_reviewer_can_reopen_acceptance_and_done(self, log: mock.Mock) -> None:
        for status in ("acceptance", "done"):
            with self.subTest(status=status):
                state = self.state()
                task = self.task(state)
                task.update(
                    status=status,
                    candidate_sha="abc123",
                    reviewed_sha="abc123",
                    ci_sha="abc123",
                    ci_status="success",
                    merge_sha="def456",
                    acceptance_evidence={"live_probe": "verified"},
                )
                with mock.patch.dict(os.environ, {"AI_NAME": "Claude"}, clear=True):
                    ai_status.command_reopen(state, [task["id"], "Code correction required"])
                self.assertEqual(task["status"], "in_progress")
                for key in (
                    "candidate_sha",
                    "reviewed_sha",
                    "ci_sha",
                    "ci_status",
                    "merge_sha",
                    "acceptance_evidence",
                ):
                    self.assertNotIn(key, task)
                self.assertEqual(state["handoffs"][-1]["to"], "Codex")
                self.assertEqual(state["handoffs"][-1]["status"], "pending")
                self.assertEqual(log.call_args.args[0]["type"], "reopen")

    @mock.patch.object(ai_status, "append_log")
    @mock.patch.object(ai_status, "resolve_full_commit_sha", side_effect=lambda value: value)
    def test_reopen_clears_acceptance_evidence_and_new_candidate_waits_for_fresh_evidence(
        self, _exists: mock.Mock, _log: mock.Mock
    ) -> None:
        for initial_status in ("acceptance", "done"):
            with self.subTest(initial_status=initial_status):
                state = self.state(required_acceptance=["staging_signoff"])
                task = self.task(state)
                task.update(
                    {
                        "status": initial_status,
                        "candidate_sha": "cand-111",
                        "candidate_branch": "codex/task-001",
                        "reviewed_sha": "cand-111",
                        "ci_sha": "cand-111",
                        "ci_status": "success",
                        "ci_run_url": "https://ci.example/1",
                        "pr_url": "https://github.com/example/repo/pull/1",
                        "merge_sha": "merge-111",
                        "acceptance_evidence": {"staging_signoff": "run-42"},
                    }
                )

                with mock.patch.dict(os.environ, {"AI_NAME": "Claude"}, clear=True):
                    ai_status.command_reopen(state, [task["id"], "Code correction required"])
                self.assertEqual(task["status"], "in_progress")
                self.assertNotIn("acceptance_evidence", task)
                self.assertNotIn("candidate_sha", task)
                self.assertNotIn("merge_sha", task)

                with mock.patch.dict(
                    os.environ,
                    {
                        "AI_NAME": "Codex",
                        "CANDIDATE_SHA": "cand-222",
                        "CANDIDATE_BRANCH": "codex/task-001",
                        "PR_URL": "https://github.com/example/repo/pull/2",
                    },
                    clear=True,
                ):
                    ai_status.command_handoff(state, [task["id"], "Claude", "New candidate"])
                self.assertEqual(task["status"], "review")
                self.assertEqual(task["candidate_sha"], "cand-222")

                with mock.patch.dict(
                    os.environ,
                    {"AI_NAME": "Claude", "REVIEWED_SHA": "cand-222"},
                    clear=True,
                ):
                    ai_status.command_approve(state, [task["id"], "LGTM"])
                self.assertEqual(task["status"], "integrating")
                self.assertEqual(task["reviewed_sha"], "cand-222")

                env_reconcile = {
                    "AI_NAME": "Supervisor",
                    "CANDIDATE_HEAD_SHA": "cand-222",
                    "CANDIDATE_CI_STATUS": "success",
                    "MERGE_SHA": "merge-222",
                }
                with mock.patch.dict(os.environ, env_reconcile, clear=True):
                    ai_status.command_reconcile_candidate(state, [task["id"], "Merged new candidate"])

                self.assertEqual(task["status"], "acceptance")
                self.assertNotIn("acceptance_evidence", task)

                with mock.patch.dict(
                    os.environ,
                    {"AI_NAME": "Codex", "ACCEPTANCE_EVIDENCE_JSON": '{"staging_signoff":"run-43"}'},
                    clear=True,
                ):
                    ai_status.command_record_acceptance(state, [task["id"], "Fresh staging accepted"])
                self.assertEqual(task["status"], "done")
                self.assertEqual(task["acceptance_evidence"]["staging_signoff"], "run-43")

    @mock.patch.object(ai_status, "append_log")
    def test_owner_reopen_other_states_is_unchanged(self, _log: mock.Mock) -> None:
        for status in ("backlog", "todo", "in_progress", "review", "integrating", "blocked"):
            with self.subTest(status=status):
                state = self.state()
                task = self.task(state)
                task.update(status=status, candidate_sha="abc123", reviewed_sha="abc123")
                with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True):
                    ai_status.command_reopen(state, [task["id"], "Revise implementation"])
                self.assertEqual(task["status"], "in_progress")
                self.assertNotIn("candidate_sha", task)
                self.assertNotIn("reviewed_sha", task)

    @mock.patch.object(ai_status, "append_log")
    def test_helper_backed_resume_rejects_new_blocker_without_mutation(self, _log: mock.Mock) -> None:
        state = self.state()
        parent = self.task(state)
        parent.update(status="blocked", waiting_for="Claude", next="Routing still missing")
        state["tasks"].append({
            "id": "HELPER-001", "task_class": "unblock", "status": "done",
            "helper_parent": parent["id"], "resolved_parent_status": "todo",
            "resolved_parent_at": "2026-09-09T01:00:00Z",
            "last_update": "2026-09-09T03:00:00Z",
        })
        state["blockers"] = [{"task_id": parent["id"], "status": "open", "created_at": "2026-09-09T02:00:00Z"}]
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "TASK_RESUME_HELPER_ID": "HELPER-001"}, clear=True):
            with self.assertRaisesRegex(SystemExit, "open blocker newer"):
                ai_status.command_resume_blocked(state, [parent["id"], "todo", "Retry old helper"])
        self.assertEqual(parent["status"], "blocked")
        self.assertEqual(parent["next"], "Routing still missing")
        self.assertEqual(parent["waiting_for"], "Claude")
        self.assertEqual(state["blockers"][0]["status"], "open")
        _log.assert_not_called()

    @mock.patch.object(ai_status, "append_log")
    def test_legacy_helper_note_or_progress_cannot_renew_resolution(self, _log: mock.Mock) -> None:
        for command in (ai_status.command_note, ai_status.command_progress):
            for resolution in (None, "invalid"):
                with self.subTest(command=command.__name__, resolution=resolution):
                    state = self.state()
                    parent = self.task(state)
                    parent.update(status="blocked", waiting_for="Claude", next="New blocker")
                    helper = {
                        "id": "HELPER-001", "owner": "Codex", "task_class": "unblock",
                        "status": "done", "helper_parent": parent["id"],
                        "resolved_parent_status": "todo", "last_update": "2026-09-09T01:00:00Z",
                    }
                    if resolution is not None:
                        helper["resolved_parent_at"] = resolution
                    state["tasks"].append(helper)
                    state["blockers"] = [{"task_id": parent["id"], "status": "open", "created_at": "2026-09-09T02:00:00Z"}]
                    with mock.patch.dict(os.environ, {"AI_NAME": "Codex"}, clear=True), mock.patch.object(
                        ai_status, "iso_now", return_value="2026-09-09T03:00:00Z"
                    ):
                        command(state, [helper["id"], "Administrative update"])
                    self.assertEqual(helper["status"], "done")
                    self.assertEqual(helper["last_update"], "2026-09-09T03:00:00Z")
                    before = copy.deepcopy(state)
                    with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "TASK_RESUME_HELPER_ID": helper["id"]}, clear=True):
                        with self.assertRaisesRegex(SystemExit, "no verifiable parent resolution time"):
                            ai_status.command_resume_blocked(state, [parent["id"], "todo", "Retry legacy helper"])
                    self.assertEqual(state, before)

    @mock.patch.object(ai_status, "append_log")
    def test_helper_backed_resume_accepts_fresh_resolution(self, _log: mock.Mock) -> None:
        state = self.state()
        parent = self.task(state)
        parent["status"] = "blocked"
        state["tasks"].append({
            "id": "HELPER-001", "task_class": "unblock", "status": "done",
            "helper_parent": parent["id"], "resolved_parent_status": "todo",
            "resolved_parent_at": "2026-09-09T03:00:00Z",
            "last_update": "2026-09-09T03:00:00Z",
        })
        state["blockers"] = [{"task_id": parent["id"], "status": "open", "created_at": "2026-09-09T02:00:00Z"}]
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "TASK_RESUME_HELPER_ID": "HELPER-001"}, clear=True):
            ai_status.command_resume_blocked(state, [parent["id"], "todo", "Repair verified"])
        self.assertEqual(parent["status"], "todo")
        self.assertEqual(state["blockers"][0]["status"], "resolved")

    @mock.patch.object(ai_status, "append_log")
    def test_helper_backed_resume_requires_matching_completed_resolved_helper(self, _log: mock.Mock) -> None:
        for overrides in ({"status": "review"}, {"helper_parent": "OTHER-001"}, {"resolved_parent_status": "blocked"}):
            with self.subTest(overrides=overrides):
                state = self.state()
                parent = self.task(state)
                parent["status"] = "blocked"
                helper = {"id": "HELPER-001", "task_class": "unblock", "status": "done", "helper_parent": parent["id"], "last_update": "2026-09-09T03:00:00Z"}
                helper.update(overrides)
                state["tasks"].append(helper)
                with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor", "TASK_RESUME_HELPER_ID": helper["id"]}, clear=True):
                    with self.assertRaisesRegex(SystemExit, "Cannot resume"):
                        ai_status.command_resume_blocked(state, [parent["id"], "todo", "Retry"])
                self.assertEqual(parent["status"], "blocked")
        _log.assert_not_called()

    @mock.patch.object(ai_status, "append_log")
    def test_merge_preserves_recorded_blocked_parent_disposition(self, _log: mock.Mock) -> None:
        state = self.state(task_class="unblock")
        helper = self.task(state)
        helper.update(helper_parent="PARENT-001", resolved_parent_status="blocked",
                      resolved_parent_next="Implement scoped routing first", resolved_parent_waiting_for="Claude")
        parent = {"id": "PARENT-001", "owner": "Gemini", "reviewer": "Claude", "status": "blocked"}
        state["tasks"].append(parent)
        with mock.patch.dict(os.environ, {"AI_NAME": "Supervisor"}, clear=True):
            ai_status.transition_after_merge(state, helper, message="Planning merged", timestamp="2026-09-09T03:00:00Z")
        self.assertEqual(helper["status"], "done")
        self.assertEqual(helper["resolved_parent_at"], "2026-09-09T03:00:00Z")
        self.assertEqual(parent["status"], "blocked")
        self.assertEqual(parent["next"], "Implement scoped routing first")
        self.assertEqual(parent["waiting_for"], "Claude")
        self.assertFalse(any(h.get("status") == "pending" for h in state["handoffs"]))

    @mock.patch.object(ai_status, "archive_task_bodies")
    @mock.patch.object(ai_status, "_retention_keeps", return_value={"handoffs": 1, "tasks": 1, "blockers": 1})
    def test_canonical_writer_prunes_closed_history(
        self, _keeps: mock.Mock, archive: mock.Mock
    ) -> None:
        state = {
            "handoffs": [
                {"task_id": "A", "status": "pending"},
                {"task_id": "B", "status": "done"},
                {"task_id": "C", "status": "done"},
            ],
            "tasks": [
                {"id": "A", "status": "todo"},
                {"id": "B", "status": "done"},
                {"id": "C", "status": "done"},
            ],
            "blockers": [
                {"task_id": "A", "status": "open"},
                {"task_id": "B", "status": "resolved"},
                {"task_id": "C", "status": "resolved"},
            ],
        }

        ai_status.prune_state_for_size(state)

        self.assertEqual([item["task_id"] for item in state["handoffs"]], ["A", "C"])
        self.assertEqual([item["id"] for item in state["tasks"]], ["A", "C"])
        self.assertEqual(state["archived_task_ids"], ["B"])
        archive.assert_called_once()
        self.assertEqual([item["task_id"] for item in state["blockers"]], ["A", "C"])

    @mock.patch.object(ai_status, "append_log")
    def test_migration_reopens_unbound_legacy_approval(self, _log: mock.Mock) -> None:
        state = self.state()
        task = self.task(state)
        task.update(
            {
                "status": "review_approved",
                "required_integration_status": "dev_deployed",
                "dev_deploy_run_url": "https://example.test/deploy/42",
                "dev_deploy_sha": "abc123",
                "dev_deploy_source_ref": "origin/dev",
            }
        )
        ai_status.command_migrate_candidate_lifecycle(state, [])
        self.assertEqual(task["status"], "in_progress")
        self.assertEqual(task["required_acceptance"], ["dev_deployed"])
        self.assertNotIn("required_integration_status", task)
        migrated_at = task["candidate_lifecycle_migrated_at"]
        ai_status.command_migrate_candidate_lifecycle(state, [])
        self.assertEqual(task["candidate_lifecycle_migrated_at"], migrated_at)


if __name__ == "__main__":
    unittest.main()


class DashboardMirrorRemovalTests(unittest.TestCase):
    """sync_dashboard must stop writing copies nobody serves."""

    def test_sync_does_not_copy_the_activity_log(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = pathlib.Path(tmpdir)
            dashboard = root / "dashboard"
            dashboard.mkdir()
            log = root / "ai-activity-log.jsonl"
            log.write_text('{"ts":"x"}\n', encoding="utf-8")

            with mock.patch.object(ai_status, "ROOT", root), \
                    mock.patch.object(ai_status, "DASHBOARD_DIR", dashboard), \
                    mock.patch.object(ai_status, "LOG_FILE", log):
                ai_status.sync_dashboard()

            self.assertFalse(
                (dashboard / "ai-activity-log.jsonl").exists(),
                "the activity log was mirrored again; the server reads the live file",
            )

    def test_sync_clears_a_mirror_left_by_an_older_build(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = pathlib.Path(tmpdir)
            dashboard = root / "dashboard"
            dashboard.mkdir()
            stale = dashboard / "ai-activity-log.jsonl"
            stale.write_text("stale snapshot\n", encoding="utf-8")

            with mock.patch.object(ai_status, "ROOT", root), \
                    mock.patch.object(ai_status, "DASHBOARD_DIR", dashboard):
                ai_status.sync_dashboard()

            self.assertFalse(
                stale.exists(),
                "a stale mirror survived; a static server here would serve a frozen snapshot",
            )

    def test_sync_leaves_the_dashboard_assets_alone(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = pathlib.Path(tmpdir)
            dashboard = root / "dashboard"
            dashboard.mkdir()
            asset = dashboard / "index.html"
            asset.write_text("<html></html>", encoding="utf-8")

            with mock.patch.object(ai_status, "ROOT", root), \
                    mock.patch.object(ai_status, "DASHBOARD_DIR", dashboard):
                ai_status.sync_dashboard()

            self.assertTrue(asset.exists(), "sync removed a dashboard asset")
