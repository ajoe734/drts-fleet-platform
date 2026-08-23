#!/usr/bin/env python3
"""Finding an older supervisor of this repository.

terminate_older_supervisors exists so a second supervisor cannot run beside the
one systemd manages. Its only path to a pid runs through
supervisor_cmdline_matches_current_script, which gated on

    proc_cwd != str(REPO_ROOT)

and REPO_ROOT is derived from where the file lives. Once the supervisor ran
from a pinned release the two directories stopped being the same, so the gate
could not come out true for any process. It did not start failing -- it never
had the ability to succeed, and a second supervisor ran 43 hours beside the
systemd one before anyone read `ps`.

Equality was the wrong shape besides: that orphan's cwd was
<repo>/tools/development-orchestrator, so even against the correct root it
would still have been missed.
"""

from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest import mock

from common import ROOT as CANONICAL_CHECKOUT
from control_plane.runtime import supervisor_runtime as supervisor


SCRIPT_REL = "tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py"


class SupervisorSelfDetectionTests(unittest.TestCase):
    def setUp(self) -> None:
        # Resolved here rather than read off the module under test, so these
        # run against a build that has no such attribute and fail on what the
        # gate decides instead of erroring on a missing name.
        self.root = Path(CANONICAL_CHECKOUT)

    def test_a_supervisor_standing_in_the_repository_root_is_matched(self) -> None:
        """The systemd case: WorkingDirectory is the canonical checkout."""
        self.assertTrue(
            supervisor.supervisor_cmdline_matches_current_script(
                ["python3", SCRIPT_REL, "--config", "x.json"], str(self.root)
            )
        )

    def test_a_supervisor_started_from_a_subdirectory_is_matched(self) -> None:
        """The orphan's actual shape.

        It was launched from tools/development-orchestrator, so a gate written
        as equality against the repository root misses it even when the root is
        the correct one. Asking whether the process stands inside the
        repository is the question that catches both.
        """
        self.assertTrue(
            supervisor.supervisor_cmdline_matches_current_script(
                ["python3", "control_plane/runtime/supervisor_runtime.py", "--config", "x.json"],
                str(self.root / "tools" / "development-orchestrator"),
            )
        )

    def test_a_supervisor_running_from_a_release_copy_is_matched(self) -> None:
        """Release worktrees live under the repository, so they qualify."""
        self.assertTrue(
            supervisor.supervisor_cmdline_matches_current_script(
                ["python3", SCRIPT_REL],
                str(self.root / ".artifacts" / "releases" / "orchestrator-abc123456"),
            )
        )

    def test_a_supervisor_for_another_checkout_is_not_matched(self) -> None:
        """The reason the cwd gate exists at all, and it still holds."""
        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(
                ["python3", SCRIPT_REL], "/home/someone/a-different-repo"
            )
        )

    def test_an_unreadable_cwd_is_not_matched(self) -> None:
        """/proc/<pid>/cwd resolution yields "" when the process is gone."""
        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(["python3", SCRIPT_REL], "")
        )

    def test_a_wrapper_process_is_still_not_matched(self) -> None:
        """Widening the cwd gate must not widen what counts as a supervisor."""
        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(
                ["bash", "-c", f"python3 {SCRIPT_REL}"], str(self.root)
            )
        )
        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(
                ["python3", "-m", "something_else"], str(self.root)
            )
        )

    def test_the_gate_no_longer_reads_the_code_location(self) -> None:
        """REPO_ROOT answers where this file lives, which is a different question.

        Kept as an explicit assertion because the regression is invisible from
        the canonical checkout, where the two directories coincide -- the same
        reason this survived four earlier fixes to the identical root cause.
        """
        import inspect

        source = inspect.getsource(supervisor.supervisor_cmdline_matches_current_script)
        body = source.split('"""')[-1]
        self.assertNotIn("REPO_ROOT", body)


def _stat_line(pid: int, comm: str, start_ticks: int) -> str:
    """A /proc/<pid>/stat line carrying `start_ticks` in field 22."""
    # Fields 3..21 inclusive is nineteen values; field 22 is starttime.
    middle = ["S"] + ["0"] * 18
    return f"{pid} ({comm}) " + " ".join(middle) + f" {start_ticks} 0 0 0\n"


