#!/usr/bin/env python3
from __future__ import annotations

import unittest

from control_plane.infra import runtime_repo as runtime_state


class RuntimeStateMigrationTests(unittest.TestCase):
    def test_migrate_state_preserves_maintenance_throttle_metadata(self) -> None:
        raw = {
            "version": 4,
            "maintenance": {
                "worker_workspace_cleanup": {
                    "last_attempt_at": "2026-07-20T01:00:00Z",
                    "last_result": {"checked": 1, "skipped": 1},
                }
            },
        }

        state = runtime_state.migrate_state(raw)

        self.assertEqual(
            state["maintenance"]["worker_workspace_cleanup"]["last_attempt_at"],
            "2026-07-20T01:00:00Z",
        )
        self.assertEqual(
            state["maintenance"]["worker_workspace_cleanup"]["last_result"],
            {"checked": 1, "skipped": 1},
        )

    def test_migrate_state_drops_unscoped_legacy_quota_pauses(self) -> None:
        raw = {
            "version": 2,
            "queue": {"events": {}},
            "workers": {},
            "approvals": {"last_reconciled_at": None},
            "quota_paused_agents": {
                "qwen": {
                    "reason": "Qwen OAuth quota exceeded",
                    "resume_at": 9999999999,
                    "paused_at": "2026-04-15T16:44:26Z",
                }
            },
            "supervisor": {"pid": 1234, "started_at": "2026-04-15T16:44:26Z", "last_heartbeat_at": "2026-04-15T16:44:30Z"},
        }

        migrated = runtime_state.migrate_state(raw)

        self.assertNotIn("quota_paused_agents", migrated)
        self.assertEqual(migrated["provider_pauses"], {})
        self.assertEqual(migrated["provider_pause_schema"], 3)

    def test_migrate_state_initializes_chair_review_and_failure_streaks(self) -> None:
        migrated = runtime_state.migrate_state({"version": 2})

        self.assertIn("chair_review", migrated)
        self.assertEqual(migrated["chair_review"]["active_review"], None)
        self.assertEqual(migrated["chair_review"]["rotation_index"], 0)
        self.assertEqual(migrated["failure_streaks"], {})
        self.assertEqual(migrated["chair_reassignment_guards"], {})
        self.assertEqual(migrated["supervisor"]["lifecycle"], "running")

    def test_migrate_state_moves_legacy_task_mirror_to_watcher_cursor(self) -> None:
        migrated = runtime_state.migrate_state(
            {"version": 3, "tasks": {"TASK-1": {"status": "review"}}}
        )

        self.assertEqual(migrated["version"], 6)
        self.assertNotIn("tasks", migrated)
        self.assertEqual(
            migrated["watcher"]["task_snapshots"]["TASK-1"]["status"],
            "review",
        )

    def test_migrate_state_absorbs_legacy_yield_into_terminal_attempt(self) -> None:
        migrated = runtime_state.migrate_state(
            {
                "version": 5,
                "worker_yields": {
                    "TASK-1:codex": {
                        "summary": "CI is still running",
                        "yielded_at": "2026-08-14T12:00:00Z",
                        "resume_at": "2026-08-14T12:02:00Z",
                    }
                },
                "workers": {
                    "codex-1": {
                        "run_id": "codex-1",
                        "task_id": "TASK-1",
                        "agent_id": "codex",
                        "status": "yielded",
                    }
                },
            }
        )

        worker = migrated["workers"]["codex-1"]
        self.assertEqual(worker["status"], "completed")
        self.assertEqual(worker["terminal_outcome"], "progress")
        self.assertEqual(worker["redispatch_after"], "2026-08-14T12:02:00Z")
        self.assertNotIn("worker_yields", migrated)

    def test_upsert_and_clear_dispatch_pause(self) -> None:
        state = runtime_state.default_state()
        pause = {
            "provider": "codex2",
            "task_id": "P3-002",
            "worker_run_id": "codex-1",
            "paused_at": "2026-04-18T02:00:00Z",
            "blocked_until": "2026-04-18T02:05:00Z",
            "failure_kind": "provider failure",
            "summary": "provider failure: worker stalled",
            "raw_ref": ".orchestrator/evidence/codex-1.json",
            "mode_bucket": "execution",
        }

        runtime_state.upsert_dispatch_pause(state, pause)
        self.assertEqual(len(state["dispatch_pauses"]), 1)
        self.assertEqual(state["dispatch_pauses"][0]["raw_ref"], pause["raw_ref"])

        updated = dict(pause)
        updated["summary"] = "provider failure: retry scheduled"
        runtime_state.upsert_dispatch_pause(state, updated)
        self.assertEqual(len(state["dispatch_pauses"]), 1)
        self.assertEqual(state["dispatch_pauses"][0]["summary"], updated["summary"])

        runtime_state.clear_dispatch_pause(state, task_id="P3-002", worker_run_id="codex-1")
        self.assertEqual(state["dispatch_pauses"], [])



