from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SYSTEMD = ROOT / "tools" / "development-orchestrator" / "systemd"
COMMON = SYSTEMD / "install-common.sh"
INSTALLERS = (
    "install-health-systemd.sh",
    "install-canonical-root-watch-systemd.sh",
    "install-claude-keepalive-systemd.sh",
)


def _bash(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(["bash", "-c", f'source "{COMMON}"\n{script}'],
                          capture_output=True, text=True, check=False)


class UnitsRunPinnedCodeTests(unittest.TestCase):
    """A unit has two roots, and pointing both at the working tree is the bug.

    Machine truth lives in the canonical root and must be read there whatever
    branch it is on. The code a unit runs must not come from there: the
    orchestrator checks branches out of that tree, so a unit pointed at it runs
    whatever happens to be checked out. On 2026-08-19 a probe fix merged to dev
    did not reach the running probe, because the root was sitting on a docs
    branch seven commits behind. The supervisor was pinned to the release for
    this reason years earlier; the other three units were not.
    """

    def test_no_shipped_unit_runs_code_out_of_the_working_tree(self) -> None:
        """The guard that outlives this change: the next unit added has to
        pin its code too, or this fails."""
        offenders = []
        for unit in sorted(SYSTEMD.glob("*.service")):
            for line in unit.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if not stripped.startswith("ExecStart="):
                    continue
                if "@REPO_ROOT@/tools" in stripped:
                    offenders.append(f"{unit.name}: {stripped}")
        self.assertEqual(offenders, [], "ExecStart must run from the pinned release")

    def test_working_directory_still_points_at_machine_truth(self) -> None:
        """Pinning the code must not move where state is read from."""
        for unit in sorted(SYSTEMD.glob("*.service")):
            text = unit.read_text(encoding="utf-8")
            for line in text.splitlines():
                if line.strip().startswith("WorkingDirectory="):
                    self.assertNotIn("releases/active", line,
                                     f"{unit.name} reads machine truth from a release worktree")

    def test_canonical_root_is_resolved_from_a_worktree(self) -> None:
        """Installers are run from release worktrees. Deriving the root from
        the script's own location would then install units pointing inside the
        worktree -- the same mistake in the opposite direction."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo = Path(tmpdir) / "repo"
            git = ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@example.invalid"]
            subprocess.run(["git", "init", "-q", "-b", "dev", str(repo)], check=True)
            (repo / "README").write_text("x\n", encoding="utf-8")
            subprocess.run([*git, "add", "README"], check=True)
            subprocess.run([*git, "commit", "-qm", "base"], check=True)
            tree = repo / "release"
            subprocess.run([*git, "worktree", "add", "-q", "--detach", str(tree)], check=True)

            result = _bash(f'orch_canonical_root "{tree}"')

            self.assertEqual(result.stdout.strip(), str(repo.resolve()), result.stderr)

    def test_a_missing_release_pointer_is_refused_with_the_command_to_fix_it(self) -> None:
        """A unit pointed at a release that is not there fails on every fire
        with a bare exec error and no hint."""
        with tempfile.TemporaryDirectory() as tmpdir:
            result = _bash(f'orch_require_release "{tmpdir}/nope"')

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("no active release", result.stderr)
            self.assertIn("release-lifecycle.py activate", result.stderr)

    def test_rendering_separates_the_two_roots(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            src = Path(tmpdir) / "unit.service"
            dst = Path(tmpdir) / "out.service"
            src.write_text("WorkingDirectory=@REPO_ROOT@\n"
                           "ExecStart=@RELEASE_ROOT@/bin/x\n", encoding="utf-8")

            result = _bash(f'orch_render_unit "{src}" "{dst}" "/truth" "/truth/.artifacts/releases/active"')

            self.assertEqual(result.returncode, 0, result.stderr)
            rendered = dst.read_text(encoding="utf-8")
            self.assertIn("WorkingDirectory=/truth\n", rendered)
            self.assertIn("ExecStart=/truth/.artifacts/releases/active/bin/x\n", rendered)

    def test_every_installer_goes_through_the_shared_resolution(self) -> None:
        """Four installers once carried the same ROOT_DIR line. Restating it is
        how three of them stayed wrong after the fourth was fixed."""
        for name in INSTALLERS:
            text = (ROOT / "tools" / "development-orchestrator" / "bin" / name).read_text(encoding="utf-8")
            self.assertIn("install-common.sh", text, name)
            self.assertIn("orch_render_unit", text, name)
            self.assertNotIn('sed -e "s|%h|$HOME|g"', text, f"{name} still renders its own units")


if __name__ == "__main__":
    unittest.main()
