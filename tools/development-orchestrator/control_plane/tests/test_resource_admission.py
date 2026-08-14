from __future__ import annotations

import unittest

from control_plane.domain.resource_admission import decide


def _config() -> dict:
    return {
        "supervisor": {
            "resource_guard": {
                "enabled": True,
                "max_total_workers": 12,
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
        config = {"supervisor": {"resource_guard": {"max_total_workers": 2}}}
        state = {
            "workers": {
                "run-1": {"status": "running", "agent_id": "codex"},
                "run-2": {"status": "waiting_approval", "agent_id": "claude"},
            }
        }
        decision = decide(config, state, agent_id="gemini")
        self.assertFalse(decision.allowed)
        self.assertEqual(decision.reason, "global worker limit reached")

    def test_blocks_new_execution_worker_at_global_limit(self) -> None:
        state = {"workers": {str(index): {"status": "running"} for index in range(3)}}
        self.assertEqual(decide(_config(), state).reason, "global execution worker limit reached")

    def test_reserves_control_and_heavy_slots(self) -> None:
        state = {
            "workers": {
                "chair": {"status": "running", "role": "chair"},
                "heavy": {"status": "running", "metadata": {"resource_profile": "heavy"}},
            }
        }
        self.assertFalse(decide(_config(), state, {"control_role": "chair"}).allowed)
        self.assertFalse(decide(_config(), state, {"resource_profile": "heavy"}).allowed)

    def test_blocks_dispatch_on_worker_pressure(self) -> None:
        state = {"workers": {}, "resource_guard": {"worker_memory_current_bytes": 90, "memory_pressure_some_avg10": 75}}
        self.assertEqual(decide(_config(), state).reason, "worker memory pressure admission threshold reached")

    def test_ignores_non_worker_service_memory(self) -> None:
        state = {"workers": {}, "resource_guard": {"memory_current_bytes": 500, "worker_memory_current_bytes": 20}}
        self.assertTrue(decide(_config(), state).allowed)

    def test_waiting_session_consumes_lane_capacity(self) -> None:
        config = _config()
        config["ready_dispatcher"] = {"max_tasks_per_agent": 1}
        state = {"workers": {"run": {"status": "waiting_approval", "agent_id": "claude"}}}
        self.assertEqual(decide(config, state, agent_id="claude").reason, "lane worker limit reached")
