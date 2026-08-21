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


EXTRACTED_PATHS = {
    "host_probes.py": INFRA,
    "agent_directory.py": INFRA,
    "task_records.py": DOMAIN,
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
            for moved in _top_level_defs(EXTRACTED_PATHS[name] / name):
                with self.subTest(module=name, symbol=moved):
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
            for moved in _top_level_defs(EXTRACTED_PATHS[name] / name):
                if moved.startswith("__"):
                    continue
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


if __name__ == "__main__":
    unittest.main()
