#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from control_plane.runtime import supervisor_runtime as supervisor


def _ago_iso(**delta) -> str:
    from datetime import datetime, timedelta, timezone

    moment = datetime.now(timezone.utc) - timedelta(**delta)
    return moment.replace(microsecond=0).isoformat().replace("+00:00", "Z")



class ChairmanFlowTests(unittest.TestCase):
    def test_read_only_release_gate_never_creates_or_resumes_source_helper(self) -> None:
        parent = {
            "id": "SHARED-DEV-DELIVERY", "status": "blocked",
            "task_class": "release", "mutates_canonical": False,
            "owner": "Pi", "reviewer": "Codex", "waiting_for": "Claude2",
            "depends_on": [],
            "next": "Wait for security CI and hosted consumer. Branch is behind; no local commit to push.",
        }
        status = {"tasks": [parent]}
        self.assertEqual(supervisor.blocked_task_triage_action(status, parent),
                         ("wait_for_parent_resolution", None))
        self.assertEqual(supervisor.dependency_ready_blocked_task_records({}, status), [])
        self.assertEqual(supervisor.dependency_ready_blocked_task_records({}, status, include_held=True)[0]["task_id"],
                         parent["id"])
        with mock.patch.object(supervisor, "load_status", return_value=status),              mock.patch.object(supervisor, "run_task_board_command") as writer:
            for kind in ("history_repair", "planning_decision", "manual_unblock"):
                action = {"task_id": parent["id"], "unblock_kind": kind, "reason": "Stale chair recovery request"}
                self.assertFalse(supervisor.create_chair_unblock_task({}, {}, action, {}))
                self.assertFalse(supervisor.apply_chair_parent_resume_action({}, {}, action))
        writer.assert_not_called()

    def test_history_triage_requires_recovery_evidence_not_historical_metadata(self) -> None:
        task = {
            "id": "COMMIT-HISTORY-REPORT", "title": "Review worktree branch history",
            "summary_zh": "previous push succeeded",
            "artifacts": ["support/task-scoped-commit-history.md"],
            "next": "Wait for dependency security CI; branch has no new commit to push.",
        }
        self.assertEqual(supervisor.blocked_task_triage_kind(task), "manual_unblock")
        for blocker in ("Closeout blocked because shared branch HEAD moved to a mixed commit.",
                        "History repair audit still required.",
                        "Push rejected: non-fast-forward.",
                        "Pre-commit failed; repair the task-scoped candidate."):
            with self.subTest(blocker=blocker):
                self.assertEqual(supervisor.blocked_task_triage_kind({**task, "next": blocker}), "history_repair")

    def test_stale_or_blocked_helper_is_visible_but_cannot_resume_parent(self) -> None:
        for disposition, resolution in (("blocked", "2026-09-09T03:00:00Z"), ("todo", "2026-09-09T01:00:00Z"), ("todo", None), ("todo", "invalid")):
            with self.subTest(disposition=disposition, resolution=resolution):
                parent = {"id": "PARENT-001", "status": "blocked", "owner": "Codex", "reviewer": "Codex2", "depends_on": [], "next": "Missing scope"}
                helper = {"id": "HELPER-001", "status": "done", "task_class": "unblock", "helper_parent": parent["id"],
                          "helper_kind": supervisor.blocked_task_triage_kind(parent), "resolved_parent_status": disposition,
                          "last_update": "2026-09-09T03:00:00Z"}
                if resolution is not None:
                    helper["resolved_parent_at"] = resolution
                status = {"tasks": [parent, helper], "blockers": [{"task_id": parent["id"], "status": "open", "created_at": "2026-09-09T02:00:00Z"}]}
                self.assertEqual(supervisor.blocked_task_triage_action(status, parent), ("wait_for_parent_resolution", helper["id"]))
                self.assertEqual(supervisor.dependency_ready_blocked_task_records({}, status), [])
                visible = supervisor.dependency_ready_blocked_task_records({}, status, include_held=True)
                self.assertEqual(visible[0]["task_id"], parent["id"])
                with mock.patch.object(supervisor, "load_status", return_value=status), mock.patch.object(supervisor, "run_task_board_command") as writer:
                    self.assertFalse(supervisor.apply_chair_parent_resume_action({}, {}, {"task_id": parent["id"], "reason": "Old helper is done"}))
                writer.assert_not_called()

    def test_external_gate_is_held_without_creating_or_resuming_helpers(self) -> None:
        parent = {"id": "PUBLISH-001", "status": "blocked", "owner": "Codex", "reviewer": "Gemini2",
                  "depends_on": [], "external_gate": True, "next": "Public push needs explicit authorization"}
        helper = {"id": "HELPER-001", "status": "done", "task_class": "unblock", "helper_parent": parent["id"],
                  "helper_kind": "history_repair", "resolved_parent_status": "todo", "resolved_parent_at": "2026-09-13T05:00:00Z"}
        for helpers in ([], [helper]):
            with self.subTest(completed_helper=bool(helpers)):
                status = {"tasks": [parent, *helpers]}
                self.assertEqual(supervisor.blocked_task_triage_action(status, parent), ("wait_for_parent_resolution", None))
                self.assertEqual(supervisor.dependency_ready_blocked_task_records({}, status), [])
                held = supervisor.dependency_ready_blocked_task_records({}, status, include_held=True)
                self.assertEqual(held[0]["task_id"], parent["id"])
                action = {"task_id": parent["id"], "reason": "Stale chair decision requests history repair"}
                with mock.patch.object(supervisor, "load_status", return_value=status), mock.patch.object(supervisor, "run_task_board_command") as writer:
                    self.assertFalse(supervisor.create_chair_unblock_task({}, {}, action, {}))
                    self.assertFalse(supervisor.apply_chair_parent_resume_action({}, {}, action))
                writer.assert_not_called()
        parent["external_gate"] = False
        self.assertEqual(supervisor.blocked_task_triage_action({"tasks": [parent]}, parent), ("create_unblock_task", None))

    def test_chair_review_message_includes_provider_health_context(self) -> None:
        message = supervisor.build_chair_review_message(
            {
                "paths": {},
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                },
            },
            reason="provider_health_triage",
            markdown_path=Path(".orchestrator/chair-reviews/test.md"),
            json_path=Path(".orchestrator/chair-reviews/test.json"),
            approval_state={"pending": []},
            state={
                "provider_pauses": {
                    "claude": {
                        "schema": 3,
                        "scope": "lane",
                        "lane_id": "claude",
                        "kind": "auth",
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                        "resume_at": None,
                    }
                },
                "dispatch_pauses": [
                    {
                        "provider": "claude",
                        "task_id": "OPX-DP-003-SIDECAR-ACCEPTANCE",
                        "failure_kind": "auth",
                        "summary": "auth: Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                ],
                "failure_streaks": {},
            },
            provider_report={
                "providers": {
                    "codex": {
                        "auth_ready": True,
                        "local_cli_worker_supported": True,
                    }
                }
            },
        )

        self.assertIn("Provider lane pauses / degraded lanes", message)
        self.assertIn("claude", message)
        self.assertIn("Invalid authentication credentials", message)
        self.assertIn("Dispatch-capable lanes", message)
        self.assertIn("codex (Codex): not_paused=true", message)
        self.assertIn("Dispatch pauses requiring chair attention", message)
        self.assertIn("OPX-DP-003-SIDECAR-ACCEPTANCE", message)

    def _identity_paused_fleet(self) -> tuple[dict, dict, dict]:
        """codex and codex2 are one account, and that account is 401-paused."""
        fingerprint = "7dd7f7fd9f792c596f59a98e"
        config = {
            "paths": {},
            "agents": {
                "claude": {"display_name": "Claude", "provider": "claude"},
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            },
        }
        state = {
            "provider_pauses": {
                f"identity:codex2:{fingerprint}": {
                    "kind": "auth",
                    "reason": "status: 401,",
                    "paused_at": "2026-08-15T04:51:02Z",
                    "resume_at": None,
                    "schema": 3,
                    "lane_id": "codex2",
                    "scope": "identity",
                    "identity_fingerprint": fingerprint,
                }
            },
            "dispatch_pauses": [],
            "failure_streaks": {},
        }
        report = {
            "providers": {
                "claude": {"auth_ready": True, "local_cli_worker_supported": True},
                "codex": {"auth_ready": True, "local_cli_worker_supported": True,
                          "identity": {"fingerprint": fingerprint}},
                "codex2": {"auth_ready": True, "local_cli_worker_supported": True,
                           "identity": {"fingerprint": fingerprint}},
            }
        }
        return config, state, report

    def test_briefing_never_offers_a_lane_the_dispatcher_would_refuse(self) -> None:
        """The dispatch-capable list looked pauses up by lane name, which cannot
        see an identity-scoped pause. codex2's 401 correctly stopped both codex
        and codex2 -- one account -- but the same briefing listed codex2 as
        auth-paused and then offered codex AND codex2 as dispatch-capable a few
        lines below. The chair reassigned work onto Codex believing it healthy,
        the dispatcher silently refused, and the task sat in todo forever.
        """
        config, state, report = self._identity_paused_fleet()
        message = supervisor.build_chair_review_message(
            config,
            reason="provider_health_triage",
            markdown_path=Path(".orchestrator/chair-reviews/test.md"),
            json_path=Path(".orchestrator/chair-reviews/test.json"),
            approval_state={"pending": []},
            state=state,
            provider_report=report,
        )

        self.assertIn("claude (Claude): not_paused=true", message)
        self.assertNotIn("codex (Codex): not_paused=true", message)
        self.assertNotIn("codex2 (Codex2): not_paused=true", message)

    def test_briefing_names_every_lane_a_pause_covers(self) -> None:
        """codex never appeared in any pause section, so the chair had no way to
        learn the account it shares with codex2 was the thing that was down."""
        config, state, report = self._identity_paused_fleet()
        message = supervisor.build_chair_review_message(
            config,
            reason="provider_health_triage",
            markdown_path=Path(".orchestrator/chair-reviews/test.md"),
            json_path=Path(".orchestrator/chair-reviews/test.json"),
            approval_state={"pending": []},
            state=state,
            provider_report=report,
        )

        pause_line = next(
            line for line in message.splitlines()
            if line.startswith("- ") and "status: 401" in line
        )
        # Substring checks would pass vacuously ("codex" is inside "codex2"),
        # so assert on the explicit list of lanes the pause takes out.
        self.assertIn("affects=", pause_line)
        affected = pause_line.split("affects=", 1)[1].split()[0]
        self.assertEqual(sorted(affected.split(",")), ["codex", "codex2"])

    def test_chair_review_message_requires_approval_actions_for_approval_triage(self) -> None:
        message = supervisor.build_chair_review_message(
            {"paths": {}},
            reason="approval_triage",
            markdown_path=Path(".orchestrator/chair-reviews/test.md"),
            json_path=Path(".orchestrator/chair-reviews/test.json"),
            approval_state={
                "pending": [
                    {
                        "approval_id": "apr-1",
                        "task_id": "ORX-FN-001",
                        "tool_name": "Agent",
                        "risk_class": "unknown",
                        "tool_input": {"description": "Review settlement matrix code"},
                    }
                ]
            },
            state={"failure_streaks": {}, "provider_pauses": {}, "dispatch_pauses": []},
        )

        self.assertIn("每一個 pending approval 都必須在 `approval_actions` 中明確", message)
        self.assertIn("description=Review settlement matrix code", message)

    def test_validate_chair_review_context_requires_pending_approval_resolution(self) -> None:
        payload = {
            "version": 1,
            "decision": "deny",
            "approval_ttl_minutes": 45,
            "reason": "approval remains unsafe",
            "blocked_by": [],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [],
        }
        approval_state = {
            "pending": [
                {
                    "approval_id": "apr-1",
                    "status": "pending",
                    "decision": None,
                }
            ]
        }

        self.assertIn(
            "approval_triage must resolve pending approvals",
            supervisor.validate_chair_review_context(payload, reason="approval_triage", approval_state=approval_state),
        )
        payload["approval_actions"] = [{"approval_id": "apr-1", "decision": "deny", "reason": "not safe"}]
        self.assertIsNone(
            supervisor.validate_chair_review_context(payload, reason="approval_triage", approval_state=approval_state)
        )
        payload["provider_actions"] = [
            {"agent": "Claude2", "action": "pause", "kind": "capacity", "reason": "stale prompt"}
        ]
        self.assertEqual(
            supervisor.validate_chair_review_context(payload, reason="approval_triage", approval_state=approval_state),
            "approval_triage must not emit provider_actions",
        )

    def test_agent_read_only_approval_is_routine_safe(self) -> None:
        approval = {
            "tool_name": "Agent",
            "risk_class": "unknown",
            "tool_input": {
                "description": "Review settlement matrix code",
                "prompt": "Read these files thoroughly and report any issues. Do not edit files.",
                "subagent_type": "Explore",
            },
        }

        self.assertTrue(supervisor._approval_is_routine_safe(approval))

    def test_chair_review_reason_prioritizes_provider_health_triage(self) -> None:
        reason = supervisor.chair_review_reason(
            {
                "provider_pauses": {
                    "claude": {
                        "kind": "auth",
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                }
            },
            {"pending": []},
        )

        self.assertEqual(reason, "provider_health_triage")

    def test_repeated_failure_records_ignore_tasks_covered_by_workspace_baseline_task(self) -> None:
        state = {
            "failure_streaks": {
                "UI-FE-ADM-FLT:owner": {
                    "task_id": "UI-FE-ADM-FLT",
                    "role": "owner",
                    "agent": "Codex",
                    "awaiting_chair": True,
                },
                "UI-FE-TEN-PSG:owner": {
                    "task_id": "UI-FE-TEN-PSG",
                    "role": "owner",
                    "agent": "Codex",
                    "awaiting_chair": True,
                },
            }
        }
        status = {
            "tasks": [
                {
                    "id": supervisor.WORKSPACE_BASELINE_TASK_ID,
                    "status": "in_progress",
                    "helper_kind": supervisor.WORKSPACE_BASELINE_HELPER_KIND,
                    "covers_task_ids": ["UI-FE-ADM-FLT"],
                }
            ]
        }

        records = supervisor.repeated_failure_records(state, status)

        self.assertEqual([item["task_id"] for item in records], ["UI-FE-TEN-PSG"])


    def test_chair_review_message_requires_approval_actions_for_approval_triage(self) -> None:
        message = supervisor.build_chair_review_message(
            {"paths": {}},
            reason="approval_triage",
            markdown_path=Path(".orchestrator/chair-reviews/test.md"),
            json_path=Path(".orchestrator/chair-reviews/test.json"),
            approval_state={
                "pending": [
                    {
                        "approval_id": "apr-1",
                        "task_id": "ORX-FN-001",
                        "tool_name": "Agent",
                        "risk_class": "unknown",
                        "tool_input": {"description": "Review settlement matrix code"},
                    }
                ]
            },
            state={"failure_streaks": {}, "provider_pauses": {}, "dispatch_pauses": []},
        )

        self.assertIn("每一個 pending approval 都必須在 `approval_actions` 中明確", message)
        self.assertIn("description=Review settlement matrix code", message)

    def test_validate_chair_review_context_requires_pending_approval_resolution(self) -> None:
        payload = {
            "version": 1,
            "decision": "deny",
            "approval_ttl_minutes": 45,
            "reason": "approval remains unsafe",
            "blocked_by": [],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [],
        }
        approval_state = {
            "pending": [
                {
                    "approval_id": "apr-1",
                    "status": "pending",
                    "decision": None,
                }
            ]
        }

        self.assertIn(
            "approval_triage must resolve pending approvals",
            supervisor.validate_chair_review_context(payload, reason="approval_triage", approval_state=approval_state),
        )
        payload["approval_actions"] = [{"approval_id": "apr-1", "decision": "deny", "reason": "not safe"}]
        self.assertIsNone(
            supervisor.validate_chair_review_context(payload, reason="approval_triage", approval_state=approval_state)
        )
        payload["provider_actions"] = [
            {"agent": "Claude2", "action": "pause", "kind": "capacity", "reason": "stale prompt"}
        ]
        self.assertEqual(
            supervisor.validate_chair_review_context(payload, reason="approval_triage", approval_state=approval_state),
            "approval_triage must not emit provider_actions",
        )

    def test_agent_read_only_approval_is_routine_safe(self) -> None:
        approval = {
            "tool_name": "Agent",
            "risk_class": "unknown",
            "tool_input": {
                "description": "Review settlement matrix code",
                "prompt": "Read these files thoroughly and report any issues. Do not edit files.",
                "subagent_type": "Explore",
            },
        }

        self.assertTrue(supervisor._approval_is_routine_safe(approval))

    def test_chair_review_reason_prioritizes_provider_health_triage(self) -> None:
        reason = supervisor.chair_review_reason(
            {
                "provider_pauses": {
                    "claude": {
                        "kind": "auth",
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                }
            },
            {"pending": []},
        )

        self.assertEqual(reason, "provider_health_triage")

    def test_repeated_failure_records_ignore_tasks_covered_by_workspace_baseline_task(self) -> None:
        state = {
            "failure_streaks": {
                "UI-FE-ADM-FLT:owner": {
                    "task_id": "UI-FE-ADM-FLT",
                    "role": "owner",
                    "agent": "Codex",
                    "awaiting_chair": True,
                },
                "UI-FE-TEN-PSG:owner": {
                    "task_id": "UI-FE-TEN-PSG",
                    "role": "owner",
                    "agent": "Codex",
                    "awaiting_chair": True,
                },
            }
        }
        status = {
            "tasks": [
                {
                    "id": supervisor.WORKSPACE_BASELINE_TASK_ID,
                    "status": "in_progress",
                    "helper_kind": supervisor.WORKSPACE_BASELINE_HELPER_KIND,
                    "covers_task_ids": ["UI-FE-ADM-FLT"],
                }
            ]
        }

        records = supervisor.repeated_failure_records(state, status)

        self.assertEqual([item["task_id"] for item in records], ["UI-FE-TEN-PSG"])

    def test_chair_review_reason_skips_reassignment_when_workspace_baseline_task_covers_loops(self) -> None:
        reason = supervisor.chair_review_reason(
            {
                "failure_streaks": {
                    "UI-FE-ADM-FLT:owner": {
                        "task_id": "UI-FE-ADM-FLT",
                        "role": "owner",
                        "agent": "Codex",
                        "awaiting_chair": True,
                    }
                },
                "provider_pauses": {},
                "dispatch_pauses": [
                    {
                        "task_id": "UI-FE-ADM-FLT",
                        "provider": "codex",
                        "failure_kind": "terminal",
                        "paused_at": "2026-05-28T00:00:00Z",
                    }
                ],
            },
            {"pending": []},
            status={
                "tasks": [
                    {
                        "id": supervisor.WORKSPACE_BASELINE_TASK_ID,
                        "status": "in_progress",
                        "helper_kind": supervisor.WORKSPACE_BASELINE_HELPER_KIND,
                        "covers_task_ids": ["UI-FE-ADM-FLT"],
                    }
                ]
            },
            config={"paths": {}},
        )

        self.assertEqual(reason, "operational_review")

    def test_chair_review_reason_prioritizes_dependency_ready_blocked_tasks(self) -> None:
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "ADM-UI-RD-005",
                    "status": "blocked",
                    "owner": "Codex",
                    "reviewer": "Codex2",
                    "depends_on": ["DEP-001"],
                    "next": "Closeout blocked because shared branch HEAD moved to a mixed commit.",
                },
            ]
        }

        reason = supervisor.chair_review_reason(
            {
                "provider_pauses": {
                    "gemini": {
                        "kind": "quota",
                        "reason": "QUOTA_EXHAUSTED",
                        "paused_at": "2026-05-18T00:00:00Z",
                    }
                }
            },
            {"pending": []},
            status=status,
            config={"paths": {}},
        )

        self.assertEqual(reason, "blocked_task_triage")

    def test_chair_review_message_includes_dependency_ready_blocked_tasks(self) -> None:
        message = supervisor.build_chair_review_message(
            {
                "paths": {},
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                },
            },
            reason="blocked_task_triage",
            markdown_path=Path(".orchestrator/chair-reviews/test.md"),
            json_path=Path(".orchestrator/chair-reviews/test.json"),
            approval_state={"pending": []},
            state={"failure_streaks": {}, "provider_pauses": {}, "dispatch_pauses": []},
            provider_report={},
            status={
                "tasks": [
                    {"id": "DEP-001", "status": "done"},
                    {
                        "id": "ADM-UI-RD-005",
                        "status": "blocked",
                        "owner": "Codex",
                        "reviewer": "Codex2",
                        "depends_on": ["DEP-001"],
                        "next": "Closeout blocked because shared branch HEAD moved to a mixed commit.",
                    },
                ]
            },
        )

        self.assertIn("Dependency-ready blocked tasks requiring chair repair", message)
        self.assertIn("ADM-UI-RD-005", message)
        self.assertIn("kind=history_repair", message)
        self.assertIn("create_unblock_task", message)

    def test_blocked_task_triage_requires_unblock_task_action(self) -> None:
        payload = {
            "version": 1,
            "decision": "operational_review",
            "approval_ttl_minutes": 45,
            "reason": "blocked task needs repair",
            "blocked_by": [],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [],
        }
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {"id": "TEN-UI-RD-010", "status": "blocked", "depends_on": ["DEP-001"]},
            ]
        }

        self.assertEqual(
            supervisor.validate_chair_review_context(
                payload,
                reason="blocked_task_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            ),
            "blocked_task_triage must resolve blocked tasks via TEN-UI-RD-010:create_unblock_task",
        )
        payload["task_actions"] = [
            {
                "task_id": "TEN-UI-RD-010",
                "action": "create_unblock_task",
                "unblock_kind": "planning_decision",
                "reason": "Missing tenant approval-rule contract needs planning.",
            }
        ]
        self.assertIsNone(supervisor.validate_chair_review_payload(payload))
        self.assertIsNone(
            supervisor.validate_chair_review_context(
                payload,
                reason="blocked_task_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            )
        )

    def test_blocked_task_triage_requires_parent_resume_when_unblock_child_is_done(self) -> None:
        payload = {
            "version": 1,
            "decision": "operational_review",
            "approval_ttl_minutes": 45,
            "reason": "blocked parent should resume after existing unblock child",
            "blocked_by": [],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [],
        }
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "ADM-UI-RD-006",
                    "status": "blocked",
                    "owner": "Codex2",
                    "reviewer": "Codex",
                    "depends_on": ["DEP-001"],
                    "next": "See support/unblock/ADM-UI-RD-006/ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR.md",
                },
                {
                    "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                    "status": "done",
                    "task_class": "unblock",
                    "helper_parent": "ADM-UI-RD-006",
                    "helper_kind": "history_repair",
                    "resolved_parent_at": "2026-09-09T03:00:00Z",
                    "next": "Repair route documented and pushed.",
                },
            ]
        }

        self.assertEqual(
            supervisor.validate_chair_review_context(
                payload,
                reason="blocked_task_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            ),
            "blocked_task_triage must resolve blocked tasks via ADM-UI-RD-006:resume_parent_task",
        )
        payload["task_actions"] = [
            {
                "task_id": "ADM-UI-RD-006",
                "action": "resume_parent_task",
                "resume_status": "todo",
                "reason": "Completed history-repair helper already documented the rebuild route.",
            }
        ]
        self.assertIsNone(supervisor.validate_chair_review_payload(payload))
        self.assertIsNone(
            supervisor.validate_chair_review_context(
                payload,
                reason="blocked_task_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            )
        )

    def test_reassignment_triage_synthesizes_followup_unblock_action(self) -> None:
        payload = {
            "version": 1,
            "decision": "operational_review",
            "approval_ttl_minutes": 45,
            "reason": "reassign the failing owner first",
            "blocked_by": [
                "UI-FE-DRV-ONB remains blocked (history_repair); not reassignable while blocked."
            ],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [
                "Run blocked_task_triage for UI-FE-DRV-ONB: create history_repair unblock task."
            ],
        }
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "UI-FE-DRV-ONB",
                    "status": "blocked",
                    "owner": "Codex2",
                    "reviewer": "Claude2",
                    "depends_on": ["DEP-001"],
                    "next": "History repair audit still required.",
                },
            ]
        }

        self.assertEqual(
            supervisor.validate_chair_review_context(
                payload,
                reason="reassignment_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            ),
            "reassignment_triage must materialize follow-up task actions via UI-FE-DRV-ONB:create_unblock_task",
        )

        normalized = supervisor.normalize_chair_review_payload_for_reason(
            payload,
            reason="reassignment_triage",
            config={"paths": {}},
            status=status,
        )

        self.assertEqual(
            normalized["task_actions"],
            [
                {
                    "task_id": "UI-FE-DRV-ONB",
                    "action": "create_unblock_task",
                    "unblock_kind": "history_repair",
                    "reason": (
                        "Chairman follow-up from reassignment_triage: UI-FE-DRV-ONB remains "
                        "dependency-ready blocked; materialize the history_repair unblock path now."
                    ),
                }
            ],
        )
        self.assertIsNone(supervisor.validate_chair_review_payload(normalized))
        self.assertIsNone(
            supervisor.validate_chair_review_context(
                normalized,
                reason="reassignment_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            )
        )

    def test_reassignment_triage_synthesizes_resume_parent_followup_action(self) -> None:
        payload = {
            "version": 1,
            "decision": "operational_review",
            "approval_ttl_minutes": 45,
            "reason": "reassign other work but resume the repaired blocked parent",
            "blocked_by": [
                "ADM-UI-RD-006 remains blocked only because the parent has not been resumed yet."
            ],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [
                "Resume ADM-UI-RD-006 after the completed history_repair unblock child."
            ],
        }
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "ADM-UI-RD-006",
                    "status": "blocked",
                    "owner": "Codex2",
                    "reviewer": "Codex",
                    "depends_on": ["DEP-001"],
                    "next": "Completed history-repair helper already documented the rebuild route.",
                },
                {
                    "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                    "status": "done",
                    "task_class": "unblock",
                    "helper_parent": "ADM-UI-RD-006",
                    "helper_kind": "history_repair",
                    "resolved_parent_at": "2026-09-09T03:00:00Z",
                    "next": "Repair route documented and pushed.",
                },
            ]
        }

        normalized = supervisor.normalize_chair_review_payload_for_reason(
            payload,
            reason="reassignment_triage",
            config={"paths": {}},
            status=status,
        )

        self.assertEqual(
            normalized["task_actions"],
            [
                {
                    "task_id": "ADM-UI-RD-006",
                    "action": "resume_parent_task",
                    "resume_status": "todo",
                    "reason": (
                        "Chairman follow-up from reassignment_triage: "
                        "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR already resolved the blocker for "
                        "ADM-UI-RD-006; resume the parent."
                    ),
                }
            ],
        )
        self.assertIsNone(
            supervisor.validate_chair_review_context(
                normalized,
                reason="reassignment_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            )
        )

    def test_provider_report_age_uses_generated_at(self) -> None:
        now = datetime(2026, 8, 4, 12, 0, 0, tzinfo=timezone.utc)
        age = supervisor.provider_report_age_seconds(
            Path("/nonexistent/provider_capabilities.json"),
            {"generated_at": "2026-08-04T11:45:00Z"},
            now=now,
        )
        self.assertEqual(age, 900.0)

    def test_provider_report_age_is_infinite_when_undateable(self) -> None:
        age = supervisor.provider_report_age_seconds(
            Path("/nonexistent/provider_capabilities.json"), {}
        )
        self.assertEqual(age, float("inf"))

    def test_stale_provider_report_is_reprobed(self) -> None:
        """A cached report that is never refreshed can strand a healthy lane."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "provider_capabilities.json"
            path.write_text(
                json.dumps({"generated_at": "2026-08-01T00:00:00Z", "providers": {}}),
                encoding="utf-8",
            )
            config = {
                "paths": {"provider_capabilities": str(path)},
                "supervisor": {"auto_refresh_provider_capabilities": False},
            }
            fresh = {"generated_at": "2026-08-04T00:00:00Z", "providers": {"claude": {}}}
            with (
                mock.patch.object(supervisor, "build_provider_capabilities", return_value=fresh) as build,
                mock.patch.object(supervisor, "write_provider_capabilities") as write,
            ):
                report = supervisor.load_provider_report(config)
            build.assert_called_once()
            write.assert_called_once()
            self.assertEqual(report, fresh)

    def test_fresh_provider_report_is_not_reprobed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "provider_capabilities.json"
            generated_at = (
                datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            )
            cached = {"generated_at": generated_at, "providers": {"claude": {}}}
            path.write_text(json.dumps(cached), encoding="utf-8")
            config = {
                "paths": {"provider_capabilities": str(path)},
                "supervisor": {"auto_refresh_provider_capabilities": False},
            }
            with mock.patch.object(supervisor, "build_provider_capabilities") as build:
                report = supervisor.load_provider_report(config)
            build.assert_not_called()
            self.assertEqual(report, cached)

    def test_provider_health_review_respects_cooldown_after_recent_pause_review(self) -> None:
        state = {
            "provider_pauses": {
                "claude": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "claude",
                    "kind": "auth",
                    "reason": "Invalid authentication credentials",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            },
            "dispatch_pauses": [],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": "2026-04-30T12:52:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }
        config = {"chair_review": {"enabled": True}}

        with (
            mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
            mock.patch.object(supervisor, "choose_chair_reviewer") as choose_chair_reviewer,
        ):
            queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

        self.assertFalse(queued)
        choose_chair_reviewer.assert_not_called()

    def test_dispatch_pause_review_respects_cooldown_after_recent_review(self) -> None:
        state = {
            "provider_pauses": {},
            "dispatch_pauses": [
                {
                    "provider": "codex2",
                    "task_id": "IAM-PRT-001",
                    "failure_kind": "quota/terminal",
                    "paused_at": "2026-04-30T12:51:53Z",
                }
            ],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": "2026-04-30T12:52:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }
        config = {"chair_review": {"enabled": True}}

        with (
            mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
            mock.patch.object(supervisor, "choose_chair_reviewer") as choose_chair_reviewer,
        ):
            queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

        self.assertFalse(queued)
        choose_chair_reviewer.assert_not_called()

    def test_dispatch_pause_recorded_after_last_review_bypasses_cooldown(self) -> None:
        state = {
            "provider_pauses": {},
            "dispatch_pauses": [
                {
                    "provider": "codex2",
                    "task_id": "IAM-PRT-001",
                    "failure_kind": "quota/terminal",
                    "paused_at": "2026-04-30T13:10:00Z",
                }
            ],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": "2026-04-30T12:52:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }

        self.assertTrue(
            supervisor.chair_review_needs_immediate_attention(state, {"tasks": []})
        )

    def test_dependency_ready_blocked_task_does_not_bypass_cooldown(self) -> None:
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "ADM-UI-RD-005",
                    "status": "blocked",
                    "owner": "Codex",
                    "reviewer": "Codex2",
                    "depends_on": ["DEP-001"],
                    "next": "Closeout blocked because shared branch HEAD moved to a mixed commit.",
                },
            ]
        }
        state = {
            "provider_pauses": {},
            "dispatch_pauses": [],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": "2026-04-30T12:52:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }
        config = {"paths": {}, "chair_review": {"enabled": True}}

        # The blocked task is still triage-worthy, so the reason stays set...
        self.assertEqual(
            supervisor.chair_review_reason(state, {"pending": []}, status=status, config=config),
            "blocked_task_triage",
        )

        # ...but it must not re-queue a review on every tick while the cooldown
        # is active, because the chair cannot clear the condition itself.
        with (
            mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
            mock.patch.object(supervisor, "choose_chair_reviewer") as choose_chair_reviewer,
        ):
            queued = supervisor.queue_chair_review(config, state, status, provider_report={})

        self.assertFalse(queued)
        choose_chair_reviewer.assert_not_called()

    def test_urgent_chair_review_can_use_lane_with_primary_work(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = {
                "agents": {
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                },
                "chair_review": {"enabled": True},
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "status_field": "status",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                },
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
            }
            state = {
                "queue": {"events": {}},
                "workers": {},
                "seen_event_keys": {},
                "provider_pauses": {
                    "claude": {
                        "schema": 3,
                        "scope": "lane",
                        "lane_id": "claude",
                        "kind": "auth",
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                },
                "chair_review": {},
            }
            status = {
                "tasks": [
                    {
                        "id": "DRV-UI-002",
                        "status": "backlog",
                        "owner": "Codex",
                        "reviewer": "Claude",
                        "depends_on": [],
                    }
                ]
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
                mock.patch.object(supervisor, "enqueue_event") as enqueue_event,
                mock.patch.object(supervisor, "write_activity_log"),
            ):
                queued = supervisor.queue_chair_review(config, state, status, provider_report={})

        self.assertTrue(queued)
        self.assertEqual(state["chair_review"]["active_review"]["agent"], "Codex")
        self.assertEqual(state["chair_review"]["active_review"]["reason"], "provider_health_triage")
        enqueue_event.assert_called_once()

    def test_chair_reviewer_skips_lane_without_auto_delivery(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            (root / "ai-status.json").write_text('{"agents": [{"name": "Gemini"}, {"name": "Codex"}], "tasks": []}\n', encoding="utf-8")
            config = {
                "agents": {
                    "gemini": {"id": "gemini", "display_name": "Gemini", "provider": "gemini"},
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                },
                "paths": {
                    "event_queue": str(root / "event-queue.jsonl"),
                    "status_file": str(root / "ai-status.json"),
                },
                "ready_dispatcher": {"active_worker_statuses": []},
            }
            state = {"workers": {}, "queue": {"events": {}}, "provider_pauses": {}, "chair_review": {}}
            status = {"agents": [{"name": "Gemini"}, {"name": "Codex"}], "tasks": []}
            provider_report = {
                "agent_adapters": {
                    "gemini": {"supported": True, "can_auto_deliver": False},
                    "codex": {"supported": True, "can_auto_deliver": True},
                }
            }

            chosen = supervisor.choose_chair_reviewer(config, state, status, provider_report)

        self.assertEqual(chosen, ("codex", "Codex"))

    def test_chair_reviewer_skips_stale_adapter_capability_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            (root / "ai-status.json").write_text('{"agents": [{"name": "Gemini"}, {"name": "Codex"}], "tasks": []}\n', encoding="utf-8")
            config = {
                "agents": {
                    "gemini": {
                        "id": "gemini",
                        "display_name": "Gemini",
                        "provider": "gemini",
                        "adapter": "antigravity",
                    },
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex", "adapter": "codex"},
                },
                "paths": {
                    "event_queue": str(root / "event-queue.jsonl"),
                    "status_file": str(root / "ai-status.json"),
                },
                "ready_dispatcher": {"active_worker_statuses": []},
            }
            state = {"workers": {}, "queue": {"events": {}}, "provider_pauses": {}, "chair_review": {}}
            status = {"agents": [{"name": "Gemini"}, {"name": "Codex"}], "tasks": []}
            provider_report = {
                "agent_adapters": {
                    "gemini": {"adapter": "gemini", "supported": True, "can_auto_deliver": True},
                    "codex": {"adapter": "codex", "supported": True, "can_auto_deliver": True},
                }
            }

            chosen = supervisor.choose_chair_reviewer(config, state, status, provider_report)

        self.assertEqual(chosen, ("codex", "Codex"))

    def test_chair_reviewer_skips_lane_banned_by_zero_capacity(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            (root / "ai-status.json").write_text('{"agents": [{"name": "Pi"}, {"name": "Codex"}], "tasks": []}\n', encoding="utf-8")
            config = {
                "agents": {
                    "pi": {"id": "pi", "display_name": "Pi", "provider": "pi"},
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                },
                "paths": {
                    "event_queue": str(root / "event-queue.jsonl"),
                    "status_file": str(root / "ai-status.json"),
                },
                "ready_dispatcher": {
                    "active_worker_statuses": [],
                    "max_tasks_per_agent_by_lane": {"pi": 0, "codex": 2},
                },
            }
            status = {"agents": [{"name": "Pi"}, {"name": "Codex"}], "tasks": []}
            provider_report = {
                "agent_adapters": {
                    "pi": {"supported": True, "can_auto_deliver": True},
                    "codex": {"supported": True, "can_auto_deliver": True},
                }
            }

            # Every rotation position must skip the banned lane, not just the first.
            chosen = []
            for rotation_index in range(2):
                state = {
                    "workers": {},
                    "queue": {"events": {}},
                    "provider_pauses": {},
                    "chair_review": {"rotation_index": rotation_index},
                }
                chosen.append(supervisor.choose_chair_reviewer(config, state, status, provider_report))
                chosen.append(
                    supervisor.choose_chair_reviewer(
                        config, state, status, provider_report, allow_primary_work_fallback=True
                    )
                )

        self.assertEqual(chosen, [("codex", "Codex")] * 4)

    def test_urgent_chair_review_can_recover_busy_lane_when_capacity_available(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            (root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
            config = {
                "agents": {
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                },
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "ready_dispatcher": {
                    "active_worker_statuses": ["running"],
                    "max_tasks_per_agent_by_lane": {"codex": 2},
                },
            }
            state = {
                "workers": {
                    "w-codex": {
                        "agent_id": "codex",
                        "status": "running",
                        "queue_event_id": "evt-codex-recover",
                    }
                },
                "queue": {
                    "events": {
                        "evt-codex-recover": {
                            "status": "started",
                        }
                    }
                },
                "provider_pauses": {},
                "chair_review": {},
            }

            chosen = supervisor.choose_chair_reviewer(
                config,
                state,
                {"tasks": []},
                {},
                allow_primary_work_fallback=True,
            )

        self.assertEqual(chosen, ("codex", "Codex"))

    def test_urgent_chair_review_records_blocked_when_no_lane_available(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = {
                "agents": {
                    "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
                },
                "chair_review": {"enabled": True},
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
            }
            state = {
                "queue": {"events": {}},
                "workers": {},
                "provider_pauses": {
                    "claude": {
                        "kind": "auth",
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                },
                "chair_review": {},
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

        self.assertTrue(queued)
        self.assertEqual(state["chair_review"]["blocked"]["reason"], "provider_health_triage")
        self.assertIsNone(state["chair_review"].get("active_review"))
        write_activity_log.assert_called_once()

    def test_duplicate_chair_provider_pause_is_noop(self) -> None:
        state = {
            "provider_pauses": {
                "claude": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "claude",
                    "kind": "auth",
                    "reason": "Invalid authentication credentials",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            }
        }
        config = {"agents": {"claude": {"display_name": "Claude", "provider": "claude"}}}

        changed = supervisor.apply_chair_provider_action(
            config,
            state,
            {
                "agent": "Claude",
                "action": "pause",
                "kind": "auth",
                "reason": "Invalid authentication credentials",
            },
        )

        self.assertFalse(changed)
        self.assertEqual(state["provider_pauses"]["claude"]["paused_at"], "2026-04-30T12:51:53Z")

    def test_chair_clear_pause_rejects_future_resume_at(self) -> None:
        state = {
            "provider_pauses": {
                "copilot": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "copilot",
                    "kind": "quota",
                    "reason": "Quota exhausted",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": 4102444800.0,
                }
            },
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            config = {
                "agents": {"copilot": {"display_name": "Copilot", "provider": "copilot"}},
                "paths": {"activity_log": str(Path(tmpdir) / "activity-log.jsonl")},
            }
            changed = supervisor.apply_chair_provider_action(
                config,
                state,
                {
                    "agent": "Copilot",
                    "action": "clear_pause",
                    "reason": "Quota limits have been met.",
                },
            )

        self.assertFalse(changed)
        self.assertIn("copilot", state["provider_pauses"])

    def test_dispatcher_skips_task_waiting_on_chair_reassignment(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {},
            "chair_review": {"enabled": True},
            "agents": {
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
            },
        }
        state = {
            "queue": {"events": {}},
            "workers": {},
            "seen_event_keys": {},
            "failure_streaks": {
                "REG-777:owner": {
                    "task_id": "REG-777",
                    "role": "owner",
                    "agent": "Codex",
                    "count": 2,
                    "threshold": 2,
                    "awaiting_chair": True,
                }
            },
        }
        status = {
            "tasks": [
                {
                    "id": "REG-777",
                    "status": "todo",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "depends_on": [],
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertFalse(changed)
        queue_delivery_event.assert_not_called()

    def test_dispatcher_skips_legacy_alias_helper_claim(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "availability_first": True,
                    "allow_any_idle_lane": True,
                    "require_assigned_agent_busy": True,
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "grok": {"id": "grok", "display_name": "Copilot (legacy alias)", "provider": "grok"},
            },
        }
        state = {
            "queue": {"events": {}},
            "workers": {},
            "provider_pauses": {
                "copilot": {
                    "kind": "quota",
                    "reason": "quota exhausted",
                    "paused_at": "2026-04-30T15:00:00Z",
                    "resume_at": None,
                }
            },
        }
        status = {
            "tasks": [
                {
                    "id": "OPX-GV-004",
                    "status": "review",
                    "owner": "Codex2",
                    "reviewer": "Copilot",
                    "depends_on": [],
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertFalse(changed)
        queue_delivery_event.assert_not_called()

    def test_refresh_chair_review_state_classifies_lost_queue_event(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "missing.md"
            json_path = review_dir / "missing.json"
            config = {
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            (root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            state = {
                "queue": {"events": {}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "gemini",
                        "agent": "Gemini",
                        "reason": "provider_health_triage",
                        "queue_event_id": "evt-missing",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            records = [
                json.loads(line)
                for line in (root / "activity-log.jsonl").read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual(records[-1]["type"], "chair_review_lost_queue_event")

    def test_queued_chair_review_survives_process_queue(self) -> None:
        """The seam between queue_chair_review and process_queue.

        Both stages had thorough tests of their own, and the defect lived
        precisely between them: chair events carry task_id=None, so the
        task-bound staleness check silently skipped every one of them, and the
        supervisor re-queued and re-lost the same review ~3000 times an hour.
        Asserting on a hand-built event would reproduce the same blind spot, so
        this drives the real queue_chair_review event through the real queue.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "chair-reviews").mkdir(parents=True, exist_ok=True)
            (root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "agents": {"claude": {"display_name": "Claude", "provider": "claude"}},
                "chair_review": {"enabled": True, "review_dir": str(root / "chair-reviews")},
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                    "chair_review_dir": str(root / "chair-reviews"),
                },
            }
            state = {"queue": {"events": {}}, "workers": {}, "chair_review": {}}

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
                mock.patch.object(supervisor, "choose_chair_reviewer", return_value=("claude", "Claude")),
            ):
                queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})
            self.assertTrue(queued)
            event_id = state["chair_review"]["active_review"]["queue_event_id"]

            with mock.patch.object(
                supervisor, "start_worker_for_request", return_value=(True, "run-1", {})
            ) as start_worker:
                supervisor.process_queue(config, state, provider_report={})

            record = state["queue"]["events"][event_id]
            self.assertNotEqual(record.get("skip_reason"), "stale_dispatch_event")
            self.assertEqual(record["status"], "started")
            start_worker.assert_called_once()
            records = [
                json.loads(line)
                for line in (root / "activity-log.jsonl").read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual([r for r in records if r["type"] == "wake_skipped"], [])

    def _planning_event(self, **overrides) -> dict:
        """The event found on the live queue four days after it was queued."""
        event = {
            "event_id": "evt-20260913T145733Z-0f405329",
            "created_at": _ago_iso(days=4),
            "event_key": "planning:phase1:Copilot:review-round-1.md",
            "task_id": "PLANNING-PHASE1-COPILOT",
            "target_agent": "copilot",
            "reason": "planning:review-round-1.md",
        }
        event.update(overrides)
        return event

    def test_a_planning_event_for_a_task_the_board_lacks_is_retired(self) -> None:
        """Nothing could expire it. The staleness rules run only for reasons in
        TASK_DISPATCH_REASONS and this is a planning reason, so the function
        returned at its first line; `reconcile_queue_records` starts from an
        event's workers and this one never admitted a worker. It was deferred
        with `waiting_capacity` against a lane with no capacity and re-queued
        every tick for four days, after that planning round had ended and the
        supervisor had moved to execution mode."""
        message = supervisor.stale_dispatch_skip_message({}, self._planning_event(), {})
        self.assertIsNotNone(message)
        self.assertIn("PLANNING-PHASE1-COPILOT", message)

    def test_a_planning_event_whose_task_is_on_the_board_is_kept(self) -> None:
        event = self._planning_event(task_id="REAL-1")
        task_map = {"REAL-1": {"id": "REAL-1", "status": "todo"}}
        self.assertIsNone(supervisor.stale_dispatch_skip_message({}, event, task_map))

    def test_a_freshly_queued_event_is_kept_through_the_grace_period(self) -> None:
        """An event is queued before the board file is rewritten, so a
        genuinely new task can be missing from it for a tick."""
        event = self._planning_event(created_at=_ago_iso(seconds=30))
        self.assertIsNone(supervisor.stale_dispatch_skip_message({}, event, {}))

    def test_an_event_without_a_created_at_is_left_alone(self) -> None:
        event = self._planning_event()
        event.pop("created_at")
        self.assertIsNone(supervisor.stale_dispatch_skip_message({}, event, {}))

    def test_stale_dispatch_skip_message_ignores_events_without_a_dispatch_reason(self) -> None:
        event = {"event_id": "evt-chair", "task_id": None, "reason": "chair_review:blocked_task_triage"}
        self.assertIsNone(supervisor.stale_dispatch_skip_message({}, event, {}))

    def test_task_dispatch_reasons_track_the_domain_enum(self) -> None:
        """Guards the drift that caused the outage.

        The literal set this replaced had already lost acceptance_ready_dispatch
        (exempting those events from a staleness check they needed) before it was
        deleted outright (subjecting every coordination event to one they must
        never get). Binding it to the enum removes the hand-maintained copy.
        """
        self.assertEqual(
            supervisor.TASK_DISPATCH_REASONS,
            frozenset(reason.value for reason in supervisor.DomainDispatchReason),
        )

    def _chair_seam_env(self, tmpdir: str) -> tuple[dict, dict]:
        root = Path(tmpdir)
        (root / "chair-reviews").mkdir(parents=True, exist_ok=True)
        (root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
        (root / "activity-log.jsonl").write_text("", encoding="utf-8")
        config = {
            "schema": {"tasks_path": "tasks", "task_id_field": "id"},
            "ready_dispatcher": {"active_worker_statuses": ["running", "started", "manual_pending"]},
            "chair_review": {"enabled": True, "cooldown_seconds": 900},
            "paths": {
                "status_file": str(root / "ai-status.json"),
                "state_file": str(root / "state.json"),
                "approval_queue": str(root / "approval-queue.json"),
                "activity_log": str(root / "activity-log.jsonl"),
                "event_queue": str(root / "event-queue.jsonl"),
            },
        }
        event = {
            "event_id": "evt-chair",
            "task_id": None,
            "reason": "chair_review:blocked_task_triage",
            "event_key": "chair:blocked_task_triage:Gemini2:x.json",
            "message": "review please",
            "target_files": [str(root / "chair-reviews" / "x.md"), str(root / "chair-reviews" / "x.json")],
        }
        (root / "event-queue.jsonl").write_text(json.dumps(event) + "\n", encoding="utf-8")
        state = {
            "queue": {"events": {"evt-chair": {"status": "completed", "processed_at": "2026-01-01T00:00:00Z"}}},
            "workers": {
                "run-chair": {
                    "run_id": "run-chair",
                    "task_id": None,
                    "provider": "gemini2",
                    "agent_id": "gemini2",
                    "status": "failed",
                    "queue_event_id": "evt-chair",
                    "last_event_at": "2026-01-01T00:00:00Z",
                }
            },
            "chair_review": {
                "active_review": {
                    "agent_id": "gemini2",
                    "agent": "Gemini2",
                    "reason": "blocked_task_triage",
                    "queue_event_id": "evt-chair",
                    "markdown_path": str(root / "chair-reviews" / "x.md"),
                    "json_path": str(root / "chair-reviews" / "x.json"),
                }
            },
        }
        return config, state

    def test_prune_keeps_a_queue_event_an_unfinished_chair_review_still_references(self) -> None:
        """prune_event_queue decided an event was disposable once no worker was
        active on it, but the chair holds its own reference through
        active_review.queue_event_id and had not finished consuming it."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state = self._chair_seam_env(tmpdir)
            supervisor.prune_event_queue(config, state)
            self.assertIn("evt-chair", state["queue"]["events"])

    def test_chair_review_without_output_reports_missing_output_not_a_lost_event(self) -> None:
        """The accurate branch was unreachable: prune runs between poll_workers
        and refresh_chair_review_state in every tick, so the record was always
        gone by the time the chair classified it. Across 148,208 logged events
        chair_review_missing_output never fired once."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state = self._chair_seam_env(tmpdir)
            supervisor.prune_event_queue(config, state)
            with mock.patch.object(
                supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}
            ):
                supervisor.refresh_chair_review_state(config, state, provider_report={})

            records = [
                json.loads(line)
                for line in (Path(tmpdir) / "activity-log.jsonl").read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            types = [record["type"] for record in records]
            self.assertIn("chair_review_missing_output", types)
            self.assertNotIn("chair_review_lost_queue_event", types)

    def test_full_tick_replays_the_gemini2_failure_end_to_end(self) -> None:
        """The three stages in the order run_once actually calls them.

        Every stage here had tests of its own before, and the defect lived
        between them: poll_workers called the run complete, prune_event_queue
        then dropped the record, and refresh_chair_review_state could only
        report that the event had vanished. Driving one worker through all
        three is the only shape that would have caught it.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "chair-reviews").mkdir()
            (root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            worker_log = root / "worker.log"
            # Verbatim content of the 2026-08-16T23:46 antigravity run: a hard
            # agent failure that matches none of the known failure patterns.
            worker_log.write_text("Error: Agent execution terminated due to error.\n", encoding="utf-8")
            markdown_path, json_path = root / "chair-reviews/x.md", root / "chair-reviews/x.json"
            declared = [str(markdown_path), str(json_path)]
            (root / "event-queue.jsonl").write_text(
                json.dumps(
                    {
                        "event_id": "evt-chair",
                        "task_id": None,
                        "reason": "chair_review:blocked_task_triage",
                        "event_key": "chair:blocked_task_triage:Gemini2:x.json",
                        "message": "review",
                        "target_files": declared,
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            config = {
                "schema": {"tasks_path": "tasks", "task_id_field": "id", "assignee_field": "owner", "reviewer_field": "reviewer"},
                "supervisor": {"stall_after_seconds": 300},
                "ready_dispatcher": {"active_worker_statuses": ["running", "started", "manual_pending"], "dependency_done_statuses": ["done"]},
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
                "providers": {},
                "agents": {"gemini2": {"id": "gemini2", "display_name": "Gemini2"}},
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "started"}}},
                "workers": {
                    "run-chair": {
                        "run_id": "run-chair", "task_id": None, "provider": "gemini2", "agent_id": "gemini2",
                        "status": "running", "queue_event_id": "evt-chair", "pid": 4242,
                        "log_path": str(worker_log), "last_event_at": "2026-01-01T00:00:00Z",
                        "request_snapshot": {
                            "reason": "chair_review:blocked_task_triage",
                            "metadata": {"mode": "coordination"},
                            "target_files": declared,
                        },
                    }
                },
                "provider_pauses": {
                    "codex2": {"schema": 3, "scope": "lane", "lane_id": "codex2", "kind": "auth",
                               "reason": "status: 401,", "paused_at": "2026-08-15T04:51:02Z", "resume_at": None}
                },
                "dispatch_pauses": [],
                "failure_streaks": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "gemini2", "agent": "Gemini2", "reason": "blocked_task_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path), "json_path": str(json_path),
                    },
                    "last_attempt_at": "2026-08-16T23:46:40Z",
                    "last_review_at": "2026-08-14T13:23:22Z",
                },
            }

            with (
                mock.patch.object(supervisor, "pid_is_alive", return_value=False),
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            ):
                supervisor.poll_workers(config, state)
                self.assertEqual(state["workers"]["run-chair"]["status"], "failed")

                supervisor.prune_event_queue(config, state)
                self.assertIn("evt-chair", state["queue"]["events"])

                supervisor.refresh_chair_review_state(config, state, provider_report={})

                supervisor.prune_event_queue(config, state)
                self.assertNotIn("evt-chair", state["queue"]["events"])

                requeued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

            types = [
                json.loads(line)["type"]
                for line in (root / "activity-log.jsonl").read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertIn("chair_review_missing_output", types)
            self.assertNotIn("chair_review_lost_queue_event", types)
            self.assertIsNotNone(state["chair_review"]["cooldown_until"])
            self.assertIsNone(state["chair_review"]["active_review"])
            # The pause the chair already looked at must not manufacture a bypass.
            self.assertFalse(requeued)

    _VALID_CHAIR_PAYLOAD = {
        "version": 1, "decision": "blocked_task_triage", "approval_ttl_minutes": 45,
        "reason": "r", "blocked_by": [], "approval_actions": [], "reassignment_actions": [],
        "task_actions": [], "provider_actions": [], "recommended_focus": [],
    }

    def _activity_records(self, tmpdir: str) -> list[dict]:
        return [
            json.loads(line)
            for line in (Path(tmpdir) / "activity-log.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    def _live_chair_worker_with_json_only(self, tmpdir: str) -> tuple[dict, dict, Path, Path]:
        """The 134234 shape: decision packet written, Markdown not yet, worker
        still bookkept as running. The JSON is backdated well past the old 15s
        mtime grace so any age-based gate would already have fired."""
        import os
        import time

        config, state = self._chair_seam_env(tmpdir)
        markdown_path = Path(state["chair_review"]["active_review"]["markdown_path"])
        json_path = Path(state["chair_review"]["active_review"]["json_path"])
        json_path.write_text(json.dumps(self._VALID_CHAIR_PAYLOAD), encoding="utf-8")
        old = time.time() - 60
        os.utime(json_path, (old, old))
        state["workers"]["run-chair"]["status"] = "running"
        state["workers"]["run-chair"]["pid"] = 999999
        return config, state, markdown_path, json_path

    def test_active_alive_worker_with_incomplete_output_pair_waits_instead_of_being_killed(self) -> None:
        """Real 134234: the chair wrote JSON, was still genuinely running, and
        was killed for missing Markdown past a fixed 15s mtime age. A real
        worker (claude2 121818) took 23.36s between the JSON and Markdown
        writes and still produced a valid review. Liveness, not age, must gate
        the wait -- and the wait must end in exactly one apply once the pair
        completes."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state, markdown_path, _json_path = self._live_chair_worker_with_json_only(tmpdir)
            with (
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})
                self.assertFalse(changed)
                self.assertEqual(state["workers"]["run-chair"]["status"], "running")
                self.assertIsNotNone(state["chair_review"]["active_review"])
                self.assertNotIn("failure_streak", state["chair_review"])
                self.assertNotIn("cooldown_until", state["chair_review"])
                self.assertNotIn("last_review_at", state["chair_review"])
                self.assertEqual(self._activity_records(tmpdir), [])

                # The worker finishes its second write; the pair is now complete.
                markdown_path.write_text("# review\n", encoding="utf-8")
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})
                self.assertTrue(changed)
                self.assertIsNone(state["chair_review"]["active_review"])
                self.assertEqual(state["chair_review"]["failure_streak"], 0)
                self.assertEqual(state["chair_review"]["last_decision"]["decision"], "blocked_task_triage")

                # Settled: a further pass must not apply the same review again.
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})
                self.assertFalse(changed)
            terminate.assert_not_called()
            types = [record["type"] for record in self._activity_records(tmpdir)]
            self.assertEqual(types.count("chair_review_applied"), 1)
            self.assertNotIn("chair_review_invalid_worker_terminated", types)
            self.assertNotIn("chair_review_invalid_schema", types)
            self.assertNotIn("chair_review_missing_output", types)

    def test_waiting_incomplete_pair_is_still_preempted_by_pending_approvals(self) -> None:
        """Waiting on a live worker must not shield it from the existing
        pending-approval preemption that runs before any output inspection."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state, _markdown_path, _json_path = self._live_chair_worker_with_json_only(tmpdir)
            pending = {"pending": [{"approval_id": "ap-1", "status": "pending"}], "history": []}
            with (
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "safe_load_approval_state", return_value=pending),
                mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})
            self.assertTrue(changed)
            terminate.assert_called_once_with(999999)
            self.assertEqual(state["workers"]["run-chair"]["status"], "superseded")
            self.assertIsNone(state["chair_review"]["active_review"])
            types = [record["type"] for record in self._activity_records(tmpdir)]
            self.assertIn("chair_review_preempted", types)
            self.assertNotIn("chair_review_invalid_schema", types)

    def test_waiting_incomplete_pair_does_not_suppress_worker_stall_and_reap(self) -> None:
        """The chair wait defers to the worker's own lifecycle; poll_workers
        must still mark the same live worker stalled, and after twice the
        stall window terminate it -- at which point the incomplete pair is
        rejected through the ordinary declared-output path."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state, _markdown_path, _json_path = self._live_chair_worker_with_json_only(tmpdir)
            config["supervisor"] = {"stall_after_seconds": 300}
            config["providers"] = {}
            config["agents"] = {"gemini2": {"id": "gemini2", "display_name": "Gemini2"}}
            worker = state["workers"]["run-chair"]
            worker["request_snapshot"] = {
                "reason": "chair_review:blocked_task_triage",
                "metadata": {"mode": "coordination"},
                "target_files": [
                    state["chair_review"]["active_review"]["markdown_path"],
                    state["chair_review"]["active_review"]["json_path"],
                ],
            }
            state["queue"]["events"]["evt-chair"] = {"status": "started"}
            worker["last_event_at"] = _ago_iso(seconds=400)
            no_approvals = {"pending": [], "history": []}
            with (
                mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                mock.patch.object(supervisor, "load_approval_state", return_value=no_approvals),
                mock.patch.object(supervisor, "safe_load_approval_state", return_value=no_approvals),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate,
            ):
                supervisor.poll_workers(config, state, provider_report={})
                self.assertEqual(worker["status"], "stalled")
                terminate.assert_not_called()
                # Stalled is still an active status: the chair keeps waiting,
                # it neither kills the worker nor takes over the stall decision.
                self.assertFalse(supervisor.refresh_chair_review_state(config, state, provider_report={}))
                self.assertIsNotNone(state["chair_review"]["active_review"])

                worker["last_event_at"] = _ago_iso(seconds=700)
                supervisor.poll_workers(config, state, provider_report={})
                terminate.assert_called_once_with(999999)
                self.assertTrue(supervisor.is_terminal_worker(worker))

                self.assertTrue(supervisor.refresh_chair_review_state(config, state, provider_report={}))
                self.assertIsNone(state["chair_review"]["active_review"])
                self.assertEqual(state["chair_review"]["failure_streak"], 1)
            records = self._activity_records(tmpdir)
            types = [record["type"] for record in records]
            self.assertEqual(types.count("worker_stalled"), 1)
            rejection = next(record for record in records if record["type"] == "chair_review_invalid_schema")
            self.assertIn("declared output missing", rejection["message"])

    def test_terminal_worker_missing_output_is_rejected_immediately_without_grace_wait(self) -> None:
        """A worker whose process has already exited gets the original
        missing-output rejection right away, even though the JSON file is
        fresh (well inside the old 15s window): it is never going to produce
        the missing Markdown, so there is nothing worth waiting for."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state = self._chair_seam_env(tmpdir)
            json_path = Path(state["chair_review"]["active_review"]["json_path"])
            json_path.write_text(json.dumps(self._VALID_CHAIR_PAYLOAD), encoding="utf-8")
            state["workers"]["run-chair"]["status"] = "running"
            state["workers"]["run-chair"]["pid"] = 999999
            with (
                mock.patch.object(supervisor, "pid_is_alive", return_value=False),
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})
            self.assertTrue(changed)
            terminate.assert_called_once_with(999999)
            self.assertEqual(state["workers"]["run-chair"]["status"], "failed")
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["failure_streak"], 1)
            records = self._activity_records(tmpdir)
            types = [record["type"] for record in records]
            self.assertIn("chair_review_invalid_worker_terminated", types)
            # JSON exists, so the declared-output rejection is reported through
            # the invalid-output event; chair_review_missing_output is reserved
            # for a review that produced no decision packet at all.
            rejection = next(record for record in records if record["type"] == "chair_review_invalid_schema")
            self.assertIn("declared output missing", rejection["message"])
            self.assertIn(str(Path(tmpdir) / "chair-reviews" / "x.md"), rejection["message"])

    def test_complete_pair_with_invalid_packet_fails_immediately_even_while_worker_alive(self) -> None:
        """Only an incomplete pair waits. Once both declared files exist, a
        malformed, schema-invalid or context-invalid packet is the worker's
        final answer and is rejected at once, live process or not."""
        import os
        import time

        broken_schema = dict(self._VALID_CHAIR_PAYLOAD, version=2)
        cases = [
            ("malformed_json", "blocked_task_triage", "{bad json", {"pending": [], "history": []},
             "decision packet is not valid JSON"),
            ("schema_invalid", "blocked_task_triage", json.dumps(broken_schema), {"pending": [], "history": []},
             "version must be 1"),
            # approval_triage is exempt from preemption, so a pending approval
            # here reaches context validation instead of superseding the review.
            ("context_invalid", "approval_triage", json.dumps(dict(self._VALID_CHAIR_PAYLOAD, decision="approval_triage")),
             {"pending": [{"approval_id": "ap-1", "status": "pending"}], "history": []},
             "approval_triage must resolve pending approvals"),
        ]
        for label, reason, json_text, approvals, expected in cases:
            with self.subTest(label), tempfile.TemporaryDirectory() as tmpdir:
                config, state = self._chair_seam_env(tmpdir)
                active = state["chair_review"]["active_review"]
                active["reason"] = reason
                Path(active["markdown_path"]).write_text("# review\n", encoding="utf-8")
                json_path = Path(active["json_path"])
                json_path.write_text(json_text, encoding="utf-8")
                old = time.time() - 60
                os.utime(json_path, (old, old))
                state["workers"]["run-chair"]["status"] = "running"
                state["workers"]["run-chair"]["pid"] = 999999
                with (
                    mock.patch.object(supervisor, "pid_is_alive", return_value=True),
                    mock.patch.object(supervisor, "safe_load_approval_state", return_value=approvals),
                    mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate,
                ):
                    changed = supervisor.refresh_chair_review_state(config, state, provider_report={})
                self.assertTrue(changed)
                terminate.assert_called_once_with(999999)
                self.assertEqual(state["workers"]["run-chair"]["status"], "failed")
                self.assertIsNone(state["chair_review"]["active_review"])
                self.assertEqual(state["chair_review"]["failure_streak"], 1)
                records = self._activity_records(tmpdir)
                types = [record["type"] for record in records]
                self.assertIn("chair_review_invalid_worker_terminated", types)
                rejection = next(record for record in records if record["type"] == "chair_review_invalid_schema")
                self.assertIn(expected, rejection["message"])
                self.assertNotIn("declared output missing", rejection["message"])

    def test_settled_chair_review_stops_retaining_its_queue_event(self) -> None:
        """The reference must be released, or the fix would leak events forever."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state = self._chair_seam_env(tmpdir)
            state["chair_review"]["active_review"] = None
            supervisor.prune_event_queue(config, state)
            self.assertNotIn("evt-chair", state["queue"]["events"])

    def test_queued_chair_review_survives_process_queue(self) -> None:
        """The seam between queue_chair_review and process_queue.

        Both stages had thorough tests of their own, and the defect lived
        precisely between them: chair events carry task_id=None, so the
        task-bound staleness check silently skipped every one of them, and the
        supervisor re-queued and re-lost the same review ~3000 times an hour.
        Asserting on a hand-built event would reproduce the same blind spot, so
        this drives the real queue_chair_review event through the real queue.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "chair-reviews").mkdir(parents=True, exist_ok=True)
            (root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "agents": {"claude": {"display_name": "Claude", "provider": "claude"}},
                "chair_review": {"enabled": True, "review_dir": str(root / "chair-reviews")},
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                    "chair_review_dir": str(root / "chair-reviews"),
                },
            }
            state = {"queue": {"events": {}}, "workers": {}, "chair_review": {}}

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
                mock.patch.object(supervisor, "choose_chair_reviewer", return_value=("claude", "Claude")),
            ):
                queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})
            self.assertTrue(queued)
            event_id = state["chair_review"]["active_review"]["queue_event_id"]

            with mock.patch.object(
                supervisor, "start_worker_for_request", return_value=(True, "run-1", {})
            ) as start_worker:
                supervisor.process_queue(config, state, provider_report={})

            record = state["queue"]["events"][event_id]
            self.assertNotEqual(record.get("skip_reason"), "stale_dispatch_event")
            self.assertEqual(record["status"], "started")
            start_worker.assert_called_once()
            records = [
                json.loads(line)
                for line in (root / "activity-log.jsonl").read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual([r for r in records if r["type"] == "wake_skipped"], [])

    def test_stale_dispatch_skip_message_ignores_events_without_a_dispatch_reason(self) -> None:
        event = {"event_id": "evt-chair", "task_id": None, "reason": "chair_review:blocked_task_triage"}
        self.assertIsNone(supervisor.stale_dispatch_skip_message({}, event, {}))

    def test_task_dispatch_reasons_track_the_domain_enum(self) -> None:
        """Guards the drift that caused the outage.

        The literal set this replaced had already lost acceptance_ready_dispatch
        (exempting those events from a staleness check they needed) before it was
        deleted outright (subjecting every coordination event to one they must
        never get). Binding it to the enum removes the hand-maintained copy.
        """
        self.assertEqual(
            supervisor.TASK_DISPATCH_REASONS,
            frozenset(reason.value for reason in supervisor.DomainDispatchReason),
        )

    def test_seen_provider_pause_no_longer_bypasses_the_cooldown_after_a_failed_review(self) -> None:
        """The urgency rule measured novelty against last_review_at, which only
        advances on success. A chair that kept failing therefore saw the same
        pause as unseen information forever and bypassed its own cooldown on
        every tick -- the loop had no brake at all."""
        state = {
            "provider_pauses": {
                "codex2": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "codex2",
                    "kind": "auth",
                    "reason": "status: 401,",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            },
            "dispatch_pauses": [],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": None,
                "last_attempt_at": "2026-04-30T13:00:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }
        config = {"chair_review": {"enabled": True}}

        with (
            mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
            mock.patch.object(supervisor, "write_activity_log"),
            mock.patch.object(supervisor, "choose_chair_reviewer", return_value=None) as choose_chair_reviewer,
        ):
            queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

        self.assertFalse(queued)
        choose_chair_reviewer.assert_not_called()

    def test_pause_recorded_after_the_last_attempt_still_bypasses_the_cooldown(self) -> None:
        """Genuinely new information must still preempt the cadence."""
        state = {
            "provider_pauses": {
                "codex2": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "codex2",
                    "kind": "auth",
                    "reason": "status: 401,",
                    "paused_at": "2026-04-30T14:00:00Z",
                    "resume_at": None,
                }
            },
            "dispatch_pauses": [],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": None,
                "last_attempt_at": "2026-04-30T13:00:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }
        config = {"chair_review": {"enabled": True}, "agents": {"claude": {"display_name": "Claude"}}}

        with (
            mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
            mock.patch.object(supervisor, "write_activity_log"),
            mock.patch.object(supervisor, "choose_chair_reviewer", return_value=None),
        ):
            supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

        self.assertEqual(state["chair_review"]["blocked"]["reason"], "provider_health_triage")

    def test_approval_already_attempted_no_longer_bypasses_the_cooldown(self) -> None:
        """Pending approvals bypassed the cadence with no watermark at all, so a
        chair failing while an approval sat in the queue retried at tick speed."""
        state = {
            "provider_pauses": {},
            "dispatch_pauses": [],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": None,
                "last_attempt_at": "2026-04-30T13:00:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }
        config = {"chair_review": {"enabled": True}}
        approvals = {"pending": [{"approval_id": "apr-1", "status": "pending", "created_at": "2026-04-30T12:00:00Z"}]}

        with (
            mock.patch.object(supervisor, "safe_load_approval_state", return_value=approvals),
            mock.patch.object(supervisor, "write_activity_log"),
            mock.patch.object(supervisor, "choose_chair_reviewer", return_value=None) as choose_chair_reviewer,
        ):
            queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

        self.assertFalse(queued)
        choose_chair_reviewer.assert_not_called()

    def test_failed_chair_review_sets_the_cooldown_instead_of_clearing_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "chair-reviews").mkdir(parents=True, exist_ok=True)
            (root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "gemini",
                        "agent": "Gemini",
                        "reason": "provider_health_triage",
                        "queue_event_id": "evt-missing",
                        "markdown_path": str(root / "chair-reviews" / "missing.md"),
                        "json_path": str(root / "chair-reviews" / "missing.json"),
                    }
                },
            }
            with mock.patch.object(
                supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}
            ):
                supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertIsNotNone(state["chair_review"]["cooldown_until"])
            # One gate, not two: the parallel backoff field must not come back.
            self.assertNotIn("failure_backoff_until", state["chair_review"])

    def test_refresh_chair_review_state_applies_canonical_reassignments_and_preserves_separation(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260429T000000Z-claude2.md"
            json_path = review_dir / "20260429T000000Z-claude2.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "reassign",
                        "approval_ttl_minutes": 45,
                        "reason": "break owner failure loop",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [
                            {
                                "task_id": "OPX-MD-003",
                                "role": "owner",
                                "from": "Codex2",
                                "to": "Codex",
                                "reason": "Codex2 hit repeated terminal failures.",
                            },
                            {
                                "task_id": "OPX-MD-003",
                                "role": "reviewer",
                                "from": "Codex",
                                "to": "Claude",
                                "reason": "Keep owner and reviewer separate after the owner move.",
                            },
                        ],
                        "task_actions": [],
                        "provider_actions": [],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "OPX-MD-003",
                                "owner": "Codex2",
                                "reviewer": "Codex",
                                "status": "in_progress",
                                "last_update": "2026-04-29T00:00:00Z",
                            }
                        ],
                        "handoffs": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                    "claude": {"display_name": "Claude", "provider": "claude"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "failure_streaks": {
                    "OPX-MD-003:owner": {
                        "task_id": "OPX-MD-003",
                        "role": "owner",
                        "agent": "Codex2",
                        "awaiting_chair": True,
                    },
                    "OPX-MD-003:reviewer": {
                        "task_id": "OPX-MD-003",
                        "role": "reviewer",
                        "agent": "Codex",
                        "awaiting_chair": True,
                    },
                },
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude2",
                        "agent": "Claude2",
                        "reason": "reassignment_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(
                    supervisor, "run_task_board_command", return_value=mock.MagicMock(ok=True)
                ) as command,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            self.assertEqual(command.call_count, 1)
            self.assertEqual(
                command.call_args.args[2][:3],
                ["OPX-MD-003", "Codex2", "Claude"],
            )
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertNotIn("OPX-MD-003:reviewer", state["failure_streaks"])
            self.assertEqual(state["chair_reassignment_guards"]["OPX-MD-003:reviewer"]["to"], "Claude")

    def test_chair_reassignment_rejects_owner_move_to_current_reviewer(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            status_path = root / "ai-status.json"
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "PBK-UI-004",
                                "owner": "Codex",
                                "reviewer": "Codex2",
                                "status": "in_progress",
                                "last_update": "2026-05-18T00:00:00Z",
                            }
                        ],
                        "handoffs": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                },
            }
            state = {"queue": {"events": {}}, "workers": {}, "failure_streaks": {}}

            with mock.patch.object(
                supervisor, "run_task_board_command", return_value=mock.MagicMock(ok=True)
            ) as command:
                changed = supervisor.apply_chair_reassignment_action(
                    config,
                    state,
                    {
                        "task_id": "PBK-UI-004",
                        "role": "owner",
                        "from": "Codex",
                        "to": "Codex2",
                        "reason": "Codex hit repeated terminal failures.",
                    },
                    provider_report={},
                )

            self.assertFalse(changed)
            command.assert_not_called()
            task = json.loads(status_path.read_text(encoding="utf-8"))["tasks"][0]
            self.assertEqual(task["owner"], "Codex")
            self.assertEqual(task["reviewer"], "Codex2")

    def _rejection_fixture(self, tmpdir: str, tasks: list, archived: list | None = None):
        root = Path(tmpdir)
        status_path = root / "ai-status.json"
        payload = {"tasks": tasks, "handoffs": []}
        if archived is not None:
            payload["archived_task_ids"] = archived
        status_path.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
        config = {
            "paths": {
                "status_file": str(status_path),
                "state_file": str(root / "state.json"),
                "approval_queue": str(root / "approval-queue.json"),
                "activity_log": str(root / "activity-log.jsonl"),
                "event_queue": str(root / "event-queue.jsonl"),
            },
            "agents": {
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
                "claude2": {"display_name": "Claude2", "provider": "claude2"},
                "gemini": {"display_name": "Gemini", "provider": "gemini"},
            },
        }
        state = {"queue": {"events": {}}, "workers": {}, "failure_streaks": {}}
        return config, state, root / "activity-log.jsonl"

    def _rejections(self, log_path: Path) -> list:
        if not log_path.exists():
            return []
        return [
            json.loads(line)
            for line in log_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and json.loads(line).get("type") == "chair_reassignment_rejected"
        ]

    def test_chair_reassignment_rejection_reports_a_task_id_the_board_does_not_have(self) -> None:
        """The 2026-09-16 incident, at the point where it became invisible.

        A chair copied `PLANNING-PHASE1-CLAUDE2` out of a stale dispatch-pause
        record, where that field holds a worker-run label rather than a board
        task id. The decision validated, was consumed, was stored as
        `last_decision`, and then applied to nothing and said nothing. With no
        log line, no guard entry and no queue event, the only reading left from
        outside was that the supervisor had stopped consuming decisions.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state, log_path = self._rejection_fixture(
                tmpdir,
                [{"id": "SR-ACCEPT-001", "owner": "Codex", "reviewer": "Codex2", "status": "todo"}],
            )

            with mock.patch.object(
                supervisor, "run_task_board_command", return_value=mock.MagicMock(ok=True)
            ) as command:
                changed = supervisor.apply_chair_reassignment_action(
                    config,
                    state,
                    {
                        "task_id": "PLANNING-PHASE1-CLAUDE2",
                        "role": "owner",
                        "from": "Claude2",
                        "to": "Gemini",
                        "reason": "Claude2 lane is paused due to quota limits.",
                    },
                    provider_report={},
                )

            self.assertFalse(changed)
            command.assert_not_called()
            rejections = self._rejections(log_path)
            self.assertEqual(len(rejections), 1)
            self.assertEqual(rejections[0]["task_id"], "PLANNING-PHASE1-CLAUDE2")
            self.assertIn("not on the task board", rejections[0]["message"])

    def test_chair_reassignment_rejection_distinguishes_an_archived_task(self) -> None:
        """An archived id is a different mistake from a fabricated one, and the
        operator reading the log needs to tell them apart."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state, log_path = self._rejection_fixture(
                tmpdir,
                [{"id": "SR-ACCEPT-001", "owner": "Codex", "reviewer": "Codex2", "status": "todo"}],
                archived=["SR-FLEET-SETTLE-001"],
            )

            with mock.patch.object(
                supervisor, "run_task_board_command", return_value=mock.MagicMock(ok=True)
            ):
                changed = supervisor.apply_chair_reassignment_action(
                    config, state,
                    {"task_id": "SR-FLEET-SETTLE-001", "role": "owner", "from": "Claude2",
                     "to": "Gemini", "reason": "Move the settle work off the paused lane."},
                    provider_report={},
                )

            self.assertFalse(changed)
            rejections = self._rejections(log_path)
            self.assertEqual(len(rejections), 1)
            self.assertIn("archived", rejections[0]["message"])

    def test_chair_reassignment_rejection_reports_a_wrong_handoff_source(self) -> None:
        """Not just the missing-task path: every guard that used to return a
        bare False now has to account for itself."""
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state, log_path = self._rejection_fixture(
                tmpdir,
                [{"id": "PBK-UI-004", "owner": "Codex", "reviewer": "Codex2", "status": "in_progress"}],
            )

            with mock.patch.object(
                supervisor, "run_task_board_command", return_value=mock.MagicMock(ok=True)
            ) as command:
                changed = supervisor.apply_chair_reassignment_action(
                    config, state,
                    {"task_id": "PBK-UI-004", "role": "owner", "from": "Claude2",
                     "to": "Gemini", "reason": "Claude2 lane is paused."},
                    provider_report={},
                )

            self.assertFalse(changed)
            command.assert_not_called()
            rejections = self._rejections(log_path)
            self.assertEqual(len(rejections), 1)
            self.assertIn("owner is Codex", rejections[0]["message"])

    def test_chair_reassignment_that_applies_writes_no_rejection(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            config, state, log_path = self._rejection_fixture(
                tmpdir,
                [{"id": "PBK-UI-004", "owner": "Claude2", "reviewer": "Codex2", "status": "in_progress"}],
            )

            with mock.patch.object(
                supervisor, "run_task_board_command", return_value=mock.MagicMock(ok=True)
            ) as command:
                changed = supervisor.apply_chair_reassignment_action(
                    config, state,
                    {"task_id": "PBK-UI-004", "role": "owner", "from": "Claude2",
                     "to": "Gemini", "reason": "Claude2 lane is paused."},
                    provider_report={},
                )

            self.assertTrue(changed)
            command.assert_called_once()
            self.assertEqual(self._rejections(log_path), [])

    def test_refresh_chair_review_state_reassigns_backlog_owner_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260430T000000Z-gemini.md"
            json_path = review_dir / "20260430T000000Z-gemini.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
                        "approval_ttl_minutes": None,
                        "reason": "Claude auth lane is degraded; move backlog owner work.",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [
                            {
                                "task_id": "OPX-DP-003-SIDECAR-ACCEPTANCE",
                                "role": "owner",
                                "from": "Claude",
                                "to": "Claude2",
                                "reason": "Claude auth failed before doing work.",
                            }
                        ],
                        "task_actions": [],
                        "provider_actions": [],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "OPX-DP-003-SIDECAR-ACCEPTANCE",
                                "owner": "Claude",
                                "reviewer": "Codex2",
                                "status": "backlog",
                                "last_update": "2026-04-30T12:43:03Z",
                            }
                        ],
                        "handoffs": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "claude": {"display_name": "Claude", "provider": "claude"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "failure_streaks": {
                    "OPX-DP-003-SIDECAR-ACCEPTANCE:owner": {
                        "task_id": "OPX-DP-003-SIDECAR-ACCEPTANCE",
                        "role": "owner",
                        "agent": "Claude",
                        "awaiting_chair": True,
                    }
                },
                "chair_review": {
                    "active_review": {
                        "agent_id": "gemini",
                        "agent": "Gemini",
                        "reason": "provider_health_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(
                    supervisor, "run_task_board_command", return_value=mock.MagicMock(ok=True)
                ) as command,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            command.assert_called_once()
            self.assertNotIn("OPX-DP-003-SIDECAR-ACCEPTANCE:owner", state["failure_streaks"])

    def test_refresh_chair_review_state_applies_provider_pause_and_reassignment(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260430T000000Z-claude.md"
            json_path = review_dir / "20260430T000000Z-claude.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
                        "approval_ttl_minutes": None,
                        "reason": "Gemini2 lane is degraded; pause it and move backlog work to a healthy owner.",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [
                            {
                                "task_id": "ORX-GV-003",
                                "role": "owner",
                                "from": "Gemini2",
                                "to": "Claude2",
                                "reason": "Gemini2 provider-health worker stalled while output already existed.",
                            }
                        ],
                        "task_actions": [],
                        "provider_actions": [
                            {
                                "agent": "Gemini2",
                                "action": "pause",
                                "kind": "auth",
                                # chair_provider_pause_reason_is_actionable now requires
                                # a concrete auth marker (e.g. "status: 401") in the reason.
                                "reason": "Provider-health worker returned status: 401 from Gemini2; pause until reauth.",
                                "reset_seconds": None,
                            }
                        ],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "ORX-GV-003",
                                "owner": "Gemini2",
                                "reviewer": "Codex",
                                "status": "backlog",
                                "last_update": "2026-04-30T14:30:00Z",
                            }
                        ],
                        "handoffs": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "gemini2": {"display_name": "Gemini2", "provider": "gemini2"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                    "codex": {"display_name": "Codex", "provider": "codex"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude",
                        "agent": "Claude",
                        "reason": "provider_health_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(
                    supervisor, "run_task_board_command", return_value=mock.MagicMock(ok=True)
                ) as command,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            command.assert_called_once()
            self.assertEqual(state["provider_pauses"]["gemini2"]["kind"], "auth")
            self.assertIsNone(state["chair_review"]["active_review"])

    def test_refresh_chair_review_state_applies_unblock_task_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260518T000000Z-claude2.md"
            json_path = review_dir / "20260518T000000Z-claude2.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
                        "approval_ttl_minutes": 45,
                        "reason": "blocked parent needs an unblock task",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [],
                        "task_actions": [
                            {
                                "task_id": "ADM-UI-RD-005",
                                "action": "create_unblock_task",
                                "unblock_kind": "history_repair",
                                "target_agent": "Codex",
                                "reviewer": "Codex2",
                                "reason": "Shared branch history must be disentangled.",
                            }
                        ],
                        "provider_actions": [],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {"id": "DEP-001", "status": "done"},
                            {
                                "id": "ADM-UI-RD-005",
                                "owner": "Codex",
                                "reviewer": "Codex2",
                                "status": "blocked",
                                "depends_on": ["DEP-001"],
                                "next": "Closeout blocked because shared branch HEAD moved to a mixed commit.",
                            },
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude2",
                        "agent": "Claude2",
                        "reason": "blocked_task_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "create_chair_unblock_task", return_value=True) as create_unblock,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            create_unblock.assert_called_once()
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["last_reason"], "blocked_task_triage")

    def test_refresh_chair_review_state_materializes_workspace_baseline_task_from_reassignment_focus(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260528T000000Z-claude.md"
            json_path = review_dir / "20260528T000000Z-claude.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
                        "approval_ttl_minutes": 45,
                        "reason": "No reassignment improves machine truth.",
                        "blocked_by": [
                            "Shared workspace-baseline blocker keeps the UI-FE wave from typecheck/build completion."
                        ],
                        "approval_actions": [],
                        "reassignment_actions": [],
                        "task_actions": [],
                        "provider_actions": [],
                        "recommended_focus": [
                            "Create a workspace-baseline repair task before re-dispatching the UI-FE wave."
                        ],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text('{"tasks": []}\n', encoding="utf-8")
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "failure_streaks": {
                    "UI-FE-ADM-FLT:owner": {
                        "task_id": "UI-FE-ADM-FLT",
                        "role": "owner",
                        "agent": "Codex",
                        "awaiting_chair": True,
                    }
                },
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude",
                        "agent": "Claude",
                        "reason": "reassignment_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "create_chair_workspace_baseline_task", return_value=True) as create_task,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            create_task.assert_called_once()
            self.assertEqual(create_task.call_args.kwargs["preferred_owner"], "Claude")
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["last_reason"], "reassignment_triage")

    def test_refresh_chair_review_state_synthesizes_reassignment_followup_unblock_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260528T000500Z-claude2.md"
            json_path = review_dir / "20260528T000500Z-claude2.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
                        "approval_ttl_minutes": 45,
                        "reason": "Move failing owner off Codex and unblock the blocked parent.",
                        "blocked_by": [
                            "UI-FE-DRV-ONB remains blocked (history_repair); not reassignable while blocked."
                        ],
                        "approval_actions": [],
                        "reassignment_actions": [],
                        "task_actions": [],
                        "provider_actions": [],
                        "recommended_focus": [
                            "Run blocked_task_triage for UI-FE-DRV-ONB: create history_repair unblock task."
                        ],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {"id": "DEP-001", "status": "done"},
                            {
                                "id": "UI-FE-DRV-ONB",
                                "owner": "Codex2",
                                "reviewer": "Claude2",
                                "status": "blocked",
                                "depends_on": ["DEP-001"],
                                "next": "History repair audit still required.",
                            },
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude2",
                        "agent": "Claude2",
                        "reason": "reassignment_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "create_chair_unblock_task", return_value=True) as create_unblock,
                mock.patch.object(supervisor, "create_chair_workspace_baseline_task", return_value=False),
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            create_unblock.assert_called_once()
            action = create_unblock.call_args.args[2]
            self.assertEqual(action["task_id"], "UI-FE-DRV-ONB")
            self.assertEqual(action["action"], "create_unblock_task")
            self.assertEqual(action["unblock_kind"], "history_repair")
            self.assertIn("reassignment_triage", action["reason"])
            self.assertEqual(
                state["chair_review"]["last_decision"]["task_actions"][0]["task_id"],
                "UI-FE-DRV-ONB",
            )
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["last_reason"], "reassignment_triage")

    def test_materialize_workspace_baseline_task_from_last_decision_uses_last_reviewer(self) -> None:
        config = {"paths": {"status_file": "ai-status.json"}}
        state = {
            "chair_review": {
                "last_reason": "reassignment_triage",
                "last_reviewer": "Claude",
                "last_decision": {
                    "reason": "Shared workspace-baseline blocker",
                    "blocked_by": ["@drts/ui-tokens and @drts/contracts module resolution"],
                    "recommended_focus": ["Dispatch a workspace-baseline repair task"],
                },
            }
        }

        with mock.patch.object(supervisor, "create_chair_workspace_baseline_task", return_value=True) as create_task:
            changed = supervisor.materialize_workspace_baseline_task_from_last_decision(
                config,
                state,
                provider_report={},
            )

        self.assertTrue(changed)
        create_task.assert_called_once_with(
            config,
            state,
            state["chair_review"]["last_decision"],
            {},
            preferred_owner="Claude",
        )

    def test_ensure_workspace_baseline_task_dispatch_queues_owner_event(self) -> None:
        task = {
            "id": "UI-BASELINE-001",
            "status": "backlog",
            "owner": "Claude",
            "reviewer": "Codex",
        }
        state = {}

        with (
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [task]}),
            mock.patch.object(supervisor, "chair_dispatch_action_reason", return_value=("Claude", "owned_ready_dispatch")),
            mock.patch.object(supervisor, "is_agent_dispatch_paused", return_value=False),
            mock.patch.object(supervisor, "ready_dispatch_settings", return_value={"active_worker_statuses": ["running"]}),
            mock.patch.object(supervisor, "outstanding_delivery_agent_counts", return_value={}),
            mock.patch.object(supervisor, "outstanding_delivery_indexes", return_value=(set(), {}, set())),
            mock.patch.object(supervisor, "build_dispatch_event", return_value={"key": "evt-baseline", "task_id": "UI-BASELINE-001"}),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_event,
            mock.patch.object(supervisor, "write_activity_log") as write_log,
        ):
            changed = supervisor.ensure_workspace_baseline_task_dispatch(
                {"paths": {"status_file": "ai-status.json"}},
                state,
                provider_report={},
            )

        self.assertTrue(changed)
        queue_event.assert_called_once()
        write_log.assert_called_once()
        self.assertIn("evt-baseline", state["seen_event_keys"])

    def test_refresh_chair_review_state_applies_resume_parent_task_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260518T000100Z-codex.md"
            json_path = review_dir / "20260518T000100Z-codex.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "blocked_task_triage",
                        "approval_ttl_minutes": 45,
                        "reason": "existing unblock child is already done",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [],
                        "task_actions": [
                            {
                                "task_id": "ADM-UI-RD-006",
                                "action": "resume_parent_task",
                                "resume_status": "todo",
                                "reason": "Completed history-repair helper already documented the rebuild route.",
                            }
                        ],
                        "provider_actions": [],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {"id": "DEP-001", "status": "done"},
                            {
                                "id": "ADM-UI-RD-006",
                                "owner": "Codex2",
                                "reviewer": "Codex",
                                "status": "blocked",
                                "depends_on": ["DEP-001"],
                                "next": "See support/unblock/ADM-UI-RD-006/ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR.md",
                            },
                            {
                                "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                                "owner": "Codex2",
                                "reviewer": "Codex",
                                "status": "done",
                                "task_class": "unblock",
                                "helper_parent": "ADM-UI-RD-006",
                                "helper_kind": "history_repair",
                            },
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "codex",
                        "agent": "Codex",
                        "reason": "blocked_task_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "apply_chair_parent_resume_action", return_value=True) as resume_parent,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            resume_parent.assert_called_once()
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["last_reason"], "blocked_task_triage")

    def test_proactive_claim_respects_chair_reassignment_guard(self) -> None:
        config = {
            "agents": {
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            }
        }
        task = {
            "id": "OPX-IN-001",
            "status": "todo",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": [],
        }
        state = {
            "chair_reassignment_guards": {
                "OPX-IN-001:owner": {
                    "task_id": "OPX-IN-001",
                    "role": "owner",
                    "from": "Codex2",
                    "to": "Codex",
                    "expires_at": "2999-01-01T00:00:00Z",
                }
            }
        }

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            config,
            task=task,
            task_map={"OPX-IN-001": task},
            idle_agent_name="Codex2",
            idle_agent_names=["Codex2"],
            agent_loads={"Codex": [0], "Codex2": [99]},
            helper_settings={
                "enabled": True,
                "task_statuses": ["todo", "in_progress", "review"],
                "availability_first": True,
                "allow_any_idle_lane": True,
                "prefer_assigned_when_idle": True,
                "require_assigned_agent_busy": True,
                "require_owner_higher_priority_load": False,
            },
            state=state,
        )

        self.assertIsNone(plan)

    def test_proactive_claim_respects_paused_explicit_owner(self) -> None:
        """Don't reshuffle a task whose explicit owner is paused but not loaded.

        Regression: when Gemini's lane is quota-paused (or its CLI dangling),
        availability-first auto-claim used to drain Gemini-owned backlog onto
        Codex2 (the only "idle" lane), even though Gemini was unavailable
        rather than busy. The fix: when the assigned owner is paused AND has
        no active work, leave the task waiting for that lane.

        See: feedback_supervisor_ignores_explicit_owner.md +
             feedback_cli_symlink_staleness.md
        """
        config = {
            "agents": {
                "gemini": {"display_name": "Gemini", "provider": "gemini"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            }
        }
        task = {
            "id": "PROD-RAIL-001",
            "status": "backlog",
            "owner": "Gemini",
            "reviewer": "Gemini2",
            "depends_on": [],
        }
        # Gemini is quota-paused; Codex2 is idle.
        state = {
            "provider_pauses": {
                "gemini": {
                    "kind": "quota",
                    "reason": "QUOTA_EXHAUSTED",
                    "paused_at": "2026-05-19T02:07:48Z",
                    "resume_at": 9999999999.0,
                }
            }
        }

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            config,
            task=task,
            task_map={"PROD-RAIL-001": task},
            idle_agent_name="Codex2",
            idle_agent_names=["Codex2"],
            agent_loads={"Gemini": [], "Codex2": []},
            helper_settings={
                "enabled": True,
                "task_statuses": ["backlog", "todo", "in_progress", "review"],
                "availability_first": True,
                "allow_any_idle_lane": True,
                "prefer_assigned_when_idle": True,
                "require_assigned_agent_busy": True,
                "require_owner_higher_priority_load": False,
                "respect_explicit_owner_when_paused": True,
            },
            state=state,
        )

        self.assertIsNone(
            plan,
            "Paused explicit owner with no active load must not be reshuffled; "
            "task should wait for the assigned lane to resume.",
        )

    def test_proactive_claim_reassigns_disabled_lane_owner(self) -> None:
        """A lane disabled via capacity=0 should not keep tasks stuck forever."""
        config = {
            "ready_dispatcher": {
                "max_tasks_per_agent": 2,
                "max_tasks_per_agent_by_lane": {
                    "gemini": 0,
                    "codex": 4,
                    "codex2": 4,
                },
            },
            "worker_reassignment": {
                "owner_fallbacks": {"Gemini": ["Codex", "Codex2"]},
                "reviewer_fallbacks": {"Gemini": ["Codex", "Codex2"]},
            },
            "agents": {
                "gemini": {"display_name": "Gemini", "provider": "gemini"},
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            },
        }
        task = {
            "id": "TENBIZ-012",
            "status": "todo",
            "owner": "Gemini",
            "reviewer": "Codex2",
            "depends_on": [],
        }

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            config,
            task=task,
            task_map={"TENBIZ-012": task},
            idle_agent_name="Codex",
            idle_agent_names=["Codex", "Codex2"],
            agent_loads={"Gemini": [3], "Codex": [99], "Codex2": [99]},
            helper_settings={
                "enabled": True,
                "task_statuses": ["backlog", "todo", "in_progress", "review"],
                "availability_first": False,
                "allow_any_idle_lane": False,
                "prefer_assigned_when_idle": True,
                "require_assigned_agent_busy": True,
                "require_owner_higher_priority_load": True,
                "respect_explicit_owner_when_paused": True,
            },
            state={"provider_pauses": {}},
        )

        self.assertIsNotNone(plan)
        self.assertEqual(plan["claim_agent"], "Codex")
        self.assertEqual(plan["new_owner"], "Codex")
        self.assertEqual(plan["new_reviewer"], "Codex2")

    def test_proactive_claim_still_reshuffles_when_explicit_owner_busy(self) -> None:
        """The paused-owner guard must not block legitimate busy reshuffling.

        If the explicit owner is actually loaded with other tasks (not just
        paused), availability-first reshuffling is still the right behavior.
        """
        config = {
            "agents": {
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            }
        }
        task = {
            "id": "FIN-GOV-001",
            "status": "backlog",
            "owner": "Codex",
            "reviewer": "Codex2",
            "depends_on": [],
        }
        # Codex is NOT paused but has 2 active tasks already.
        state: dict = {"provider_pauses": {}}

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            config,
            task=task,
            task_map={"FIN-GOV-001": task},
            idle_agent_name="Codex2",
            idle_agent_names=["Codex2"],
            # Codex carries higher-priority load already; Codex2 is idle.
            agent_loads={"Codex": [0, 1]},
            helper_settings={
                "enabled": True,
                "task_statuses": ["backlog", "todo", "in_progress", "review"],
                "availability_first": True,
                "allow_any_idle_lane": True,
                "prefer_assigned_when_idle": True,
                "require_assigned_agent_busy": True,
                "require_owner_higher_priority_load": False,
                "respect_explicit_owner_when_paused": True,
            },
            state=state,
        )

        self.assertIsNotNone(
            plan,
            "When owner is busy (not paused), availability-first reshuffle is still valid.",
        )

    def test_helper_claim_settings_default_respects_paused_owner(self) -> None:
        """`respect_explicit_owner_when_paused` defaults to True.

        Default-true is the safer behavior — protects against the
        availability-first cascade documented in
        feedback_supervisor_ignores_explicit_owner.md. Operators can
        explicitly set False in config to restore the old behavior.
        """
        settings = supervisor.helper_claim_settings({})
        self.assertTrue(settings["respect_explicit_owner_when_paused"])

    def test_dispatch_paused_when_provider_auth_is_not_ready(self) -> None:
        config = {"agents": {"gemini2": {"display_name": "Gemini2", "provider": "gemini2"}}}
        provider_report = {"providers": {"gemini2": {"auth_ready": False}}}

        self.assertTrue(supervisor.is_agent_dispatch_paused(config, {}, "gemini2", provider_report=provider_report))

    def test_numbered_lane_does_not_inherit_primary_provider_pause(self) -> None:
        config = {
            "agents": {
                "claude": {"display_name": "Claude", "provider": "claude"},
                "claude2": {"display_name": "Claude2", "provider": "claude2"},
            }
        }
        state = {
            "provider_pauses": {
                "claude": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "claude",
                    "kind": "auth",
                    "reason": "Invalid authentication credentials",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            },
        }
        provider_report = {
            "providers": {
                "claude": {"auth_ready": False},
                "claude2": {"auth_ready": True},
            }
        }

        self.assertTrue(supervisor.is_agent_dispatch_paused(config, state, "claude", provider_report=provider_report))
        self.assertFalse(supervisor.is_agent_dispatch_paused(config, state, "claude2", provider_report=provider_report))

    def test_numbered_lane_does_not_fallback_to_primary_provider_report(self) -> None:
        config = {"agents": {"claude2": {"display_name": "Claude2", "provider": "claude2"}}}
        provider_report = {"providers": {"claude": {"auth_ready": False}}}

        self.assertFalse(supervisor.is_agent_dispatch_paused(config, {}, "claude2", provider_report=provider_report))

    def test_quota_pause_follows_shared_identity_pool_only(self) -> None:
        config = {
            "agents": {
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            }
        }
        state = {
            "provider_pauses": {
                "pool:codex:account-a:terra": {
                    "schema": 3,
                    "scope": "quota_pool",
                    "lane_id": "codex",
                    "kind": "quota",
                    "quota_pool": "codex:account-a:terra",
                    "identity_fingerprint": "account-a",
                    "resume_at": 4102444800.0,
                }
            }
        }
        shared_report = {
            "providers": {
                "codex": {
                    "auth_ready": True,
                    "identity": {"fingerprint": "account-a", "quota_pool": "codex:account-a:terra"},
                },
                "codex2": {
                    "auth_ready": True,
                    "identity": {"fingerprint": "account-a", "quota_pool": "codex:account-a:terra"},
                },
            }
        }
        separate_report = {
            "providers": {
                **shared_report["providers"],
                "codex2": {
                    "auth_ready": True,
                    "identity": {"fingerprint": "account-b", "quota_pool": "codex:account-b:terra"},
                },
            }
        }

        self.assertTrue(supervisor.is_agent_dispatch_paused(config, state, "codex", provider_report=shared_report))
        self.assertTrue(supervisor.is_agent_dispatch_paused(config, state, "codex2", provider_report=shared_report))
        self.assertFalse(supervisor.is_agent_dispatch_paused(config, state, "codex2", provider_report=separate_report))

    def test_auth_pause_does_not_expire_from_surface_auth_ready_probe(self) -> None:
        config = {"agents": {"claude": {"display_name": "Claude", "provider": "claude"}}}
        state = {
            "provider_pauses": {
                "claude": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "claude",
                    "kind": "auth",
                    "reason": "Invalid authentication credentials",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            },
        }
        provider_report = {"providers": {"claude": {"auth_ready": True}}}

        expired = supervisor.expire_provider_pauses(config, state, provider_report)

        self.assertEqual(expired, [])
        self.assertIn("claude", state["provider_pauses"])
        self.assertTrue(supervisor.is_agent_dispatch_paused(config, state, "claude", provider_report=provider_report))

    def test_reason_hint_pause_clears_at_provider_reset_time(self) -> None:
        config = {"agents": {"codex2": {"display_name": "Codex2", "provider": "codex2"}}}
        state = {
            "provider_pauses": {
                "codex2": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "codex2",
                    "kind": "quota",
                    "reason": "The worker log ended with repeated usage limit errors and a retry time of Jan 1, 2020 12:58 AM.",
                    "paused_at": "2026-06-28T17:03:39Z",
                    "resume_at": None,
                }
            },
        }
        provider_report = {"providers": {"codex2": {"auth_ready": True}}}
        expired = supervisor.expire_provider_pauses(config, state, provider_report)

        self.assertEqual(expired, ["codex2"])
        self.assertNotIn("codex2", state["provider_pauses"])

    def test_reason_hint_pause_stays_paused_until_probe_clears_it(self) -> None:
        config = {"agents": {"codex2": {"display_name": "Codex2", "provider": "codex2"}}}
        state: dict[str, object] = {}
        supervisor.pause_provider(
            state,
            "codex2",
            "The lane is rate-limited and resets Jul 1, 5pm (UTC).",
            kind="quota",
            reset_seconds=None,
        )

        entry = state["provider_pauses"]["codex2"]
        self.assertEqual(entry.get("resume_at_source"), "reason_hint")
        self.assertIsNotNone(entry.get("resume_at"))
        self.assertTrue(
            supervisor.is_agent_dispatch_paused(
                config,
                state,
                "codex2",
                provider_report={"providers": {"codex2": {"auth_ready": True}}},
            )
        )

    def _pause_entry(self, reason: str, *, kind: str, reset_seconds: int | None) -> dict:
        state: dict[str, object] = {}
        supervisor.pause_provider(
            state, "codex2", reason, kind=kind, reset_seconds=reset_seconds
        )
        return state["provider_pauses"]["codex2"]

    def test_reset_hint_later_than_caller_default_wins(self) -> None:
        # Quota pauses hardcode reset_seconds=14400, which used to discard the
        # provider's own reset time. The lane then woke 4h later, hit the same
        # quota error and re-paused, on repeat.
        before = datetime.now(timezone.utc).timestamp()
        entry = self._pause_entry(
            "You've hit your usage limit. Resets in 96h.",
            kind="quota",
            reset_seconds=14400,
        )

        self.assertEqual(entry.get("resume_at_source"), "reason_hint")
        self.assertGreaterEqual(entry["resume_at"], before + 96 * 3600 - 60)

    def test_reset_hint_shorter_than_caller_default_does_not_pull_wakeup_forward(
        self,
    ) -> None:
        before = datetime.now(timezone.utc).timestamp()
        entry = self._pause_entry(
            "429 Too Many Requests. Resets in 5m.",
            kind="capacity",
            reset_seconds=14400,
        )

        self.assertEqual(entry.get("resume_at_source"), "reset_seconds")
        self.assertGreaterEqual(entry["resume_at"], before + 14400 - 60)

    def test_pause_without_reset_hint_keeps_caller_reset_seconds(self) -> None:
        before = datetime.now(timezone.utc).timestamp()
        entry = self._pause_entry(
            "quota_exhausted: no reset time stated",
            kind="quota",
            reset_seconds=14400,
        )

        self.assertEqual(entry.get("resume_at_source"), "reset_seconds")
        self.assertGreaterEqual(entry["resume_at"], before + 14400 - 60)

    def test_auth_pause_ignores_reset_hint_and_stays_indefinite(self) -> None:
        entry = self._pause_entry(
            "invalid api key. Resets in 96h.", kind="auth", reset_seconds=None
        )

        self.assertIsNone(entry["resume_at"])
        self.assertNotIn("resume_at_source", entry)


class IdleOperationalReviewTests(unittest.TestCase):
    """An operational review that reports no change should not be re-run.

    chair_review_reason ended in an unconditional `return "operational_review"`,
    so the reason was never None, the `if reason is None: return False` gate in
    queue_chair_review could not fire, and the 900s cooldown was the only
    throttle -- one that does not ask whether there is anything to say. On
    2026-08-20 that produced 91 reviews, every one with no actions and no
    blockers. Reviews that carry something stay unaffected: on 2026-08-22, with
    the release chain blocked, all 86 carried actions or blockers.
    """

    IDLE_STATUS = {
        "tasks": [
            {"id": "DRV-UI-002", "status": "done", "owner": "Codex", "reviewer": "Claude", "depends_on": []},
        ]
    }

    def _state(self, **chair: object) -> dict:
        return {
            "provider_pauses": {},
            "dispatch_pauses": [],
            "failure_streaks": {},
            "chair_review": dict(chair),
        }

    def _reason(self, state: dict, status: dict | None = None, config: dict | None = None):
        return supervisor.chair_review_reason(
            state,
            {"pending": []},
            status=status if status is not None else self.IDLE_STATUS,
            config=config if config is not None else {"paths": {}, "chair_review": {"enabled": True}},
        )

    def _fingerprint(self, state: dict, status: dict | None = None) -> str:
        return supervisor.operational_review_fingerprint(
            status if status is not None else self.IDLE_STATUS, {"pending": []}, state
        )

    def test_the_first_operational_review_always_runs(self) -> None:
        """Nothing on record yet is not the same as nothing to say."""
        self.assertEqual(self._reason(self._state()), "operational_review")

    def test_an_unchanged_fleet_does_not_get_a_second_review(self) -> None:
        state = self._state(last_operational_review_at=supervisor.utc_now())
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)

        self.assertIsNone(self._reason(state))

    def test_a_task_status_change_brings_the_review_back(self) -> None:
        state = self._state(last_operational_review_at=supervisor.utc_now())
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)
        moved = {"tasks": [dict(self.IDLE_STATUS["tasks"][0], status="in_progress")]}

        self.assertEqual(self._reason(state, status=moved), "operational_review")

    def test_a_routing_change_brings_the_review_back(self) -> None:
        """Ownership moving is a thing the chair reports on, so it counts."""
        state = self._state(last_operational_review_at=supervisor.utc_now())
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)
        reassigned = {"tasks": [dict(self.IDLE_STATUS["tasks"][0], owner="Gemini")]}

        self.assertEqual(self._reason(state, status=reassigned), "operational_review")

    def test_telemetry_churn_is_not_change(self) -> None:
        """The reason the digest is a whitelist rather than the whole document.

        Heartbeats and resource samples move on every 2s tick. Folding any of
        them in would make each fingerprint unique, which is the same as not
        having one.
        """
        state = self._state(last_operational_review_at=supervisor.utc_now())
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)
        state["supervisor"] = {"last_heartbeat_at": "2026-08-23T04:00:00Z"}
        state["resource_guard"] = {"memory_current_bytes": 6_000_000_000, "last_check_at": "2026-08-23T04:00:00Z"}
        state["disk_guard"] = {"free_gb": 12.5}

        self.assertIsNone(self._reason(state))

    def test_the_floor_returns_the_chair_even_with_nothing_moving(self) -> None:
        """Whatever the digest does not cover must not be able to silence it."""
        state = self._state(last_operational_review_at="2026-08-20T00:00:00Z")
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)

        self.assertEqual(self._reason(state), "operational_review")

    def test_a_zero_floor_skips_for_as_long_as_nothing_moves(self) -> None:
        state = self._state(last_operational_review_at="2020-01-01T00:00:00Z")
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)
        config = {"paths": {}, "chair_review": {"enabled": True, "idle_review_interval_seconds": 0}}

        self.assertIsNone(self._reason(state, config=config))

    PAUSED_STATE_PAUSES = {
        "gemini": {
            "schema": 3,
            "scope": "lane",
            "lane_id": "gemini",
            "kind": "quota",
            "reason": "Individual quota reached",
            "paused_at": "2026-09-21T11:31:06Z",
            "resume_at": None,
        }
    }

    def test_the_first_health_triage_always_runs(self) -> None:
        state = self._state()
        state["provider_pauses"] = dict(self.PAUSED_STATE_PAUSES)

        self.assertEqual(self._reason(state), "provider_health_triage")

    def test_an_unchanged_pause_set_does_not_get_a_second_health_triage(self) -> None:
        """Four quota-paused lanes produced 88 identical, action-less triages in a day.

        A pause is a standing condition; re-briefing the chair on the same
        pauses every cooldown held the supervisor loop for ~145s each time and
        spent the only lanes still working on a verdict that changed nothing.
        """
        state = self._state(last_operational_review_at=supervisor.utc_now())
        state["provider_pauses"] = dict(self.PAUSED_STATE_PAUSES)
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)

        self.assertIsNone(self._reason(state))

    def test_a_new_pause_brings_health_triage_back(self) -> None:
        state = self._state(last_operational_review_at=supervisor.utc_now())
        state["provider_pauses"] = dict(self.PAUSED_STATE_PAUSES)
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)
        state["provider_pauses"]["codex"] = dict(self.PAUSED_STATE_PAUSES["gemini"], lane_id="codex")

        self.assertEqual(self._reason(state), "provider_health_triage")

    def test_a_lifted_pause_brings_health_triage_back(self) -> None:
        """Lifting is as much news as pausing: the chair should see the lane return."""
        state = self._state(last_operational_review_at=supervisor.utc_now())
        state["provider_pauses"] = dict(self.PAUSED_STATE_PAUSES)
        state["provider_pauses"]["codex"] = dict(self.PAUSED_STATE_PAUSES["gemini"], lane_id="codex")
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)
        del state["provider_pauses"]["codex"]

        self.assertEqual(self._reason(state), "provider_health_triage")

    def test_the_floor_returns_health_triage_even_with_nothing_moving(self) -> None:
        state = self._state(last_operational_review_at="2026-08-20T00:00:00Z")
        state["provider_pauses"] = dict(self.PAUSED_STATE_PAUSES)
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)

        self.assertEqual(self._reason(state), "provider_health_triage")

    def test_a_missing_review_timestamp_does_not_suppress(self) -> None:
        """A fingerprint with no time beside it cannot be aged, so it defers."""
        state = self._state()
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)

        self.assertEqual(self._reason(state), "operational_review")

    def test_triage_reasons_still_outrank_the_idle_gate(self) -> None:
        """The gate sits below every reason that has something to report."""
        state = self._state(last_operational_review_at=supervisor.utc_now())
        state["chair_review"]["last_operational_fingerprint"] = self._fingerprint(state)
        state["provider_pauses"] = {
            "claude": {
                "schema": 3, "scope": "lane", "lane_id": "claude", "kind": "auth",
                "reason": "Invalid authentication credentials",
                "paused_at": "2026-08-23T03:00:00Z",
            }
        }

        self.assertEqual(self._reason(state), "provider_health_triage")

    def _queue_config(self, root: Path) -> dict:
        return {
            "agents": {"codex": {"id": "codex", "display_name": "Codex", "provider": "codex"}},
            "chair_review": {"enabled": True},
            "schema": {
                "tasks_path": "tasks", "task_id_field": "id", "status_field": "status",
                "assignee_field": "owner", "reviewer_field": "reviewer",
            },
            "paths": {
                "status_file": str(root / "ai-status.json"),
                "state_file": str(root / "state.json"),
                "approval_queue": str(root / "approval-queue.json"),
                "activity_log": str(root / "activity-log.jsonl"),
                "event_queue": str(root / "event-queue.jsonl"),
            },
        }

    def test_a_queued_operational_review_records_the_watermark(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            config = self._queue_config(Path(tmpdir))
            state = {
                "queue": {"events": {}}, "workers": {}, "seen_event_keys": {},
                "provider_pauses": {}, "dispatch_pauses": [], "failure_streaks": {},
                "chair_review": {},
            }
            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
                mock.patch.object(supervisor, "enqueue_event"),
                mock.patch.object(supervisor, "write_activity_log"),
            ):
                queued = supervisor.queue_chair_review(config, state, self.IDLE_STATUS, provider_report={})

        self.assertTrue(queued)
        self.assertEqual(state["chair_review"]["active_review"]["reason"], "operational_review")
        self.assertTrue(state["chair_review"]["last_operational_fingerprint"])
        self.assertTrue(state["chair_review"]["last_operational_review_at"])

    def test_a_review_that_could_not_be_dispatched_records_nothing(self) -> None:
        """Recording on the attempt would answer a question nobody asked.

        No lane was free, so no chair saw this state. Stamping the watermark
        here would suppress the retry and leave the state unreviewed.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            config = self._queue_config(Path(tmpdir))
            state = {
                "queue": {"events": {}}, "workers": {}, "seen_event_keys": {},
                "provider_pauses": {}, "dispatch_pauses": [], "failure_streaks": {},
                "chair_review": {},
            }
            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
                mock.patch.object(supervisor, "choose_chair_reviewer", return_value=None),
                mock.patch.object(supervisor, "enqueue_event") as enqueue_event,
                mock.patch.object(supervisor, "write_activity_log"),
            ):
                supervisor.queue_chair_review(config, state, self.IDLE_STATUS, provider_report={})

        enqueue_event.assert_not_called()
        self.assertNotIn("last_operational_fingerprint", state["chair_review"])


