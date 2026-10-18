#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("classify_change_scope.py")
SPEC = importlib.util.spec_from_file_location("classify_change_scope", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
change_scope = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(change_scope)


class ChangeScopeTest(unittest.TestCase):
    def test_tool_only_diff_skips_product_gates(self) -> None:
        result = change_scope.classify_paths(
            [
                "tools/development-orchestrator/github_bus.py",
                "tools/development-orchestrator/test_github_bus.py",
                "tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py",
                ".orchestrator/config.json",
            ]
        )

        self.assertEqual(
            result,
            {"scope": "tool-only", "product": "false", "orchestrator": "true", "e2e": "false"},
        )

    def test_product_diff_runs_product_gates(self) -> None:
        result = change_scope.classify_paths(["apps/api/src/index.ts"])

        self.assertEqual(
            result,
            {"scope": "product", "product": "true", "orchestrator": "false", "e2e": "true"},
        )

    def test_mixed_diff_runs_both_gate_families(self) -> None:
        result = change_scope.classify_paths(
            ["apps/api/src/index.ts", "tools/development-orchestrator/github_bus.py"]
        )

        self.assertEqual(
            result,
            {"scope": "mixed", "product": "true", "orchestrator": "true", "e2e": "true"},
        )

    def test_docs_only_diff_is_non_product(self) -> None:
        result = change_scope.classify_paths(["docs/ops/branch-strategy.md", "README.md"])

        self.assertEqual(
            result,
            {"scope": "non-product", "product": "false", "orchestrator": "false", "e2e": "false"},
        )

    def test_workflow_and_classifier_changes_default_to_product(self) -> None:
        result = change_scope.classify_paths(
            [".github/workflows/ci.yml", "tools/ci/classify_change_scope.py"]
        )

        self.assertEqual(result["scope"], "product")
        self.assertEqual(result["product"], "true")

    def test_full_events_and_empty_diffs_fail_safe(self) -> None:
        expected = {"scope": "full", "product": "true", "orchestrator": "true", "e2e": "true"}

        self.assertEqual(change_scope.classify_paths([], force_full=True), expected)
        self.assertEqual(change_scope.classify_paths([]), expected)

    def test_unknown_paths_keep_product_gates(self) -> None:
        result = change_scope.classify_paths(["new-unclassified-surface/example.py"])
        self.assertEqual(result["product"], "true")
        self.assertEqual(result["e2e"], "true")


class DivergedPrScopeTest(unittest.TestCase):
    """Exercise the CLI against real history, including independent trunk work."""

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="ci-pr-scope-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        self.git("init", "-q", "-b", "dev")
        self.git("config", "user.name", "Scope regression")
        self.git("config", "user.email", "scope@example.invalid")
        self.write("apps/api/src/index.ts", "export const original = true;\n")
        self.write("tools/development-orchestrator/common.py", "BASELINE = True\n")
        self.base = self.commit("Common base")
        self.write("apps/api/src/trunk-only.ts", "export const unrelatedTrunkFeature = true;\n")
        self.trunk = self.commit("Independent product change on dev")
        self.git("checkout", "-q", "-b", "candidate", self.base)
        self.output_counter = 0

    def git(self, *args: str) -> str:
        return subprocess.run(["git", *args], cwd=self.repo, check=True,
                              capture_output=True, text=True).stdout.strip()

    def write(self, path: str, text: str) -> None:
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def commit(self, message: str) -> str:
        self.git("add", ".")
        self.git("commit", "-qm", message)
        return self.git("rev-parse", "HEAD")

    def classify(self, head: str, event: str = "pull_request", base_ref: str = "dev",
                 base_sha: str | None = None) -> tuple[subprocess.CompletedProcess[str], dict[str, str]]:
        self.output_counter += 1
        output = self.root / f"outputs-{self.output_counter}"
        result = subprocess.run(
            [sys.executable, str(MODULE_PATH), "--event-name", event,
             "--base-ref", base_ref, "--base-sha", self.trunk if base_sha is None else base_sha,
             "--head-sha", head, "--github-output", str(output)],
            cwd=self.repo, capture_output=True, text=True,
        )
        values = dict(line.split("=", 1) for line in output.read_text().splitlines()) if output.exists() else {}
        return result, values

    def test_trunk_product_changes_do_not_expand_a_tool_only_pr(self) -> None:
        self.write("tools/development-orchestrator/common.py", "BASELINE = False\n")
        result, values = self.classify(self.commit("Candidate tooling fix"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(values, {"scope": "tool-only", "product": "false", "orchestrator": "true", "e2e": "false"})
        self.assertNotIn("apps/api", result.stdout)

    def test_candidate_product_changes_still_require_product_ci(self) -> None:
        self.write("tools/development-orchestrator/common.py", "BASELINE = False\n")
        self.write("apps/api/src/own-feature.ts", "export const candidateFeature = true;\n")
        result, values = self.classify(self.commit("Candidate product and tooling changes"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(values, {"scope": "mixed", "product": "true", "orchestrator": "true", "e2e": "true"})
        self.assertIn("apps/api/src/own-feature.ts", result.stdout)
        self.assertNotIn("trunk-only.ts", result.stdout)

    def test_product_rename_into_docs_keeps_deleted_product_path(self) -> None:
        (self.repo / "docs").mkdir()
        self.git("mv", "apps/api/src/index.ts", "docs/archived-source.ts")
        result, values = self.classify(self.commit("Move product source into docs"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(values["product"], "true")
        self.assertEqual(values["e2e"], "true")
        self.assertIn("apps/api/src/index.ts", result.stdout)
        self.assertIn("docs/archived-source.ts", result.stdout)

    def test_non_pr_main_empty_and_missing_base_still_run_full_ci(self) -> None:
        self.write("tools/development-orchestrator/common.py", "BASELINE = False\n")
        head = self.commit("Candidate tooling fix")
        for args in ((head, "push"), (head, "workflow_dispatch"),
                     (head, "pull_request", "main"), (self.base,)):
            with self.subTest(args=args):
                result, values = self.classify(*args)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(values, {"scope": "full", "product": "true", "orchestrator": "true", "e2e": "true"})
        result, values = self.classify(head, base_sha="")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(values["scope"], "full")

    def test_unavailable_history_does_not_report_a_green_scope(self) -> None:
        result, values = self.classify(self.base, base_sha="f" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(values, {})

    def test_scope_jobs_fetch_history_for_merge_base(self) -> None:
        workflows = MODULE_PATH.parents[2] / ".github/workflows"
        for file, job in (("ci.yml", "scope"), ("ci-integ.yml", "changes")):
            with self.subTest(workflow=file):
                text = (workflows / file).read_text()
                block = text.split(f"\n  {job}:\n", 1)[1].split("      - name:", 1)[0]
                self.assertIn("uses: actions/checkout@", block)
                self.assertIn("fetch-depth: 0", block)


if __name__ == "__main__":
    unittest.main()
