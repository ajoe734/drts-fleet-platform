from __future__ import annotations

import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = (ROOT / ".github" / "workflows" / "ci.yml",
             ROOT / ".github" / "workflows" / "ci-integ.yml")

_JOB = re.compile(r"^  ([A-Za-z0-9_-]+):\s*$")
_TOP = re.compile(r"^[A-Za-z]")


def jobs_without_timeout(path: Path) -> list[str]:
    """Job names in one workflow that declare no timeout-minutes.

    Parsed by indentation rather than with a YAML library on purpose: this runs
    in the same CI job it protects, and adding a dependency there to check that
    CI cannot hang would be its own kind of joke. The shape it assumes -- job
    keys at two spaces under a top-level `jobs:` -- is the shape both files use.
    """
    lines = path.read_text(encoding="utf-8").splitlines()
    offenders: list[str] = []
    in_jobs = False
    current: str | None = None
    seen_timeout = False
    for line in lines:
        if _TOP.match(line):
            if current and not seen_timeout:
                offenders.append(current)
            current, seen_timeout = None, False
            in_jobs = line.startswith("jobs:")
            continue
        if not in_jobs:
            continue
        match = _JOB.match(line)
        if match:
            if current and not seen_timeout:
                offenders.append(current)
            current, seen_timeout = match.group(1), False
            continue
        if current and line.strip().startswith("timeout-minutes:"):
            seen_timeout = True
    if current and not seen_timeout:
        offenders.append(current)
    return offenders


class WorkflowTimeoutTests(unittest.TestCase):
    """A hung step should cost minutes, not a working day.

    GitHub's default job timeout is six hours. On 2026-08-19 a transient hang in
    `apt-get install postgresql-client` held iam-negative-matrix for three hours
    and twenty minutes on dev, with the branch's CI result unknown the whole
    time, and the same step had hung three jobs on a pull request earlier that
    day. Neither workflow declared a timeout anywhere.
    """

    def test_every_job_declares_a_timeout(self) -> None:
        for path in WORKFLOWS:
            with self.subTest(workflow=path.name):
                self.assertEqual(jobs_without_timeout(path), [],
                                 "add timeout-minutes to these jobs")

    def test_the_parser_notices_a_job_without_one(self) -> None:
        """A checker that cannot fail is not a checker."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            sample = Path(tmpdir) / "w.yml"
            sample.write_text(
                "name: x\njobs:\n"
                "  guarded:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n"
                "  bare:\n    runs-on: ubuntu-latest\n    steps: []\n",
                encoding="utf-8")

            self.assertEqual(jobs_without_timeout(sample), ["bare"])

    def test_it_reads_the_real_workflows_and_finds_jobs(self) -> None:
        """Guards the parser against silently matching nothing, which would make
        the check above pass for the wrong reason."""
        for path in WORKFLOWS:
            text = path.read_text(encoding="utf-8")
            declared = text.count("timeout-minutes:")
            self.assertGreaterEqual(declared, 5, f"{path.name} looks unparsed")


if __name__ == "__main__":
    unittest.main()
