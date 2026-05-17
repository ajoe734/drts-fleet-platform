#!/usr/bin/env python3
"""Smoke tests verifying branch_routing is wired into supervisor and the
copilot_cloud adapter as expected by docs/ops/orchestrator-integration-guide.md.

These don't exercise the full supervisor dispatch loop (that requires too much
mocking for the value); instead they verify the integration points by static
inspection and by exercising the adapter's command-building path directly.
"""
from __future__ import annotations

import inspect
import unittest
from pathlib import Path
from unittest import mock

import branch_routing
import supervisor
from adapters import copilot_cloud
from adapters.base import DeliveryRequest


HERE = Path(__file__).resolve().parent


class SupervisorRoutingHookTests(unittest.TestCase):
    """Confirms supervisor.start_worker_for_request stamps routing fields onto
    the worker record. We assert via source inspection because the function
    itself is non-trivial to exercise end-to-end without a full config."""

    def test_supervisor_imports_route_task(self) -> None:
        self.assertIs(supervisor.route_task, branch_routing.route_task)

    def test_start_worker_for_request_sets_routing_fields(self) -> None:
        source = inspect.getsource(supervisor.start_worker_for_request)
        for field in [
            '"track": routing.track',
            '"base_branch": routing.base_branch',
            '"publish_branch": routing.publish_branch',
            '"gate_layer": "feat"',
            '"routing_matched_rule": routing.matched_rule_index',
        ]:
            self.assertIn(field, source, f"missing in start_worker_for_request: {field}")

    def test_routing_uses_request_task_id(self) -> None:
        source = inspect.getsource(supervisor.start_worker_for_request)
        self.assertIn("route_task(request.task_id, config=config)", source)


class CopilotCloudRoutingFallbackTests(unittest.TestCase):
    """Verifies the copilot_cloud adapter falls back to branch_routing when
    providers.copilot.cloud.base_branch is not explicitly configured."""

    def _build_adapter(self, *, base_branch: str | None) -> copilot_cloud.CopilotCloudAdapter:
        cloud_cfg: dict = {"repo": "ajoe734/drts-fleet-platform"}
        if base_branch is not None:
            cloud_cfg["base_branch"] = base_branch
        config = {
            "providers": {"copilot": {"cloud": cloud_cfg}},
            "agents": {"copilot-cloud-agent": {"id": "copilot-cloud-agent"}},
            "paths": {"status_file": str(HERE / "ai-status.json")},
        }
        return copilot_cloud.CopilotCloudAdapter(config=config, provider_capabilities={})

    def _capture_command(self, adapter: copilot_cloud.CopilotCloudAdapter, request: DeliveryRequest) -> list[str]:
        # Bypass the capability check so the adapter actually builds a command.
        cap = mock.MagicMock()
        cap.installed = True
        cap.verified = "verified"
        cap.notes = ""
        with mock.patch.object(adapter, "capability", return_value=cap), \
             mock.patch.object(copilot_cloud, "command_exists", return_value="/usr/bin/gh"), \
             mock.patch.object(copilot_cloud, "spawn_background_process") as spawn:
            spawn.return_value = (mock.MagicMock(pid=12345), None)
            adapter.deliver(request)
            self.assertTrue(spawn.called, "spawn_background_process should have been called")
            command_arg = spawn.call_args[0][0]
            return list(command_arg)

    def test_falls_back_to_routed_branch_when_config_branch_absent(self) -> None:
        adapter = self._build_adapter(base_branch=None)
        request = DeliveryRequest(
            agent_id="copilot-cloud-agent",
            provider="copilot",
            delivery_mode="copilot_cloud",
            task_id="BE-APR-NOTIFY-001",
            message="do the thing",
            reason="test",
            metadata={},
        )
        command = self._capture_command(adapter, request)
        self.assertIn("--base", command)
        idx = command.index("--base")
        self.assertEqual(command[idx + 1], "dev")

    def test_falls_back_to_frontend_for_ui_tasks(self) -> None:
        adapter = self._build_adapter(base_branch=None)
        request = DeliveryRequest(
            agent_id="copilot-cloud-agent",
            provider="copilot",
            delivery_mode="copilot_cloud",
            task_id="OPS-UI-APR-001",
            message="ship the canvas",
            reason="test",
            metadata={},
        )
        command = self._capture_command(adapter, request)
        idx = command.index("--base")
        self.assertEqual(command[idx + 1], "dev")

    def test_explicit_config_branch_wins_over_routing(self) -> None:
        adapter = self._build_adapter(base_branch="custom-base")
        request = DeliveryRequest(
            agent_id="copilot-cloud-agent",
            provider="copilot",
            delivery_mode="copilot_cloud",
            task_id="BE-APR-NOTIFY-001",  # would route to backend trunk
            message="m",
            reason="test",
            metadata={},
        )
        command = self._capture_command(adapter, request)
        idx = command.index("--base")
        self.assertEqual(command[idx + 1], "custom-base")

    def test_no_base_flag_when_no_task_id_and_no_config_branch(self) -> None:
        adapter = self._build_adapter(base_branch=None)
        request = DeliveryRequest(
            agent_id="copilot-cloud-agent",
            provider="copilot",
            delivery_mode="copilot_cloud",
            task_id=None,
            message="ad-hoc",
            reason="test",
            metadata={},
        )
        command = self._capture_command(adapter, request)
        self.assertNotIn("--base", command)


if __name__ == "__main__":
    unittest.main()
