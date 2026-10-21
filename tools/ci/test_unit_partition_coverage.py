from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("verify_unit_partition_coverage.py")
SPEC = importlib.util.spec_from_file_location("verify_unit_partition_coverage", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
partition_coverage = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(partition_coverage)

discover_manifest = partition_coverage.discover_manifest
load_shard_report = partition_coverage.load_shard_report
merge_reports = partition_coverage.merge_reports
normalize_suite_path = partition_coverage.normalize_suite_path
verify_partition = partition_coverage.verify_partition


def _suite(name: str, status: str = "passed") -> dict:
    return {"name": name, "status": status, "assertionResults": []}


def _report(*names: str) -> dict:
    return {
        "testResults": [_suite(name) for name in names],
        "numTotalTests": len(names),
        "numPassedTests": len(names),
        "numFailedTests": 0,
        "success": True,
    }


class DiscoverManifestTests(unittest.TestCase):
    def test_include_globs_find_matching_files_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "tests" / "unit").mkdir(parents=True)
            (root / "tests" / "unit" / "a.test.ts").write_text("")
            (root / "tests" / "unit" / "b.test.ts").write_text("")
            (root / "tests" / "unit" / "readme.md").write_text("")
            manifest = discover_manifest(root, ["tests/unit/**/*.test.ts"], [])
            self.assertEqual(manifest, {"tests/unit/a.test.ts", "tests/unit/b.test.ts"})

    def test_exclude_glob_removes_a_matched_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "tests" / "unit").mkdir(parents=True)
            (root / "tests" / "unit" / "a.test.ts").write_text("")
            (root / "tests" / "unit" / "quarantined.test.ts").write_text("")
            manifest = discover_manifest(
                root, ["tests/unit/**/*.test.ts"], ["tests/unit/quarantined.test.ts"])
            self.assertEqual(manifest, {"tests/unit/a.test.ts"})

    def test_exclude_directory_glob_removes_every_file_under_it(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            quarantine = root / "tests" / "unit" / "quarantine"
            quarantine.mkdir(parents=True)
            (quarantine / "a.test.ts").write_text("")
            (quarantine / "b.test.ts").write_text("")
            (root / "tests" / "unit" / "kept.test.ts").write_text("")
            manifest = discover_manifest(
                root, ["tests/unit/**/*.test.ts"], ["tests/unit/quarantine/**"])
            self.assertEqual(manifest, {"tests/unit/kept.test.ts"})

    def test_node_modules_is_always_skipped_even_with_a_bare_glob(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vendored = root / "node_modules" / "some-dep"
            vendored.mkdir(parents=True)
            (vendored / "vendored.test.ts").write_text("")
            (root / "owned.test.ts").write_text("")
            manifest = discover_manifest(root, ["**/*.test.ts"], [])
            self.assertEqual(manifest, {"owned.test.ts"})


class NormalizeSuitePathTests(unittest.TestCase):
    def test_absolute_path_under_root_is_stripped_to_relative(self) -> None:
        root = Path("/home/runner/work/x/x")
        name = "/home/runner/work/x/x/tests/unit/a.test.ts"
        self.assertEqual(normalize_suite_path(name, root), "tests/unit/a.test.ts")

    def test_already_relative_path_is_kept_as_is(self) -> None:
        root = Path("/home/runner/work/x/x")
        self.assertEqual(normalize_suite_path("tests/unit/a.test.ts", root), "tests/unit/a.test.ts")

    def test_non_string_name_yields_none(self) -> None:
        root = Path("/irrelevant")
        self.assertIsNone(normalize_suite_path(None, root))


class LoadShardReportTests(unittest.TestCase):
    def test_missing_file_is_a_load_error(self) -> None:
        report, errors = load_shard_report(Path("/nonexistent/shard.json"))
        self.assertIsNone(report)
        self.assertEqual(len(errors), 1)
        self.assertIn("missing shard report", errors[0])

    def test_malformed_json_is_a_load_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "shard.json"
            path.write_text("{not valid json")
            report, errors = load_shard_report(path)
            self.assertIsNone(report)
            self.assertIn("malformed shard report JSON", errors[0])

    def test_missing_test_results_array_is_a_load_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "shard.json"
            path.write_text(json.dumps({"success": True}))
            report, errors = load_shard_report(path)
            self.assertIsNone(report)
            self.assertIn("testResults must be an array", errors[0])

    def test_valid_report_loads_with_no_errors(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "shard.json"
            path.write_text(json.dumps(_report("tests/unit/a.test.ts")))
            report, errors = load_shard_report(path)
            self.assertEqual(errors, [])
            self.assertEqual(report["testResults"][0]["name"], "tests/unit/a.test.ts")


class VerifyPartitionTests(unittest.TestCase):
    root = Path("/repo")

    def test_exact_disjoint_coverage_has_no_errors(self) -> None:
        manifest = {"tests/unit/a.test.ts", "tests/unit/b.test.ts"}
        shards = [
            ("shard-1", _report("tests/unit/a.test.ts")),
            ("shard-2", _report("tests/unit/b.test.ts")),
        ]
        self.assertEqual(verify_partition(manifest, shards, self.root), [])

    def test_missing_file_from_every_shard_is_an_error(self) -> None:
        manifest = {"tests/unit/a.test.ts", "tests/unit/b.test.ts"}
        shards = [("shard-1", _report("tests/unit/a.test.ts"))]
        errors = verify_partition(manifest, shards, self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("missing from every shard report: tests/unit/b.test.ts", errors[0])

    def test_file_reported_by_two_shards_is_a_duplicate_error(self) -> None:
        manifest = {"tests/unit/a.test.ts"}
        shards = [
            ("shard-1", _report("tests/unit/a.test.ts")),
            ("shard-2", _report("tests/unit/a.test.ts")),
        ]
        errors = verify_partition(manifest, shards, self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("duplicate shard coverage for tests/unit/a.test.ts", errors[0])
        self.assertIn("shard-1", errors[0])
        self.assertIn("shard-2", errors[0])

    def test_suite_outside_the_discovered_manifest_is_flagged(self) -> None:
        manifest = {"tests/unit/a.test.ts"}
        shards = [("shard-1", _report("tests/unit/a.test.ts", "tests/unit/stale.test.ts"))]
        errors = verify_partition(manifest, shards, self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("not in the discovered manifest", errors[0])

    def test_duplicate_within_one_shards_own_report_is_flagged(self) -> None:
        manifest = {"tests/unit/a.test.ts"}
        report = _report("tests/unit/a.test.ts")
        report["testResults"].append(_suite("tests/unit/a.test.ts"))
        shards = [("shard-1", report)]
        errors = verify_partition(manifest, shards, self.root)
        self.assertTrue(any("duplicate suite within one shard's own report" in e for e in errors))

    def test_file_level_skip_status_is_not_itself_an_error(self) -> None:
        """A legitimate `describe.skip` file is still exactly-once coverage,
        same as an unsharded run would report it; only identity is checked
        here, not pass/fail/skip status."""
        manifest = {"tests/unit/a.test.ts"}
        shards = [("shard-1", _report("tests/unit/a.test.ts"))]
        shards[0][1]["testResults"][0]["status"] = "skipped"
        self.assertEqual(verify_partition(manifest, shards, self.root), [])

    def test_malformed_suite_entry_is_flagged(self) -> None:
        manifest: set[str] = set()
        shards = [("shard-1", {"testResults": ["not-a-dict"]})]
        errors = verify_partition(manifest, shards, self.root)
        self.assertTrue(any("named suite object required" in e for e in errors))


class MergeReportsTests(unittest.TestCase):
    def test_test_results_are_concatenated_in_order(self) -> None:
        merged = merge_reports([_report("a.test.ts"), _report("b.test.ts")])
        names = [suite["name"] for suite in merged["testResults"]]
        self.assertEqual(names, ["a.test.ts", "b.test.ts"])

    def test_numeric_summary_fields_are_summed_not_recomputed(self) -> None:
        merged = merge_reports([_report("a.test.ts", "b.test.ts"), _report("c.test.ts")])
        self.assertEqual(merged["numTotalTests"], 3)
        self.assertEqual(merged["numPassedTests"], 3)

    def test_a_single_failed_shard_makes_the_merged_report_unsuccessful(self) -> None:
        failing = _report("a.test.ts")
        failing["success"] = False
        merged = merge_reports([_report("b.test.ts"), failing])
        self.assertFalse(merged["success"])

    def test_original_suite_status_and_name_survive_the_merge_unchanged(self) -> None:
        report = _report("a.test.ts")
        report["testResults"][0]["status"] = "failed"
        report["testResults"][0]["failureMessage"] = "boom"
        merged = merge_reports([report])
        self.assertEqual(merged["testResults"][0]["status"], "failed")
        self.assertEqual(merged["testResults"][0]["failureMessage"], "boom")


if __name__ == "__main__":
    unittest.main()
