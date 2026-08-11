from __future__ import annotations

import unittest

from control_plane.domain.resource_admission import decide


def _config() -> dict:
    return {
        "supervisor": {
            "resource_guard": {
                "enabled": True,
                "max_execution_workers": 3,
                "max_control_workers": 1,
                "max_heavy_workers": 1,
                "dispatch_memory_high_bytes": 100,
                "dispatch_pressure_avg10": 60,
            }
        }
    }


class ResourceAdmissionTests(unittest.TestCase):
    def test_global_limit_counts_waiting_sessions(self) -> None:
        config = {
            "supervisor": {
                "resource_guard": {
                    "max_total_workers": 2,
                    "max_execution_workers": 12,
                }
            }
        }
        state = {
            "workers": {
                "run-1": {"status": "running", "agent_id": "codex"},
                "run-2": {"status": "waiting_approval", "agent_id": "claude"},
            }
        }

        decision = decide(config, state, agent_id="gemini")

        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "global worker limit reached")
        self.assertEqual(decision.total_count, 2)

    def test_blocks_new_product_worker_at_global_limit(self) -> None:
        state = {"workers": {str(index): {"status": "running"} for index in range(3)}}
        decision = decide(_config(), state, {})
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "global execution worker limit reached")

    def test_reserves_control_and_heavy_slots_separately(self) -> None:
        state = {
            "workers": {
                "chair": {"status": "running", "role": "chair"},
                "heavy": {"status": "running", "metadata": {"resource_profile": "heavy"}},
            }
        }
        self.assertFalse(decide(_config(), state, {"control_role": "chair"}).allowed)
        self.assertFalse(decide(_config(), state, {"resource_profile": "heavy"}).allowed)

    def test_blocks_dispatch_when_worker_pressure_is_high(self) -> None:
        state = {"workers": {}, "resource_guard": {"worker_memory_current_bytes": 90, "memory_pressure_some_avg10": 75}}
        decision = decide(_config(), state, {})
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "worker memory pressure admission threshold reached")

    def test_ignores_non_worker_service_memory(self) -> None:
        state = {"workers": {}, "resource_guard": {"memory_current_bytes": 500, "worker_memory_current_bytes": 20}}
        self.assertTrue(decide(_config(), state, {}).allowed)

    def test_enforces_lane_capacity_for_direct_queue_delivery(self) -> None:
        config = _config()
        config["supervisor"]["ready_dispatcher"] = {"max_tasks_per_agent": 1}
        state = {"workers": {"run": {"status": "waiting_approval", "agent_id": "claude"}}}
        decision = decide(config, state, {}, agent_id="claude")
        self.assertFalse(decision.allowed)

    def test_control_worker_does_not_consume_execution_lane_capacity(self) -> None:
        config = _config()
        config["supervisor"]["ready_dispatcher"] = {"max_tasks_per_agent": 1}
        state = {
            "workers": {
                "chair": {"status": "running", "agent_id": "codex", "role": "chair"},
            }
        }
        self.assertTrue(decide(config, state, {}, agent_id="codex").allowed)

    def test_uses_canonical_top_level_lane_capacity(self) -> None:
        config = _config()
        config["ready_dispatcher"] = {
            "max_tasks_per_agent": 1,
            "max_tasks_per_agent_by_lane": {"gemini": 2},
        }
        state = {
            "workers": {
                "first": {"status": "running", "agent_id": "gemini"},
            }
        }

        self.assertTrue(decide(config, state, {}, agent_id="gemini").allowed)
        state["workers"]["second"] = {"status": "running", "agent_id": "gemini"}
        decision = decide(config, state, {}, agent_id="gemini")
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "lane worker limit reached")