class CandidateCiResumeTests(unittest.TestCase):
    """Explicit Chair `resume_parent_task` with resume_basis=candidate_ci_recovered."""

    def setUp(self) -> None:
        import os
        from control_plane.domain.chair_policy import open_blocker_fingerprint

        self.tmp = tempfile.TemporaryDirectory(prefix="chair-ci-native-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.task = {
            "id": "CI-RECOVERY-EXAMPLE", "title": "Original candidate", "phase": "test",
            "owner": "Pi", "reviewer": "Codex", "status": "blocked", "waiting_for": "Gemini",
            "depends_on": [], "artifacts": [], "acceptance": [], "next": "Original CI error; cause unknown",
            "candidate_sha": "a" * 40, "candidate_generation": "generation-one",
            "candidate_branch": "pi/existing-candidate", "pr_url": "https://github.com/acme/fleet/pull/31",
            "ci_status": "failure", "ci_sha": "a" * 40, "last_update": "2026-10-27T00:00:00Z",
        }
        self.task["candidate_review_handoff"] = {k: self.task[k] for k in (
            "owner", "reviewer", "candidate_sha", "candidate_branch", "candidate_generation"
        )}
        from test_ai_status import ai_status as board_commands
        self.board = board_commands.default_state()
        self.board.update({"tasks": [self.task], "agents": [], "handoffs": [], "blockers": [{
            "task_id": self.task["id"], "owner": "Pi", "waiting_for": "Gemini", "status": "open",
            "message": "Preserved original failure", "created_at": "2026-10-27T00:00:00Z",
        }]})
        self.fingerprint = open_blocker_fingerprint(self.board["blockers"], self.task["id"])[0]
        self.path = self.root / "ai-status.json"
        self.path.write_text(json.dumps(self.board))
        self.runtime_log = self.root / "runtime-log.jsonl"
        self.board_log = self.root / "ai-activity-log.jsonl"
        self.config = {"paths": {"status_file": str(self.path), "activity_log": str(self.runtime_log)},
                       "github_bus": {"repo": "acme/fleet"}}
        self.action = {"task_id": self.task["id"], "action": "resume_parent_task", "resume_status": "in_progress",
                       "resume_basis": "candidate_ci_recovered", "candidate_sha": self.task["candidate_sha"],
                       "candidate_generation": self.task["candidate_generation"],
                       "blocker_fingerprint": self.fingerprint, "pr_url": self.task["pr_url"],
                       "reason": "Actual Chair confirmed original CI blocker resolved"}
        mock.patch.dict(os.environ, {"ORCH_STATUS_ROOT": str(self.root), "AI_STATUS_ROOT": str(self.root)}, clear=True).start()
        self.addCleanup(mock.patch.stopall)
        self.pr = {"url": self.task["pr_url"], "state": "OPEN", "headRefOid": self.task["candidate_sha"],
                   "headRefName": self.task["candidate_branch"], "mergeStateStatus": "CLEAN",
                   "statusCheckRollup": [{"detailsUrl": "https://github.com/acme/fleet/actions/runs/81/job/12",
                                          "name": "unit", "workflowName": "CI",
                                          "status": "COMPLETED", "conclusion": "SUCCESS"}]}
        self.run = {"id": 81, "workflow_id": 7, "event": "pull_request", "head_sha": self.task["candidate_sha"],
                    "head_branch": self.task["candidate_branch"], "pull_requests": [{"number": 31}],
                    "created_at": "2026-10-27T01:00:00Z", "status": "completed", "conclusion": "success"}

    def observe(self, argv):
        import copy
        return copy.deepcopy(self.pr if argv[0] == "pr" else [{"workflow_runs": [self.run]}])

    def assert_untouched(self, before: bytes) -> None:
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(self.runtime_log.exists(), "rejected recovery wrote a Supervisor activity log")
        self.assertFalse(self.board_log.exists(), "rejected recovery wrote a board activity log")

    def test_actual_chair_path_uses_real_GH_classifier_and_temp_board_writer(self) -> None:
        import github_bus
        import copy
        before = copy.deepcopy(self.task)
        with mock.patch.object(github_bus, "gh_json", side_effect=self.observe) as reads:
            self.assertTrue(supervisor.apply_chair_parent_resume_action(self.config, {}, self.action))
        self.assertEqual(reads.call_count, 2)
        state = json.loads(self.path.read_text())
        task = state["tasks"][0]
        self.assertEqual((task["status"], task["ci_status"], task["ci_sha"]), ("review", "success", before["candidate_sha"]))
        for key in ("owner", "reviewer", "candidate_sha", "candidate_generation", "candidate_branch",
                    "candidate_review_handoff", "pr_url"):
            self.assertEqual(task[key], before[key])
        self.assertEqual(task["ci_run_url"], "https://github.com/acme/fleet/actions/runs/81/job/12")
        for key in ("waiting_for", "reviewed_sha", "merge_sha", "acceptance_evidence"):
            self.assertNotIn(key, task)
        self.assertEqual(len(state["tasks"]), 1)
        self.assertEqual(state["blockers"][0]["status"], "resolved")
        board_rows = [json.loads(line)["type"] for line in self.board_log.read_text().splitlines()]
        self.assertEqual(board_rows, ["candidate_reconciled", "blocked_task_resumed"])
        runtime_rows = [json.loads(line) for line in self.runtime_log.read_text().splitlines()]
        self.assertEqual([(row["type"], row["resume_basis"]) for row in runtime_rows],
                         [("chair_parent_resume_applied", "candidate_ci_recovered")])

    def test_pending_failure_foreign_provenance_head_branch_and_PR_do_not_resume(self) -> None:
        import github_bus
        import copy
        for kind in ("pending", "failure", "foreign_workflow", "head", "branch", "PR", "lookup_failed"):
            with self.subTest(kind=kind):
                pr, run = copy.deepcopy(self.pr), copy.deepcopy(self.run)
                if kind == "pending": run.update(status="in_progress", conclusion=None)
                if kind == "failure": run["conclusion"] = "failure"
                if kind == "foreign_workflow": run["head_sha"] = "b" * 40
                if kind == "head": pr["headRefOid"] = "b" * 40
                if kind == "branch": pr["headRefName"] = "pi/other"
                if kind == "PR": pr["url"] = "https://github.com/acme/fleet/pull/32"
                def external(argv, kind=kind, pr=pr, run=run):
                    if argv[0] == "pr": return pr
                    if kind == "lookup_failed": raise github_bus.GitHubBusError("Unavailable")
                    return [{"workflow_runs": [run]}]
                before = self.path.read_bytes()
                with mock.patch.object(github_bus, "gh_json", side_effect=external):
                    self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, self.action))
                self.assert_untouched(before)

    def test_merged_all_skipped_neutral_and_absent_own_ci_do_not_count_as_recovered(self) -> None:
        import github_bus
        import copy
        for kind in ("merged", "closed", "all_skipped_jobs", "neutral_jobs", "skipped_run", "neutral_run",
                     "no_own_workflow", "external_check_only", "stale_conclusion", "run_without_rows"):
            with self.subTest(kind=kind):
                pr, run = copy.deepcopy(self.pr), copy.deepcopy(self.run)
                rows = pr["statusCheckRollup"]
                if kind == "merged": pr["state"] = "MERGED"
                if kind == "closed": pr["state"] = "CLOSED"
                if kind == "all_skipped_jobs": rows[0]["conclusion"] = "SKIPPED"
                if kind == "neutral_jobs": rows[0]["conclusion"] = "NEUTRAL"
                if kind == "skipped_run": run["conclusion"] = "skipped"
                if kind == "neutral_run": run["conclusion"] = "neutral"
                if kind == "no_own_workflow": pr["statusCheckRollup"] = []
                if kind == "external_check_only":
                    pr["statusCheckRollup"] = [{"detailsUrl": "https://ci.example/build/1", "name": "ext",
                                                "status": "COMPLETED", "conclusion": "SUCCESS"}]
                if kind == "stale_conclusion": rows[0]["conclusion"] = "STALE"
                if kind == "run_without_rows":
                    # A newer equivalent rerun with no job rows yet cannot prove success.
                    newer = {**run, "id": 82, "created_at": "2026-10-27T02:00:00Z"}
                runs = [run, newer] if kind == "run_without_rows" else [run]
                def external(argv, pr=pr, runs=runs):
                    return copy.deepcopy(pr if argv[0] == "pr" else [{"workflow_runs": runs}])
                if kind in {"merged", "all_skipped_jobs", "neutral_run", "skipped_run", "external_check_only"}:
                    # The shared classifier calls these "success"; recovery must not trust that alone.
                    with mock.patch.object(github_bus, "gh_json", side_effect=external):
                        observation = github_bus.candidate_pr_observation("acme/fleet", 31)
                    self.assertEqual(github_bus.candidate_ci_status(observation)[0], "success")
                before = self.path.read_bytes()
                with mock.patch.object(github_bus, "gh_json", side_effect=external):
                    self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, self.action))
                self.assert_untouched(before)

    def test_same_H_new_generation_between_read_and_transaction_remains_blocked(self) -> None:
        import github_bus
        def external(argv):
            data = self.observe(argv)
            if argv[0] == "api":
                state = json.loads(self.path.read_text())
                state["tasks"][0]["candidate_generation"] = "new-generation-same-H"
                self.path.write_text(json.dumps(state))
            return data
        with mock.patch.object(github_bus, "gh_json", side_effect=external):
            self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, self.action))
        task = json.loads(self.path.read_text())["tasks"][0]
        self.assertEqual((task["status"], task["candidate_generation"]), ("blocked", "new-generation-same-H"))
        self.assertEqual(task["ci_status"], "failure")
        self.assertFalse(self.runtime_log.exists())
        self.assertFalse(self.board_log.exists())

    def test_blocker_added_or_edited_after_chair_snapshot_fails_closed(self) -> None:
        import github_bus
        for kind in ("added_before_apply", "added_during_github_read", "edited_during_github_read"):
            with self.subTest(kind=kind):
                board = json.loads(json.dumps(self.board))
                if kind == "added_before_apply":
                    board["blockers"].append({"task_id": self.task["id"], "owner": "Pi", "waiting_for": "Codex",
                                              "status": "open", "message": "New product blocker",
                                              "created_at": "2026-10-27T02:00:00Z"})
                self.path.write_text(json.dumps(board))
                def external(argv, kind=kind):
                    data = self.observe(argv)
                    if argv[0] == "api" and kind != "added_before_apply":
                        state = json.loads(self.path.read_text())
                        if kind == "added_during_github_read":
                            state["blockers"].append({"task_id": self.task["id"], "owner": "Pi", "waiting_for": "Codex",
                                                      "status": "open", "message": "Late blocker",
                                                      "created_at": "2026-10-27T02:00:00Z"})
                        else:
                            state["blockers"][0]["message"] = "Different open blocker"
                        self.path.write_text(json.dumps(state))
                    return data
                with mock.patch.object(github_bus, "gh_json", side_effect=external):
                    self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, self.action))
                state = json.loads(self.path.read_text())
                self.assertEqual(state["tasks"][0]["status"], "blocked")
                self.assertTrue(all(row["status"] == "open" for row in state["blockers"]))
                self.assertFalse(self.runtime_log.exists())
                self.assertFalse(self.board_log.exists())

    def test_no_explicit_basis_or_invalidated_handoff_does_not_resume(self) -> None:
        import github_bus
        for kind in ("no_basis", "invalidated_handoff", "external_gate", "release", "stale_fingerprint",
                     "reviewed", "no_open_blocker", "helper_named"):
            with self.subTest(kind=kind):
                action = dict(self.action); board = json.loads(json.dumps(self.board))
                if kind == "no_basis": action.pop("resume_basis")
                if kind == "invalidated_handoff": board["tasks"][0]["candidate_review_handoff"] = None
                if kind == "external_gate": board["tasks"][0]["external_gate"] = True
                if kind == "release": board["tasks"][0].update(task_class="release", mutates_canonical=False)
                if kind == "stale_fingerprint": action["blocker_fingerprint"] = "0" * 64
                if kind == "reviewed": board["tasks"][0]["reviewed_sha"] = "a" * 40
                if kind == "no_open_blocker": board["blockers"][0]["status"] = "resolved"
                if kind == "helper_named": action["helper_task_id"] = "DONE-HELPER"
                self.path.write_text(json.dumps(board)); before = self.path.read_bytes()
                with mock.patch.object(github_bus, "gh_json") as reads:
                    self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, action))
                reads.assert_not_called()
                self.assert_untouched(before)

    def test_chair_context_recognizes_explicit_variant_without_changing_helper_route(self) -> None:
        status = json.loads(json.dumps(self.board))
        records = supervisor.dependency_ready_blocked_task_records({}, status)
        self.assertEqual([(r["task_id"], r["action"]) for r in records], [(self.task["id"], "create_unblock_task")])
        recovery = records[0]["candidate_ci_recovery"]
        self.assertEqual((recovery["candidate_sha"], recovery["blocker_fingerprint"]),
                         (self.task["candidate_sha"], self.fingerprint))
        message = supervisor.build_chair_review_message(
            {}, reason="blocked_task_triage", markdown_path=self.root / "d.md", json_path=self.root / "d.json",
            approval_state={"pending": [], "history": []}, state={}, provider_report={}, status=status)
        self.assertIn(f"ci_recovery=eligible candidate_sha={self.task['candidate_sha']}", message)
        self.assertIn(f"blocker_fingerprint={self.fingerprint}", message)
        self.assertIn("resume_basis=candidate_ci_recovered", message)
        base = {"version": 1, "approval_ttl_minutes": 45, "reason": "r", "blocked_by": [], "approval_actions": [],
                "reassignment_actions": [], "provider_actions": [], "recommended_focus": [self.task["id"]]}
        for reason in ("blocked_task_triage", "reassignment_triage"):
            with self.subTest(reason=reason):
                explicit = {**base, "decision": reason, "task_actions": [self.action]}
                normalized = supervisor.normalize_chair_review_payload_for_reason(explicit, reason=reason, config={}, status=status)
                self.assertEqual(normalized["task_actions"], [self.action])
                self.assertIsNone(supervisor.validate_chair_review_context(
                    normalized, reason=reason, approval_state={"pending": []}, config={}, status=status))
                # A stale explicit decision stays on the explicit route: no helper is
                # synthesized or required; apply alone rejects it (fail closed).
                for drift in ({"blocker_fingerprint": "0" * 64}, {"candidate_generation": "other"},
                              {"pr_url": "https://github.com/acme/fleet/pull/32"}):
                    payload = {**base, "decision": reason, "task_actions": [{**self.action, **drift}]}
                    normalized = supervisor.normalize_chair_review_payload_for_reason(payload, reason=reason, config={}, status=status)
                    self.assertEqual(normalized["task_actions"], [{**self.action, **drift}])
                    self.assertIsNone(supervisor.validate_chair_review_context(
                        normalized, reason=reason, approval_state={"pending": []}, config={}, status=status))
                # Without any explicit decision the existing helper route is unchanged.
                payload = {**base, "decision": reason, "task_actions": []}
                normalized = supervisor.normalize_chair_review_payload_for_reason(payload, reason=reason, config={}, status=status)
                if reason == "reassignment_triage":
                    self.assertEqual([a["action"] for a in normalized["task_actions"]], ["create_unblock_task"])
                else:
                    self.assertIn(f"{self.task['id']}:create_unblock_task", supervisor.validate_chair_review_context(
                        normalized, reason=reason, approval_state={"pending": []}, config={}, status=status) or "")
        self.assertIn(f"pr_url={self.task['pr_url']}", message)
        ineligible = json.loads(json.dumps(status))
        ineligible["tasks"][0]["candidate_review_handoff"] = None
        self.assertIsNone(supervisor.dependency_ready_blocked_task_records({}, ineligible)[0]["candidate_ci_recovery"])

    def test_completed_native_chair_decision_reaches_real_transaction(self) -> None:
        import github_bus
        review = self.root / "chair-reviews"
        review.mkdir()
        markdown = review / "decision.md"; markdown.write_text("# Actual decision-port fixture\n")
        decision = review / "decision.json"
        payload = {"version": 1, "decision": "blocked_task_triage", "approval_ttl_minutes": 45,
                   "reason": "Specific original CI blocker is resolved", "blocked_by": [], "approval_actions": [],
                   "reassignment_actions": [], "task_actions": [self.action], "provider_actions": [],
                   "recommended_focus": [self.task["id"]]}
        approval = self.root / "approval-queue.json"
        approval.write_text(json.dumps({"pending": [], "history": []}))
        self.config["paths"]["approval_queue"] = str(approval)
        self.config["chair_review"] = {"enabled": True, "cooldown_seconds": 900}
        for reason in ("blocked_task_triage", "reassignment_triage"):
            with self.subTest(reason=reason):
                self.path.write_text(json.dumps(self.board))
                payload["decision"] = reason; decision.write_text(json.dumps(payload))
                runtime = {"queue": {"events": {"chair-case": {"status": "completed"}}}, "workers": {},
                           "chair_review": {"active_review": {"agent": "Codex", "agent_id": "codex", "reason": reason,
                                "queue_event_id": "chair-case", "markdown_path": str(markdown), "json_path": str(decision)}}}
                with mock.patch.object(github_bus, "gh_json", side_effect=self.observe):
                    self.assertTrue(supervisor.refresh_chair_review_state(self.config, runtime, provider_report={}))
                state = json.loads(self.path.read_text())
                self.assertEqual(state["tasks"][0]["status"], "review")
                self.assertEqual(len(state["tasks"]), 1)  # no helper task created
                self.assertIsNone(runtime["chair_review"]["active_review"])
                actions = runtime["chair_review"]["last_decision"]["task_actions"]
                self.assertEqual(actions, [self.action])  # no synthesized helper
        for key, value in (("resume_basis", "unrelated_blocker"), ("candidate_sha", "short"),
                           ("candidate_generation", ""), ("resume_status", "todo"),
                           ("blocker_fingerprint", None), ("blocker_fingerprint", "x"),
                           ("pr_url", None), ("pr_url", "https://example.com/acme/fleet/pull/31")):
            with self.subTest(invalid_field=key, value=value):
                payload["task_actions"] = [{**self.action, key: value}]
                self.assertIsNotNone(supervisor.validate_chair_review_payload(payload))
        payload["task_actions"] = [{**self.action, "action": "create_unblock_task"}]
        self.assertIsNotNone(supervisor.validate_chair_review_payload(payload))

    def run_refresh(self, reason: str, payload: dict) -> dict:
        review = self.root / "chair-reviews"
        review.mkdir(exist_ok=True)
        markdown = review / "decision.md"; markdown.write_text("# Actual decision-port fixture\n")
        decision = review / "decision.json"; decision.write_text(json.dumps(payload))
        approval = self.root / "approval-queue.json"
        approval.write_text(json.dumps({"pending": [], "history": []}))
        self.config["paths"]["approval_queue"] = str(approval)
        self.config["chair_review"] = {"enabled": True, "cooldown_seconds": 900}
        runtime = {"queue": {"events": {"chair-case": {"status": "completed"}}}, "workers": {},
                   "chair_review": {"active_review": {"agent": "Codex", "agent_id": "codex", "reason": reason,
                        "queue_event_id": "chair-case", "markdown_path": str(markdown), "json_path": str(decision)}}}
        supervisor.refresh_chair_review_state(self.config, runtime, provider_report={})
        return runtime

    def test_R2_stale_explicit_decision_after_new_blocker_never_falls_back_to_helper(self) -> None:
        import github_bus
        payload = {"version": 1, "approval_ttl_minutes": 45, "reason": "Specific original CI blocker is resolved",
                   "blocked_by": [], "approval_actions": [], "reassignment_actions": [],
                   "task_actions": [self.action], "provider_actions": [], "recommended_focus": [self.task["id"]]}
        for reason in ("reassignment_triage", "blocked_task_triage"):
            with self.subTest(reason=reason):
                # A blocker arrives after the Chair snapshot the decision fingerprinted.
                board = json.loads(json.dumps(self.board))
                board["blockers"].append({"task_id": self.task["id"], "owner": "Pi", "waiting_for": "Codex",
                                          "status": "open", "message": "Blocker after Chair snapshot",
                                          "created_at": "2026-10-27T02:00:00Z"})
                self.path.write_text(json.dumps(board))
                before = self.path.read_bytes()
                with mock.patch.object(github_bus, "gh_json") as reads, \
                        mock.patch.object(supervisor, "queue_delivery_event") as wake:
                    runtime = self.run_refresh(reason, {**payload, "decision": reason})
                reads.assert_not_called()
                wake.assert_not_called()
                self.assertEqual(self.path.read_bytes(), before)  # no helper, no assignment, still blocked
                self.assertEqual(set(runtime["queue"]["events"]), {"chair-case"})
                self.assertIsNone(runtime["chair_review"]["active_review"])
                self.assertEqual(runtime["chair_review"]["last_decision"]["task_actions"], [self.action])
                rows = self.runtime_log.read_text().splitlines() if self.runtime_log.exists() else []
                self.assertFalse(any("chair_unblock" in row or "chair_parent_resume" in row for row in rows))
                self.assertFalse(self.board_log.exists())

    def test_R2_task_without_explicit_decision_still_gets_reassignment_helper(self) -> None:
        payload = {"version": 1, "decision": "reassignment_triage", "approval_ttl_minutes": 45,
                   "reason": "Route the blocked task", "blocked_by": [self.task["id"]], "approval_actions": [],
                   "reassignment_actions": [], "task_actions": [], "provider_actions": [],
                   "recommended_focus": [self.task["id"]]}
        normalized = supervisor.normalize_chair_review_payload_for_reason(
            payload, reason="reassignment_triage", config=self.config, status=json.loads(self.path.read_text()))
        self.assertEqual([(a["task_id"], a["action"]) for a in normalized["task_actions"]],
                         [(self.task["id"], "create_unblock_task")])

    def test_R1_dependency_regressed_or_added_during_github_read_fails_closed(self) -> None:
        import github_bus
        dependency = {"id": "DEP-A", "title": "Dependency", "phase": "test", "owner": "Codex", "reviewer": "Pi",
                      "status": "done", "depends_on": [], "artifacts": [], "acceptance": [], "next": "Done"}
        for kind in ("regressed", "added_unfinished", "positive"):
            with self.subTest(kind=kind):
                board = json.loads(json.dumps(self.board))
                board["tasks"][0]["depends_on"] = ["DEP-A"]
                board["tasks"].append(dict(dependency))
                if kind == "added_unfinished":
                    board["tasks"].append({**dependency, "id": "DEP-B", "status": "in_progress"})
                self.path.write_text(json.dumps(board))
                before = self.path.read_bytes()
                for log in (self.runtime_log, self.board_log):
                    log.unlink(missing_ok=True)
                def external(argv, kind=kind):
                    data = self.observe(argv)
                    if argv[0] == "api" and kind != "positive":
                        state = json.loads(self.path.read_text())
                        if kind == "regressed":
                            state["tasks"][1]["status"] = "in_progress"
                        else:
                            state["tasks"][0]["depends_on"].append("DEP-B")
                        self.path.write_text(json.dumps(state))
                    return data
                with mock.patch.object(github_bus, "gh_json", side_effect=external):
                    resumed = supervisor.apply_chair_parent_resume_action(self.config, {}, self.action)
                state = json.loads(self.path.read_text())
                if kind == "positive":
                    self.assertTrue(resumed)
                    self.assertEqual(state["tasks"][0]["status"], "review")
                    continue
                self.assertFalse(resumed)
                task = state["tasks"][0]
                self.assertEqual((task["status"], task["waiting_for"], task["ci_status"]), ("blocked", "Gemini", "failure"))
                self.assertTrue(all(row["status"] == "open" for row in state["blockers"]))
                self.assertNotEqual(self.path.read_bytes(), before)  # only the concurrent edit landed
                self.assertFalse(self.runtime_log.exists())
                self.assertFalse(self.board_log.exists())

    def test_R3_bound_PR_changed_from_chair_observation_fails_closed(self) -> None:
        import github_bus
        pr32 = "https://github.com/acme/fleet/pull/32"
        green_pr32 = {**self.pr, "url": pr32}
        run32 = {**self.run, "pull_requests": [{"number": 32}]}
        def observe32(argv):
            return json.loads(json.dumps(green_pr32 if argv[0] == "pr" else [{"workflow_runs": [run32]}]))
        for kind in ("before_apply", "during_github_read"):
            with self.subTest(kind=kind):
                board = json.loads(json.dumps(self.board))
                if kind == "before_apply":
                    board["tasks"][0]["pr_url"] = pr32  # same H/generation/handoff, different PR
                self.path.write_text(json.dumps(board))
                for log in (self.runtime_log, self.board_log):
                    log.unlink(missing_ok=True)
                def external(argv, kind=kind):
                    if kind == "during_github_read" and argv[0] == "api":
                        state = json.loads(self.path.read_text())
                        state["tasks"][0]["pr_url"] = pr32
                        self.path.write_text(json.dumps(state))
                        return self.observe(argv)
                    return observe32(argv) if kind == "before_apply" else self.observe(argv)
                with mock.patch.object(github_bus, "gh_json", side_effect=external) as reads:
                    self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, self.action))
                if kind == "before_apply":
                    reads.assert_not_called()  # never substitutes PR32's green CI
                task = json.loads(self.path.read_text())["tasks"][0]
                self.assertEqual((task["status"], task["pr_url"], task["ci_status"]), ("blocked", pr32, "failure"))
                self.assertFalse(self.runtime_log.exists())
                self.assertFalse(self.board_log.exists())
        # Same PR as observed by the Chair still resumes.
        self.path.write_text(json.dumps(self.board))
        with mock.patch.object(github_bus, "gh_json", side_effect=self.observe):
            self.assertTrue(supervisor.apply_chair_parent_resume_action(self.config, {}, self.action))
        self.assertEqual(json.loads(self.path.read_text())["tasks"][0]["status"], "review")

    def test_R4_two_stable_preexisting_blockers_never_resume_through_completed_chair(self) -> None:
        import github_bus
        from control_plane.domain.chair_policy import open_blocker_fingerprint
        board = json.loads(json.dumps(self.board))
        # Both exist at the Chair snapshot and never change. The wording is
        # irrelevant: only "not exactly one open blocker" may decide this.
        board["blockers"] = [
            {**board["blockers"][0], "message": "Candidate CI failed on transport error"},
            {"task_id": self.task["id"], "owner": "Pi", "waiting_for": "Codex", "status": "open",
             "message": "Product decision on fare rounding pending", "created_at": "2026-10-27T00:10:00Z"},
        ]
        stable_fingerprint = open_blocker_fingerprint(board["blockers"], self.task["id"])[0]
        action = {**self.action, "blocker_fingerprint": stable_fingerprint}
        self.path.write_text(json.dumps(board))
        records = supervisor.dependency_ready_blocked_task_records({}, board)
        self.assertIsNone(records[0]["candidate_ci_recovery"])
        message = supervisor.build_chair_review_message(
            {}, reason="blocked_task_triage", markdown_path=self.root / "d.md", json_path=self.root / "d.json",
            approval_state={"pending": [], "history": []}, state={}, provider_report={}, status=board)
        self.assertNotIn("ci_recovery=eligible candidate_sha=", message)
        self.assertIn(f"- {self.task['id']}: kind=manual_unblock action=create_unblock_task", message)
        payload = {"version": 1, "approval_ttl_minutes": 45, "reason": "Chair judged CI the sole blocker",
                   "blocked_by": [], "approval_actions": [], "reassignment_actions": [],
                   "task_actions": [action], "provider_actions": [], "recommended_focus": [self.task["id"]]}
        for reason in ("blocked_task_triage", "reassignment_triage"):
            with self.subTest(reason=reason):
                before = self.path.read_bytes()
                with mock.patch.object(github_bus, "gh_json", side_effect=self.observe) as reads, \
                        mock.patch.object(supervisor, "queue_delivery_event") as wake:
                    runtime = self.run_refresh(reason, {**payload, "decision": reason})
                reads.assert_not_called()  # rejected in preflight, before any GitHub read
                wake.assert_not_called()
                self.assertEqual(self.path.read_bytes(), before)
                state = json.loads(self.path.read_text())
                self.assertEqual(state["tasks"][0]["status"], "blocked")
                self.assertEqual([row["status"] for row in state["blockers"]], ["open", "open"])
                self.assertEqual(len(state["tasks"]), 1)
                self.assertEqual(set(runtime["queue"]["events"]), {"chair-case"})
                self.assertEqual(runtime["chair_review"]["last_decision"]["task_actions"], [action])
                # Only the review's own completion record; no resume/helper side effects.
                rows = [json.loads(line)["type"] for line in self.runtime_log.read_text().splitlines()]
                self.assertFalse([row for row in rows if "resume" in row or "unblock" in row], rows)
                self.runtime_log.unlink()
                self.assertFalse(self.board_log.exists())
        # Even with the preflight bypassed, the real board transaction refuses it.
        identity = {k: self.task[k] for k in ("owner", "reviewer", "candidate_sha", "candidate_branch",
                                                "candidate_generation", "pr_url")}
        result = supervisor.run_task_board_command(
            self.config, "resume-blocked", [self.task["id"], "in_progress", "Bypassed preflight"],
            environ={"AI_NAME": "Supervisor", "TASK_RESUME_BASIS": "candidate_ci_recovered",
                     "TASK_RESUME_CANDIDATE_IDENTITY_JSON": json.dumps(identity),
                     "TASK_RESUME_BLOCKER_FINGERPRINT": stable_fingerprint,
                     "TASK_RESUME_CHAIR_PR_URL": self.task["pr_url"],
                     "TASK_RESUME_DEPENDS_ON_JSON": "[]", "TASK_RESUME_DEPENDENCY_DONE_STATUSES": '["done"]',
                     "CANDIDATE_HEAD_SHA": self.task["candidate_sha"], "CANDIDATE_BRANCH": self.task["candidate_branch"],
                     "CANDIDATE_CI_STATUS": "success", "PR_URL": self.task["pr_url"]})
        self.assertFalse(result.ok)
        self.assertIn("exactly one open blocker", result.error)
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(self.board_log.exists())
        # The ordinary helper route for such a task is unchanged.
        normalized = supervisor.normalize_chair_review_payload_for_reason(
            {**payload, "decision": "reassignment_triage", "task_actions": [], "blocked_by": [self.task["id"]]},
            reason="reassignment_triage", config=self.config, status=board)
        self.assertEqual([a["action"] for a in normalized["task_actions"]], ["create_unblock_task"])


    HELD_DEFERRAL = ("HELD-UNBLOCK: Existing governance helper requires original human triage; no nested helper "
                     "is permitted. Keep its blocker, owner, reviewer and waiting_for unchanged.")

    def add_held_governance_helper(self, **changes) -> dict:
        held = {"id": "HELD-UNBLOCK", "title": "Existing blocked governance helper", "phase": "test", "owner": "Pi",
                "reviewer": "Codex", "status": "blocked", "task_class": "unblock", "helper_parent": "ORIGINAL-PARENT",
                "helper_kind": "manual_unblock", "depends_on": [], "artifacts": [], "acceptance": [],
                "waiting_for": "Claude2", "next": "Needs original human triage."}
        held.update(changes)
        self.board["tasks"].append(held)
        self.board["blockers"].append({"task_id": held["id"], "owner": "Pi", "waiting_for": "Claude2",
                                       "status": "open", "message": "Original manual governance hold",
                                       "created_at": "2026-10-27T00:00:00Z"})
        self.path.write_text(json.dumps(self.board))
        return held

    def mixed_payload(self, reason: str, blocked_by: list) -> dict:
        return {"version": 1, "decision": reason, "approval_ttl_minutes": 45,
                "reason": "Original candidate CI alone recovered; unrelated governance helper must remain held.",
                "blocked_by": blocked_by, "approval_actions": [], "reassignment_actions": [],
                "task_actions": [self.action], "provider_actions": [], "recommended_focus": []}

    def runtime_rows(self) -> list:
        return [json.loads(line)["type"] for line in self.runtime_log.read_text().splitlines()] if self.runtime_log.exists() else []

    def test_R6_mixed_recovery_and_reasoned_governance_deferral_survive_both_reasons(self) -> None:
        import github_bus
        held = self.add_held_governance_helper()
        snapshot = json.loads(json.dumps(self.board))
        for reason in ("blocked_task_triage", "reassignment_triage"):
            with self.subTest(reason=reason):
                self.path.write_text(json.dumps(snapshot)); self.runtime_log.unlink(missing_ok=True)
                payload = self.mixed_payload(reason, [self.HELD_DEFERRAL])
                normalized = supervisor.normalize_chair_review_payload_for_reason(
                    payload, reason=reason, config=self.config, status=snapshot)
                self.assertEqual(normalized["task_actions"], [self.action])  # no synthesized helper
                with mock.patch.object(github_bus, "gh_json", side_effect=self.observe) as reads, \
                        mock.patch.object(supervisor, "queue_delivery_event") as wake:
                    runtime = self.run_refresh(reason, payload)
                self.assertEqual(reads.call_count, 2)
                wake.assert_not_called()
                state = json.loads(self.path.read_text())
                self.assertEqual(state["tasks"][0]["status"], "review")
                self.assertEqual(state["tasks"][1], held)  # owner/reviewer/waiting_for untouched
                self.assertEqual(len(state["tasks"]), 2)
                self.assertEqual(state["blockers"][1], snapshot["blockers"][1])
                self.assertEqual(self.runtime_rows(), ["chair_parent_resume_applied", "chair_review_applied"])
                self.assertEqual(runtime.get("governance_escalations", {}), {})
                self.assertEqual(runtime["chair_review"]["last_decision"]["task_actions"], [self.action])

    def test_R6_generic_or_unmatched_deferrals_keep_existing_behavior(self) -> None:
        import github_bus
        self.add_held_governance_helper()
        snapshot = json.loads(json.dumps(self.board))
        generic = {
            "id_only": ["HELD-UNBLOCK"],
            "short_reason": ["HELD-UNBLOCK: hold it"],
            "no_task_named": ["Governance helpers stay held for human triage; no nested helpers."],
            "names_other_task": ["HELD-UNBLOCK: same reason as ORIGINAL-PARENT, keep everything unchanged"],
            "not_first": ["Keep HELD-UNBLOCK: needs original human triage, no nested helper"],
        }
        for kind, blocked_by in generic.items():
            with self.subTest(kind=kind):
                self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(
                    self.config, {"blocked_by": blocked_by}, supervisor.chair_blocked_task_selection(self.config, snapshot),
                    snapshot), set())
                # blocked_task_triage: still rejected as a whole, before any GitHub read.
                self.path.write_text(json.dumps(snapshot)); before = self.path.read_bytes()
                self.runtime_log.unlink(missing_ok=True)
                with mock.patch.object(github_bus, "gh_json") as reads:
                    self.run_refresh("blocked_task_triage", self.mixed_payload("blocked_task_triage", blocked_by))
                reads.assert_not_called()
                self.assertEqual(self.path.read_bytes(), before)
                self.assertEqual(self.runtime_rows(), ["chair_review_invalid_schema"])
                # reassignment_triage: a named task still gets the existing synthesized helper route.
                normalized = supervisor.normalize_chair_review_payload_for_reason(
                    self.mixed_payload("reassignment_triage", blocked_by), reason="reassignment_triage",
                    config=self.config, status=snapshot)
                synthesized = [a["task_id"] for a in normalized["task_actions"] if a["action"] == "create_unblock_task"]
                self.assertEqual(synthesized, [] if kind == "no_task_named" else ["HELD-UNBLOCK"])

    def test_R6_deferral_never_waives_an_ordinary_or_non_blocked_task(self) -> None:
        # Ordinary blocked task (helper route can succeed): a reasoned deferral is not a waiver.
        ordinary = {"blocked_by": ["CI-RECOVERY-EXAMPLE: needs original human triage, no helper wanted here"]}
        selection = supervisor.chair_blocked_task_selection(self.config, self.board)
        self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(self.config, ordinary, selection, self.board), set())
        payload = {"version": 1, "decision": "blocked_task_triage", "approval_ttl_minutes": 45, "reason": "r",
                   "blocked_by": ordinary["blocked_by"], "approval_actions": [], "reassignment_actions": [],
                   "task_actions": [], "provider_actions": [], "recommended_focus": []}
        self.assertEqual(supervisor.validate_chair_review_context(
            payload, reason="blocked_task_triage", approval_state={"pending": []}, config=self.config, status=self.board),
            "blocked_task_triage must resolve blocked tasks via CI-RECOVERY-EXAMPLE:create_unblock_task")
        normalized = supervisor.normalize_chair_review_payload_for_reason(
            {**payload, "decision": "reassignment_triage"}, reason="reassignment_triage", config=self.config, status=self.board)
        self.assertEqual([a["action"] for a in normalized["task_actions"]], ["create_unblock_task"])
        # Named governance task that is not actually blocked: nothing to defer, nothing changes.
        self.add_held_governance_helper(status="in_progress")
        selection = supervisor.chair_blocked_task_selection(self.config, self.board)
        self.assertNotIn("HELD-UNBLOCK", [r["task_id"] for r in selection])
        self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(
            self.config, {"blocked_by": [self.HELD_DEFERRAL]}, selection, self.board), set())
        # Without any deferral the recursion guard keeps escalating instead of nesting a helper.
        self.board["tasks"][-1]["status"] = "blocked"; self.path.write_text(json.dumps(self.board))
        state: dict = {}
        self.assertFalse(supervisor.create_chair_unblock_task(
            self.config, state, {"task_id": "HELD-UNBLOCK", "reason": "route"}, {}))
        self.assertIn("HELD-UNBLOCK", state["governance_escalations"])
        self.assertIn("governance_recursion_blocked", self.runtime_rows())


    OPERATOR_DEFERRAL = ("OPERATOR-ONLY: Original external operator must supply genuine live role sessions; "
                         "retain the existing blocker and routing without a source helper.")

    def add_operator_hold(self) -> dict:
        return self.add_held_governance_helper(
            id="OPERATOR-ONLY", task_class="verification", helper_parent="", helper_kind="",
            next="Original external operator must supply genuine live role sessions.")

    def test_R6_operator_hold_and_governance_deferrals_in_one_mixed_recovery_batch(self) -> None:
        import github_bus
        governance = self.add_held_governance_helper()
        operator = self.add_operator_hold()
        snapshot = json.loads(json.dumps(self.board))
        self.assertFalse(supervisor.chair_unblock_recursion_guarded(self.config, operator, {}))
        for reason in ("blocked_task_triage", "reassignment_triage"):
            with self.subTest(reason=reason):
                self.path.write_text(json.dumps(snapshot)); self.runtime_log.unlink(missing_ok=True)
                payload = self.mixed_payload(reason, [self.HELD_DEFERRAL, self.OPERATOR_DEFERRAL])
                normalized = supervisor.normalize_chair_review_payload_for_reason(
                    payload, reason=reason, config=self.config, status=snapshot)
                self.assertEqual(normalized["task_actions"], [self.action])
                self.assertIsNone(supervisor.validate_chair_review_context(
                    normalized, reason=reason, approval_state={"pending": []}, config=self.config, status=snapshot))
                with mock.patch.object(github_bus, "gh_json", side_effect=self.observe) as reads, \
                        mock.patch.object(supervisor, "queue_delivery_event") as wake:
                    runtime = self.run_refresh(reason, payload)
                self.assertEqual(reads.call_count, 2)
                wake.assert_not_called()
                state = json.loads(self.path.read_text())
                self.assertEqual(state["tasks"][0]["status"], "review")
                self.assertEqual(state["tasks"][1:], [governance, operator])  # no helper, nothing touched
                self.assertEqual(state["blockers"][1:], snapshot["blockers"][1:])
                self.assertEqual(self.runtime_rows(), ["chair_parent_resume_applied", "chair_review_applied"])
                self.assertEqual(runtime.get("governance_escalations", {}), {})

    def test_R6_operator_deferral_outside_a_valid_mixed_batch_keeps_helper_route(self) -> None:
        import github_bus
        self.add_operator_hold()
        snapshot = json.loads(json.dumps(self.board))
        stale = {**self.action, "blocker_fingerprint": "0" * 64}
        # A stale mixed batch is refused as a whole and synthesizes nothing.
        for reason in ("blocked_task_triage", "reassignment_triage"):
            payload = {**self.mixed_payload(reason, [self.OPERATOR_DEFERRAL]), "task_actions": [stale]}
            normalized = supervisor.normalize_chair_review_payload_for_reason(
                payload, reason=reason, config=self.config, status=snapshot)
            self.assertEqual(normalized["task_actions"], [stale])
            self.assertEqual(supervisor.validate_chair_review_context(
                normalized, reason=reason, approval_state={"pending": []}, config=self.config, status=snapshot),
                f"{reason} mixed recovery batch is stale; refusing it without deferring OPERATOR-ONLY")
        cases = {
            "no_recovery_action": ([], [self.OPERATOR_DEFERRAL]),
            "short_reason": ([self.action], ["OPERATOR-ONLY: keep it held"]),
            "id_only": ([self.action], ["OPERATOR-ONLY"]),
            "names_other_task": ([self.action], ["OPERATOR-ONLY: wait for ORIGINAL-PARENT, keep blocker and routing"]),
            "unmatched_id": ([self.action], ["OPERATOR-ONLYX: Original external operator must supply sessions now"]),
        }
        for kind, (actions, blocked_by) in cases.items():
            with self.subTest(kind=kind):
                payload = {**self.mixed_payload("blocked_task_triage", blocked_by), "task_actions": actions}
                selection = supervisor.chair_blocked_task_selection(self.config, snapshot)
                self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(self.config, payload, selection, snapshot), set())
                self.assertIn("OPERATOR-ONLY:create_unblock_task", supervisor.validate_chair_review_context(
                    payload, reason="blocked_task_triage", approval_state={"pending": []}, config=self.config,
                    status=snapshot) or "")
                normalized = supervisor.normalize_chair_review_payload_for_reason(
                    {**payload, "decision": "reassignment_triage", "blocked_by": ["OPERATOR-ONLY: " + "x" * 30]
                     if kind == "unmatched_id" else blocked_by},
                    reason="reassignment_triage", config=self.config, status=snapshot)
                if kind != "unmatched_id":
                    self.assertIn(("OPERATOR-ONLY", "create_unblock_task"),
                                  [(a["task_id"], a["action"]) for a in normalized["task_actions"]])

    def use_real_agent_config(self) -> None:
        self.config["agents"] = {name.lower(): {"display_name": name, "provider": name.lower().rstrip("2"),
                                                "file_inbox_path": str(self.root / f"{name.lower()}.md")}
                                 for name in ("Claude", "Claude2", "Codex", "Gemini", "Pi")}
        self.config["paths"]["event_queue"] = str(self.root / "events.jsonl")
        self.config["schema"] = {"tasks_path": "tasks", "task_id_field": "id", "status_field": "status",
                                 "assignee_field": "owner", "reviewer_field": "reviewer"}

    def refresh_side_effects(self, reason: str, payload: dict, gh=None) -> dict:
        import github_bus
        self.runtime_log.unlink(missing_ok=True)
        before = self.path.read_bytes()
        with mock.patch.object(github_bus, "gh_json", side_effect=gh) as reads, \
                mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as wake:
            runtime = self.run_refresh(reason, payload)
        state = json.loads(self.path.read_text())
        return {"reads": reads.call_count, "wakes": wake.call_count, "unchanged": self.path.read_bytes() == before,
                "rows": self.runtime_rows(), "helpers": [t["id"] for t in state["tasks"] if "-UNBLOCK-" in t["id"]],
                "escalations": runtime.get("governance_escalations", {}), "state": state,
                "board_log": self.board_log.exists()}

    def test_R6_stale_mixed_batch_full_refresh_has_no_side_effects_for_either_reason(self) -> None:
        self.use_real_agent_config()
        base = json.loads(json.dumps(self.board))
        dependency = {"id": "DEP-OPEN", "title": "Dependency", "phase": "test", "owner": "Codex", "reviewer": "Pi",
                      "status": "in_progress", "depends_on": [], "artifacts": [], "acceptance": [], "next": "Working"}
        deferrals = {"governance": ({}, self.HELD_DEFERRAL),
                     "operator": ({"id": "OPERATOR-ONLY", "task_class": "verification", "helper_parent": "",
                                   "helper_kind": ""}, self.OPERATOR_DEFERRAL)}
        staleness = {
            "new_blocker_after_snapshot": {},
            "fingerprint": {"blocker_fingerprint": "0" * 64},
            "generation": {"candidate_generation": "generation-two"},
            "pr": {"pr_url": "https://github.com/acme/fleet/pull/32"},
            "dependency_not_done": {},
        }
        for deferral_kind, (held_changes, deferral) in deferrals.items():
            for stale_kind, action_changes in staleness.items():
                for reason in ("blocked_task_triage", "reassignment_triage"):
                    with self.subTest(deferral=deferral_kind, stale=stale_kind, reason=reason):
                        self.board = json.loads(json.dumps(base))
                        self.add_held_governance_helper(**held_changes)
                        if stale_kind == "new_blocker_after_snapshot":
                            self.board["blockers"].append({"task_id": self.task["id"], "owner": "Pi",
                                                           "waiting_for": "Codex", "status": "open",
                                                           "message": "Blocker after Chair snapshot",
                                                           "created_at": "2026-10-27T02:00:00Z"})
                        if stale_kind == "dependency_not_done":
                            self.board["tasks"][0]["depends_on"] = ["DEP-OPEN"]
                            self.board["tasks"].append(dependency)
                        self.path.write_text(json.dumps(self.board))
                        payload = {**self.mixed_payload(reason, [deferral]),
                                   "task_actions": [{**self.action, **action_changes}]}
                        self.assertIn("mixed recovery batch is stale", supervisor.validate_chair_review_context(
                            supervisor.normalize_chair_review_payload_for_reason(
                                payload, reason=reason, config=self.config, status=self.board),
                            reason=reason, approval_state={"pending": []}, config=self.config, status=self.board) or "")
                        effects = self.refresh_side_effects(reason, payload, gh=self.observe)
                        self.assertEqual((effects["reads"], effects["wakes"], effects["helpers"]), (0, 0, []))
                        self.assertTrue(effects["unchanged"])
                        self.assertEqual(effects["rows"], ["chair_review_invalid_schema"])
                        self.assertEqual(effects["escalations"], {})
                        self.assertFalse(effects["board_log"])

    def test_R6_real_agent_config_valid_mixed_batch_and_ordinary_helper_route(self) -> None:
        self.use_real_agent_config()
        base = json.loads(json.dumps(self.board))
        # Valid mixed batch: recovery applies, both deferred records untouched, no helper or wake.
        for reason in ("blocked_task_triage", "reassignment_triage"):
            with self.subTest(valid=reason):
                self.board = json.loads(json.dumps(base))
                governance = self.add_held_governance_helper()
                operator = self.add_operator_hold()
                effects = self.refresh_side_effects(
                    reason, self.mixed_payload(reason, [self.HELD_DEFERRAL, self.OPERATOR_DEFERRAL]), gh=self.observe)
                self.assertEqual((effects["reads"], effects["wakes"], effects["helpers"]), (2, 0, []))
                self.assertEqual(effects["state"]["tasks"][0]["status"], "review")
                self.assertEqual(effects["state"]["tasks"][1:], [governance, operator])
                self.assertEqual(effects["rows"], ["chair_parent_resume_applied", "chair_review_applied"])
        # Ordinary batch without recovery: the existing synthesized helper route still materializes,
        # which also shows this config really reaches the assign writer and queue port.
        self.board = json.loads(json.dumps(base))
        self.add_operator_hold()
        payload = {**self.mixed_payload("reassignment_triage", [self.OPERATOR_DEFERRAL]), "task_actions": []}
        effects = self.refresh_side_effects("reassignment_triage", payload)
        self.assertEqual(effects["helpers"], ["OPERATOR-ONLY-UNBLOCK-MANUAL-UNBLOCK"])
        self.assertEqual(effects["wakes"], 1)
        self.assertIn("chair_unblock_task_created", effects["rows"])
        # An explicit helper action in an otherwise valid mixed batch keeps its normal path too.
        self.board = json.loads(json.dumps(base))
        self.add_operator_hold()
        payload = self.mixed_payload("reassignment_triage", [])
        payload["task_actions"] = [self.action, {"task_id": "OPERATOR-ONLY", "action": "create_unblock_task",
                                                 "reason": "Chair wants a source repair helper here"}]
        effects = self.refresh_side_effects("reassignment_triage", payload, gh=self.observe)
        self.assertEqual(effects["state"]["tasks"][0]["status"], "review")
        self.assertEqual(effects["helpers"], ["OPERATOR-ONLY-UNBLOCK-MANUAL-UNBLOCK"])

    def test_R6_mixed_batch_still_requires_undeferred_ordinary_tasks(self) -> None:
        self.add_operator_hold()
        self.add_held_governance_helper(id="ORDINARY-ACTIONABLE", task_class="implementation", helper_parent="",
                                        helper_kind="", next="Needs a source repair")
        payload = self.mixed_payload("blocked_task_triage", [self.OPERATOR_DEFERRAL])
        self.assertEqual(supervisor.validate_chair_review_context(
            payload, reason="blocked_task_triage", approval_state={"pending": []}, config=self.config, status=self.board),
            "blocked_task_triage must resolve blocked tasks via ORDINARY-ACTIONABLE:create_unblock_task")
        normalized = supervisor.normalize_chair_review_payload_for_reason(
            {**self.mixed_payload("reassignment_triage", [self.OPERATOR_DEFERRAL]),
             "recommended_focus": ["ORDINARY-ACTIONABLE"]},
            reason="reassignment_triage", config=self.config, status=self.board)
        self.assertEqual([(a["task_id"], a["action"]) for a in normalized["task_actions"]],
                         [(self.task["id"], "resume_parent_task"), ("ORDINARY-ACTIONABLE", "create_unblock_task")])

    # Compact adaptation of the native 20261028T104828Z-claude.json blocked_by, not a verbatim copy:
    # the fourth entry's ancestor/next wording differs from the on-disk original. It keeps the
    # structural traits under test (full-width colons, the "PD-4" milestone label).
    NATIVE_1048_HELPER_DEFERRALS = [
        "SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010-UNBLOCK-MANUAL-UNBLOCK：自身即 parent 的既有 helper，next 明載 H3/H4 HOLD 與 recursion base-case 禁止 lineage>=maxdepth1 的再生 helper；不可再建 helper-of-helper。",
        "SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010-UNBLOCK-HISTORY-REPAIR：已於 2026-10-11 DONE 並歸檔（PR #2549 merge 7f39917），因 create_chair_unblock_task 未檢查 archived_task_ids 的已知 bug 於 2026-10-21 被誤重建；重複 create_unblock_task 只會再餵同一個 bug，需 Supervisor 層級修正或人工歸檔。",
        "SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010-UNBLOCK-PLANNING-DECISION：next 自述是 2026-10-24 由 synthesize_reassignment_followup_task_actions 誤建（當時 chair review 已明示 blocked_by 不應新建 unblock task），且現行 governance 規格明文禁止在 parent 的 all-writer exclusion/publication HOLD 未解除前新增 helper/handoff。",
        "PAX-WEB-RIDE-UI-20261009-UNBLOCK-PLANNING-DECISION：自身即 parent 的既有 helper，卡在 PD-4（已發佈 ancestor bbc358cbda65 缺 Reviewer trailer），需要既有的人類/治理權責處理，不是可再派一層 helper 解的執行性缺口。",
    ]
    NATIVE_1048_HELPERS = [
        ("SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010-UNBLOCK-MANUAL-UNBLOCK",
         "SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010", "manual_unblock"),
        ("SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010-UNBLOCK-HISTORY-REPAIR",
         "SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010", "history_repair"),
        ("SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010-UNBLOCK-PLANNING-DECISION",
         "SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010", "planning_decision"),
        ("PAX-WEB-RIDE-UI-20261009-UNBLOCK-PLANNING-DECISION", "PAX-WEB-RIDE-UI-20261009", "planning_decision"),
    ]
    NATIVE_1048_PARENT_ACTIONS = [
        ("DOC-LIVE-RUNNER-UPGRADE-20261005", "manual_unblock", "Codex", "Claude2"),
        ("SR-LIVE-INVOICE-MAIL-20261007", "manual_unblock", "Claude", "Codex"),
        ("BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025", "planning_decision", "Codex", "Claude2"),
        ("SR-LIVE-GLOBAL-UX-ROLE-READBACK-COMPATIBILITY-20261026", "manual_unblock", "Claude", "Codex"),
    ]

    def native_1048_board(self) -> dict:
        """Compact board for the actual native 10:48 blocked_task_triage: the b93 candidate,
        the four existing helper rows and the four ordinary first-line parents."""
        from control_plane.domain.chair_policy import open_blocker_fingerprint
        self.use_real_agent_config()
        self.config["github_bus"]["repo"] = "ajoe734/drts-fleet-platform"
        b93 = "b93ea337b030ec41e198ab8007418a06eb07efce"
        pr_url = "https://github.com/ajoe734/drts-fleet-platform/pull/3081"
        # Board CI already reconciled to the same-run green rerun, so the record is
        # recovery-ready and admitted past the 8-record window, as natively.
        self.task.update(id="PAX-OPS-PREPARE-ERROR-DIAGNOSTIC-20261026", candidate_sha=b93, ci_sha=b93,
                         ci_status="success",
                         candidate_generation="62efb825eb934848bf16327124af1ba1", pr_url=pr_url,
                         candidate_branch="pi/pax-ops-prepare-error-diagnostic")
        self.task["candidate_review_handoff"] = {k: self.task[k] for k in (
            "owner", "reviewer", "candidate_sha", "candidate_branch", "candidate_generation")}
        def row(task_id, **changes):
            task = {"id": task_id, "title": task_id, "phase": "test", "owner": "Pi", "reviewer": "Codex",
                    "status": "blocked", "task_class": "implementation", "mutates_canonical": True,
                    "depends_on": [], "artifacts": [], "acceptance": [], "waiting_for": "Claude2",
                    "next": "Original blocker."}
            task.update(changes)
            return task
        tasks = [row(task_id, task_class="unblock", helper_parent=parent, helper_kind=kind)
                 for task_id, parent, kind in self.NATIVE_1048_HELPERS]
        tasks += [row(task_id) for task_id, *_ in self.NATIVE_1048_PARENT_ACTIONS]
        tasks.append(self.task)
        blockers = [{"task_id": task["id"], "owner": task["owner"], "waiting_for": task["waiting_for"],
                     "status": "open", "message": f"Original blocker for {task['id']}",
                     "created_at": "2026-10-27T00:00:00Z"} for task in tasks]
        self.board.update(tasks=tasks, blockers=blockers)
        self.path.write_text(json.dumps(self.board))
        fingerprint = open_blocker_fingerprint(blockers, self.task["id"])[0]
        self.action.update(task_id=self.task["id"], candidate_sha=b93, pr_url=pr_url, blocker_fingerprint=fingerprint,
                           candidate_generation=self.task["candidate_generation"])
        self.pr.update(url=pr_url, headRefOid=b93, headRefName=self.task["candidate_branch"])
        self.pr["statusCheckRollup"][0]["detailsUrl"] = \
            "https://github.com/ajoe734/drts-fleet-platform/actions/runs/40589219996/job/12"
        self.run.update(id=40589219996, head_sha=b93, head_branch=self.task["candidate_branch"],
                        pull_requests=[{"number": 3081}])
        return json.loads(json.dumps(self.board))

    def native_1048_payload(self, blocked_by: list) -> dict:
        actions = [self.action] + [
            {"task_id": task_id, "action": "create_unblock_task", "unblock_kind": kind, "target_agent": agent,
             "reviewer": reviewer, "reason": "Parent 非 helper 本身；建立 task-scoped helper 交健康 lane。"}
            for task_id, kind, agent, reviewer in self.NATIVE_1048_PARENT_ACTIONS]
        return {"version": 1, "decision": "operational_review", "approval_ttl_minutes": 45,
                "reason": "blocked_task_triage：b93 CI 恢復；四個一線 parent 建 helper；四個既有 helper 維持 blocked。",
                "blocked_by": blocked_by, "approval_actions": [], "reassignment_actions": [], "task_actions": actions,
                "provider_actions": [], "recommended_focus": []}

    def test_R6_native_1048_helper_dispositions_with_b93_recovery_pass_unchanged(self) -> None:
        snapshot = self.native_1048_board()
        helper_ids = [task_id for task_id, *_ in self.NATIVE_1048_HELPERS]
        selection = supervisor.chair_blocked_task_selection(self.config, snapshot)
        expected = {r["task_id"]: r["action"] for r in selection}
        self.assertEqual(len(selection), 9)
        self.assertTrue(all(expected[task_id] == "create_unblock_task" for task_id in helper_ids))
        task_map = supervisor.task_index_from_status(self.config, snapshot)
        self.assertTrue(all(supervisor.chair_unblock_recursion_guarded(self.config, task_map[task_id], task_map)
                            for task_id in helper_ids))
        payload = self.native_1048_payload(self.NATIVE_1048_HELPER_DEFERRALS)
        self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(self.config, payload, selection, snapshot),
                         set(helper_ids))
        self.assertIsNone(supervisor.validate_chair_review_context(
            payload, reason="blocked_task_triage", approval_state={"pending": []}, config=self.config, status=snapshot))
        effects = self.refresh_side_effects("blocked_task_triage", payload, gh=self.observe)
        state = {task["id"]: task for task in effects["state"]["tasks"]}
        self.assertEqual(effects["reads"], 2)
        self.assertEqual(state[self.task["id"]]["status"], "review")
        self.assertEqual([state[task_id] for task_id in helper_ids],
                         [task for task in snapshot["tasks"] if task["id"] in helper_ids])  # untouched, still blocked
        self.assertEqual(sorted(effects["helpers"]), sorted(
            helper_ids + [f"{task_id}-UNBLOCK-{kind.upper().replace('_', '-')}"
                          for task_id, kind, *_ in self.NATIVE_1048_PARENT_ACTIONS]))  # no helper-of-helper
        self.assertEqual(effects["escalations"], {})
        self.assertIn("chair_parent_resume_applied", effects["rows"])
        self.assertEqual(effects["rows"].count("chair_unblock_task_created"), 4)
        self.assertNotIn("governance_recursion_blocked", effects["rows"])
        self.assertNotIn("chair_review_invalid_schema", effects["rows"])

    def test_R6_native_1048_deferral_format_keeps_anti_abuse_rejections(self) -> None:
        snapshot = self.native_1048_board()
        helper = self.NATIVE_1048_HELPERS[0][0]
        selection = supervisor.chair_blocked_task_selection(self.config, snapshot)
        reason = "自身即 parent 的既有 helper，recursion base-case 禁止再生 helper；不可再建 helper-of-helper。"
        accepted = {"ascii_colon": f"{helper}: {reason}", "full_width_colon": f"{helper}：{reason}",
                    "milestone_label": f"{helper}：卡在 PD-4 與 H3/H4 HOLD，需要既有的人類/治理權責處理。"}
        rejected = {"short_reason": f"{helper}：維持 blocked",
                    "names_other_task": f"{helper}：same reason as SR-DEV-OWNED-OPERATIONAL-FIXTURE-ASSESSMENT-20261010",
                    "names_numbered_task": f"{helper}：wait for RGP-002 and keep the existing helper blocked",
                    "label_prefixed_task": f"{helper}：wait for PD-4-RELEASE and keep the existing helper blocked",
                    "other_separator": f"{helper}；{reason}",
                    "not_first": f"維持 {helper}：{reason}"}
        for kind, entry in {**accepted, **rejected}.items():
            with self.subTest(kind=kind):
                deferred = supervisor.chair_reasoned_deferral_task_ids(
                    self.config, {**self.native_1048_payload([entry])}, selection, snapshot)
                self.assertEqual(deferred, {helper} if kind in accepted else set())
        # Whole-batch rejection stays for a malformed disposition, before any GitHub read or write.
        blocked_by = [rejected["names_other_task"], *self.NATIVE_1048_HELPER_DEFERRALS[1:]]
        payload = self.native_1048_payload(blocked_by)
        self.assertEqual(supervisor.validate_chair_review_context(
            payload, reason="blocked_task_triage", approval_state={"pending": []}, config=self.config, status=snapshot),
            f"blocked_task_triage must resolve blocked tasks via {helper}:create_unblock_task")
        effects = self.refresh_side_effects("blocked_task_triage", payload, gh=self.observe)
        self.assertEqual((effects["reads"], effects["wakes"], effects["unchanged"]), (0, 0, True))
        self.assertEqual(effects["rows"], ["chair_review_invalid_schema"])
        # Outside a mixed recovery batch an ordinary actionable parent is never waived by a
        # well-formed full-width deferral; the protected helpers stay deferrable on their own.
        ordinary = self.NATIVE_1048_PARENT_ACTIONS[0][0]
        payload = self.native_1048_payload(self.NATIVE_1048_HELPER_DEFERRALS + [f"{ordinary}：{reason}"])
        payload["task_actions"] = [a for a in payload["task_actions"]
                                   if a["task_id"] not in {ordinary, self.task["id"]}]
        payload["task_actions"].append({"task_id": self.task["id"], "action": "create_unblock_task",
                                        "reason": "Ordinary helper route for the candidate"})
        self.assertEqual(supervisor.validate_chair_review_context(
            payload, reason="blocked_task_triage", approval_state={"pending": []}, config=self.config, status=snapshot),
            f"blocked_task_triage must resolve blocked tasks via {ordinary}:create_unblock_task")

    ARCHIVE_DEFERRAL = ("ARCHIVE-PARENT: Existing helper is archived and reserved; preserve blocked state until new "
                        "valid resolution evidence is available.")

    def archive_parent_board(self, archived_kind: str | None = None, **changes) -> dict:
        """Ordinary blocked parent whose only prior helper ID is archive-reserved."""
        self.use_real_agent_config()
        parent = {"id": "ARCHIVE-PARENT", "title": "Ordinary parent", "phase": "test", "owner": "Pi",
                  "reviewer": "Codex", "status": "blocked", "task_class": "implementation", "depends_on": [],
                  "artifacts": [], "acceptance": [], "waiting_for": "Claude2", "next": "Original blocker."}
        parent.update(changes)
        kind = archived_kind or supervisor.blocked_task_triage_kind(parent)
        self.board.update(tasks=[parent], archived_task_ids=[supervisor.chair_unblock_task_id(parent["id"], kind)],
                          blockers=[{"task_id": parent["id"], "owner": "Pi", "waiting_for": "Claude2",
                                     "status": "open", "message": "Original blocker",
                                     "created_at": "2026-10-27T00:00:00Z"}])
        self.path.write_text(json.dumps(self.board))
        return json.loads(json.dumps(self.board))

    def triage_payload(self, blocked_by: list, actions: list | None = None) -> dict:
        return {"version": 1, "decision": "blocked_task_triage", "approval_ttl_minutes": 45,
                "reason": "Archived helper stays reserved.", "blocked_by": blocked_by, "approval_actions": [],
                "reassignment_actions": [], "task_actions": actions or [], "provider_actions": [],
                "recommended_focus": []}

    def triage_verdict(self, snapshot: dict, blocked_by: list, actions: list | None = None) -> str | None:
        return supervisor.validate_chair_review_context(
            self.triage_payload(blocked_by, actions), reason="blocked_task_triage",
            approval_state={"pending": []}, config=self.config, status=snapshot)

    def test_R6_archive_reserved_helper_parent_defers_without_recreate_or_resume(self) -> None:
        snapshot = self.archive_parent_board()
        selection = supervisor.chair_blocked_task_selection(self.config, snapshot)
        self.assertEqual([(r["task_id"], r["action"]) for r in selection], [("ARCHIVE-PARENT", "create_unblock_task")])
        # The real creator refuses the selected action: the stable helper ID is archive-reserved.
        before = self.path.read_bytes(); state: dict = {}
        self.assertFalse(supervisor.create_chair_unblock_task(
            self.config, state, {"task_id": "ARCHIVE-PARENT", "reason": "route"}, {}))
        self.assertEqual((self.path.read_bytes(), state, self.runtime_rows()), (before, {}, []))
        # A specific reasoned deferral is eligible; nothing else is waived.
        self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(
            self.config, {"blocked_by": [self.ARCHIVE_DEFERRAL]}, selection, snapshot), {"ARCHIVE-PARENT"})
        self.assertIsNone(self.triage_verdict(snapshot, [self.ARCHIVE_DEFERRAL]))
        missing = "blocked_task_triage must resolve blocked tasks via ARCHIVE-PARENT:create_unblock_task"
        for kind, blocked_by in {"no_disposition": [], "id_only": ["ARCHIVE-PARENT"],
                                 "short_reason": ["ARCHIVE-PARENT: archived"],
                                 "names_other_task": ["ARCHIVE-PARENT: same as ARCHIVE-PARENT-UNBLOCK-MANUAL-UNBLOCK "
                                                      "which is archived, keep it blocked"]}.items():
            with self.subTest(kind=kind):
                self.assertEqual(self.triage_verdict(snapshot, blocked_by), missing)
        # Full refresh: the parent stays blocked, the archived ID is not recreated, nothing resumes.
        effects = self.refresh_side_effects("blocked_task_triage", self.triage_payload([self.ARCHIVE_DEFERRAL]))
        self.assertEqual((effects["reads"], effects["wakes"], effects["helpers"]), (0, 0, []))
        self.assertTrue(effects["unchanged"])
        self.assertEqual(effects["rows"], ["chair_review_applied"])
        self.assertEqual(effects["state"]["tasks"][0]["status"], "blocked")
        self.assertFalse(effects["board_log"])
        # reassignment_triage synthesizes no doomed helper for the deferred parent.
        normalized = supervisor.normalize_chair_review_payload_for_reason(
            {**self.triage_payload([self.ARCHIVE_DEFERRAL]), "decision": "reassignment_triage"},
            reason="reassignment_triage", config=self.config, status=snapshot)
        self.assertEqual(normalized["task_actions"], [])

    def test_R6_unreserved_helper_route_and_structural_selection_controls(self) -> None:
        missing = "blocked_task_triage must resolve blocked tasks via ARCHIVE-PARENT:create_unblock_task"
        # Another kind archived: the default helper is still creatable, so the parent stays actionable.
        snapshot = self.archive_parent_board(archived_kind="history_repair")
        self.assertNotEqual(supervisor.blocked_task_triage_kind(snapshot["tasks"][0]), "history_repair")
        self.assertEqual(self.triage_verdict(snapshot, [self.ARCHIVE_DEFERRAL]), missing)
        self.assertIsNone(self.triage_verdict(snapshot, [], [{"task_id": "ARCHIVE-PARENT",
                                                              "action": "create_unblock_task", "reason": "route"}]))
        self.assertTrue(supervisor.create_chair_unblock_task(
            self.config, {}, {"task_id": "ARCHIVE-PARENT", "reason": "route"}, {}))
        self.assertIn("ARCHIVE-PARENT-UNBLOCK-MANUAL-UNBLOCK", [t["id"] for t in json.loads(self.path.read_text())["tasks"]])
        # Nothing archived: ordinary actionable enforcement is unchanged.
        snapshot = self.archive_parent_board(); snapshot["archived_task_ids"] = []
        self.assertEqual(self.triage_verdict(snapshot, [self.ARCHIVE_DEFERRAL]), missing)
        helper_row = {"title": "Helper", "phase": "test", "owner": "Codex", "reviewer": "Claude",
                      "task_class": "unblock", "helper_parent": "ARCHIVE-PARENT", "helper_kind": "manual_unblock",
                      "depends_on": [], "artifacts": [], "acceptance": [], "next": "Helper work"}
        controls = {
            # Existing open helper: wait_for_unblock_task, out of the required-action selection.
            "open_helper": ({"tasks_extra": [{**helper_row, "id": "ARCHIVE-PARENT-UNBLOCK-MANUAL-UNBLOCK",
                                              "status": "in_progress"}], "archive": False}, None),
            # Completed helper with a verifiable resolution: the existing resume route is still
            # required, never a deferral (its ID is reserved, but the action is not create_unblock_task).
            "completed_helper": ({"tasks_extra": [{**helper_row, "id": "ARCHIVE-PARENT-UNBLOCK-MANUAL-UNBLOCK",
                                                   "status": "done", "resolved_parent_status": "in_progress",
                                                   "resolved_parent_at": "2026-10-27T01:00:00Z"}],
                                  "archive": False},
                                 "blocked_task_triage must resolve blocked tasks via ARCHIVE-PARENT:resume_parent_task"),
            # Completed helper without a resolution clock: advisory wait, out of the selection.
            "unverified_completed_helper": ({"tasks_extra": [{**helper_row, "status": "done",
                                                              "id": "ARCHIVE-PARENT-UNBLOCK-MANUAL-UNBLOCK"}],
                                             "archive": False}, None),
            # Delivery HOLD / external gate: wait_for_parent_resolution, out of the selection.
            "hold": ({"parent": {"external_gate": True}}, None),
            # Dependency not done: not dependency-ready, out of the selection.
            "dependency": ({"parent": {"depends_on": ["DEP-OPEN"]},
                            "tasks_extra": [{**helper_row, "id": "DEP-OPEN", "task_class": "implementation",
                                             "helper_parent": "", "helper_kind": "", "status": "in_progress"}]}, None),
        }
        for kind, (spec, expected) in controls.items():
            with self.subTest(control=kind):
                snapshot = self.archive_parent_board(**spec.get("parent", {}))
                if spec.get("archive") is False:
                    snapshot["archived_task_ids"] = []
                snapshot["tasks"] += spec.get("tasks_extra", [])
                self.path.write_text(json.dumps(snapshot)); self.board = json.loads(json.dumps(snapshot))
                self.assertEqual(self.triage_verdict(snapshot, [self.ARCHIVE_DEFERRAL]), expected)
                if kind == "completed_helper":
                    selection = supervisor.chair_blocked_task_selection(self.config, snapshot)
                    self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(
                        self.config, {"blocked_by": [self.ARCHIVE_DEFERRAL]}, selection, snapshot), set())
                if kind in {"hold", "dependency"}:
                    before = self.path.read_bytes()
                    self.assertFalse(supervisor.create_chair_unblock_task(
                        self.config, {}, {"task_id": "ARCHIVE-PARENT", "reason": "route"}, {}))
                    self.assertEqual(self.path.read_bytes(), before)
        # Lineage depth: a helper-of-helper parent is recursion guarded and escalates, never nests.
        snapshot = self.archive_parent_board(task_class="unblock", helper_parent="ROOT-PARENT",
                                             helper_kind="manual_unblock")
        snapshot["archived_task_ids"] = []; self.path.write_text(json.dumps(snapshot))
        self.assertIsNone(self.triage_verdict(snapshot, [self.ARCHIVE_DEFERRAL]))
        state: dict = {}
        self.assertFalse(supervisor.create_chair_unblock_task(
            self.config, state, {"task_id": "ARCHIVE-PARENT", "reason": "route"}, {}))
        self.assertIn("ARCHIVE-PARENT", state["governance_escalations"])


