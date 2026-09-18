#!/usr/bin/env python3
"""Every command an instructional document tells you to run must exist.

The orchestrator's entry points moved from `scripts/` to
`tools/development-orchestrator/bin/`, and the documents that tell a new lane
how to start were never updated. `ORCHESTRATOR_QUICKSTART.md`,
`LLM_ONBOARDING.md`, `README.md` and `AI_COLLABORATION_GUIDE.md` all instructed
people to run `scripts/run-supervisor.sh`, which has not existed for weeks.
These are the first files a new agent reads.

Scope is instructional documents only. `support/sidecars/**`,
`support/unblock/**`, `BOOTSTRAP_REPORT.md` and the extracted migration bundle
are records of what was run at the time -- rewriting them to match today's
layout would falsify the evidence they exist to preserve, so they are excluded
here rather than fixed.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]

# Documents whose job is to tell a reader what to run now.
INSTRUCTIONAL_DOCS = (
    "ORCHESTRATOR_QUICKSTART.md",
    "LLM_ONBOARDING.md",
    "README.md",
    "AI_COLLABORATION_GUIDE.md",
    "SUPERVISOR_OPERATING_MODEL.md",
    "infra/seeds/README.md",
    "tests/smoke/README.md",
    "tools/development-orchestrator/README.md",
    "tools/development-orchestrator/ops/canonical-root-lock/README.md",
)

# A path-shaped token under a directory that holds runnable things.
COMMAND_PATH = re.compile(
    r"(?<![A-Za-z0-9_./-])"
    r"((?:scripts|tools|operations|infra|tests)/[A-Za-z0-9_./-]+\.(?:sh|py))"
)


class InstructionalDocPathTests(unittest.TestCase):
    def test_documented_commands_exist(self) -> None:
        missing: list[str] = []
        for name in INSTRUCTIONAL_DOCS:
            document = REPO_ROOT / name
            if not document.exists():
                continue
            for number, line in enumerate(
                document.read_text(encoding="utf-8").splitlines(), 1
            ):
                for match in COMMAND_PATH.finditer(line):
                    referenced = match.group(1)
                    if not (REPO_ROOT / referenced).exists():
                        missing.append(f"{name}:{number} -> {referenced}")

        self.assertEqual(
            missing,
            [],
            "instructional documents point at commands that do not exist:\n  "
            + "\n  ".join(missing),
        )

    def test_the_guard_covers_the_entry_points_a_new_lane_reads(self) -> None:
        """A doc dropping off this list is how the drift returns unnoticed."""
        for name in ("ORCHESTRATOR_QUICKSTART.md", "LLM_ONBOARDING.md", "README.md"):
            self.assertIn(name, INSTRUCTIONAL_DOCS)
            self.assertTrue((REPO_ROOT / name).exists(), f"{name} vanished")


if __name__ == "__main__":
    unittest.main()
