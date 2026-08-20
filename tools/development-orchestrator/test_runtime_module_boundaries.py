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


class ExtractedLeafModulesStayLeavesTests(unittest.TestCase):
    EXTRACTED = ("host_probes.py", "agent_directory.py")

    def test_no_extracted_module_imports_the_runtime_back(self) -> None:
        """The whole reason these were safe to move.

        An import back into supervisor_runtime would recreate the cycle the
        leaf-first order exists to avoid, and it would do so quietly: Python
        tolerates it until the import order changes.
        """
        for name in self.EXTRACTED:
            with self.subTest(module=name):
                imports = _imported_modules(INFRA / name)
                offenders = {m for m in imports if "runtime" in m}
                self.assertEqual(offenders, set(), f"{name} imports {offenders}")

    def test_extracted_modules_do_not_reach_into_orchestration(self) -> None:
        """Lookups and host reads, not decisions.

        These two layers answer "what is this machine doing" and "which agent
        is this". Importing dispatch or chair policy here would mean the module
        had started deciding something, which is the point at which it stops
        being a leaf.
        """
        forbidden = ("control_plane.usecases", "control_plane.domain.dispatch_policy",
                     "control_plane.domain.chair_policy", "github_bus", "adapters")
        for name in self.EXTRACTED:
            with self.subTest(module=name):
                imports = _imported_modules(INFRA / name)
                for bad in forbidden:
                    self.assertNotIn(bad, imports, f"{name} imports {bad}")

    def test_the_runtime_no_longer_defines_what_was_moved(self) -> None:
        """A re-inlined copy would drift from the extracted one in silence."""
        runtime_defs = _top_level_defs(RUNTIME)
        for name in self.EXTRACTED:
            for moved in _top_level_defs(INFRA / name):
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
            for moved in _top_level_defs(INFRA / name):
                if moved.startswith("__"):
                    continue
                with self.subTest(symbol=moved):
                    self.assertTrue(hasattr(supervisor_runtime, moved), moved)


if __name__ == "__main__":
    unittest.main()
