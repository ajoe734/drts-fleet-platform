#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from control_plane.runtime import supervisor_runtime as supervisor


class ChairmanFlowTests(unittest.TestCase):
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
