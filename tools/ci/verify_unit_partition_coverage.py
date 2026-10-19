#!/usr/bin/env python3
"""Verify native Vitest `--shard` partition coverage for a suite split across
multiple CI jobs, then merge the shard reports into one combined report with
every original per-suite name/status/failure/skip count untouched.

CI-FULL-UNIT-BUDGET-AND-COVERAGE-FLOW-20261015 splits the root `test:unit` job
(and, separately, the apps/api package suite) into several parallel shard jobs
so each fits inside a bounded hosted timeout instead of competing for one
job's budget. Native `--shard=i/N` trusts Vitest to divide the discovered file
set correctly; this script does not trust that split blindly. It independently
discovers the full file manifest from the same include/exclude globs the real
command uses and checks the union of what every shard actually reported
against that manifest: every discovered file must appear in exactly one
shard's report, with no gaps and no duplicates. A missing, duplicated,
malformed, or otherwise incomplete shard report is a failure here, not a
silent pass-through.

This tool never runs product tests itself. It only reads already-produced
Vitest JSON reports and the test tree's filenames.
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path


def discover_manifest(root: Path, include: list[str], exclude: list[str]) -> set[str]:
    """Independently discovered file set for the given globs, mirroring the
    real `vitest run --exclude ...` invocation without running Vitest.

    `node_modules` is always skipped: a bare `**/*.test.ts` include (as used
    for the apps/api package, which has no vitest.config) would otherwise walk
    into vendored packages' own test files, which the real command never
    collects (Vitest excludes node_modules by default).
    """
    included: set[str] = set()
    for pattern in include:
        for match in glob.glob(str(root / pattern), recursive=True):
            path = Path(match)
            if not path.is_file():
                continue
            relative = path.relative_to(root).as_posix()
            if "node_modules/" in relative or relative.startswith("node_modules/"):
                continue
            included.add(relative)
    excluded: set[str] = set()
    for pattern in exclude:
        for match in glob.glob(str(root / pattern), recursive=True):
            path = Path(match)
            if path.is_file():
                excluded.add(path.relative_to(root).as_posix())
    return included - excluded


def normalize_suite_path(name: object, root: Path) -> str | None:
    """A shard report's `testResults[].name` is normally the file path as
    Vitest resolved it (absolute on hosted runners). Reduce it to the same
    repo-relative form `discover_manifest` produces, so the two sets compare
    on equal footing regardless of the runner's absolute prefix.
    """
    if not isinstance(name, str):
        return None
    flat = name.replace("\\", "/")
    root_str = root.resolve().as_posix()
    if flat.startswith(root_str + "/"):
        return flat[len(root_str) + 1:]
    if not flat.startswith("/"):
        return flat
    # Different runner, different absolute prefix: fall back to the longest
    # suffix that starts at a directory also present in the manifest root's
    # own relative tree (e.g. "/home/runner/work/x/x/apps/api/tests/...").
    parts = flat.split("/")
    for i in range(len(parts)):
        candidate = "/".join(parts[i:])
        if candidate:
            return candidate
    return None


def load_shard_report(path: Path) -> tuple[dict | None, list[str]]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        return None, [f"{path}: missing shard report ({error})"]
    try:
        report = json.loads(text)
    except ValueError as error:
        return None, [f"{path}: malformed shard report JSON ({error})"]
    if not isinstance(report, dict) or not isinstance(report.get("testResults"), list):
        return None, [f"{path}: malformed shard report (testResults must be an array)"]
    return report, []


def verify_partition(
    manifest: set[str],
    shard_reports: list[tuple[str, dict]],
    root: Path,
) -> list[str]:
    """Coverage identity only: every manifest file reported exactly once.

    Deliberately does not judge pass/fail/skip status of individual suites --
    a file-level skip can be a legitimate, intentional Vitest `describe.skip`
    the same as an unsharded run would report, and a whole shard job that
    failed or was cancelled already fails CI through its own job result. This
    only catches a shard split that silently drops, duplicates, or invents
    file coverage.
    """
    errors: list[str] = []
    seen: dict[str, list[str]] = {}
    for label, report in shard_reports:
        names_in_this_shard: set[str] = set()
        for suite in report["testResults"]:
            if not isinstance(suite, dict) or not isinstance(suite.get("name"), str):
                errors.append(f"{label}: malformed testResults entry (named suite object required)")
                continue
            normalized = normalize_suite_path(suite["name"], root)
            if normalized is None:
                continue
            if normalized in names_in_this_shard:
                errors.append(f"{label}: duplicate suite within one shard's own report: {normalized}")
                continue
            names_in_this_shard.add(normalized)
            seen.setdefault(normalized, []).append(label)

    for name, labels in sorted(seen.items()):
        if len(labels) > 1:
            errors.append(f"duplicate shard coverage for {name}: reported by {', '.join(labels)}")

    covered = set(seen)
    for name in sorted(manifest - covered):
        errors.append(f"missing from every shard report: {name}")
    for name in sorted(covered - manifest):
        errors.append(f"reported but not in the discovered manifest (stale exclude or renamed file?): {name}")
    return errors


def merge_reports(shard_reports: list[dict]) -> dict:
    """Concatenate every shard's `testResults` and sum numeric summary fields.

    No status is invented: a shard's suites keep their original name, status,
    failure message and assertion list exactly as that shard produced them.
    """
    merged: dict = {
        "numTotalTestSuites": 0,
        "numPassedTestSuites": 0,
        "numFailedTestSuites": 0,
        "numPendingTestSuites": 0,
        "numTotalTests": 0,
        "numPassedTests": 0,
        "numFailedTests": 0,
        "numPendingTests": 0,
        "testResults": [],
        "success": True,
    }
    numeric_keys = [key for key in merged if key.startswith("num")]
    for report in shard_reports:
        for key in numeric_keys:
            value = report.get(key)
            if isinstance(value, (int, float)):
                merged[key] += value
        merged["testResults"].extend(report["testResults"])
        if report.get("success") is False:
            merged["success"] = False
    return merged


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                      formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True,
                         help="directory the --include/--exclude globs and shard report "
                              "suite names are relative to")
    parser.add_argument("--include", dest="include", action="append", default=[], required=True,
                         help="glob (relative to --root) the real command discovers from; repeat per glob")
    parser.add_argument("--exclude", dest="exclude", action="append", default=[],
                         help="glob (relative to --root) the real command's --exclude removes; repeat per glob")
    parser.add_argument("--shard-report", dest="shard_reports", action="append", default=[], required=True,
                         help="path to one shard's Vitest JSON report; repeat per shard")
    parser.add_argument("--merged-output", default=None,
                         help="write the merged combined report (same shape existing verifiers expect) here")
    args = parser.parse_args(argv)

    root = Path(args.root)
    manifest = discover_manifest(root, args.include, args.exclude)
    if not manifest:
        print("ERROR: discovered manifest is empty; --root/--include are wrong")
        return 1

    reports: list[tuple[str, dict]] = []
    errors: list[str] = []
    for raw_path in args.shard_reports:
        report, load_errors = load_shard_report(Path(raw_path))
        errors.extend(load_errors)
        if report is not None:
            reports.append((raw_path, report))

    errors.extend(verify_partition(manifest, reports, root))

    for error in errors:
        print("ERROR: " + error)
    if errors:
        return 1

    print(f"Unit partition coverage: {len(manifest)} discovered files, "
          f"{len(args.shard_reports)} shard reports, union covers each exactly once.")

    if args.merged_output:
        merged = merge_reports([report for _, report in reports])
        Path(args.merged_output).write_text(json.dumps(merged), encoding="utf-8")
        print(f"Merged combined report written to {args.merged_output}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