class SupervisorStartOrderTests(unittest.TestCase):
    """PID order stops being start order once /proc/sys/kernel/pid_max wraps.

    terminate_older_supervisors skipped every candidate that failed
    `pid < current_pid`. On a host that has wrapped -- this one has, carrying a
    two-day-old process at 3_210_175 beside a minutes-old one at 2_102_389 --
    a restarted supervisor draws a low PID, so that test is false for exactly
    the pre-wrap orphan the guard exists to kill.

    The cwd gate above was the first way this guard failed to find a second
    supervisor. This is the second, and it stood behind the first: widening
    the cwd gate made orphans visible, and then this comparison refused to act
    on them.
    """

    def test_a_pre_wrap_orphan_with_a_higher_pid_is_still_older(self) -> None:
        """The regression, in the shape this host actually produces."""
        self.assertTrue(
            supervisor.supervisor_is_older_than_current(
                candidate_pid=3_210_175,
                candidate_start_ticks=1_000,
                current_pid=781_069,
                current_start_ticks=9_000,
            )
        )

    def test_a_process_started_after_us_is_not_terminated(self) -> None:
        """A low PID does not make a newer process a candidate either."""
        self.assertFalse(
            supervisor.supervisor_is_older_than_current(
                candidate_pid=12_345,
                candidate_start_ticks=9_000,
                current_pid=3_210_175,
                current_start_ticks=1_000,
            )
        )

    def test_the_current_process_is_never_its_own_candidate(self) -> None:
        self.assertFalse(
            supervisor.supervisor_is_older_than_current(
                candidate_pid=4242,
                candidate_start_ticks=1_000,
                current_pid=4242,
                current_start_ticks=1_000,
            )
        )

    def test_a_shared_start_tick_falls_back_to_pid_order(self) -> None:
        """Two supervisors inside one clock tick: PID order is all that is left."""
        self.assertTrue(
            supervisor.supervisor_is_older_than_current(
                candidate_pid=100, candidate_start_ticks=7, current_pid=200, current_start_ticks=7
            )
        )
        self.assertFalse(
            supervisor.supervisor_is_older_than_current(
                candidate_pid=200, candidate_start_ticks=7, current_pid=100, current_start_ticks=7
            )
        )

    def test_an_unreadable_start_time_falls_back_to_pid_order(self) -> None:
        """An unreadable /proc entry must not silently come out as "older"."""
        self.assertFalse(
            supervisor.supervisor_is_older_than_current(
                candidate_pid=900, candidate_start_ticks=None, current_pid=100, current_start_ticks=5
            )
        )
        self.assertTrue(
            supervisor.supervisor_is_older_than_current(
                candidate_pid=100, candidate_start_ticks=5, current_pid=900, current_start_ticks=None
            )
        )

    def test_start_ticks_are_read_from_field_22(self) -> None:
        with mock.patch.object(Path, "read_text", return_value=_stat_line(42, "python3", 123_456)):
            self.assertEqual(supervisor.process_start_ticks(42), 123_456)

    def test_a_comm_with_spaces_and_parentheses_does_not_shift_fields(self) -> None:
        """Splitting the whole line reads the wrong field for such a comm."""
        with mock.patch.object(Path, "read_text", return_value=_stat_line(42, "a (b) c", 777)):
            self.assertEqual(supervisor.process_start_ticks(42), 777)

    def test_a_missing_process_yields_no_start_time(self) -> None:
        with mock.patch.object(Path, "read_text", side_effect=OSError):
            self.assertIsNone(supervisor.process_start_ticks(42))
        self.assertIsNone(supervisor.process_start_ticks(0))

    def test_a_truncated_stat_line_yields_no_start_time(self) -> None:
        with mock.patch.object(Path, "read_text", return_value="42 (python3) S 1 42\n"):
            self.assertIsNone(supervisor.process_start_ticks(42))

    def test_this_process_reports_a_real_start_time(self) -> None:
        """Against the live kernel rather than a fixture, so the offset is checked."""
        ticks = supervisor.process_start_ticks(os.getpid())
        self.assertIsNotNone(ticks)
        assert ticks is not None
        self.assertGreater(ticks, 0)
        uptime_ticks = float(Path("/proc/uptime").read_text().split()[0]) * os.sysconf("SC_CLK_TCK")
        self.assertLessEqual(ticks, uptime_ticks)

    def test_the_guard_no_longer_compares_pids_directly(self) -> None:
        """Invisible until a wrap happens, which is why it is pinned here."""
        import inspect

        source = inspect.getsource(supervisor.terminate_older_supervisors)
        self.assertNotIn("pid >= current_pid", source)
        self.assertIn("supervisor_is_older_than_current", source)


