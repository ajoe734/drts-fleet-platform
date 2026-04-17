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


if __name__ == "__main__":
    unittest.main()
