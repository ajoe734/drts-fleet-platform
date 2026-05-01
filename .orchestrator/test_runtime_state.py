#!/usr/bin/env python3
from __future__ import annotations

import unittest

import runtime_state


class RuntimeStateMigrationTests(unittest.TestCase):
    def test_migrate_state_preserves_quota_paused_agents(self) -> None:
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

        self.assertIn("quota_paused_agents", migrated)
        self.assertEqual(migrated["quota_paused_agents"]["qwen"]["reason"], "Qwen OAuth quota exceeded")
        self.assertEqual(migrated["provider_pauses"]["qwen"]["kind"], "quota")

    def test_migrate_state_initializes_chair_review_and_failure_streaks(self) -> None:
        migrated = runtime_state.migrate_state({"version": 2})

        self.assertIn("chair_review", migrated)
        self.assertEqual(migrated["chair_review"]["active_review"], None)
        self.assertEqual(migrated["chair_review"]["rotation_index"], 0)
        self.assertEqual(migrated["failure_streaks"], {})
        self.assertEqual(migrated["chair_reassignment_guards"], {})
        self.assertEqual(migrated["supervisor"]["lifecycle"], "running")

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
        self.assertEqual(runtime_state.dispatch_pauses_for_task(state, "P3-002")[0]["raw_ref"], pause["raw_ref"])

        updated = dict(pause)
        updated["summary"] = "provider failure: retry scheduled"
        runtime_state.upsert_dispatch_pause(state, updated)
        self.assertEqual(len(state["dispatch_pauses"]), 1)
        self.assertEqual(state["dispatch_pauses"][0]["summary"], updated["summary"])

        runtime_state.clear_dispatch_pause(state, task_id="P3-002", worker_run_id="codex-1")
        self.assertEqual(state["dispatch_pauses"], [])


if __name__ == "__main__":
    unittest.main()