class PruneExpiredReassignmentGuardsTests(unittest.TestCase):
    def test_drops_expired_keeps_future_and_unparseable(self) -> None:
        from datetime import datetime, timezone, timedelta
        now = datetime.now(timezone.utc)
        past = (now - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        future = (now + timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        state = {
            "chair_reassignment_guards": {
                "T1:reviewer": {"task_id": "T1", "expires_at": past},
                "T2:owner": {"task_id": "T2", "expires_at": future},
                "T3:owner": {"task_id": "T3", "expires_at": "not-a-date"},
                "T4:owner": {"task_id": "T4"},  # missing expires_at
            }
        }
        runtime_state.prune_expired_reassignment_guards(state)
        self.assertEqual(set(state["chair_reassignment_guards"]), {"T2:owner", "T3:owner", "T4:owner"})

    def test_safe_on_missing_or_empty(self) -> None:
        empty: dict = {}
        runtime_state.prune_expired_reassignment_guards(empty)  # must not raise
        self.assertNotIn("chair_reassignment_guards", empty)
        state = {"chair_reassignment_guards": {}}
        runtime_state.prune_expired_reassignment_guards(state)
        self.assertEqual(state["chair_reassignment_guards"], {})



class StateDigestTests(unittest.TestCase):
    def test_digest_slims_workers_and_omits_bulk(self) -> None:
        state = {
            "version": 3,
            "last_scan_at": "2026-05-31T00:00:00Z",
            "seen_event_keys": {f"k{i}": "t" * 400 for i in range(500)},
            "tasks": {f"T{i}": {"summary_zh": "x" * 500} for i in range(200)},
            "provider_pauses": {"claude2": {"kind": "auth"}},
            "failure_streaks": {"X:owner": {"count": 2}},
            "dispatch_pauses": [{"task_id": "Y"}],
            "chair_reassignment_guards": {"Z:owner": {"expires_at": "2030-01-01T00:00:00Z"}},
            "chair_review": {"rotation_index": 1},
            "supervisor": {"lifecycle": "running"},
            "workers": {
                "r1": {
                    "status": "running", "task_id": "T1", "provider": "claude",
                    "request_snapshot": {"reason": "owned_ready_dispatch", "message": "m" * 9000},
                    "command": "c" * 8000, "metadata": {"big": "d" * 8000},
                },
            },
        }
        digest = runtime_state.build_state_digest(state)
        # bulk omitted
        self.assertNotIn("seen_event_keys", digest)
        self.assertNotIn("tasks", digest)
        # chair-relevant kept
        self.assertEqual(digest["provider_pauses"], {"claude2": {"kind": "auth"}})
        self.assertIn("failure_streaks", digest)
        self.assertIn("chair_reassignment_guards", digest)
        # worker slimmed: reason preserved, fat fields dropped
        w = digest["workers"]["r1"]
        self.assertEqual(w["reason"], "owned_ready_dispatch")
        self.assertEqual(w["status"], "running")
        self.assertNotIn("request_snapshot", w)
        self.assertNotIn("command", w)
        self.assertNotIn("metadata", w)
        # whole digest stays tiny despite fat input
        import json as _json
        self.assertLess(len(_json.dumps(digest)), 4096)


if __name__ == "__main__":
    unittest.main()
