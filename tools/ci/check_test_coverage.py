#!/usr/bin/env python3
"""Every test file must be on a path CI actually runs.

A test that nobody runs is worse than no test: it reads as coverage. This
repository has been bitten twice. `control_plane/tests/test_lane_health.py`
used bare functions with no TestCase, so unittest collected the module and
skipped its three tests -- and those were the only tests for the predicate at
the centre of a lane-pause fault, so they had never executed once. Separately,
`tools/ci/git/` is on no discovery path at all, so a test file placed beside
the script it covers would never have run.

The covered paths are read out of the workflow files rather than restated here.
Restating them would make this checker a second answer to "what does CI run",
free to drift from the first -- which is the exact fault it exists to catch.

Exit 0 when every test file is both reachable and collectable.
"""
from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

WORKFLOWS = ("ci.yml", "ci-integ.yml")
# Copies of the tree, not source: worktrees, release bundles, extracted archives.
EXCLUDED_ROOTS = {"workspace", ".artifacts", ".git", "node_modules"}
EXCLUDED_MARKERS = ("node_modules", "__pycache__", "_extracted", "tmp_iam_acc3_fix")
SEARCH_ROOTS = ("tools", "operations", "apps", "packages")

_DISCOVER_RE = re.compile(r"unittest\s+discover\s+-s\s+(\S+)")
_DIRECT_RE = re.compile(r"unittest\s+(\S+\.py)")


def covered_targets(repo_root: Path) -> tuple[set[str], set[str]]:
    """(discovery roots, explicitly named files) as the workflows declare them."""
    roots: set[str] = set()
    files: set[str] = set()
    for name in WORKFLOWS:
        path = repo_root / ".github" / "workflows" / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        roots.update(m.rstrip("/") for m in _DISCOVER_RE.findall(text))
        files.update(_DIRECT_RE.findall(text))
    return roots, files


def python_test_files(repo_root: Path) -> list[Path]:
    found: list[Path] = []
    for root in SEARCH_ROOTS:
        base = repo_root / root
        if not base.is_dir():
            continue
        for path in base.rglob("test_*.py"):
            relative = path.relative_to(repo_root)
            if relative.parts[0] in EXCLUDED_ROOTS:
                continue
            if any(marker in str(relative) for marker in EXCLUDED_MARKERS):
                continue
            found.append(relative)
    return sorted(found)


def uncollectable(repo_root: Path, relative: Path) -> int:
    """Count of bare `def test_*` functions unittest will silently skip.

    unittest collects TestCase subclasses. A module of bare functions -- pytest
    style -- imports cleanly, reports nothing, and passes.
    """
    try:
        tree = ast.parse((repo_root / relative).read_text(encoding="utf-8", errors="ignore"))
    except (OSError, SyntaxError):
        return 0
    if any(isinstance(node, ast.ClassDef) for node in tree.body):
        return 0
    return sum(
        1 for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name.startswith("test_")
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()

    roots, explicit = covered_targets(repo_root)
    if not roots and not explicit:
        print("::error::check_test_coverage: no unittest invocation found in the workflows.", file=sys.stderr)
        return 1

    unreachable: list[Path] = []
    silent: list[tuple[Path, int]] = []
    for relative in python_test_files(repo_root):
        text = str(relative)
        if not (any(text.startswith(f"{root}/") for root in roots) or text in explicit):
            unreachable.append(relative)
            continue
        count = uncollectable(repo_root, relative)
        if count:
            silent.append((relative, count))

    if not unreachable and not silent:
        print(f"check_test_coverage: every test file is reachable and collectable "
              f"({len(python_test_files(repo_root))} checked).")
        return 0

    print("::error::check_test_coverage: tests that will never run", file=sys.stderr)
    for relative in unreachable:
        print(f"  - {relative}: on no path CI runs. Covered roots: {', '.join(sorted(roots)) or '(none)'}",
              file=sys.stderr)
    for relative, count in silent:
        print(f"  - {relative}: {count} bare test function(s) and no TestCase; unittest will skip them.",
              file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
