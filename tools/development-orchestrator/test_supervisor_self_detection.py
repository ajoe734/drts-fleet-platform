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

import unittest
from pathlib import Path

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