class SupervisorMergedAcceptanceResumeTests(unittest.TestCase):
    """Supervisor-authority merged-acceptance resume through the real board writer."""

    def setUp(self) -> None:
        import copy
        import os
        from test_ai_status import MERGED_BLOCKED_ACCEPTANCE_TASK, ai_status as board_commands

        self.tmp = tempfile.TemporaryDirectory(prefix="merged-acceptance-native-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.task = copy.deepcopy(MERGED_BLOCKED_ACCEPTANCE_TASK)
        self.board = board_commands.default_state()
        self.board.update({"tasks": [self.task], "agents": [], "handoffs": [], "blockers": [{
            "task_id": self.task["id"], "owner": "Claude", "waiting_for": "Codex", "status": "open",
            "message": "Runtime evidence blocker", "created_at": "2026-10-27T00:00:00Z",
        }]})
        self.path = self.root / "ai-status.json"
        self.path.write_text(json.dumps(self.board))
        self.runtime_log = self.root / "runtime-log.jsonl"
        self.board_log = self.root / "ai-activity-log.jsonl"
        self.config = {"paths": {"status_file": str(self.path), "activity_log": str(self.runtime_log)},
                       "github_bus": {"repo": "acme/fleet"}}
        mock.patch.dict(os.environ, {"ORCH_STATUS_ROOT": str(self.root), "AI_STATUS_ROOT": str(self.root)}, clear=True).start()
        self.addCleanup(mock.patch.stopall)

    def assert_untouched(self, before: bytes) -> None:
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(self.runtime_log.exists(), "rejected resume wrote a Supervisor activity log")
        self.assertFalse(self.board_log.exists(), "rejected resume wrote a board activity log")

    def test_supervisor_route_restores_acceptance_without_github_or_identity_change(self) -> None:
        import copy
        import github_bus
        before = copy.deepcopy(self.task)
        with mock.patch.object(github_bus, "gh_json") as reads, \
                mock.patch.object(supervisor, "queue_delivery_event") as wake:
            self.assertTrue(supervisor.apply_supervisor_merged_acceptance_resume(
                self.config, self.task["id"], "Runtime evidence exists for the original keys"))
        reads.assert_not_called()
        wake.assert_not_called()
        state = json.loads(self.path.read_text()); task = state["tasks"][0]
        self.assertEqual(task["status"], "acceptance")
        for key in ("owner", "reviewer", "candidate_sha", "candidate_generation", "candidate_branch",
                    "reviewed_sha", "ci_sha", "ci_status", "merge_sha", "required_acceptance"):
            self.assertEqual(task[key], before[key])
        self.assertNotIn("acceptance_evidence", task)
        self.assertEqual(len(state["tasks"]), 1)
        self.assertEqual([row["status"] for row in state["blockers"]], ["resolved"])
        rows = [json.loads(line) for line in self.runtime_log.read_text().splitlines()]
        self.assertEqual([(row["type"], row["resume_basis"], row["merge_sha"]) for row in rows],
                         [("supervisor_merged_acceptance_resumed", "merged_runtime_acceptance_ready", before["merge_sha"])])
        # Second call is a no-op: the task is no longer blocked.
        snapshot = self.path.read_bytes()
        self.assertFalse(supervisor.apply_supervisor_merged_acceptance_resume(self.config, self.task["id"], "Again"))
        self.assertEqual(self.path.read_bytes(), snapshot)

    def test_ineligible_or_gated_tasks_stay_blocked_without_residue(self) -> None:
        import copy
        second = {"task_id": self.task["id"], "owner": "Claude", "waiting_for": "Codex", "status": "open",
                  "message": "Second blocker", "created_at": "2026-10-27T01:00:00Z"}
        dependency = {"id": "DEP-A", "title": "Dependency", "phase": "test", "owner": "Codex", "reviewer": "Claude",
                      "status": "in_progress", "depends_on": [], "artifacts": [], "acceptance": [], "next": "Open"}
        cases = {
            "unmerged": {"merge_sha": None}, "ci_red": {"ci_status": "failure"}, "ci_pending": {"ci_status": "queued"},
            "no_review": {"reviewed_sha": None}, "self_review": {"reviewer": "Claude"},
            "external_gate": {"external_gate": True}, "release_gate": {"task_class": "release", "mutates_canonical": False},
            "evidence_complete": {"acceptance_evidence": {key: "ref" for key in self.task["required_acceptance"]}},
            "done": {"status": "done"}, "in_progress": {"status": "in_progress"},
        }
        for kind, changes in [*cases.items(), ("second_blocker", None), ("dependency", None), ("empty_reason", None)]:
            with self.subTest(kind=kind):
                board = copy.deepcopy(self.board)
                if changes:
                    board["tasks"][0].update(changes)
                    board["tasks"][0] = {k: v for k, v in board["tasks"][0].items() if v is not None}
                if kind == "second_blocker":
                    board["blockers"].append(second)
                if kind == "dependency":
                    board["tasks"][0]["depends_on"] = ["DEP-A"]; board["tasks"].append(dependency)
                self.path.write_text(json.dumps(board)); before = self.path.read_bytes()
                reason = "" if kind == "empty_reason" else "Runtime evidence exists"
                self.assertFalse(supervisor.apply_supervisor_merged_acceptance_resume(self.config, self.task["id"], reason))
                self.assert_untouched(before)

    def test_routes_stay_separate_from_candidate_ci_recovery(self) -> None:
        # A merged task has no CI-recovery route; a CI-recovery task has no merged-acceptance route.
        self.assertIsNone(supervisor.candidate_ci_recovery_context(self.board, self.task))
        self.assertIsNotNone(supervisor.merged_acceptance_resume_context(self.board, self.task))
        ci_task = {key: value for key, value in self.task.items() if key not in ("reviewed_sha", "merge_sha")}
        ci_task.update(ci_status="failure", pr_url="https://github.com/acme/fleet/pull/31",
                       candidate_review_handoff={k: self.task[k] for k in (
                           "owner", "reviewer", "candidate_sha", "candidate_branch", "candidate_generation")})
        self.assertIsNone(supervisor.merged_acceptance_resume_context(self.board, ci_task))
        self.assertIsNotNone(supervisor.candidate_ci_recovery_context(self.board, ci_task))

    def chair_action(self, board: dict | None = None, **changes) -> dict:
        from control_plane.domain.chair_policy import open_blocker_fingerprint

        board = board or self.board
        action = {"task_id": self.task["id"], "action": "resume_parent_task", "resume_status": "acceptance",
                  "resume_basis": "merged_runtime_acceptance_ready", "candidate_sha": self.task["candidate_sha"],
                  "candidate_generation": self.task["candidate_generation"], "merge_sha": self.task["merge_sha"],
                  "candidate_branch": self.task["candidate_branch"], "owner": self.task["owner"],
                  "reviewer": self.task["reviewer"], "required_acceptance": list(self.task["required_acceptance"]),
                  "depends_on": list(self.task["depends_on"]),
                  "blocker_fingerprint": open_blocker_fingerprint(board["blockers"], self.task["id"])[0],
                  "reason": "Chair confirmed the runtime evidence blocker is the only remaining one"}
        action.update(changes)
        return action

    def chair_payload(self, *actions: dict, reason: str = "blocked_task_triage") -> dict:
        return {"version": 1, "decision": reason, "approval_ttl_minutes": 45, "reason": "r", "blocked_by": [],
                "approval_actions": [], "reassignment_actions": [], "task_actions": list(actions),
                "provider_actions": [], "recommended_focus": [self.task["id"]]}

    def run_native_chair_review(self, payload: dict, reason: str = "blocked_task_triage") -> tuple[str | None, bool]:
        """The Supervisor's own Chair output path: schema, reason normalization,
        context validation, then the normal task-action dispatcher."""
        status = supervisor.load_status(self.config)
        payload = supervisor.normalize_chair_review_payload_for_reason(payload, reason=reason, config=self.config, status=status)
        error = supervisor.validate_chair_review_payload(payload) or supervisor.validate_chair_review_context(
            payload, reason=reason, approval_state={"pending": []}, config=self.config, status=status)
        if error:
            return error, False
        return None, supervisor.apply_chair_task_actions(self.config, {}, payload, {})

    def test_existing_chair_merged_acceptance_normal_action_reaches_same_gateway_and_protected_controls(self) -> None:
        import copy
        import github_bus

        # The Chair context shows the existing structural eligibility; the prompt names the route.
        records = supervisor.dependency_ready_blocked_task_records(self.config, self.board)
        merged = records[0]["merged_acceptance_resume"]
        action = self.chair_action()
        self.assertEqual((merged["identity"]["merge_sha"], merged["blocker_fingerprint"]),
                         (self.task["merge_sha"], action["blocker_fingerprint"]))
        message = supervisor.build_chair_review_message(
            self.config, reason="blocked_task_triage", markdown_path=self.root / "d.md", json_path=self.root / "d.json",
            approval_state={"pending": [], "history": []}, state={}, provider_report={}, status=self.board)
        self.assertIn(f"merged_acceptance=eligible candidate_sha={self.task['candidate_sha']} "
                      f"candidate_generation={self.task['candidate_generation']} merge_sha={self.task['merge_sha']} "
                      f"candidate_branch={self.task['candidate_branch']} owner={self.task['owner']} "
                      f"reviewer={self.task['reviewer']} "
                      f"required_acceptance={'|'.join(self.task['required_acceptance'])} depends_on=- "
                      f"blocker_fingerprint={action['blocker_fingerprint']} open_blockers=1", message)
        self.assertIn("resume_basis=merged_runtime_acceptance_ready", message)
        self.assertNotIn("ci_recovery=eligible candidate_sha=", message)
        # The hard-rule prose names open_blockers=1 as the case requiring the
        # Chair to confirm the blocker is the sole remaining one.
        self.assertIn("若 `open_blockers=1`，你必須實際確認那一個 open blocker 是唯一剩餘阻礙", message)

        # Protected controls first: each stale/forged/malformed decision leaves no residue.
        before = self.path.read_bytes()
        drifts = {
            "stale_candidate_sha": ({"candidate_sha": "f" * 40}, None),
            "stale_generation": ({"candidate_generation": "other-generation"}, None),
            "stale_merge_sha": ({"merge_sha": "e" * 40}, None),
            "stale_fingerprint": ({"blocker_fingerprint": "0" * 64}, None),
            "stale_branch": ({"candidate_branch": "claude/some-other-branch"}, None),
            "stale_owner": ({"owner": "Gemini"}, None),
            "stale_reviewer": ({"reviewer": "Gemini2"}, None),
            "stale_required_acceptance": ({"required_acceptance": ["a different key"]}, None),
            "stale_depends_on": ({"depends_on": ["SOME-OTHER-DEP"]}, None),
            "wrong_status": ({"resume_status": "in_progress"}, "merged acceptance resume only resumes acceptance"),
            "helper": ({"helper_task_id": "UNBLOCK-1"}, "merged acceptance resume must not name an unblock helper"),
            "pr_url": ({"pr_url": "https://github.com/acme/fleet/pull/31"},
                       "merged acceptance resume has unexpected fields: pr_url"),
            "wrong_basis": ({"resume_basis": "merged_ready", "resume_status": None},
                            "task_actions resume_basis is only candidate_ci_recovered or "
                            "merged_runtime_acceptance_ready for resume_parent_task"),
        }
        for kind, (changes, schema_error) in drifts.items():
            with self.subTest(kind=kind):
                drifted = {k: v for k, v in {**action, **changes}.items() if v is not None}
                error, changed = self.run_native_chair_review(self.chair_payload(drifted))
                self.assertEqual(error, schema_error)
                self.assertFalse(changed)
                # Even an unvalidated decision cannot pass the dispatcher alone.
                self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, drifted))
                self.assert_untouched(before)

        # Stale switch: the board changes after the Chair-bound check but before the
        # gateway's re-read; the observed tuple binds the gateway, so nothing applies.
        swapped = copy.deepcopy(self.board)
        swapped["blockers"][0]["message"] = "A different runtime blocker"
        real_load = supervisor.load_status
        calls = []

        def load_then_swap(config):
            calls.append(1)
            if len(calls) == 2:
                self.path.write_text(json.dumps(swapped))
            return real_load(config)

        with mock.patch.object(supervisor, "load_status", side_effect=load_then_swap):
            self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, action))
        self.assertEqual(len(calls), 2)
        self.assert_untouched(json.dumps(swapped).encode())
        self.path.write_bytes(before)

        # The matching decision reaches the same existing gateway and its locked transition.
        before_task = copy.deepcopy(self.task)
        gateway = supervisor.apply_supervisor_merged_acceptance_resume
        with mock.patch.object(github_bus, "gh_json") as reads, \
                mock.patch.object(supervisor, "queue_delivery_event") as wake, \
                mock.patch.object(supervisor, "apply_supervisor_merged_acceptance_resume", wraps=gateway) as spy:
            error, changed = self.run_native_chair_review(self.chair_payload(action))
        self.assertIsNone(error)
        self.assertTrue(changed)
        spy.assert_called_once_with(self.config, self.task["id"], action["reason"], chair_observation={
            key: action[key] for key in (
                "candidate_sha", "candidate_generation", "merge_sha", "candidate_branch", "owner", "reviewer",
                "blocker_fingerprint", "required_acceptance", "depends_on")})
        reads.assert_not_called()
        wake.assert_not_called()
        state = json.loads(self.path.read_text()); task = state["tasks"][0]
        self.assertEqual(task["status"], "acceptance")
        for key in ("owner", "reviewer", "candidate_sha", "candidate_generation", "candidate_branch",
                    "reviewed_sha", "ci_sha", "ci_status", "merge_sha", "required_acceptance"):
            self.assertEqual(task[key], before_task[key])
        self.assertNotIn("acceptance_evidence", task)
        self.assertEqual(len(state["tasks"]), 1)
        self.assertEqual([row["status"] for row in state["blockers"]], ["resolved"])
        rows = [json.loads(line) for line in self.runtime_log.read_text().splitlines()]
        self.assertEqual([(row["type"], row["resume_basis"]) for row in rows],
                         [("supervisor_merged_acceptance_resumed", "merged_runtime_acceptance_ready")])
        # Replaying the same decision is a no-op: the task is no longer blocked.
        snapshot = self.path.read_bytes()
        self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, action))
        self.assertEqual(self.path.read_bytes(), snapshot)

    def test_explicit_merged_decision_replaces_helper_route(self) -> None:
        for reason in ("blocked_task_triage", "reassignment_triage"):
            with self.subTest(reason=reason):
                status = supervisor.load_status(self.config)
                explicit = supervisor.normalize_chair_review_payload_for_reason(
                    self.chair_payload(self.chair_action(), reason=reason), reason=reason, config=self.config, status=status)
                self.assertEqual([a["action"] for a in explicit["task_actions"]], ["resume_parent_task"])
                self.assertIsNone(supervisor.validate_chair_review_context(
                    explicit, reason=reason, approval_state={"pending": []}, config=self.config, status=status))
                # Without the explicit decision the existing helper route is unchanged.
                plain = supervisor.normalize_chair_review_payload_for_reason(
                    self.chair_payload(reason=reason), reason=reason, config=self.config, status=status)
                if reason == "reassignment_triage":
                    self.assertEqual([a["action"] for a in plain["task_actions"]], ["create_unblock_task"])
                else:
                    self.assertIn(f"{self.task['id']}:create_unblock_task", supervisor.validate_chair_review_context(
                        plain, reason=reason, approval_state={"pending": []}, config=self.config, status=status) or "")
        # A task no longer eligible still requires its helper route when the Chair
        # made no explicit decision; an explicit (now stale) one is not overridden.
        ineligible = json.loads(json.dumps(self.board))
        ineligible["tasks"][0].pop("merge_sha")
        self.assertIsNone(supervisor.dependency_ready_blocked_task_records(self.config, ineligible)[0]["merged_acceptance_resume"])
        self.assertIn(f"{self.task['id']}:create_unblock_task", supervisor.validate_chair_review_context(
            self.chair_payload(), reason="blocked_task_triage", approval_state={"pending": []},
            config=self.config, status=ineligible) or "")
        self.assertIsNone(supervisor.validate_chair_review_context(
            self.chair_payload(self.chair_action()), reason="blocked_task_triage", approval_state={"pending": []},
            config=self.config, status=ineligible))

    def r3_stale_boards(self) -> dict[str, dict]:
        """Boards re-read after the Chair saw an eligible task; each makes the
        fresh merged-acceptance context None while the task stays blocked."""
        import copy
        boards = {}
        for kind, changes in {
            "second_open_blocker": None, "merge_sha_cleared": {"merge_sha": None},
            "ci_red": {"ci_status": "failure"}, "review_missing_self_review": {"reviewer": self.task["owner"]},
            "evidence_recorded": {"acceptance_evidence": {key: "ref" for key in self.task["required_acceptance"]}},
        }.items():
            board = copy.deepcopy(self.board)
            if changes is None:
                board["blockers"].append({"task_id": self.task["id"], "owner": "Claude", "waiting_for": "Codex",
                                          "status": "open", "message": "Second blocker",
                                          "created_at": "2026-10-27T01:00:00Z"})
            else:
                board["tasks"][0].update(changes)
                board["tasks"][0] = {k: v for k, v in board["tasks"][0].items() if v is not None}
            boards[kind] = board
        return boards

    def test_r3_stale_explicit_merged_resume_never_synthesizes_helper(self) -> None:
        explicit = self.chair_action()  # what the Chair saw: eligible, one open blocker
        self.assertIsNotNone(supervisor.merged_acceptance_resume_context(self.board, self.task))
        for kind, board in self.r3_stale_boards().items():
            for reason in ("reassignment_triage", "blocked_task_triage"):
                with self.subTest(kind=kind, reason=reason):
                    self.path.write_text(json.dumps(board)); before = self.path.read_bytes()
                    status = supervisor.load_status(self.config)
                    # Step 1: the fresh context really is gone.
                    self.assertIsNone(supervisor.merged_acceptance_resume_context(status, status["tasks"][0]))
                    # Step 2: the explicit decision is kept; no helper is synthesized or required.
                    normalized = supervisor.normalize_chair_review_payload_for_reason(
                        self.chair_payload(explicit, reason=reason), reason=reason, config=self.config, status=status)
                    self.assertEqual(normalized["task_actions"], [explicit])
                    self.assertEqual(supervisor.synthesize_reassignment_followup_task_actions(
                        self.config, self.chair_payload(explicit, reason=reason), status), [])
                    with mock.patch.object(supervisor, "queue_delivery_event") as wake:
                        error, changed = self.run_native_chair_review(self.chair_payload(explicit, reason=reason), reason)
                    self.assertIsNone(error)
                    self.assertFalse(changed)
                    wake.assert_not_called()
                    self.assert_untouched(before)
                    # The ordinary no-explicit helper route is unchanged.
                    plain = supervisor.normalize_chair_review_payload_for_reason(
                        self.chair_payload(reason=reason), reason=reason, config=self.config, status=status)
                    if reason == "reassignment_triage":
                        self.assertEqual([a["action"] for a in plain["task_actions"]], ["create_unblock_task"])
                    else:
                        self.assertIn(f"{self.task['id']}:create_unblock_task", supervisor.validate_chair_review_context(
                            plain, reason=reason, approval_state={"pending": []}, config=self.config, status=status) or "")

    def test_r3_gateway_freshness_still_rejects_the_same_stale_boards(self) -> None:
        explicit = self.chair_action()
        for kind, board in self.r3_stale_boards().items():
            with self.subTest(kind=kind):
                self.path.write_text(json.dumps(board)); before = self.path.read_bytes()
                with mock.patch.object(supervisor, "queue_delivery_event") as wake:
                    self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, explicit))
                    self.assertFalse(supervisor.apply_supervisor_merged_acceptance_resume(
                        self.config, self.task["id"], "stale Chair decision"))
                wake.assert_not_called()
                self.assert_untouched(before)

    def zero_open_board(self) -> dict:
        """The original blocker kept as resolved history; an unrelated sibling keeps its open blocker."""
        import copy
        board = copy.deepcopy(self.board)
        board["blockers"][0].update(status="resolved", resolved_at="2026-10-28T00:00:00Z")
        board["blockers"].append({"task_id": "SIBLING-TASK", "owner": "Codex", "waiting_for": "Claude",
                                  "status": "open", "message": "Unrelated sibling blocker",
                                  "created_at": "2026-10-27T02:00:00Z"})
        return board

    def test_existing_zero_open_merged_chair_resume_preserves_frozen_snapshot_and_one_open_controls(self) -> None:
        import copy
        import github_bus
        from test_ai_status import EMPTY_OPEN_BLOCKER_FINGERPRINT

        zero = self.zero_open_board()
        self.path.write_text(json.dumps(zero)); before = self.path.read_bytes()
        context = supervisor.merged_acceptance_resume_context(zero, zero["tasks"][0])
        self.assertIsNotNone(context)
        self.assertEqual(context["blocker_fingerprint"], EMPTY_OPEN_BLOCKER_FINGERPRINT)
        # The unmerged CI-recovery route keeps its exactly-one contract.
        ci_task = {key: value for key, value in self.task.items() if key not in ("reviewed_sha", "merge_sha")}
        ci_task.update(ci_status="success", pr_url="https://github.com/acme/fleet/pull/31",
                       candidate_review_handoff={k: self.task[k] for k in (
                           "owner", "reviewer", "candidate_sha", "candidate_branch", "candidate_generation")})
        self.assertIsNotNone(supervisor.candidate_ci_recovery_context(self.board, ci_task))
        self.assertIsNone(supervisor.candidate_ci_recovery_context(zero, ci_task))
        # The prompt shows the same nine observations, with the exact empty-set fingerprint.
        message = supervisor.build_chair_review_message(
            self.config, reason="blocked_task_triage", markdown_path=self.root / "d.md", json_path=self.root / "d.json",
            approval_state={"pending": [], "history": []}, state={}, provider_report={}, status=zero)
        self.assertIn(f"merged_acceptance=eligible candidate_sha={self.task['candidate_sha']} ", message)
        self.assertIn(f"blocker_fingerprint={EMPTY_OPEN_BLOCKER_FINGERPRINT} open_blockers=0", message)
        # The hard-rule prose must not tell the Chair this zero-open row needs
        # a blocker to confirm: the eligible row and its own instructions must
        # not contradict (reopen finding F1). Covers the actual generated
        # text, not just the eligibility/fingerprint context dict.
        self.assertNotIn("剛好一個 open blocker、已獨立 review、同 SHA own CI 成功、已 merge", message)
        self.assertIn("若 `open_blockers=0`，代表這個已 merge 的任務目前沒有任何 open blocker", message)
        self.assertIn("不需要、也不要去確認或捏造一個不存在的 blocker", message)
        action = self.chair_action(zero)
        self.assertEqual(action["blocker_fingerprint"], EMPTY_OPEN_BLOCKER_FINGERPRINT)

        # Stale zero/one observations and absent/blank/forged fingerprints leave no residue.
        one_action = self.chair_action(self.board)
        stale = {
            "one_open_observed_now_zero": one_action,
            "blank_fingerprint": {**action, "blocker_fingerprint": ""},
            "forged_fingerprint": {**action, "blocker_fingerprint": "0" * 64},
            "absent_fingerprint": {k: v for k, v in action.items() if k != "blocker_fingerprint"},
            "stale_merge_sha": {**action, "merge_sha": "e" * 40},
            "stale_owner": {**action, "owner": "Gemini"},
        }
        for kind, drifted in stale.items():
            with self.subTest(kind=kind):
                _, changed = self.run_native_chair_review(self.chair_payload(drifted))
                self.assertFalse(changed)
                self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, drifted))
                self.assert_untouched(before)
        # Zero observed, then one open blocker appears before the board write.
        one_now = copy.deepcopy(self.board)
        self.path.write_text(json.dumps(one_now)); one_before = self.path.read_bytes()
        _, changed = self.run_native_chair_review(self.chair_payload(action))
        self.assertFalse(changed)
        self.assert_untouched(one_before)
        # Zero-to-one and one-to-zero between the Chair-bound check and the gateway's re-read.
        real_load = supervisor.load_status
        for kind, (start, swapped, decision) in {
            "zero_to_one_at_gateway_reread": (zero, self.board, action),
            "one_to_zero_at_gateway_reread": (self.board, zero, one_action),
        }.items():
            with self.subTest(kind=kind):
                self.path.write_text(json.dumps(start))
                calls = []

                def load_then_swap(config, swapped=swapped):
                    calls.append(1)
                    if len(calls) == 2:
                        self.path.write_text(json.dumps(swapped))
                    return real_load(config)

                with mock.patch.object(supervisor, "load_status", side_effect=load_then_swap):
                    self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, decision))
                self.assertEqual(len(calls), 2)
                self.assert_untouched(json.dumps(swapped).encode())
        # Zero-to-one at the board's own locked reread: the gateway's observation goes stale under lock.
        self.path.write_bytes(before)
        real_run = supervisor.run_task_board_command

        def add_blocker_then_run(config, command, args, environ):
            board = json.loads(self.path.read_text())
            board["blockers"].append({**self.board["blockers"][0], "message": "Added under lock"})
            self.path.write_text(json.dumps(board))
            return real_run(config, command, args, environ=environ)

        with mock.patch.object(supervisor, "run_task_board_command", side_effect=add_blocker_then_run):
            self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, action))
        locked_board = json.loads(self.path.read_text())
        self.assertEqual(locked_board["tasks"][0]["status"], "blocked")
        self.assertFalse(self.runtime_log.exists())
        self.assertFalse(self.board_log.exists())

        # The fresh zero-open decision reaches the same gateway and its locked transition.
        self.path.write_bytes(before)
        gateway = supervisor.apply_supervisor_merged_acceptance_resume
        with mock.patch.object(github_bus, "gh_json") as reads, \
                mock.patch.object(supervisor, "queue_delivery_event") as wake, \
                mock.patch.object(supervisor, "apply_supervisor_merged_acceptance_resume", wraps=gateway) as spy:
            error, changed = self.run_native_chair_review(self.chair_payload(action))
        self.assertIsNone(error)
        self.assertTrue(changed)
        spy.assert_called_once_with(self.config, self.task["id"], action["reason"], chair_observation={
            key: action[key] for key in supervisor.MERGED_ACCEPTANCE_OBSERVATION_KEYS})
        reads.assert_not_called()
        wake.assert_not_called()
        state = json.loads(self.path.read_text()); task = state["tasks"][0]
        self.assertEqual(task["status"], "acceptance")
        for key in ("owner", "reviewer", "candidate_sha", "candidate_generation", "candidate_branch",
                    "reviewed_sha", "ci_sha", "ci_status", "merge_sha", "required_acceptance", "depends_on"):
            self.assertEqual(task[key], self.task[key])
        self.assertNotIn("acceptance_evidence", task)
        self.assertEqual(len(state["tasks"]), 1)  # no helper
        self.assertEqual(state["blockers"], zero["blockers"])  # history and sibling untouched
        rows = [json.loads(line) for line in self.runtime_log.read_text().splitlines()]
        self.assertEqual([(row["type"], row["merge_sha"]) for row in rows],
                         [("supervisor_merged_acceptance_resumed", self.task["merge_sha"])])
        snapshot = self.path.read_bytes()
        self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, action))
        self.assertEqual(self.path.read_bytes(), snapshot)

    def test_zero_open_merged_tasks_keep_every_other_gate_without_residue(self) -> None:
        import copy
        dependency = {"id": "DEP-A", "title": "Dependency", "phase": "test", "owner": "Codex", "reviewer": "Claude",
                      "status": "in_progress", "depends_on": [], "artifacts": [], "acceptance": [], "next": "Open"}
        helper = {"id": "UNBLOCK-A", "title": "Helper", "phase": "test", "owner": "Codex", "reviewer": "Claude2",
                  "status": "in_progress", "depends_on": [], "artifacts": [], "acceptance": [], "next": "Open",
                  "task_class": "unblock", "helper_parent": self.task["id"], "helper_kind": "manual_unblock"}
        cases = {
            "unmerged": {"merge_sha": None}, "short_merge_sha": {"merge_sha": "2f16b4f"},
            "ci_red": {"ci_status": "failure"}, "ci_pending": {"ci_status": "queued"},
            "ci_other_sha": {"ci_sha": "1" * 40}, "no_review": {"reviewed_sha": None},
            "review_other_sha": {"reviewed_sha": "1" * 40}, "self_review": {"reviewer": "Claude"},
            "external_gate": {"external_gate": True}, "release_gate": {"task_class": "release", "mutates_canonical": False},
            "noncanonical": {"mutates_canonical": False},
            "evidence_complete": {"acceptance_evidence": {key: "ref" for key in self.task["required_acceptance"]}},
            "no_required_keys": {"required_acceptance": []},
            "acceptance_review_request": {"acceptance_review_request": {"state": "pending"}},
            "in_progress": {"status": "in_progress"}, "done": {"status": "done"},
        }
        for kind in [*cases, "two_open", "dependency", "open_helper", "empty_reason"]:
            with self.subTest(kind=kind):
                board = self.zero_open_board()
                if kind in cases:
                    board["tasks"][0].update(cases[kind])
                    board["tasks"][0] = {k: v for k, v in board["tasks"][0].items() if v is not None}
                if kind == "two_open":
                    board["blockers"] += [{**self.board["blockers"][0], "message": f"Open {i}"} for i in range(2)]
                if kind == "dependency":
                    board["tasks"][0]["depends_on"] = ["DEP-A"]; board["tasks"].append(dependency)
                if kind == "open_helper":
                    board["tasks"].append(helper)
                self.path.write_text(json.dumps(board)); before = self.path.read_bytes()
                if kind != "empty_reason":
                    action = self.chair_action(board, depends_on=list(board["tasks"][0].get("depends_on") or []))
                    message = supervisor.build_chair_review_message(
                        self.config, reason="blocked_task_triage", markdown_path=self.root / "d.md",
                        json_path=self.root / "d.json", approval_state={"pending": [], "history": []}, state={},
                        provider_report={}, status=board)
                    self.assertNotIn("merged_acceptance=eligible candidate_sha=", message)
                    self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, action))
                    _, changed = self.run_native_chair_review(self.chair_payload(action))
                    self.assertFalse(changed)
                reason = "" if kind == "empty_reason" else "Runtime evidence exists"
                self.assertFalse(supervisor.apply_supervisor_merged_acceptance_resume(self.config, self.task["id"], reason))
                self.assert_untouched(before)

    def test_existing_chair_merged_acceptance_wiring_exact_review_own_CI_normal_protected_merge(self) -> None:
        import copy
        second = {"task_id": self.task["id"], "owner": "Claude", "waiting_for": "Codex", "status": "open",
                  "message": "Second blocker", "created_at": "2026-10-27T01:00:00Z"}
        dependency = {"id": "DEP-A", "title": "Dependency", "phase": "test", "owner": "Codex", "reviewer": "Claude",
                      "status": "in_progress", "depends_on": [], "artifacts": [], "acceptance": [], "next": "Open"}
        helper = {"id": "UNBLOCK-A", "title": "Helper", "phase": "test", "owner": "Codex", "reviewer": "Claude2",
                  "status": "in_progress", "depends_on": [], "artifacts": [], "acceptance": [], "next": "Open",
                  "task_class": "unblock", "helper_parent": self.task["id"], "helper_kind": "manual_unblock"}
        cases = {
            "unmerged": {"merge_sha": None}, "short_merge_sha": {"merge_sha": "2f16b4f"},
            "ci_red": {"ci_status": "failure"}, "ci_pending": {"ci_status": "queued"},
            "ci_other_sha": {"ci_sha": "1" * 40}, "no_review": {"reviewed_sha": None},
            "review_other_sha": {"reviewed_sha": "1" * 40}, "self_review": {"reviewer": "Claude"},
            "external_gate": {"external_gate": True}, "release_gate": {"task_class": "release", "mutates_canonical": False},
            "evidence_complete": {"acceptance_evidence": {key: "ref" for key in self.task["required_acceptance"]}},
            "no_required_keys": {"required_acceptance": []},
            "acceptance_review_request": {"acceptance_review_request": {"state": "pending"}},
        }
        for kind in [*cases, "second_blocker", "dependency", "open_helper"]:
            with self.subTest(kind=kind):
                board = copy.deepcopy(self.board)
                if kind in cases:
                    board["tasks"][0].update(cases[kind])
                    board["tasks"][0] = {k: v for k, v in board["tasks"][0].items() if v is not None}
                if kind == "second_blocker":
                    board["blockers"].append(second)
                if kind == "dependency":
                    board["tasks"][0]["depends_on"] = ["DEP-A"]; board["tasks"].append(dependency)
                if kind == "open_helper":
                    board["tasks"].append(helper)
                self.path.write_text(json.dumps(board)); before = self.path.read_bytes()
                action = self.chair_action(board)
                # Well-formed and fresh for this board, yet the task is not eligible.
                self.assertIsNone(supervisor.validate_chair_review_payload(self.chair_payload(action)))
                message = supervisor.build_chair_review_message(
                    self.config, reason="blocked_task_triage", markdown_path=self.root / "d.md",
                    json_path=self.root / "d.json", approval_state={"pending": [], "history": []}, state={},
                    provider_report={}, status=board)
                self.assertNotIn("merged_acceptance=eligible candidate_sha=", message)
                self.assertFalse(supervisor.apply_chair_parent_resume_action(self.config, {}, action))
                _, changed = self.run_native_chair_review(self.chair_payload(action))
                self.assertFalse(changed)
                self.assert_untouched(before)


