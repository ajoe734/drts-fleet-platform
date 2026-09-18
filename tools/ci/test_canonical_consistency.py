"""Tests for the canonical consistency checks.

The gate exists because `SD-DP-20260422-003` forbade execution tasks from
rewriting L1 files and nothing enforced it, so four unratified amendments landed
in a day. These tests pin the behaviour that matters rather than the wording: an
L1 edit without an accepted packet naming it must fail, and a change that touches
no L1 file must cost nothing.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "check_canonical_consistency",
    ROOT / "tools" / "ci" / "git" / "check_canonical_consistency.py",
)
assert SPEC is not None and SPEC.loader is not None
checker = importlib.util.module_from_spec(SPEC)
# Register before exec: the module defines dataclasses, and `dataclasses`
# resolves field types through `sys.modules[cls.__module__]`, which is absent
# for a module loaded straight from a file path.
sys.modules[SPEC.name] = checker
SPEC.loader.exec_module(checker)


MAP_TEMPLATE = """# Canonical Document Map

## 2. Canonical Layers

### L1 Product Truth

- `phase1_prd_detailed_v1.md`
- `phase1_service_contracts_v1.md`

### L1.5 Accepted System Design Decisions

_(none)_
"""

ACCEPTED_PACKET = """# SD-DP-test

## Decision Record

- `decision_id`: `SD-DP-test`
- `status`: `accepted`
- `affected_docs`:
  - `phase1_service_contracts_v1.md` section 5.2
