#!/usr/bin/env python3
"""Every test file must contribute at least one test that CI actually runs.

A test that nobody runs is worse than no test: it reads as coverage. This
repository has been bitten twice. control_plane/tests/test_lane_health.py held
three pytest-style functions with no TestCase, so unittest imported the module,
collected nothing, and stayed green -- and those were the only tests for the
predicate at the centre of the lane-pause fault that stalled dispatch.
Separately, tools/ci/git/ sits on no discovery root, so a test placed beside the
script it covers would never have run.

Nothing here restates a fact it can measure. Which files exist is asked of git,
what CI runs is read out of the workflows, and what unittest reaches is settled
by running discovery and seeing which files yield a test. Restating any of those
would make this checker a second answer to a question that already has one --
the exact fault it exists to catch, and the fault its first version shipped
with: a hand-written exclusion list silently dropped a real test file whose
name happened to contain `node_modules`, and a path-prefix rule blessed
directories discovery cannot enter for want of an __init__.py.

One measurement covers every way a test can fail to run -- unreachable
directory, missing __init__.py, bare functions, a module that fails to import.
The AST pass that follows only names the reason.

Exit 0 when every tracked test file yields at least one collected test.
"""
from __future__ import annotations

import argparse
import ast
import fnmatch
import re
import subprocess
import sys
from pathlib import Path

WORKFLOWS = ("ci.yml", "ci-integ.yml")
DEFAULT_PATTERN = "test_*.py"

_DISCOVER_RE = re.compile(r"unittest\s+discover\s+-s\s+(\S+)(?:\s+-p\s+['\"]?([^'\"\s]+))?")
_DIRECT_RE = re.compile(r"unittest\s+((?:\S+/)*\S+\.py)")

# Enumerate the files that actually yield a test, in a child process: discovery
# imports the modules it walks, and those imports belong nowhere near this one.
_COLLECT = """
import sys, unittest
from pathlib import Path
start, pattern, top = sys.argv[1], sys.argv[2], sys.argv[3]
seen = set()
def walk(suite):
    for test in suite:
        if isinstance(test, unittest.TestSuite):
            walk(test)
            continue
        module = sys.modules.get(type(test).__module__)
        path = getattr(module, "__file__", None)
        if path:
            seen.add(str(Path(path).resolve()))
try:
    walk(unittest.defaultTestLoader.discover(start, pattern=pattern, top_level_dir=top))
except Exception as error:
    print(f"!{error}", file=sys.stderr)
print("\\n".join(sorted(seen)))
"""


def covered_targets(repo_root: Path) -> tuple[set[tuple[str, str]], set[str]]:
    """((discovery root, pattern), explicit files) as the workflows declare them."""
    roots: set[tuple[str, str]] = set()
    files: set[str] = set()
    for name in WORKFLOWS:
        path = repo_root / ".github" / "workflows" / name
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for start, pattern in _DISCOVER_RE.findall(text):
            roots.add((start.rstrip("/"), pattern or DEFAULT_PATTERN))
        files.update(_DIRECT_RE.findall(text))
    return roots, files


def tracked_test_files(repo_root: Path, patterns: set[str]) -> list[Path]:
    """Tracked files whose name matches a pattern CI discovers by.

    git is the authority on which files are source. Release worktrees, extracted
    bundles and vendored trees are untracked here, so they never enter the scan
    and no hand-written exclusion list can misfire on a real file.
    """
    listed = subprocess.run(["git", "ls-files", "-z", "--", "*.py"], cwd=repo_root,
                            capture_output=True, text=True, check=True).stdout
    return sorted(
        Path(name) for name in listed.split("\0")
        if name and any(fnmatch.fnmatch(Path(name).name, pattern) for pattern in patterns)
    )


def collected_files(repo_root: Path, roots: set[tuple[str, str]], explicit: set[str]) -> set[Path]:
    """The files that yield at least one test when CI's own commands run."""
    targets = [(start, pattern, start) for start, pattern in roots]
    # `python3 -m unittest path/to/test_x.py` is discovery over a single name.
    targets += [(str(Path(name).parent), Path(name).name, str(Path(name).parent)) for name in explicit]

    collected: set[Path] = set()
    for start, pattern, top in targets:
        if not (repo_root / start).is_dir():
            continue
        result = subprocess.run([sys.executable, "-c", _COLLECT, start, pattern, top],
                                cwd=repo_root, capture_output=True, text=True, check=False)
        for line in result.stdout.splitlines():
            try:
                collected.add(Path(line).resolve().relative_to(repo_root))
            except ValueError:
                continue
    return collected


def reason(repo_root: Path, relative: Path, roots: set[tuple[str, str]]) -> str:
    """Name the likeliest cause, to save the next person the bisect."""
    text = str(relative)
    if not any(text.startswith(f"{start}/") for start, _ in roots):
        listed = ", ".join(sorted(start for start, _ in roots)) or "(none)"
        return f"on no path CI runs (discovery roots: {listed})"

    try:
        tree = ast.parse((repo_root / relative).read_text(encoding="utf-8", errors="ignore"))
    except (OSError, SyntaxError) as error:
        return f"does not parse: {error}"

    bare = [node.name for node in tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name.startswith("test_")]
    if bare:
        return (f"{len(bare)} bare test function(s) and no TestCase collecting them; "
                "unittest only collects TestCase methods")

    for parent in relative.parents:
        if str(parent) == "." or any(str(parent) == start for start, _ in roots):
            break
        if not (repo_root / parent / "__init__.py").exists():
            return f"{parent}/ has no __init__.py, so discovery cannot descend into it"

    return "yields no test when discovery runs (import error, or no TestCase at all)"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()

    roots, explicit = covered_targets(repo_root)
    if not roots and not explicit:
        print("::error::check_test_coverage: no unittest invocation found in the workflows.",
              file=sys.stderr)
        return 1

    patterns = {pattern for _, pattern in roots} | {Path(name).name for name in explicit}
    tracked = tracked_test_files(repo_root, patterns | {DEFAULT_PATTERN})
    collected = collected_files(repo_root, roots, explicit)

    silent = [path for path in tracked if path not in collected]
    if not silent:
        print(f"check_test_coverage: all {len(tracked)} test files yield tests CI runs.")
        return 0

    print("::error::check_test_coverage: test files that yield nothing when CI runs",
          file=sys.stderr)
    for path in silent:
        print(f"  - {path}: {reason(repo_root, path, roots)}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