class ChairBlockedSelectionReachabilityTests(unittest.TestCase):
    """R5: a fixed Chair window must not starve an explicit-positive CI recovery."""

    TARGET = "OUT-OF-WINDOW-RECOVERY"

    def plain(self, index: int) -> dict:
        return {"id": f"PLAIN-{index:02d}", "title": "Ordinary blocked", "phase": "test", "owner": "Pi",
                "reviewer": "Codex", "status": "blocked", "depends_on": [], "next": f"Ordinary blocker {index}"}

    def board(self, **target_changes) -> dict:
        target = {
            "id": self.TARGET, "title": "Recovered candidate", "phase": "test", "owner": "Pi", "reviewer": "Codex",
            "status": "blocked", "waiting_for": "Gemini", "depends_on": [], "next": "Blocked",
            "candidate_sha": "a" * 40, "candidate_generation": "generation-one",
            "candidate_branch": "pi/existing-candidate", "pr_url": "https://github.com/acme/fleet/pull/31",
            "ci_status": "success", "ci_sha": "a" * 40,
        }
        target["candidate_review_handoff"] = {k: target[k] for k in (
            "owner", "reviewer", "candidate_sha", "candidate_branch", "candidate_generation")}
        extra_blockers = target_changes.pop("_extra_blockers", 0)
        target.update(target_changes)
        tasks = [self.plain(i) for i in range(11)] + [target]  # target is record 12 of 12
        blockers = [{"task_id": t["id"], "owner": "Pi", "waiting_for": "Gemini", "status": "open",
                     "message": f"Blocker for {t['id']}", "created_at": "2026-10-27T00:00:00Z"} for t in tasks]
        blockers += [{"task_id": self.TARGET, "owner": "Pi", "waiting_for": "Codex", "status": "open",
                      "message": f"Second blocker {i}", "created_at": "2026-10-27T00:10:00Z"} for i in range(extra_blockers)]
        return {"tasks": tasks, "blockers": blockers}

    def blocked_lines(self, status: dict) -> list[str]:
        message = supervisor.build_chair_review_message(
            {}, reason="blocked_task_triage", markdown_path=Path("d.md"), json_path=Path("d.json"),
            approval_state={"pending": [], "history": []}, state={}, provider_report={}, status=status)
        section = message.split("Dependency-ready blocked tasks requiring chair repair:\n", 1)[1]
        return [line for line in section.splitlines() if line.startswith("- ")]

    def explicit_action(self, status: dict) -> dict:
        from control_plane.domain.chair_policy import open_blocker_fingerprint
        target = status["tasks"][-1]
        return {"task_id": self.TARGET, "action": "resume_parent_task", "resume_basis": "candidate_ci_recovered",
                "resume_status": "in_progress", "candidate_sha": target.get("candidate_sha"),
                "candidate_generation": target.get("candidate_generation"), "pr_url": target.get("pr_url"),
                "blocker_fingerprint": open_blocker_fingerprint(status["blockers"], self.TARGET)[0],
                "reason": "Original CI blocker recovered"}

    def payload(self, reason: str, actions: list, mentioned: list) -> dict:
        return {"version": 1, "decision": reason, "approval_ttl_minutes": 45, "reason": "r",
                "blocked_by": mentioned, "approval_actions": [], "reassignment_actions": [],
                "task_actions": actions, "provider_actions": [], "recommended_focus": []}

    def window_helpers(self) -> list[dict]:
        return [{"task_id": f"PLAIN-{i:02d}", "action": "create_unblock_task", "reason": "route"} for i in range(8)]

    def test_explicit_positive_record_beyond_window_reaches_prompt_context_and_synthesis(self) -> None:
        status = self.board()
        window = [f"PLAIN-{i:02d}" for i in range(8)]
        # Prompt: the unchanged first eight in order, then the recovery record appended last.
        lines = self.blocked_lines(status)
        self.assertEqual([line[2:].split(":", 1)[0] for line in lines], [*window, self.TARGET])
        self.assertIn("ci_recovery=eligible candidate_sha=" + "a" * 40, lines[-1])
        self.assertTrue(all("ci_recovery=eligible" not in line for line in lines[:-1]))
        self.assertEqual(lines[:-1], self.blocked_lines({**status, "tasks": status["tasks"][:8],
                                                         "blockers": status["blockers"][:8]}))
        # Context: the Chair must now resolve it like any listed record; the explicit route does.
        error = supervisor.validate_chair_review_context(
            self.payload("blocked_task_triage", self.window_helpers(), []), reason="blocked_task_triage",
            approval_state={"pending": []}, config={}, status=status)
        self.assertEqual(error, f"blocked_task_triage must resolve blocked tasks via {self.TARGET}:create_unblock_task")
        self.assertIsNone(supervisor.validate_chair_review_context(
            self.payload("blocked_task_triage", [*self.window_helpers(), self.explicit_action(status)], []),
            reason="blocked_task_triage", approval_state={"pending": []}, config={}, status=status))
        # Reassignment synthesis: the mentioned record is reachable; an explicit decision adds no helper.
        records = supervisor.reassignment_followup_task_records({}, self.payload("reassignment_triage", [], [self.TARGET]), status)
        self.assertEqual([r["task_id"] for r in records], [self.TARGET])
        self.assertIsNotNone(records[0]["candidate_ci_recovery"])
        explicit = self.payload("reassignment_triage", [self.explicit_action(status)], [self.TARGET])
        normalized = supervisor.normalize_chair_review_payload_for_reason(
            explicit, reason="reassignment_triage", config={}, status=status)
        self.assertEqual(normalized["task_actions"], [self.explicit_action(status)])
        self.assertIsNone(supervisor.validate_chair_review_context(
            normalized, reason="reassignment_triage", approval_state={"pending": []}, config={}, status=status))
        # One source for all three sites.
        self.assertEqual([r["task_id"] for r in supervisor.chair_blocked_task_selection({}, status)], [*window, self.TARGET])

    def test_beyond_window_records_without_explicit_positive_state_stay_truncated(self) -> None:
        cases = {
            "no_recovery_route": {"candidate_sha": None, "candidate_review_handoff": None},
            "ci_running": {"ci_status": "running"},
            "ci_failure": {"ci_status": "failure"},
            "ci_for_other_candidate": {"ci_sha": "b" * 40},
            "ci_missing": {"ci_status": None},
            "two_open_blockers": {"_extra_blockers": 1},
            "handoff_missing": {"candidate_review_handoff": None},
            "pr_missing": {"pr_url": None},
            "branch_missing": {"candidate_branch": None},
            "generation_mismatch": {"candidate_generation": "generation-two"},
            "release_hold": {"task_class": "release", "mutates_canonical": False},
        }
        window = [f"PLAIN-{i:02d}" for i in range(8)]
        for kind, changes in cases.items():
            with self.subTest(kind=kind):
                status = self.board(**dict(changes))
                lines = self.blocked_lines(status)
                self.assertEqual([line[2:].split(":", 1)[0] for line in lines], window)
                self.assertIsNone(supervisor.validate_chair_review_context(
                    self.payload("blocked_task_triage", self.window_helpers(), []), reason="blocked_task_triage",
                    approval_state={"pending": []}, config={}, status=status))
                # Even a Chair payload naming it explicitly does not drag it into the window.
                explicit = self.explicit_action(status)
                records = supervisor.reassignment_followup_task_records(
                    {}, self.payload("reassignment_triage", [explicit], [self.TARGET]), status)
                self.assertEqual(records, [])
                normalized = supervisor.normalize_chair_review_payload_for_reason(
                    self.payload("reassignment_triage", [], [self.TARGET]), reason="reassignment_triage",
                    config={}, status=status)
                self.assertEqual(normalized["task_actions"], [])

    def test_window_and_trigger_checks_unchanged_when_recovery_is_inside_or_absent(self) -> None:
        # Inside the window: no duplication and ordinary order.
        status = self.board()
        status["tasks"] = [status["tasks"][-1], *status["tasks"][:-1]]
        selection = supervisor.chair_blocked_task_selection({}, status)
        self.assertEqual([r["task_id"] for r in selection], [self.TARGET, *[f"PLAIN-{i:02d}" for i in range(7)]])
        self.assertEqual(selection, supervisor.dependency_ready_blocked_task_records({}, status))
        # Existence/trigger callers keep their limit=1 view.
        self.assertEqual(len(supervisor.dependency_ready_blocked_task_records({}, status, limit=1)), 1)
        # Fewer than eight records: nothing appended or reordered.
        small = {"tasks": status["tasks"][:3], "blockers": status["blockers"]}
        self.assertEqual(supervisor.chair_blocked_task_selection({}, small),
                         supervisor.dependency_ready_blocked_task_records({}, small))

    def test_R5_many_ready_records_are_admitted_bounded(self) -> None:
        board = self.board()
        ordinary = board["tasks"][:11]  # 8 in the window, 3 ordinary beyond it
        target = board["tasks"][-1]
        tasks = list(ordinary)
        blockers = [b for b in board["blockers"] if b["task_id"] != self.TARGET]
        # Interleave ineligible records ahead of the ready ones; they must not use the reserve.
        for kind, changes in (("red", {"ci_status": "failure"}), ("pending", {"ci_status": "running"}),
                              ("hold", {"task_class": "release", "mutates_canonical": False}),
                              ("dependency", {"depends_on": ["PLAIN-00"]}), ("two-blockers", {})):
            tasks.append({**json.loads(json.dumps(target)), "id": f"INELIGIBLE-{kind.upper()}", **changes})
            blockers.append({"task_id": tasks[-1]["id"], "owner": "Pi", "waiting_for": "Gemini", "status": "open",
                             "message": "Blocker", "created_at": "2026-10-27T00:00:00Z"})
        blockers.append({**blockers[-1], "message": "Second blocker"})
        for index in range(64):
            tasks.append({**json.loads(json.dumps(target)), "id": f"RECOVERY-{index:03d}"})
            blockers.append({"task_id": tasks[-1]["id"], "owner": "Pi", "waiting_for": "Gemini", "status": "open",
                             "message": "CI blocker", "created_at": "2026-10-27T00:00:00Z"})
        status = {"tasks": tasks, "blockers": blockers}
        window = [f"PLAIN-{i:02d}" for i in range(8)]
        expected = [*window, "RECOVERY-000", "RECOVERY-001"]
        # Prompt: bounded batch; the first eight are byte-identical to the plain window.
        lines = self.blocked_lines(status)
        self.assertEqual([line[2:].split(":", 1)[0] for line in lines], expected)
        self.assertEqual(lines[:8], self.blocked_lines({"tasks": ordinary[:8], "blockers": blockers[:8]}))
        # Context: only the admitted two are required, and their explicit routes satisfy it.
        error = supervisor.validate_chair_review_context(
            self.payload("blocked_task_triage", self.window_helpers(), []), reason="blocked_task_triage",
            approval_state={"pending": []}, config={}, status=status)
        self.assertEqual(error, "blocked_task_triage must resolve blocked tasks via "
                                "RECOVERY-000:create_unblock_task, RECOVERY-001:create_unblock_task")
        # Synthesis: an admitted record is reachable; one beyond the reserve is not.
        records = supervisor.reassignment_followup_task_records(
            {}, self.payload("reassignment_triage", [], ["RECOVERY-001", "RECOVERY-005"]), status)
        self.assertEqual([r["task_id"] for r in records], ["RECOVERY-001"])
        self.assertEqual([r["task_id"] for r in supervisor.chair_blocked_task_selection({}, status)], expected)
        self.assertEqual(supervisor.CHAIR_CI_RECOVERY_RESERVE, 2)

    def requested_board(self, decoy_changes: dict, target_changes: dict | None = None) -> dict:
        status = self.board()
        target = status["tasks"][-1]
        target["next"] = ("Please resume_parent_task with resume_basis=candidate_ci_recovered after confirming "
                          "original CI-only blocker.")
        decoys = []
        for index in range(2):
            decoy = json.loads(json.dumps({**target, "next": "Original manual disposition remains required."}))
            decoy.update(id=f"MANUAL-HOLD-{index}", **decoy_changes)
            decoys.append(decoy)
        target.update(target_changes or {})
        status["tasks"] = status["tasks"][:8] + decoys + [target]
        status["blockers"] = [b for b in status["blockers"] if b["task_id"] in {t["id"] for t in status["tasks"]}]
        status["blockers"] += [{"task_id": d["id"], "status": "open", "owner": "Pi", "waiting_for": "Claude2",
                                "message": "Original manual disposition", "created_at": "2026-10-27T00:00:00Z"}
                               for d in decoys]
        return status

    def test_R5_requested_recovery_is_admitted_past_green_records_that_stay_blocked(self) -> None:
        window = [f"PLAIN-{i:02d}" for i in range(8)]
        for label, decoy_changes in (("governance_decoys", {"task_class": "unblock", "helper_parent": "ORIGINAL-PARENT"}),
                                     ("first_class_decoys", {})):
            with self.subTest(decoys=label):
                status = self.requested_board(decoy_changes)
                expected = [*window, "MANUAL-HOLD-0", self.TARGET]  # original relative order kept
                for _ in range(3):  # unchanged board, unchanged (bounded) selection
                    self.assertEqual([r["task_id"] for r in supervisor.chair_blocked_task_selection({}, status)], expected)
                lines = self.blocked_lines(status)
                self.assertEqual([line[2:].split(":", 1)[0] for line in lines], expected)
                self.assertIn("ci_recovery=eligible", lines[-1])
                error = supervisor.validate_chair_review_context(
                    self.payload("blocked_task_triage", self.window_helpers(), []), reason="blocked_task_triage",
                    approval_state={"pending": []}, config={}, status=status)
                self.assertIn(f"{self.TARGET}:create_unblock_task", error)
                records = supervisor.reassignment_followup_task_records(
                    {}, self.payload("reassignment_triage", [], [self.TARGET, "MANUAL-HOLD-1"]), status)
                self.assertEqual([r["task_id"] for r in records], [self.TARGET])

    def test_R5_request_token_never_creates_eligibility_or_exceeds_the_reserve(self) -> None:
        window = [f"PLAIN-{i:02d}" for i in range(8)]
        # Not requested: earlier ready records keep the reserve (previous behavior).
        status = self.requested_board({}, {"next": "Blocked on CI"})
        self.assertEqual([r["task_id"] for r in supervisor.chair_blocked_task_selection({}, status)],
                         [*window, "MANUAL-HOLD-0", "MANUAL-HOLD-1"])
        # Requested but not structurally ready: never admitted, never takes a requested slot.
        for kind, changes in (("ci_red", {"ci_status": "failure"}), ("ci_pending", {"ci_status": "running"}),
                              ("two_blockers", {"_two": True}), ("dependency", {"depends_on": ["PLAIN-00"]}),
                              ("hold", {"task_class": "release", "mutates_canonical": False}),
                              ("identity", {"pr_url": None}), ("handoff", {"candidate_review_handoff": None})):
            with self.subTest(kind=kind):
                changes = dict(changes)
                two = changes.pop("_two", False)
                status = self.requested_board({}, changes)
                if two:
                    status["blockers"].append({"task_id": self.TARGET, "status": "open", "owner": "Pi",
                                               "waiting_for": "Codex", "message": "Second",
                                               "created_at": "2026-10-27T00:20:00Z"})
                selected = [r["task_id"] for r in supervisor.chair_blocked_task_selection({}, status)]
                self.assertEqual(selected, [*window, "MANUAL-HOLD-0", "MANUAL-HOLD-1"])
                self.assertNotIn(self.TARGET, "\n".join(self.blocked_lines(status)))
        # Many requested-and-ready records: still bounded by the reserve, original order kept.
        status = self.requested_board({"next": "resume_basis=candidate_ci_recovered please"})
        self.assertEqual([r["task_id"] for r in supervisor.chair_blocked_task_selection({}, status)],
                         [*window, "MANUAL-HOLD-0", "MANUAL-HOLD-1"])
        # The token is not an authorization: a requested record without a recovery context has none.
        self.assertIsNone(supervisor.candidate_ci_recovery_context(
            status, {**status["tasks"][-1], "candidate_review_handoff": None}))


