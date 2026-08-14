#!/usr/bin/env python3
"""Smoke tests verifying branch routing is wired into the Supervisor runtime."""
from __future__ import annotations

import inspect
import unittest

import branch_routing
from control_plane.runtime import supervisor_runtime as supervisor


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


if __name__ == "__main__":
    unittest.main()