"""

PROPOSED_PACKET = ACCEPTED_PACKET.replace("`accepted`", "`proposed`")

UNRELATED_PACKET = ACCEPTED_PACKET.replace(
    "`phase1_service_contracts_v1.md` section 5.2", "`some_other_doc.md`"
)


class Repo:
    """A throwaway git repo so the gate is tested against real git plumbing."""

    def __init__(self, tmp: str) -> None:
        self.path = Path(tmp)
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "t@example.com")
        self._git("config", "user.name", "t")

    def _git(self, *args: str) -> str:
        return subprocess.run(
            ["git", *args],
            cwd=str(self.path),
            capture_output=True,
            text=True,
            check=True,
        ).stdout

    def write(self, rel: str, text: str) -> None:
        target = self.path / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def commit(self, message: str) -> str:
        self._git("add", "-A")
        self._git("commit", "-q", "-m", message)
        return self._git("rev-parse", "HEAD").strip()

    def run_check(self, base: str, head: str = "HEAD") -> int:
        proc = subprocess.run(
            [
                "python3",
                str(ROOT / "tools" / "ci" / "git" / "check_canonical_consistency.py"),
                "--ci",
                "--base",
                base,
                "--head",
                head,
            ],
            cwd=str(self.path),
            capture_output=True,
            text=True,
            check=False,
            env={"PATH": "/usr/bin:/bin", "CANONICAL_CONSISTENCY_ROOT": str(self.path)},
        )
        return proc.returncode


class L1EditAuthorityTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Repo(self._tmp.name)
        self.repo.write("CANONICAL_DOCUMENT_MAP.md", MAP_TEMPLATE)
        self.repo.write("phase1_prd_detailed_v1.md", "prd v1\n")
        self.repo.write("phase1_service_contracts_v1.md", "contracts v1\n")
        self.repo.write("apps/api/src/thing.ts", "export const a = 1;\n")
        self.base = self.repo.commit("BASE-001: seed\n\nTask-ID: BASE-001\n")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_a_change_touching_no_l1_file_passes(self) -> None:
        self.repo.write("apps/api/src/thing.ts", "export const a = 2;\n")
        self.repo.commit("X-001: unrelated\n\nTask-ID: X-001\n")
        self.assertEqual(self.repo.run_check(self.base), 0)

    def test_an_l1_edit_with_no_decision_packet_fails(self) -> None:
        """CONF-DOC-001 and CONF-CODE-001 both looked exactly like this."""
        self.repo.write("phase1_service_contracts_v1.md", "contracts v2\n")
        self.repo.commit("X-002: edit contracts\n\nTask-ID: X-002\n")
        self.assertEqual(self.repo.run_check(self.base), 1)

    def test_an_l1_edit_with_only_a_proposed_packet_fails(self) -> None:
        self.repo.write("phase1_service_contracts_v1.md", "contracts v2\n")
        self.repo.write("docs/01-decisions/SD-DP-test.md", PROPOSED_PACKET)
        self.repo.commit("X-003: edit with proposal\n\nTask-ID: X-003\n")
        self.assertEqual(self.repo.run_check(self.base), 1)

    def test_an_l1_edit_with_an_accepted_packet_naming_it_passes(self) -> None:
        self.repo.write("phase1_service_contracts_v1.md", "contracts v2\n")
        self.repo.write("docs/01-decisions/SD-DP-test.md", ACCEPTED_PACKET)
        self.repo.commit("X-004: accepted revision\n\nTask-ID: X-004\n")
        self.assertEqual(self.repo.run_check(self.base), 0)

    def test_an_accepted_packet_that_does_not_name_the_file_fails(self) -> None:
        """A packet in the change is not a blanket licence to edit any L1 file."""
        self.repo.write("phase1_prd_detailed_v1.md", "prd v2\n")
        self.repo.write("docs/01-decisions/SD-DP-test.md", UNRELATED_PACKET)
        self.repo.commit("X-005: mismatched packet\n\nTask-ID: X-005\n")
        self.assertEqual(self.repo.run_check(self.base), 1)

    def test_the_protected_list_follows_the_map_rather_than_a_hardcoded_copy(self) -> None:
        """Dropping a file from the map's L1 section stops protecting it.

        Hardcoding the list here would be the same defect as the classification
        allowlist that broke dev: a second place to update that nothing
        reminds you about.
        """
        self.repo.write(
            "CANONICAL_DOCUMENT_MAP.md",
            MAP_TEMPLATE.replace("- `phase1_service_contracts_v1.md`\n", ""),
        )
        self.repo.write("phase1_service_contracts_v1.md", "contracts v2\n")
        self.repo.commit("X-006: demoted file\n\nTask-ID: X-006\n")
        self.assertEqual(self.repo.run_check(self.base), 0)

    def test_a_missing_l1_section_fails_closed(self) -> None:
        self.repo.write("CANONICAL_DOCUMENT_MAP.md", "# Map\n\nno layers here\n")
        self.repo.write("phase1_service_contracts_v1.md", "contracts v2\n")
        self.repo.commit("X-007: map broken\n\nTask-ID: X-007\n")
        self.assertNotEqual(self.repo.run_check(self.base), 0)


class CitedPathTests(unittest.TestCase):
    """A document may not introduce a reference to a file that is not there.

    Diff-scoped on purpose: the repository already carries 237 of these, and a
    check that fails on pre-existing debt gets bypassed rather than fixed. This
    stops the count growing.
    """

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Repo(self._tmp.name)
        self.repo.write("CANONICAL_DOCUMENT_MAP.md", MAP_TEMPLATE)
        self.repo.write("phase1_prd_detailed_v1.md", "prd v1\n")
        self.repo.write("phase1_service_contracts_v1.md", "contracts v1\n")
        self.repo.write("tools/real.ts", "export const a = 1;\n")
        self.base = self.repo.commit("BASE-001: seed\n\nTask-ID: BASE-001\n")

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_a_doc_citing_a_real_path_passes(self) -> None:
        self.repo.write("docs/note.md", "see `tools/real.ts` for it\n")
        self.repo.commit("X-010: cite real\n\nTask-ID: X-010\n")
        self.assertEqual(self.repo.run_check(self.base), 0)

    def test_a_doc_citing_a_missing_path_fails(self) -> None:
        self.repo.write("docs/note.md", "see `tools/gone.ts` for it\n")
        self.repo.commit("X-011: cite missing\n\nTask-ID: X-011\n")
        self.assertEqual(self.repo.run_check(self.base), 1)

    def test_a_relative_path_is_not_treated_as_a_broken_link(self) -> None:
        """Paths like `modules/auth/auth.controller.ts` are written against a
        base this checker cannot know. Counting them produced a 19% false
        positive rate on the first attempt."""
        self.repo.write("docs/note.md", "see `modules/auth/auth.controller.ts`\n")
        self.repo.commit("X-012: relative path\n\nTask-ID: X-012\n")
        self.assertEqual(self.repo.run_check(self.base), 0)

    def test_pre_existing_debt_outside_the_diff_is_not_failed(self) -> None:
        self.repo.write("docs/old.md", "see `tools/gone.ts`\n")
        base = self.repo.commit("X-013: existing debt\n\nTask-ID: X-013\n")
        self.repo.write("tools/real.ts", "export const a = 2;\n")
        self.repo.commit("X-014: unrelated\n\nTask-ID: X-014\n")
        self.assertEqual(self.repo.run_check(base), 0)


if __name__ == "__main__":
    unittest.main()