class ExistingMergedAcceptanceBoundedAdmissionTests(unittest.TestCase):
    """A merged-eligible record ranked past the fixed Chair window reaches the
    same bounded selection, prompt, validator, synthesis and locked gateway."""

    TARGET = "MERGED-OUT-OF-WINDOW"

    def setUp(self) -> None:
        import copy
        import os
        from test_ai_status import MERGED_BLOCKED_ACCEPTANCE_TASK, ai_status as board_commands

        self.tmp = tempfile.TemporaryDirectory(prefix="merged-bounded-admission-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.merged_template = copy.deepcopy(MERGED_BLOCKED_ACCEPTANCE_TASK)
        self.board = board_commands.default_state()
        # Sixteen ordinary dependency-ready records ahead of the merged one: it is rank 16 (zero-based).
        tasks = [self.plain(index) for index in range(16)] + [self.merged(self.TARGET)]
        self.board.update({"tasks": tasks, "agents": [], "handoffs": [],
                           "blockers": [self.blocker(task["id"]) for task in tasks]})
        self.path = self.root / "ai-status.json"
        self.runtime_log = self.root / "runtime-log.jsonl"
        self.board_log = self.root / "ai-activity-log.jsonl"
        self.config = {"paths": {"status_file": str(self.path), "activity_log": str(self.runtime_log)},
                       "github_bus": {"repo": "acme/fleet"}}
        self.write(self.board)
        mock.patch.dict(os.environ, {"ORCH_STATUS_ROOT": str(self.root), "AI_STATUS_ROOT": str(self.root)}, clear=True).start()
        self.addCleanup(mock.patch.stopall)

    # Fixtures -----------------------------------------------------------

    def plain(self, index: int) -> dict:
        return {"id": f"PLAIN-{index:02d}", "title": "Ordinary blocked", "phase": "test", "owner": "Pi",
                "reviewer": "Codex", "status": "blocked", "depends_on": [], "artifacts": [], "acceptance": [],
                "next": f"Ordinary blocker {index}"}

    def merged(self, task_id: str, **changes) -> dict:
        task = {**json.loads(json.dumps(self.merged_template)), "id": task_id}
        task.update(changes)
        return {key: value for key, value in task.items() if value is not None}

    def ci_ready(self, task_id: str, **changes) -> dict:
        task = {"id": task_id, "title": "Recovered candidate", "phase": "test", "owner": "Pi", "reviewer": "Codex",
                "status": "blocked", "waiting_for": "Gemini", "depends_on": [], "artifacts": [], "acceptance": [],
                "next": "Blocked", "candidate_sha": "a" * 40, "candidate_generation": "generation-one",
                "candidate_branch": "pi/existing-candidate", "pr_url": "https://github.com/acme/fleet/pull/31",
                "ci_status": "success", "ci_sha": "a" * 40}
        task["candidate_review_handoff"] = {k: task[k] for k in (
            "owner", "reviewer", "candidate_sha", "candidate_branch", "candidate_generation")}
        task.update(changes)
        return task

    def blocker(self, task_id: str, message: str = "Original blocker", created_at: str = "2026-10-27T00:00:00Z") -> dict:
        return {"task_id": task_id, "owner": "Claude", "waiting_for": "Codex", "status": "open",
                "message": f"{message} for {task_id}", "created_at": created_at}

    def write(self, board: dict) -> bytes:
        self.path.write_text(json.dumps(board))
        return self.path.read_bytes()

    def window(self) -> list[str]:
        return [f"PLAIN-{index:02d}" for index in range(8)]

    def selected(self, status: dict) -> list[str]:
        return [r["task_id"] for r in supervisor.chair_blocked_task_selection(self.config, status)]

    def blocked_lines(self, status: dict) -> list[str]:
        message = supervisor.build_chair_review_message(
            self.config, reason="blocked_task_triage", markdown_path=self.root / "d.md", json_path=self.root / "d.json",
            approval_state={"pending": [], "history": []}, state={}, provider_report={}, status=status)
        section = message.split("Dependency-ready blocked tasks requiring chair repair:\n", 1)[1]
        return [line for line in section.splitlines() if line.startswith("- ")]

    def merged_action(self, status: dict, task_id: str | None = None, **changes) -> dict:
        from control_plane.domain.chair_policy import open_blocker_fingerprint
        task_id = task_id or self.TARGET
        task = next(t for t in status["tasks"] if t["id"] == task_id)
        action = {"task_id": task_id, "action": "resume_parent_task", "resume_status": "acceptance",
                  "resume_basis": "merged_runtime_acceptance_ready", "candidate_sha": task["candidate_sha"],
                  "candidate_generation": task["candidate_generation"], "merge_sha": task["merge_sha"],
                  "candidate_branch": task["candidate_branch"], "owner": task["owner"],
                  "reviewer": task["reviewer"], "required_acceptance": list(task["required_acceptance"]),
                  "depends_on": list(task.get("depends_on") or []),
                  "blocker_fingerprint": open_blocker_fingerprint(status["blockers"], task_id)[0],
                  "reason": "Chair confirmed the one runtime evidence blocker is the only remaining one"}
        action.update(changes)
        return action

    def payload(self, reason: str, actions: list, blocked_by: list | None = None) -> dict:
        return {"version": 1, "decision": reason, "approval_ttl_minutes": 45, "reason": "r",
                "blocked_by": blocked_by or [], "approval_actions": [], "reassignment_actions": [],
                "task_actions": actions, "provider_actions": [], "recommended_focus": []}

    def window_helpers(self) -> list[dict]:
        return [{"task_id": task_id, "action": "create_unblock_task", "reason": "route"} for task_id in self.window()]

    def deferrals(self) -> list[str]:
        return [f"{task_id}: unrelated ordinary blocker stays with its original routing this round"
                for task_id in self.window()]

    def context_error(self, payload: dict, status: dict, reason: str = "blocked_task_triage") -> str | None:
        return supervisor.validate_chair_review_context(
            payload, reason=reason, approval_state={"pending": []}, config=self.config, status=status)

    def run_native_chair_review(self, payload: dict, reason: str = "blocked_task_triage") -> tuple[str | None, bool]:
        """Schema, reason normalization, context validation, then the normal task-action dispatcher."""
        status = supervisor.load_status(self.config)
        payload = supervisor.normalize_chair_review_payload_for_reason(payload, reason=reason, config=self.config, status=status)
        error = supervisor.validate_chair_review_payload(payload) or supervisor.validate_chair_review_context(
            payload, reason=reason, approval_state={"pending": []}, config=self.config, status=status)
        if error:
            return error, False
        return None, supervisor.apply_chair_task_actions(self.config, {}, payload, {})

    def assert_untouched(self, before: bytes) -> None:
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(self.runtime_log.exists(), "rejected review wrote a Supervisor activity log")
        self.assertFalse(self.board_log.exists(), "rejected review wrote a board activity log")

    # Tests --------------------------------------------------------------

    def test_existing_merged_acceptance_bounded_selection_real_before_and_actual_mixed_gateway_controls(self) -> None:
        status = self.board
        records = supervisor.dependency_ready_blocked_task_records(self.config, status, limit=None)
        # Before: the merged record is structurally eligible yet ranked 16, outside the fixed eight,
        # and the board holds no CI-ready record that the earlier reserve would admit.
        self.assertEqual([r["task_id"] for r in records].index(self.TARGET), 16)
        self.assertIsNotNone(records[16]["merged_acceptance_resume"])
        self.assertEqual([r["task_id"] for r in supervisor.dependency_ready_blocked_task_records(self.config, status)],
                         self.window())
        self.assertFalse([r for r in records if supervisor.candidate_ci_recovery_ready(r)])
        # After: the unchanged first eight, then the merged record from the shared reserve.
        self.assertEqual(self.selected(status), [*self.window(), self.TARGET])
        lines = self.blocked_lines(status)
        self.assertEqual([line[2:].split(":", 1)[0] for line in lines], [*self.window(), self.TARGET])
        self.assertIn(f"merged_acceptance=eligible candidate_sha={self.merged_template['candidate_sha']}", lines[-1])
        self.assertIn("action=create_unblock_task", lines[-1])
        self.assertEqual(lines[:-1], self.blocked_lines({**status, "tasks": status["tasks"][:8],
                                                         "blockers": status["blockers"][:8]}))
        # Validator: the admitted record must be resolved like any listed one; the explicit merged route does.
        self.assertEqual(self.context_error(self.payload("blocked_task_triage", self.window_helpers()), status),
                         f"blocked_task_triage must resolve blocked tasks via {self.TARGET}:create_unblock_task")
        action = self.merged_action(status)
        self.assertIsNone(self.context_error(
            self.payload("blocked_task_triage", [*self.window_helpers(), action]), status))
        # Reassignment synthesis reaches it; an explicit merged decision adds no helper.
        mention = self.payload("reassignment_triage", [], [self.TARGET])
        self.assertEqual([r["task_id"] for r in supervisor.reassignment_followup_task_records(self.config, mention, status)],
                         [self.TARGET])
        self.assertEqual(supervisor.synthesize_reassignment_followup_task_actions(
            self.config, self.payload("reassignment_triage", [action], [self.TARGET]), status), [])

        # Actual mixed batch: one exact merged resume plus specific deferrals for the
        # unrelated window records. The deferral is only valid because the resume matches.
        self.assertEqual(self.context_error(self.payload("blocked_task_triage", [], self.deferrals()), status),
                         "blocked_task_triage must resolve blocked tasks via " + ", ".join(
                             f"{t}:create_unblock_task" for t in self.window()[:6]))
        self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(
            self.config, self.payload("blocked_task_triage", [action], self.deferrals()),
            supervisor.chair_blocked_task_selection(self.config, status), status), set(self.window()))
        before_tasks = json.loads(self.path.read_text())["tasks"]
        gateway = supervisor.apply_supervisor_merged_acceptance_resume
        import github_bus
        with mock.patch.object(github_bus, "gh_json") as reads, \
                mock.patch.object(supervisor, "queue_delivery_event") as wake, \
                mock.patch.object(supervisor, "apply_supervisor_merged_acceptance_resume", wraps=gateway) as spy:
            error, changed = self.run_native_chair_review(self.payload("blocked_task_triage", [action], self.deferrals()))
        self.assertIsNone(error)
        self.assertTrue(changed)
        spy.assert_called_once_with(self.config, self.TARGET, action["reason"], chair_observation={
            key: action[key] for key in supervisor.MERGED_ACCEPTANCE_OBSERVATION_KEYS})
        self.assertEqual(len(supervisor.MERGED_ACCEPTANCE_OBSERVATION_KEYS), 9)
        reads.assert_not_called()
        wake.assert_not_called()
        state = json.loads(self.path.read_text())
        self.assertEqual(state["tasks"][:16], before_tasks[:16])  # deferred and unlisted records untouched
        self.assertEqual(len(state["tasks"]), 17)  # no helper
        target = state["tasks"][16]
        self.assertEqual(target["status"], "acceptance")
        for key in ("owner", "reviewer", "candidate_sha", "candidate_generation", "candidate_branch",
                    "reviewed_sha", "ci_sha", "ci_status", "merge_sha", "required_acceptance"):
            self.assertEqual(target[key], before_tasks[16][key])
        self.assertNotIn("acceptance_evidence", target)
        self.assertEqual([b["status"] for b in state["blockers"]], ["open"] * 16 + ["resolved"])
        rows = [json.loads(line)["type"] for line in self.runtime_log.read_text().splitlines()]
        self.assertEqual(rows, ["supervisor_merged_acceptance_resumed"])

    def test_reassignment_mixed_merged_batch_defers_without_synthesized_helpers(self) -> None:
        status = self.board
        action = self.merged_action(status)
        payload = self.payload("reassignment_triage", [action], self.deferrals())
        normalized = supervisor.normalize_chair_review_payload_for_reason(
            payload, reason="reassignment_triage", config=self.config, status=status)
        self.assertEqual(normalized["task_actions"], [action])
        self.assertIsNone(self.context_error(normalized, status, "reassignment_triage"))
        # Without the matching explicit resume the same deferrals are not a waiver.
        plain = supervisor.normalize_chair_review_payload_for_reason(
            self.payload("reassignment_triage", [], self.deferrals()), reason="reassignment_triage",
            config=self.config, status=status)
        self.assertEqual([(a["task_id"], a["action"]) for a in plain["task_actions"]],
                         [(t, "create_unblock_task") for t in self.window()])

    def stale_actions(self, status: dict) -> dict[str, dict]:
        return {
            "candidate_sha": self.merged_action(status, candidate_sha="f" * 40),
            "candidate_generation": self.merged_action(status, candidate_generation="other-generation"),
            "merge_sha": self.merged_action(status, merge_sha="e" * 40),
            "candidate_branch": self.merged_action(status, candidate_branch="claude/other"),
            "owner": self.merged_action(status, owner="Gemini"),
            "reviewer": self.merged_action(status, reviewer="Gemini2"),
            "blocker_fingerprint": self.merged_action(status, blocker_fingerprint="0" * 64),
            "required_acceptance": self.merged_action(status, required_acceptance=["another key"]),
            "depends_on": self.merged_action(status, depends_on=["SOME-OTHER-DEP"]),
        }

    def test_stale_mixed_merged_batch_is_refused_without_helper_mutation_or_residue(self) -> None:
        import copy
        import github_bus
        stale = self.stale_actions(self.board)
        self.assertEqual(sorted(stale), sorted(supervisor.MERGED_ACCEPTANCE_OBSERVATION_KEYS))
        cases = {kind: (self.board, action) for kind, action in stale.items()}
        # Board drift after the Chair snapshot: a second open blocker, or a dependency no longer done.
        second = copy.deepcopy(self.board)
        second["blockers"].append(self.blocker(self.TARGET, "Blocker after Chair snapshot", "2026-10-27T02:00:00Z"))
        cases["second_blocker_after_snapshot"] = (second, self.merged_action(self.board))
        dependency = copy.deepcopy(self.board)
        dependency["tasks"][16]["depends_on"] = ["DEP-OPEN"]
        dependency["tasks"].append({**self.plain(99), "id": "DEP-OPEN", "status": "in_progress"})
        cases["dependency_not_done"] = (dependency, self.merged_action(self.board, depends_on=["DEP-OPEN"]))
        for kind, (board, action) in cases.items():
            for reason in ("blocked_task_triage", "reassignment_triage"):
                with self.subTest(kind=kind, reason=reason):
                    before = self.write(board)
                    payload = self.payload(reason, [action], self.deferrals())
                    normalized = supervisor.normalize_chair_review_payload_for_reason(
                        payload, reason=reason, config=self.config, status=board)
                    self.assertEqual(normalized["task_actions"], [action])  # nothing synthesized
                    with mock.patch.object(github_bus, "gh_json") as reads, \
                            mock.patch.object(supervisor, "queue_delivery_event") as wake, \
                            mock.patch.object(supervisor, "apply_supervisor_merged_acceptance_resume") as gateway:
                        error, changed = self.run_native_chair_review(payload, reason)
                    self.assertIn(f"{reason} mixed recovery batch is stale", error or "")
                    self.assertFalse(changed)
                    gateway.assert_not_called()
                    reads.assert_not_called()
                    wake.assert_not_called()
                    self.assert_untouched(before)

    def test_invalid_or_missing_explicit_intent_never_waives_required_actions(self) -> None:
        status = self.board
        cases = {
            "no_merged_action": [],
            "wrong_status": [self.merged_action(status, resume_status="in_progress")],
            "extra_field": [self.merged_action(status, pr_url="https://github.com/acme/fleet/pull/31")],
            "other_task": [{**self.merged_action(status), "task_id": "PLAIN-00"}],
        }
        for kind, actions in cases.items():
            with self.subTest(kind=kind):
                payload = self.payload("blocked_task_triage", actions, self.deferrals())
                self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(
                    self.config, payload, supervisor.chair_blocked_task_selection(self.config, status), status), set())
                before = self.write(status)
                error, changed = self.run_native_chair_review(payload)
                self.assertIsNotNone(error)
                self.assertFalse(changed)
                self.assert_untouched(before)

    def test_ineligible_out_of_window_merged_records_stay_excluded(self) -> None:
        import copy
        cases = {
            "unmerged": {"merge_sha": None}, "ci_red": {"ci_status": "failure"},
            "ci_pending": {"ci_status": "queued"}, "ci_other_sha": {"ci_sha": "1" * 40},
            "no_review": {"reviewed_sha": None}, "review_other_sha": {"reviewed_sha": "1" * 40},
            "self_review": {"reviewer": "Claude"}, "external_gate": {"external_gate": True},
            "release_hold": {"task_class": "release", "mutates_canonical": False},
            "evidence_complete": {"acceptance_evidence": {k: "ref" for k in self.merged_template["required_acceptance"]}},
            "pending_acceptance_review": {"acceptance_review_request": {"state": "pending"}},
        }
        boards = {}
        for kind, changes in cases.items():
            board = copy.deepcopy(self.board)
            board["tasks"][16] = self.merged(self.TARGET, **changes)
            boards[kind] = board
        two = copy.deepcopy(self.board)
        two["blockers"].append(self.blocker(self.TARGET, "Second blocker", "2026-10-27T01:00:00Z"))
        boards["two_blockers"] = two
        # Zero open blockers is now an admitted merged context (see the zero-open
        # bounded test); three or more stay excluded like two.
        three = copy.deepcopy(two)
        three["blockers"].append(self.blocker(self.TARGET, "Third blocker", "2026-10-27T02:00:00Z"))
        boards["three_blockers"] = three
        dependency = copy.deepcopy(self.board)
        dependency["tasks"][16]["depends_on"] = ["PLAIN-00"]
        boards["dependency_incomplete"] = dependency
        helper = copy.deepcopy(self.board)
        helper["tasks"].append({**self.plain(98), "id": f"{self.TARGET}-UNBLOCK-MANUAL-UNBLOCK", "status": "in_progress",
                                "task_class": "unblock", "helper_parent": self.TARGET, "helper_kind": "manual_unblock"})
        boards["ongoing_helper"] = helper
        for kind, board in boards.items():
            with self.subTest(kind=kind):
                self.assertEqual(self.selected(board), self.window())
                self.assertTrue(all("merged_acceptance=eligible" not in line for line in self.blocked_lines(board)))
                self.assertIsNone(self.context_error(self.payload("blocked_task_triage", self.window_helpers()), board))

    def zero_open(self, board: dict, task_id: str | None = None) -> dict:
        """Keep the merged record's original blocker as resolved history."""
        import copy
        board = copy.deepcopy(board)
        for blocker in board["blockers"]:
            if blocker["task_id"] == (task_id or self.TARGET):
                blocker.update(status="resolved", resolved_at="2026-10-28T00:00:00Z")
        return board

    def test_zero_open_merged_record_reaches_bounded_reserve_and_same_gateway(self) -> None:
        import github_bus
        from test_ai_status import EMPTY_OPEN_BLOCKER_FINGERPRINT
        zero = self.zero_open(self.board)
        before = self.write(zero)
        # Same fixed eight plus the shared reserve; the merged option shows the empty-set fingerprint.
        self.assertEqual(self.selected(zero), [*self.window(), self.TARGET])
        lines = self.blocked_lines(zero)
        self.assertEqual(len(lines), 9)
        self.assertEqual(lines[:8], self.blocked_lines(self.board)[:8])
        self.assertIn("merged_acceptance=eligible", lines[-1])
        self.assertIn(f"blocker_fingerprint={EMPTY_OPEN_BLOCKER_FINGERPRINT}", lines[-1])
        action = self.merged_action(zero)
        self.assertEqual(action["blocker_fingerprint"], EMPTY_OPEN_BLOCKER_FINGERPRINT)
        # No explicit decision: the ordinary helper route is still required, never waived.
        self.assertEqual(self.context_error(self.payload("blocked_task_triage", self.window_helpers()), zero),
                         f"blocked_task_triage must resolve blocked tasks via {self.TARGET}:create_unblock_task")
        self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(
            self.config, self.payload("blocked_task_triage", [], self.deferrals()),
            supervisor.chair_blocked_task_selection(self.config, zero), zero), set())
        # One-open observation against the zero board (and the reverse) is a stale batch.
        for kind, (board, decision) in {
            "one_observed_now_zero": (zero, self.merged_action(self.board)),
            "zero_observed_now_one": (self.board, action),
        }.items():
            for reason in ("blocked_task_triage", "reassignment_triage"):
                with self.subTest(kind=kind, reason=reason):
                    stale_before = self.write(board)
                    with mock.patch.object(supervisor, "apply_supervisor_merged_acceptance_resume") as gateway:
                        error, changed = self.run_native_chair_review(
                            self.payload(reason, [decision], self.deferrals()), reason)
                    self.assertIn(f"{reason} mixed recovery batch is stale", error or "")
                    self.assertFalse(changed)
                    gateway.assert_not_called()
                    self.assert_untouched(stale_before)
        # The fresh mixed batch applies once through the same gateway, adding no helper.
        self.write(zero)
        before_board = json.loads(before)
        gateway = supervisor.apply_supervisor_merged_acceptance_resume
        with mock.patch.object(github_bus, "gh_json") as reads, \
                mock.patch.object(supervisor, "queue_delivery_event") as wake, \
                mock.patch.object(supervisor, "apply_supervisor_merged_acceptance_resume", wraps=gateway) as spy:
            error, changed = self.run_native_chair_review(self.payload("blocked_task_triage", [action], self.deferrals()))
        self.assertIsNone(error)
        self.assertTrue(changed)
        spy.assert_called_once_with(self.config, self.TARGET, action["reason"], chair_observation={
            key: action[key] for key in supervisor.MERGED_ACCEPTANCE_OBSERVATION_KEYS})
        reads.assert_not_called()
        wake.assert_not_called()
        state = json.loads(self.path.read_text())
        self.assertEqual(state["tasks"][:16], before_board["tasks"][:16])
        self.assertEqual(len(state["tasks"]), 17)
        target = state["tasks"][16]
        self.assertEqual(target["status"], "acceptance")
        for key in ("owner", "reviewer", "candidate_sha", "candidate_generation", "candidate_branch",
                    "reviewed_sha", "ci_sha", "ci_status", "merge_sha", "required_acceptance"):
            self.assertEqual(target[key], before_board["tasks"][16][key])
        self.assertEqual(state["blockers"], before_board["blockers"])  # nothing resolved, erased or added

    def test_zero_open_merged_shares_reserve_with_ci_priority_and_ten_cap(self) -> None:
        import copy
        # CI-ready and zero-open merged records share the reserve, one slot each, in board order.
        mixed = copy.deepcopy(self.board)
        for index in range(3):
            mixed["tasks"].insert(16, self.ci_ready(f"CI-READY-{index}"))
            mixed["blockers"].append(self.blocker(f"CI-READY-{index}"))
        mixed["tasks"].append(self.merged("MERGED-LATER"))
        mixed = self.zero_open(self.zero_open(mixed), "MERGED-LATER")
        self.assertEqual(self.selected(mixed), [*self.window(), "CI-READY-2", self.TARGET])
        lines = self.blocked_lines(mixed)
        self.assertIn("ci_recovery=eligible", lines[8])
        self.assertIn("merged_acceptance=eligible", lines[9])
        # Explicitly requested CI recovery keeps its priority over zero-open merged records.
        requested = copy.deepcopy(mixed)
        for task in requested["tasks"]:
            if task["id"] in {"CI-READY-0", "CI-READY-1"}:
                task["next"] = "Please resume_parent_task with resume_basis=candidate_ci_recovered now."
        self.assertEqual(self.selected(requested), [*self.window(), "CI-READY-1", "CI-READY-0"])
        # A zero-open CI-ready record is still not a CI-recovery candidate.
        ci_zero = self.zero_open(mixed, "CI-READY-2")
        self.assertEqual(self.selected(ci_zero), [*self.window(), "CI-READY-1", self.TARGET])
        # Many zero-open merged records: still ten, original order, stable.
        many = self.zero_open(self.board)
        for index in range(30):
            many["tasks"].append(self.merged(f"MERGED-EXTRA-{index:02d}"))
        for _ in range(3):
            self.assertEqual(self.selected(many), [*self.window(), self.TARGET, "MERGED-EXTRA-00"])
        self.assertEqual(len(self.blocked_lines(many)), 10)
        # Inside the window: no duplication, no reordering.
        inside = self.zero_open(self.board)
        inside["tasks"] = [inside["tasks"][16], *inside["tasks"][:16]]
        self.assertEqual(self.selected(inside), [self.TARGET, *self.window()[:7]])

    def test_shared_reserve_cap_stable_order_and_ci_merged_fairness(self) -> None:
        import copy
        from control_plane.domain.chair_policy import open_blocker_fingerprint
        # Many merged-ready records past the window: still ten, original order, stable.
        many = copy.deepcopy(self.board)
        for index in range(30):
            many["tasks"].append(self.merged(f"MERGED-EXTRA-{index:02d}"))
            many["blockers"].append(self.blocker(f"MERGED-EXTRA-{index:02d}"))
        for _ in range(3):
            self.assertEqual(self.selected(many), [*self.window(), self.TARGET, "MERGED-EXTRA-00"])
        self.assertEqual(len(self.blocked_lines(many)), 10)
        self.assertEqual(supervisor.CHAIR_CI_RECOVERY_RESERVE, 2)
        self.assertEqual(supervisor.CHAIR_BLOCKED_TASK_WINDOW, 8)
        self.assertIn("MERGED-EXTRA-00:create_unblock_task", self.context_error(
            self.payload("blocked_task_triage", [*self.window_helpers(), self.merged_action(many)]), many) or "")
        # Mixed CI-ready and merged-ready records share the reserve: one slot each, in board order.
        mixed = copy.deepcopy(self.board)
        for index in range(3):
            mixed["tasks"].insert(16, self.ci_ready(f"CI-READY-{index}"))
            mixed["blockers"].append(self.blocker(f"CI-READY-{index}"))
        mixed["tasks"].append(self.merged("MERGED-LATER"))
        mixed["blockers"].append(self.blocker("MERGED-LATER"))
        self.assertEqual(self.selected(mixed), [*self.window(), "CI-READY-2", self.TARGET])
        lines = self.blocked_lines(mixed)
        self.assertIn("ci_recovery=eligible", lines[8])
        self.assertIn("merged_acceptance=eligible", lines[9])
        # Both explicit routes in one batch satisfy the validator; neither needs a helper.
        ci_task = next(t for t in mixed["tasks"] if t["id"] == "CI-READY-2")
        ci_action = {"task_id": "CI-READY-2", "action": "resume_parent_task", "resume_basis": "candidate_ci_recovered",
                     "resume_status": "in_progress", "candidate_sha": ci_task["candidate_sha"],
                     "candidate_generation": ci_task["candidate_generation"], "pr_url": ci_task["pr_url"],
                     "blocker_fingerprint": open_blocker_fingerprint(mixed["blockers"], "CI-READY-2")[0],
                     "reason": "Original CI blocker recovered"}
        self.assertIsNone(self.context_error(self.payload(
            "blocked_task_triage", [*self.window_helpers(), ci_action, self.merged_action(mixed)]), mixed))
        # Explicitly requested CI recovery keeps its existing priority over both.
        requested = copy.deepcopy(mixed)
        for task in requested["tasks"]:
            if task["id"] in {"CI-READY-0", "CI-READY-1"}:
                task["next"] = "Please resume_parent_task with resume_basis=candidate_ci_recovered now."
        self.assertEqual(self.selected(requested), [*self.window(), "CI-READY-1", "CI-READY-0"])
        # Without merged records the CI-only reserve is unchanged.
        ci_only = copy.deepcopy(mixed)
        ci_only["tasks"] = [t for t in ci_only["tasks"] if not t["id"].startswith("MERGED-")]
        ci_only["blockers"] = [b for b in ci_only["blockers"] if not b["task_id"].startswith("MERGED-")]
        self.assertEqual(self.selected(ci_only), [*self.window(), "CI-READY-2", "CI-READY-1"])
        # Inside the window: no duplication, no reordering.
        inside = copy.deepcopy(self.board)
        inside["tasks"] = [inside["tasks"][16], *inside["tasks"][:16]]
        self.assertEqual(self.selected(inside), [self.TARGET, *self.window()[:7]])

    def completed_helper_board(self, **helper_changes) -> dict:
        import copy
        board = copy.deepcopy(self.board)
        helper = {**self.plain(97), "id": f"{self.TARGET}-UNBLOCK-MANUAL-UNBLOCK", "status": "done",
                  "task_class": "unblock", "helper_parent": self.TARGET, "helper_kind": "manual_unblock",
                  "resolved_parent_status": "blocked", "resolved_parent_at": "2026-10-26T00:00:00Z",
                  "last_update": "2026-10-26T00:00:00Z", "next": "Resolved"}
        helper.update(helper_changes)
        board["tasks"].append(helper)
        return board

    def test_completed_helper_held_merged_record_exposes_only_explicit_merged_route(self) -> None:
        import copy
        import github_bus
        for variant, changes in (("helper_keeps_blocked", {}),
                                 ("newer_blocker_than_helper", {"resolved_parent_status": "todo"})):
            with self.subTest(variant=variant):
                board = self.completed_helper_board(**changes)
                before = self.write(board)
                task = board["tasks"][16]
                helper_id = f"{self.TARGET}-UNBLOCK-MANUAL-UNBLOCK"
                # Before: the existing triage holds it at wait_for_parent_resolution through the old helper.
                self.assertEqual(supervisor.blocked_task_triage_action(board, task), ("wait_for_parent_resolution", helper_id))
                self.assertNotIn(self.TARGET, [r["task_id"] for r in supervisor.dependency_ready_blocked_task_records(
                    self.config, board, limit=None)])
                # After: admitted through the shared reserve with its original action and helper label.
                self.assertEqual(self.selected(board), [*self.window(), self.TARGET])
                lines = self.blocked_lines(board)
                self.assertIn(f"action=wait_for_parent_resolution helper={helper_id}", lines[-1])
                self.assertIn("merged_acceptance=eligible", lines[-1])
                # It requires no action and synthesizes none; the old helper is never reused.
                self.assertIsNone(self.context_error(self.payload("blocked_task_triage", self.window_helpers()), board))
                self.assertEqual(supervisor.synthesize_reassignment_followup_task_actions(
                    self.config, self.payload("reassignment_triage", [], [self.TARGET]), board), [])
                self.assertFalse(supervisor.apply_chair_parent_resume_action(
                    self.config, {}, {"task_id": self.TARGET, "action": "resume_parent_task", "reason": "old helper"}))
                self.assert_untouched(before)
                # The explicit merged resume reaches the same gateway; helper history stays.
                action = self.merged_action(board)
                with mock.patch.object(github_bus, "gh_json") as reads, \
                        mock.patch.object(supervisor, "queue_delivery_event") as wake:
                    error, changed = self.run_native_chair_review(
                        self.payload("blocked_task_triage", [action], self.deferrals()))
                self.assertIsNone(error)
                self.assertTrue(changed)
                reads.assert_not_called()
                wake.assert_not_called()
                state = json.loads(self.path.read_text())
                self.assertEqual(state["tasks"][16]["status"], "acceptance")
                self.assertEqual(state["tasks"][17], board["tasks"][17])  # helper record unchanged
                self.assertEqual(len(state["tasks"]), 18)
                self.assertEqual(state["tasks"][:16], board["tasks"][:16])
                self.runtime_log.unlink(missing_ok=True)
                self.board_log.unlink(missing_ok=True)
        # Controls: the same held record without merged eligibility stays out of the bounded batch.
        for kind, board in {
            "unmerged": self.completed_helper_board(),
            "ongoing_second_helper": self.completed_helper_board(),
        }.items():
            with self.subTest(control=kind):
                board = copy.deepcopy(board)
                if kind == "unmerged":
                    board["tasks"][16].pop("merge_sha")
                else:
                    board["tasks"].append({**self.plain(96), "id": "SECOND-HELPER", "status": "in_progress",
                                           "task_class": "unblock", "helper_parent": self.TARGET,
                                           "helper_kind": "planning_decision"})
                self.assertEqual(self.selected(board), self.window())

    def held_merged_board(self, extra: int) -> dict:
        """Seven ordinary records, TARGET held by its completed helper, and
        `extra` more held merged-eligible copies, each with its own helper and one open blocker."""
        import copy
        board = self.completed_helper_board()
        keep = {f"PLAIN-{index:02d}" for index in range(7)} | {self.TARGET, f"{self.TARGET}-UNBLOCK-MANUAL-UNBLOCK"}
        board["tasks"] = [task for task in board["tasks"] if task["id"] in keep]
        board["blockers"] = [b for b in board["blockers"] if b["task_id"] in keep]
        target = next(task for task in board["tasks"] if task["id"] == self.TARGET)
        helper = next(task for task in board["tasks"] if task["id"] == f"{self.TARGET}-UNBLOCK-MANUAL-UNBLOCK")
        for name in ("SECOND", "THIRD", "FOURTH")[:extra]:
            task_id = f"MERGED-{name}-HELD"
            board["tasks"].append({**copy.deepcopy(target), "id": task_id})
            board["tasks"].append({**copy.deepcopy(helper), "id": f"{task_id}-UNBLOCK-MANUAL-UNBLOCK", "helper_parent": task_id})
            board["blockers"].append(self.blocker(task_id))
        return board

    def prompt_ids(self, board: dict) -> list[str]:
        return [line[2:].split(":", 1)[0] for line in self.blocked_lines(board)]

    def test_prompt_and_validator_share_one_selection_with_held_merged_candidates(self) -> None:
        board = self.held_merged_board(extra=3)
        ordinary = [f"PLAIN-{index:02d}" for index in range(7)]
        expected = [*ordinary, self.TARGET, "MERGED-SECOND-HELD", "MERGED-THIRD-HELD"]
        # Same task ids, same order, on every path: prompt, context validation, deferral, stale check.
        self.assertEqual(self.prompt_ids(board), expected)
        self.assertEqual(self.selected(board), expected)
        self.assertNotIn("MERGED-FOURTH-HELD", self.prompt_ids(board))  # still 8 + reserve 2
        lines = self.blocked_lines(board)
        advertised = [line[2:].split(":", 1)[0] for line in lines if "merged_acceptance=eligible" in line]
        self.assertEqual(advertised, expected[7:])
        deferrals = self.deferrals()[:7]
        selection = supervisor.chair_blocked_task_selection(self.config, board)
        # Every advertised merged route is accepted with the same deferrals; none is required.
        self.assertIsNone(self.context_error(self.payload("blocked_task_triage", [
            {"task_id": task_id, "action": "create_unblock_task", "reason": "route"} for task_id in ordinary]), board))
        for task_id in advertised:
            for reason in ("blocked_task_triage", "reassignment_triage"):
                with self.subTest(task_id=task_id, reason=reason):
                    payload = self.payload(reason, [self.merged_action(board, task_id)], deferrals)
                    self.assertEqual(supervisor.stale_mixed_recovery_deferrals(self.config, payload, board), [])
                    self.assertEqual(supervisor.chair_reasoned_deferral_task_ids(
                        self.config, payload, selection, board), set(ordinary))
                    normalized = supervisor.normalize_chair_review_payload_for_reason(
                        payload, reason=reason, config=self.config, status=board)
                    self.assertEqual(normalized["task_actions"], payload["task_actions"])  # nothing synthesized
                    self.assertIsNone(self.context_error(normalized, board, reason))
        # A held record without a merged route is tracked on both paths and never requires an action.
        tracking = self.held_merged_board(extra=0)
        tracking["tasks"][7].pop("merge_sha")
        self.assertEqual(self.prompt_ids(tracking), self.selected(tracking))
        self.assertEqual(self.selected(tracking), [*ordinary, self.TARGET])
        self.assertNotIn("merged_acceptance=eligible", self.blocked_lines(tracking)[-1])
        self.assertIn(f"{ordinary[0]}:create_unblock_task", self.context_error(
            self.payload("blocked_task_triage", [], deferrals), tracking) or "")

    def test_mixed_apply_with_third_held_merged_record_and_out_of_set_no_write(self) -> None:
        import github_bus
        board = self.held_merged_board(extra=3)
        deferrals = self.deferrals()[:7]
        # Beyond the shared bound: not advertised, so its mixed batch is refused with no write.
        before = self.write(board)
        outside = self.payload("blocked_task_triage", [self.merged_action(board, "MERGED-FOURTH-HELD")], deferrals)
        with mock.patch.object(supervisor, "apply_supervisor_merged_acceptance_resume") as gateway:
            error, changed = self.run_native_chair_review(outside)
        self.assertIn("mixed recovery batch is stale", error or "")
        self.assertFalse(changed)
        gateway.assert_not_called()
        self.assert_untouched(before)
        # A stale snapshot of an advertised record is refused the same way.
        stale = self.payload("blocked_task_triage",
                             [self.merged_action(board, "MERGED-THIRD-HELD", merge_sha="e" * 40)], deferrals)
        error, changed = self.run_native_chair_review(stale)
        self.assertIn("mixed recovery batch is stale", error or "")
        self.assertFalse(changed)
        self.assert_untouched(before)
        # The advertised third record: ordinary deferrals + one exact merged resume apply once.
        action = self.merged_action(board, "MERGED-THIRD-HELD")
        gateway = supervisor.apply_supervisor_merged_acceptance_resume
        with mock.patch.object(github_bus, "gh_json") as reads, \
                mock.patch.object(supervisor, "queue_delivery_event") as wake, \
                mock.patch.object(supervisor, "apply_supervisor_merged_acceptance_resume", wraps=gateway) as spy:
            error, changed = self.run_native_chair_review(self.payload("blocked_task_triage", [action], deferrals))
        self.assertIsNone(error)
        self.assertTrue(changed)
        spy.assert_called_once_with(self.config, "MERGED-THIRD-HELD", action["reason"], chair_observation={
            key: action[key] for key in supervisor.MERGED_ACCEPTANCE_OBSERVATION_KEYS})
        reads.assert_not_called()
        wake.assert_not_called()
        state = json.loads(self.path.read_text())
        by_id = {task["id"]: task for task in state["tasks"]}
        self.assertEqual(by_id["MERGED-THIRD-HELD"]["status"], "acceptance")
        self.assertEqual([t for t in state["tasks"] if t["id"] != "MERGED-THIRD-HELD"],
                         [t for t in board["tasks"] if t["id"] != "MERGED-THIRD-HELD"])
        self.assertEqual(len(state["tasks"]), len(board["tasks"]))  # no helper
        opened = [b["task_id"] for b in state["blockers"] if b["status"] == "open"]
        self.assertNotIn("MERGED-THIRD-HELD", opened)
        self.assertEqual(len(opened), len(board["blockers"]) - 1)


