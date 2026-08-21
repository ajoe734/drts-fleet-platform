from __future__ import annotations

import re
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
    "install-dashboard-systemd.sh",
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

    def test_no_unit_is_ordered_after_a_target_that_pulls_it_in(self) -> None:
        """WantedBy=X and After=X close a loop, and systemd breaks it by force.

        drts-supervisor.service declared both for default.target. The target
        pulls the unit in and is then told to wait for it, so systemd deletes
        one job from the boot transaction to resolve it -- and which one is not
        something the units get to choose. On the 2026-08-16 boot it deleted
        drts-dashboard.service, reached through After=drts-supervisor.service.
        The dashboard stayed down for four days reporting `enabled` the whole
        time, and the same coin toss could have deleted the supervisor.

        `systemd-analyze verify` does not report it: a cycle only exists once a
        transaction is built, so nothing catches this before a boot does.
        """
        def directive(text: str, name: str) -> set[str]:
            values: set[str] = set()
            for line in text.splitlines():
                if line.strip().startswith(f"{name}="):
                    values.update(line.split("=", 1)[1].split())
            return values

        for unit in sorted(SYSTEMD.glob("*.service")):
            text = unit.read_text(encoding="utf-8")
            overlap = directive(text, "After") & directive(text, "WantedBy")
            self.assertEqual(overlap, set(),
                             f"{unit.name} is ordered after the target that wants it")

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

    def test_the_release_name_is_read_from_the_physical_directory(self) -> None:
        """The pointer is the normal way to name the current release.

        A plain basename names the release after whatever path was typed, so
        running an installer through `.artifacts/releases/active` asked the
        lifecycle tool to activate a release called "active". It refused,
        correctly, and the unit silently kept its previous definition.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            real = Path(tmpdir) / "orchestrator-abc123"
            real.mkdir()
            pointer = Path(tmpdir) / "active"
            pointer.symlink_to(real)

            result = _bash(f'orch_release_name "{pointer}"')

            self.assertEqual(result.stdout.strip(), "orchestrator-abc123", result.stderr)

    def test_rendering_substitutes_the_values_passed_to_it(self) -> None:
        """A number repeated across units is a number that can move in one of
        them. The dashboard port appears three times in two files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            src = Path(tmpdir) / "unit.service"
            dst = Path(tmpdir) / "out.service"
            src.write_text("ExecStart=x --url http://127.0.0.1:@DASHBOARD_PORT@\n"
                           "ExecStartPre=curl http://127.0.0.1:@DASHBOARD_PORT@/index.html\n",
                           encoding="utf-8")

            result = _bash(f'orch_render_unit "{src}" "{dst}" /truth /truth/rel DASHBOARD_PORT=4174')

            self.assertEqual(result.returncode, 0, result.stderr)
            rendered = dst.read_text(encoding="utf-8")
            self.assertNotIn("@DASHBOARD_PORT@", rendered)
            self.assertEqual(rendered.count("127.0.0.1:4174"), 2)

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

    def test_every_helper_an_installer_calls_is_defined(self) -> None:
        """The installers only find out at run time, and nothing runs them.

        Moving orch_canonical_root into bin/lib took orch_release_root with it:
        the two definitions were adjacent, the edit was a slice, and the
        function was simply gone. Every test still passed, CI was green, and it
        merged. All four installers were broken -- `orch_release_root: command
        not found` on the first line that mattered -- and the only reason it
        surfaced was someone running one by hand.
        """
        bin_dir = ROOT / "tools" / "development-orchestrator" / "bin"
        defined = set()
        for path in (COMMON, bin_dir / "lib" / "orch-roots.sh"):
            defined.update(re.findall(r"^(orch_[a-z_]+)\(\)",
                                      path.read_text(encoding="utf-8"), re.MULTILINE))

        for name in INSTALLERS:
            text = (bin_dir / name).read_text(encoding="utf-8")
            called = {call for call in re.findall(r"\b(orch_[a-z_]+)\b", text)}
            missing = sorted(called - defined)
            self.assertEqual(missing, [], f"{name} calls helpers nothing defines")

    def test_the_shared_file_actually_loads(self) -> None:
        """Sourcing it is what the installers do first; if that fails they die
        on the next line with a message about a function instead."""
        result = _bash("declare -F | grep -c orch_")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertGreaterEqual(int(result.stdout.strip()), 5, "helpers did not load")

    def test_the_canonical_root_rule_has_exactly_one_definition(self) -> None:
        """Two copies of this rule is the fault this repo keeps re-finding.

        install-common.sh used to carry its own; the runtime scripts needed the
        same answer and would have grown a third.
        """
        tool_root = ROOT / "tools" / "development-orchestrator"
        definitions = [
            path.relative_to(ROOT)
            for path in sorted(tool_root.rglob("*.sh"))
            if "orch_canonical_root() {" in path.read_text(encoding="utf-8", errors="ignore")
        ]
        self.assertEqual([str(p) for p in definitions],
                         ["tools/development-orchestrator/bin/lib/orch-roots.sh"])

    def test_the_dashboard_is_told_where_machine_truth_lives(self) -> None:
        """dashboard_server.py defaults its repo root to the tree it lives in.

        Serving it from a pinned release would then read that worktree's
        ai-status.json -- absent, so the page renders empty and blames nobody.
        """
        launcher = (ROOT / "tools" / "development-orchestrator" / "bin"
                    / "launch-dashboard.sh").read_text(encoding="utf-8")

        self.assertIn("orch-roots.sh", launcher)
        self.assertIn("--repo-root", launcher)

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