class SupervisorConfigScopeTests(unittest.TestCase):
    """Same checkout is not the same fleet.

    test_supervisor_shutdown starts the shipped entrypoint against a throwaway
    config to prove a real SIGTERM stops it cleanly. That child is a
    supervisor, it stands inside the repository, and main() runs
    terminate_older_supervisors for it -- so it matched the production
    supervisor, saw a lower pid, and killed it. Running the orchestrator suite
    took the fleet's supervisor down, and the pre-merge gate runs that suite
    against every candidate.

    The evidence pointed away from the guard rather than at it: the child logs
    its supervisor_replaced record through its own throwaway config, so the
    canonical activity log holds none and the guard reads as though it had
    never fired once.
    """

    CANONICAL_CONFIG = "/home/lupin/drts-fleet-platform/.orchestrator/config.json"

    def test_a_supervisor_on_another_config_is_not_a_duplicate(self) -> None:
        """The shape the shutdown test produces, and what it cost."""
        self.assertNotEqual(
            supervisor.supervisor_config_argument(
                ["python3", SCRIPT_REL, "--config", "/tmp/pytest-xyz/config.json", "--quiet"],
                str(CANONICAL_CHECKOUT),
            ),
            supervisor.supervisor_config_argument(
                ["python3", SCRIPT_REL, "--config", self.CANONICAL_CONFIG, "--verbose"],
                str(CANONICAL_CHECKOUT),
            ),
        )

    def test_the_same_config_is_the_same_fleet(self) -> None:
        """A real duplicate must still be found, from any cwd inside the repo."""
        self.assertEqual(
            supervisor.supervisor_config_argument(
                ["python3", SCRIPT_REL, "--config", self.CANONICAL_CONFIG],
                str(CANONICAL_CHECKOUT),
            ),
            supervisor.supervisor_config_argument(
                ["python3", SCRIPT_REL, "--config", self.CANONICAL_CONFIG],
                str(Path(CANONICAL_CHECKOUT) / "tools" / "development-orchestrator"),
            ),
        )

    def test_a_relative_config_resolves_against_the_process_cwd(self) -> None:
        """Not against ours: the other process resolved it against its own."""
        self.assertEqual(
            supervisor.supervisor_config_argument(
                ["python3", SCRIPT_REL, "--config", ".orchestrator/config.json"],
                str(CANONICAL_CHECKOUT),
            ),
            str(Path(CANONICAL_CHECKOUT) / ".orchestrator" / "config.json"),
        )

    def test_the_default_config_matches_what_parse_args_uses(self) -> None:
        """A command line naming no config still names one."""
        self.assertEqual(
            supervisor.supervisor_config_argument(["python3", SCRIPT_REL], str(CANONICAL_CHECKOUT)),
            str(Path(CANONICAL_CHECKOUT) / ".orchestrator" / "config.json"),
        )

    def test_the_equals_form_is_read_too(self) -> None:
        self.assertEqual(
            supervisor.supervisor_config_argument(
                ["python3", SCRIPT_REL, f"--config={self.CANONICAL_CONFIG}"], str(CANONICAL_CHECKOUT)
            ),
            supervisor.supervisor_config_argument(
                ["python3", SCRIPT_REL, "--config", self.CANONICAL_CONFIG], str(CANONICAL_CHECKOUT)
            ),
        )

    def test_an_unknowable_cwd_yields_no_identity(self) -> None:
        """Better to spare a process than to kill one we cannot identify."""
        self.assertEqual(
            supervisor.supervisor_config_argument(["python3", SCRIPT_REL], ""), ""
        )

    def test_enumeration_skips_a_supervisor_on_a_different_config(self) -> None:
        """End to end over a faked /proc: the child must not be a candidate."""
        ours = ["python3", SCRIPT_REL, "--config", self.CANONICAL_CONFIG, "--verbose"]
        theirs = ["python3", SCRIPT_REL, "--config", "/tmp/throwaway/config.json", "--quiet"]
        entries = {4242: ours, 4243: theirs}

        class FakeProcDir:
            def __init__(self, pid: int) -> None:
                self.name = str(pid)
                self._pid = pid

            def __truediv__(self, child: str):
                return FakeProcEntry(self._pid, child)

        class FakeProcEntry:
            def __init__(self, pid: int, child: str) -> None:
                self._pid, self._child = pid, child

            def read_bytes(self) -> bytes:
                return b"\x00".join(part.encode() for part in entries[self._pid]) + b"\x00"

            def resolve(self):
                return Path(CANONICAL_CHECKOUT)

        with (
            mock.patch.object(supervisor.sys, "argv", ours),
            mock.patch.object(supervisor.os, "getcwd", return_value=str(CANONICAL_CHECKOUT)),
            mock.patch.object(
                supervisor.Path, "iterdir", return_value=[FakeProcDir(4242), FakeProcDir(4243)]
            ),
        ):
            found = supervisor.iter_matching_supervisor_pids()

        self.assertEqual(found, [4242])


if __name__ == "__main__":
    unittest.main()


class OpenclawMcpRootTests(unittest.TestCase):
    """The MCP adapter resolved `tools/`, then ran repo-relative paths in it.

    `drts_task_slice` runs `bash tools/development-orchestrator/bin/ai-status.sh`
    with REPO_ROOT as its cwd. REPO_ROOT was `Path(__file__).parents[2]`, which
    is `tools/`, so the command resolved to <repo>/tools/tools/... -- a path
    that has never existed -- under check=True. The tool could only raise.

    That one predates release copies entirely; the release move then added a
    second way for the same line to be wrong.
    """

    def _module(self):
        import importlib.util

        path = Path(__file__).resolve().parent / "adapters" / "openclaw_drts_mcp.py"
        spec = importlib.util.spec_from_file_location("_openclaw_probe", path)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module

    def test_the_helper_the_adapter_shells_out_to_resolves(self) -> None:
        module = self._module()
        script = Path(module.REPO_ROOT) / "tools" / "development-orchestrator" / "bin" / "ai-status.sh"
        self.assertTrue(script.is_file(), f"{script} does not exist")

    def test_the_root_is_the_checkout_that_owns_machine_truth(self) -> None:
        module = self._module()
        self.assertEqual(Path(module.CANONICAL_ROOT), Path(CANONICAL_CHECKOUT))
        self.assertEqual(Path(module.REPO_ROOT), Path(CANONICAL_CHECKOUT))
