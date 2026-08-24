#!/usr/bin/env python3
"""The runtime module is being taken apart, one layer at a time.

supervisor_runtime.py reached 8208 lines. The obstacle to splitting it is not
size but entanglement: the feature clusters (chair 1583 lines, worker 1770,
dispatch 801) all reach into a shared helper layer in the same file, so lifting
any one of them out first would create an import cycle.

What can move without that risk is the leaf layer -- functions that depend on
nothing else in the module. There were 99 of those, 1314 lines. They are moved
in cohesive groups rather than into one bag, because a module named for what it
holds is the only part of this that is worth anything afterwards.

These tests are about that boundary, not about behaviour: they fail if an
extracted module grows a dependency that would put the cycle back.
"""

from __future__ import annotations

import ast
import unittest
from pathlib import Path


TOOL_ROOT = Path(__file__).resolve().parent
RUNTIME = TOOL_ROOT / "control_plane" / "runtime" / "supervisor_runtime.py"
INFRA = TOOL_ROOT / "control_plane" / "infra"
DOMAIN = TOOL_ROOT / "control_plane" / "domain"


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
    return found


def _top_level_defs(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return {
        node.name
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
    }


# Two of these existed before the split and were extended by it rather than
# created: worker_lifecycle already owned worker-attempt rules, and host_probes
# already read /proc and the cgroup files that worker CPU accounting needs. A
# cut that lands in a module which already says what it holds is worth more
# than a fourth module about the same subject.
EXTRACTED_PATHS = {
    "host_probes.py": INFRA,
    "agent_directory.py": INFRA,
    "task_records.py": DOMAIN,
    "worker_lifecycle.py": DOMAIN,
}

# What each cut actually lifted out of supervisor_runtime.py. Listed rather than
# derived from "every def in the module", because two of these modules existed
# first and hold names the runtime never imported -- deriving it asserted that
# worker_lifecycle.outcome_id must be reachable from the runtime, which was
# never true and has nothing to do with whether the extraction held.
MOVED_FROM_RUNTIME = {
    "host_probes.py": (
        "_current_cgroup_path", "_host_available_memory_bytes", "_read_cgroup_number",
        "_read_memory_pressure_avg10", "_sd_notify", "_signal_worker_pid",
        "reap_child_pid", "reap_finished_children",
    ),
    "agent_directory.py": (
        "adapter_info_for_agent", "display_name_is_legacy_alias", "known_agent_display_names",
        "ordered_idle_agent_names", "provider_report_age_seconds",
        "provider_report_key_for_agent", "resolve_agent_model_preference",
        "status_agent_names_by_lane",
    ),
    "task_records.py": (
        "_has_dispatchable_backlog", "_task_branch", "_task_is_open", "build_dispatch_event",
        "current_dispatch_event_key", "dispatch_reason_priority",
        "outstanding_queue_event_references", "ready_dispatch_signature",
        "task_index_from_status", "task_is_dispatch_eligible_for_agent",
        "task_role_for_dispatch_reason", "workspace_baseline_cover_task_ids",
    ),
    "worker_lifecycle.py": (
        "heartbeat_lag_seconds", "parse_worker_dispatched_at", "trim_worker_history",
        "worker_reported_outcome", "worker_supports_approval_resume",
    ),
}


class ExtractedLeafModulesStayLeavesTests(unittest.TestCase):
    EXTRACTED = tuple(EXTRACTED_PATHS)

    def test_no_extracted_module_imports_the_runtime_back(self) -> None:
        """The whole reason these were safe to move.

        An import back into supervisor_runtime would recreate the cycle the
        leaf-first order exists to avoid, and it would do so quietly: Python
        tolerates it until the import order changes.
        """
        for name in self.EXTRACTED:
            with self.subTest(module=name):
                imports = _imported_modules(EXTRACTED_PATHS[name] / name)
                offenders = {m for m in imports if "runtime" in m}
                self.assertEqual(offenders, set(), f"{name} imports {offenders}")

    def test_extracted_modules_do_not_reach_into_orchestration(self) -> None:
        """What a module may reach for depends on the layer it landed in.

        host_probes and agent_directory answer "what is this machine doing" and
        "which agent is this" -- importing policy there would mean they had
        started deciding something, which is the point at which they stop being
        lookups. task_records landed in the domain package, where importing a
        sibling policy module is the existing arrangement, so the rule it has to
        keep is the outward one: no usecases, no bus, no adapters.
        """
        outward = ("control_plane.usecases", "github_bus", "adapters")
        policy = ("control_plane.domain.dispatch_policy", "control_plane.domain.chair_policy")
        for name in self.EXTRACTED:
            with self.subTest(module=name):
                imports = _imported_modules(EXTRACTED_PATHS[name] / name)
                forbidden = outward if EXTRACTED_PATHS[name] is DOMAIN else outward + policy
                for bad in forbidden:
                    self.assertNotIn(bad, imports, f"{name} imports {bad}")

    def test_the_runtime_no_longer_defines_what_was_moved(self) -> None:
        """A re-inlined copy would drift from the extracted one in silence."""
        runtime_defs = _top_level_defs(RUNTIME)
        for name in self.EXTRACTED:
            module_defs = _top_level_defs(EXTRACTED_PATHS[name] / name)
            for moved in MOVED_FROM_RUNTIME[name]:
                with self.subTest(module=name, symbol=moved):
                    self.assertIn(moved, module_defs, "the extraction list is out of date")
                    self.assertNotIn(moved, runtime_defs)

    def test_the_moved_names_are_still_reachable_from_the_runtime(self) -> None:
        """Call sites were deliberately not rewritten.

        The extraction is meant to be invisible to every caller; if the names
        stopped resolving through supervisor_runtime, this would have been a
        behaviour change wearing a refactor's clothes.
        """
        import sys

        if str(TOOL_ROOT) not in sys.path:
            sys.path.insert(0, str(TOOL_ROOT))
        from control_plane.runtime import supervisor_runtime

        for name in self.EXTRACTED:
            for moved in MOVED_FROM_RUNTIME[name]:
                with self.subTest(symbol=moved):
                    self.assertTrue(hasattr(supervisor_runtime, moved), moved)

    def test_the_domain_layer_does_not_depend_on_infrastructure(self) -> None:
        """A rule the domain package already kept, now that it has a new member.

        Every module under control_plane/domain imports only stdlib, common, and
        its siblings. task_records was extracted because its functions touch no
        I/O helper at all -- that is what made it domain rather than a third
        repository -- so an infra import here would mean the distinction had
        quietly stopped being true.
        """
        for module in sorted(DOMAIN.glob("*.py")):
            if module.name == "__init__.py":
                continue
            with self.subTest(module=module.name):
                for imported in _imported_modules(module):
                    self.assertFalse(
                        imported.startswith("control_plane.infra"),
                        f"{module.name} imports {imported}",
                    )

    def test_the_readers_that_could_not_move_are_still_reachable(self) -> None:
        """Five worker readers stayed in the runtime module on purpose.

        classify_worker_failure, worker_task_evidence_match,
        worker_matches_current_assignment, worker_assignment_role and
        resolve_terminal_worker_reason reach for detect_worker_failure,
        ready_dispatch_settings and resolve_dispatch_target -- which live in
        infra and usecases. Moving them into domain alongside their siblings
        would have inverted the layering, so the split stopped at the boundary
        rather than at the group. This records that as a decision instead of an
        oversight, and fails if one of them is quietly moved later.
        """
        import sys

        if str(TOOL_ROOT) not in sys.path:
            sys.path.insert(0, str(TOOL_ROOT))
        from control_plane.runtime import supervisor_runtime

        runtime_defs = _top_level_defs(RUNTIME)
        for name in (
            "classify_worker_failure",
            "worker_task_evidence_match",
            "worker_matches_current_assignment",
            "worker_assignment_role",
            "resolve_terminal_worker_reason",
        ):
            with self.subTest(symbol=name):
                self.assertIn(name, runtime_defs)
                self.assertTrue(hasattr(supervisor_runtime, name))


if __name__ == "__main__":
    unittest.main()