class ExistingApprovalSuccessCooldownFairnessTests(unittest.TestCase):
    """A successful approval_triage must neither extend nor clear the shared
    cooldown. Extending it let back-to-back approvals (each a fresh signal that
    bypasses the cooldown) push an already-due blocked_task_triage, which may
    not bypass, out of reach across every pending-empty gap."""

    START = datetime(2026, 10, 29, 9, 0, 0, tzinfo=timezone.utc)

    def setUp(self) -> None:
        import copy
        from datetime import timedelta
        from test_ai_status import MERGED_BLOCKED_ACCEPTANCE_TASK, ai_status as board_commands

        self.timedelta = timedelta
        self.tmp = tempfile.TemporaryDirectory(prefix="approval-cooldown-fairness-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / "chair-reviews").mkdir()
        (self.root / "activity-log.jsonl").write_text("", encoding="utf-8")
        self.status_path = self.root / "ai-status.json"
        self.task = copy.deepcopy(MERGED_BLOCKED_ACCEPTANCE_TASK)
        self.board = board_commands.default_state()
        self.board.update({"tasks": [self.task], "agents": [], "handoffs": [], "blockers": [{
            "task_id": self.task["id"], "owner": "Claude", "waiting_for": "Codex", "status": "open",
            "message": "Runtime evidence blocker", "created_at": "2026-10-27T00:00:00Z"}]})
        self.status_path.write_text(json.dumps(self.board), encoding="utf-8")
        self.config = {
            "agents": {"claude": {"display_name": "Claude", "provider": "claude"}},
            "chair_review": {"enabled": True, "cooldown_seconds": 900, "review_dir": str(self.root / "chair-reviews")},
            "paths": {
                "status_file": str(self.status_path),
                "state_file": str(self.root / "state.json"),
                "approval_queue": str(self.root / "approval-queue.json"),
                "activity_log": str(self.root / "activity-log.jsonl"),
                "event_queue": str(self.root / "event-queue.jsonl"),
                "chair_review_dir": str(self.root / "chair-reviews"),
            },
        }
        self.state = {"queue": {"events": {}}, "workers": {}, "provider_pauses": {}, "dispatch_pauses": [],
                      "failure_streaks": {}, "chair_review": {
                          "last_review_at": "2026-10-29T08:00:00Z", "last_attempt_at": "2026-10-29T08:00:00Z",
                          "cooldown_until": "2026-10-29T08:15:00Z"}}
        self.clock = [self.START]
        self.pending: list[dict] = []
        clock = self.clock

        class Clock(datetime):
            @classmethod
            def now(cls, tz=None):  # type: ignore[override]
                return clock[0] if tz is not None else clock[0].replace(tzinfo=None)

        # Only external IO is stubbed: the clock, the approval store, the brief
        # writer, lane selection and the queue writer. The scheduler and refresh
        # functions under test run unmodified.
        mock.patch.object(supervisor, "datetime", Clock).start()
        mock.patch.object(supervisor, "utc_now", side_effect=lambda: self.iso(clock[0])).start()
        mock.patch.object(supervisor, "safe_load_approval_state",
                          side_effect=lambda config: {"pending": [dict(item) for item in self.pending],
                                                      "history": []}).start()
        mock.patch.object(supervisor, "resolve_approval", side_effect=self.resolve).start()
        mock.patch.object(supervisor, "ensure_task_brief", return_value=None).start()
        self.choose = mock.patch.object(supervisor, "choose_chair_reviewer", return_value=("claude", "Claude")).start()
        self.enqueue = mock.patch.object(supervisor, "enqueue_event").start()
        self.addCleanup(mock.patch.stopall)

    # Fixtures -----------------------------------------------------------

    @staticmethod
    def iso(moment: datetime) -> str:
        return moment.replace(microsecond=0).isoformat().replace("+00:00", "Z")

    def advance(self, seconds: int) -> None:
        self.clock[0] = self.clock[0] + self.timedelta(seconds=seconds)

    def resolve(self, config, approval_id, **kwargs) -> None:
        self.pending[:] = [item for item in self.pending if item["approval_id"] != approval_id]

    def add_approval(self) -> str:
        approval_id = f"apr-{len(self.pending)}-{self.iso(self.clock[0])}"
        self.pending.append({"approval_id": approval_id, "status": "pending", "created_at": self.iso(self.clock[0])})
        return approval_id

    def queue(self) -> bool:
        return supervisor.queue_chair_review(self.config, self.state, supervisor.load_status(self.config), {})

    def active_reason(self) -> str | None:
        return (self.state["chair_review"].get("active_review") or {}).get("reason")

    def payload(self, reason: str) -> dict:
        return {"version": 1, "decision": reason, "approval_ttl_minutes": 45, "reason": "r", "blocked_by": [],
                "approval_actions": [{"approval_id": item["approval_id"], "decision": "deny", "reason": "r"}
                                     for item in self.pending],
                "reassignment_actions": [], "task_actions": [], "provider_actions": [], "recommended_focus": []}

    def complete(self, payload: dict | None) -> bool:
        """The active Chair run finishes: valid outputs, or none at all."""
        active = self.state["chair_review"]["active_review"]
        if payload is not None:
            Path(active["markdown_path"]).write_text("# Review\n", encoding="utf-8")
            Path(active["json_path"]).write_text(json.dumps(payload), encoding="utf-8")
        self.state["queue"]["events"][active["queue_event_id"]] = {"status": "completed"}
        return supervisor.refresh_chair_review_state(self.config, self.state, provider_report={})

    def dispatch_approval(self) -> None:
        self.add_approval()
        self.assertEqual(supervisor.chair_review_reason(
            self.state, {"pending": self.pending}, status=supervisor.load_status(self.config), config=self.config),
            "approval_triage")
        self.assertTrue(supervisor.chair_review_needs_immediate_attention(
            self.state, supervisor.load_status(self.config), {"pending": self.pending}))
        self.assertTrue(self.queue())
        self.assertEqual(self.active_reason(), "approval_triage")

    # Tests --------------------------------------------------------------

    def test_existing_approval_success_preserves_due_blocked_cadence_and_original_failure_priority_controls(self) -> None:
        status_bytes = self.status_path.read_bytes()
        records = supervisor.dependency_ready_blocked_task_records(self.config, supervisor.load_status(self.config))
        self.assertEqual([record["task_id"] for record in records], [self.task["id"]])
        self.assertIsNotNone(records[0]["merged_acceptance_resume"])

        # Approvals arrive every ten minutes (< 900s); each is resolved, leaving pending empty.
        for _ in range(3):
            before = self.state["chair_review"]["cooldown_until"]
            self.dispatch_approval()
            enqueued = self.enqueue.call_count
            # Single active Chair: nothing else is dispatched while it runs, fresh signal or not.
            self.advance(30)
            self.add_approval()
            self.assertFalse(self.queue())
            self.assertEqual(self.enqueue.call_count, enqueued)
            self.advance(30)
            self.assertTrue(self.complete(self.payload("approval_triage")))
            chair = self.state["chair_review"]
            self.assertEqual(self.pending, [])
            self.assertIsNone(chair["active_review"])
            self.assertEqual(chair["last_reason"], "approval_triage")
            self.assertEqual(chair["last_review_at"], self.iso(self.clock[0]))
            self.assertEqual(chair["failure_streak"], 0)
            # Neither extended nor cleared: the pre-approval deadline is kept as is.
            self.assertEqual(chair["cooldown_until"], before)
            self.assertEqual(self.status_path.read_bytes(), status_bytes)
            self.advance(540)

        # Pending is empty and nothing new arrived: the already-due blocked review now runs.
        self.assertFalse(supervisor.chair_review_needs_immediate_attention(
            self.state, supervisor.load_status(self.config), {"pending": []}))
        self.assertTrue(self.queue())
        self.assertEqual(self.active_reason(), "blocked_task_triage")
        self.assertEqual(self.enqueue.call_count, 4)
        self.assertEqual(self.enqueue.call_args.args[1]["reason"], "chair_review:blocked_task_triage")
        # Queueing the review is the only effect: no board write, phase change or vote.
        self.assertEqual(self.status_path.read_bytes(), status_bytes)
        self.assertEqual(json.loads(self.status_path.read_text())["tasks"][0]["status"], "blocked")

    def test_successful_approval_keeps_a_live_failure_deadline_and_seen_pending_cannot_bypass_it(self) -> None:
        # A genuine failure: the blocked review finishes without its declared outputs.
        self.assertTrue(self.queue())
        self.assertEqual(self.active_reason(), "blocked_task_triage")
        self.advance(60)
        self.assertTrue(self.complete(None))
        failure_deadline = self.state["chair_review"]["cooldown_until"]
        self.assertEqual(failure_deadline, self.iso(self.clock[0] + self.timedelta(seconds=900)))
        self.assertEqual(self.state["chair_review"]["failure_streak"], 1)
        self.advance(60)
        self.assertFalse(self.queue())

        # A fresh approval still takes priority over the due blocked review and bypasses the clock...
        self.dispatch_approval()
        self.advance(60)
        self.assertTrue(self.complete(self.payload("approval_triage")))
        # ...but its success neither clears nor extends the live failure deadline.
        self.assertEqual(self.state["chair_review"]["cooldown_until"], failure_deadline)
        self.assertFalse(self.queue())
        self.assertIsNone(self.state["chair_review"]["active_review"])

        # A malformed approval verdict is a failure: it backs off again and the
        # still-pending, already-seen approval cannot bypass that clock.
        self.advance(60)
        self.dispatch_approval()
        self.advance(60)
        self.assertTrue(self.complete({"version": 1, "decision": "approval_triage"}))
        retry_after = self.state["chair_review"]["cooldown_until"]
        self.assertEqual(retry_after, self.iso(self.clock[0] + self.timedelta(seconds=900)))
        self.assertEqual(self.state["chair_review"]["failure_streak"], 1)
        self.assertEqual(len(self.pending), 1)
        self.advance(60)
        self.assertFalse(supervisor.chair_review_needs_immediate_attention(
            self.state, supervisor.load_status(self.config), {"pending": self.pending}))
        enqueued = self.enqueue.call_count
        self.assertFalse(self.queue())
        self.assertEqual(self.enqueue.call_count, enqueued)

        # Once the real deadline passes the cadence resumes on its own.
        self.advance(900)
        self.assertTrue(self.queue())
        self.assertEqual(self.active_reason(), "approval_triage")

    def test_non_approval_success_still_sets_the_cooldown_and_blocks_due_work(self) -> None:
        self.status_path.write_text(json.dumps({**self.board, "tasks": [], "blockers": []}), encoding="utf-8")
        for reason in ("blocked_task_triage", "reassignment_triage", "provider_health_triage", "operational_review"):
            with self.subTest(reason=reason):
                self.advance(60)
                self.state["chair_review"]["cooldown_until"] = "2026-10-29T08:15:00Z"
                self.state["chair_review"]["active_review"] = {
                    "agent_id": "claude", "agent": "Claude", "reason": reason, "queue_event_id": f"evt-{reason}",
                    "markdown_path": str(self.root / "chair-reviews" / f"{reason}.md"),
                    "json_path": str(self.root / "chair-reviews" / f"{reason}.json"),
                }
                self.assertTrue(self.complete(self.payload(reason)))
                self.assertEqual(self.state["chair_review"]["last_reason"], reason)
                self.assertEqual(self.state["chair_review"]["cooldown_until"],
                                 self.iso(self.clock[0] + self.timedelta(seconds=900)))

        # A real unexpired non-approval cooldown still blocks a due blocked review.
        self.status_path.write_text(json.dumps(self.board), encoding="utf-8")
        self.advance(60)
        self.assertEqual(supervisor.chair_review_reason(
            self.state, {"pending": []}, status=supervisor.load_status(self.config), config=self.config),
            "blocked_task_triage")
        self.assertFalse(self.queue())
        self.enqueue.assert_not_called()

    def test_approval_success_without_ready_blocked_rows_queues_no_follow_up_work(self) -> None:
        idle = {**self.board, "tasks": [], "blockers": []}
        self.status_path.write_text(json.dumps(idle), encoding="utf-8")
        chair = self.state["chair_review"]
        chair["last_operational_fingerprint"] = supervisor.operational_review_fingerprint(
            idle, {"pending": []}, self.state)
        chair["last_operational_review_at"] = self.iso(self.clock[0])
        self.dispatch_approval()
        self.advance(60)
        self.assertTrue(self.complete(self.payload("approval_triage")))
        self.assertEqual(chair["cooldown_until"], "2026-10-29T08:15:00Z")
        self.advance(60)
        self.assertIsNone(supervisor.chair_review_reason(
            self.state, {"pending": []}, status=idle, config=self.config))
        self.assertFalse(self.queue())
        self.assertEqual(self.enqueue.call_count, 1)
