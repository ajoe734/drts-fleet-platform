from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CI_INTEG = ROOT / ".github" / "workflows" / "ci-integ.yml"
CI_FEAT = ROOT / ".github" / "workflows" / "ci.yml"

_JOB = re.compile(r"^  ([A-Za-z0-9_-]+):\s*$")


def job_block(text: str, job_name: str) -> str:
    """The lines of one top-level job, from its `  <name>:` line (exclusive)
    up to (not including) the next top-level job key or end of file.

    Parsed by indentation, matching the convention test_workflow_timeouts.py
    already uses for the same reason: this runs inside the CI job it
    partially protects, so it does not add a YAML library dependency.
    """
    lines = text.splitlines()
    start = None
    for index, line in enumerate(lines):
        match = _JOB.match(line)
        if match and match.group(1) == job_name:
            start = index + 1
            break
    if start is None:
        raise AssertionError(f"job {job_name!r} not found")
    end = len(lines)
    for index in range(start, len(lines)):
        if _JOB.match(lines[index]):
            end = index
            break
    return "\n".join(lines[start:end])


def shard_report_count(block: str) -> int:
    return len(re.findall(r"--shard-report", block))


def matrix_shard_values(block: str) -> list[int]:
    match = re.search(r"shard:\s*\[([^\]]+)\]", block)
    if not match:
        return []
    return [int(value.strip()) for value in match.group(1).split(",")]


def env_is_set(block: str, name: str) -> bool:
    """Whether `block` actually assigns this env var, as opposed to merely
    mentioning its name in a comment explaining why it is absent."""
    return re.search(rf'^\s*{re.escape(name)}:\s*', block, re.MULTILINE) is not None


class CiIntegUnitPartitioningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.text = CI_INTEG.read_text(encoding="utf-8")

    def test_unit_shard_matrix_has_four_contiguous_shards(self) -> None:
        block = job_block(self.text, "unit-shard")
        self.assertEqual(matrix_shard_values(block), [1, 2, 3, 4])
        self.assertIn("--shard=${{ matrix.shard }}/4", block)

    def test_unit_aggregate_checks_exactly_the_matrix_shard_count(self) -> None:
        block = job_block(self.text, "unit")
        self.assertEqual(shard_report_count(block), 4)

    def test_unit_required_check_name_is_unchanged(self) -> None:
        self.assertIn("\n  unit:\n", "\n" + self.text)

    def test_ci_integ_aggregate_still_depends_on_unit_by_name(self) -> None:
        block = job_block(self.text, "ci-integ")
        needs = re.search(r"needs:\s*\[([^\]]+)\]", block)
        self.assertIsNotNone(needs)
        names = [name.strip() for name in needs.group(1).split(",")]
        self.assertIn("unit", names)
        self.assertNotIn("unit-shard", names)
        self.assertNotIn("unit-image", names)

    def test_api_image_waiver_env_is_confined_to_the_shard_job(self) -> None:
        self.assertTrue(env_is_set(job_block(self.text, "unit-shard"), "DRTS_REQUIRE_API_TEST_IMAGE"))
        self.assertFalse(env_is_set(job_block(self.text, "unit-image"), "DRTS_REQUIRE_API_TEST_IMAGE"))
        self.assertFalse(env_is_set(job_block(self.text, "unit"), "DRTS_REQUIRE_API_TEST_IMAGE"))

    def test_unit_shard_fails_closed_on_a_non_success_shard_result(self) -> None:
        block = job_block(self.text, "unit")
        self.assertIn("needs.unit-shard.result", block)
        self.assertIn("= 'success'", block)


class CiFeatUnitPartitioningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.text = CI_FEAT.read_text(encoding="utf-8")

    def test_product_root_unit_matrix_has_four_contiguous_shards(self) -> None:
        block = job_block(self.text, "product_root_unit")
        self.assertEqual(matrix_shard_values(block), [1, 2, 3, 4])
        self.assertIn("--shard=${{ matrix.shard }}/4", block)

    def test_product_api_unit_matrix_has_two_contiguous_shards(self) -> None:
        block = job_block(self.text, "product_api_unit")
        self.assertEqual(matrix_shard_values(block), [1, 2])
        self.assertIn("--shard=${{ matrix.shard }}/2", block)

    def test_aggregate_checks_exactly_the_matrix_shard_counts(self) -> None:
        block = job_block(self.text, "product_smoke_acceptance")
        # One verify_unit_partition_coverage.py call per suite: 4 root shards
        # + 2 API shards reported across the two calls combined.
        self.assertEqual(shard_report_count(block), 6)

    def test_product_smoke_acceptance_required_check_name_is_unchanged(self) -> None:
        self.assertIn("\n  product_smoke_acceptance:\n", "\n" + self.text)

    def test_smoke_acceptance_still_depends_on_product_smoke_acceptance_by_name(self) -> None:
        block = job_block(self.text, "smoke-acceptance")
        needs = re.search(r"needs:\s*\[([^\]]+)\]", block)
        self.assertIsNotNone(needs)
        names = [name.strip() for name in needs.group(1).split(",")]
        self.assertIn("product_smoke_acceptance", names)

    def test_mfa_waiver_env_is_confined_to_the_api_unit_job(self) -> None:
        self.assertTrue(env_is_set(job_block(self.text, "product_api_unit"), "DRTS_DEV_MFA_WAIVED"))
        self.assertFalse(env_is_set(job_block(self.text, "product_root_unit"), "DRTS_DEV_MFA_WAIVED"))
        self.assertFalse(env_is_set(job_block(self.text, "product_fast_checks"), "DRTS_DEV_MFA_WAIVED"))
        self.assertFalse(env_is_set(job_block(self.text, "product_smoke_acceptance"), "DRTS_DEV_MFA_WAIVED"))

    def test_aggregate_fails_closed_on_any_non_success_upstream_job(self) -> None:
        block = job_block(self.text, "product_smoke_acceptance")
        for upstream in ("product_fast_checks", "product_root_unit", "product_api_unit"):
            self.assertIn(f"needs.{upstream}.result", block)


class SharedToolingWiringTests(unittest.TestCase):
    """Both new test files must be reachable by the same gate that would
    otherwise silently stop protecting anything they cover, per
    check_test_coverage.py's own rule: a test CI never runs is worse than no
    test."""

    def test_both_workflows_invoke_the_new_partitioning_tests_directly(self) -> None:
        for path in (CI_INTEG, CI_FEAT):
            text = path.read_text(encoding="utf-8")
            with self.subTest(workflow=path.name):
                self.assertIn("tools/ci/test_workflow_unit_partitioning.py", text)
                self.assertIn("tools/ci/test_unit_partition_coverage.py", text)


if __name__ == "__main__":
    unittest.main()
