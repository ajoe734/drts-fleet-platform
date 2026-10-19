from __future__ import annotations

import unittest
from unittest import mock

from control_plane.runtime import supervisor_runtime as supervisor
from control_plane.infra.runtime_repo import prune_worker_records
from control_plane.infra.worktree_maintenance import active_worker_workspace_roots


class LiveApprovalResumeTests(unittest.TestCase):
    def worker(self, status="waiting_approval"):
        return {
            "run_id": "claude2-live-run",
            "task_id": "UV-EXEC-024",
            "provider": "claude2",
            "agent_id": "claude2",
            "session_id": "session-1",
            "status": status,
            "pid": 4242,
            "worker_unit": "drts-worker-claude2-live-run.service",
            "log_path": "/task/original-stdout.log",
            "deferred_action": "approval-1",
            "deferred_tool_use": "tool-1",
        }

    def test_live_allow_keeps_original_handles_and_is_idempotent(self):
        worker = self.worker()
        handles = {key: worker[key] for key in ("pid", "worker_unit", "log_path")}
        approval = {"approval_id": "approval-1", "decision": "allow"}

        # The observed duplicate systemd launch failed, but MainPID lookup
        # returned the original PID and the old code replaced its stdout path.
        def duplicate_resume(_config, current, _report, **_kwargs):
            current["log_path"] = "/task/failed-duplicate-launch.log"
            current["resume_count"] = 1
            return {"pid": current["pid"], "log_path": current["log_path"]}

        with (
            mock.patch.object(supervisor, "resume_claude_worker", side_effect=duplicate_resume) as resume,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            result = supervisor.handle_worker_approval_state(
                {}, {}, {}, worker, pending=[], resolved=[approval], alive=True,
            )
            self.assertEqual(result, (False, True))
            self.assertEqual(worker["status"], "running")
            self.assertEqual({key: worker[key] for key in handles}, handles)
            self.assertEqual(worker["last_approval_id"], "approval-1")
            self.assertIsNone(worker["deferred_action"])
            self.assertIsNone(worker["deferred_tool_use"])
            self.assertNotIn("resume_count", worker)
            self.assertEqual(
                supervisor.handle_worker_approval_state(
                    {}, {}, {}, worker, pending=[], resolved=[approval], alive=True,
                ),
                (False, False),
            )
            resume.assert_not_called()

    def test_live_pending_keeps_waiting_without_starting_another_process(self):
        worker = self.worker(status="running")
        approval = {"approval_id": "approval-1", "created_at": "2026-09-10T10:00:00Z"}
        with (
            mock.patch.object(supervisor, "resume_claude_worker") as resume,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            result = supervisor.handle_worker_approval_state(
                {}, {}, {}, worker, pending=[approval], resolved=[], alive=True,
            )
        self.assertEqual(result, (True, True))
        self.assertEqual(worker["status"], "waiting_approval")
        self.assertEqual(worker["log_path"], "/task/original-stdout.log")
        resume.assert_not_called()

    def test_dead_suspended_worker_still_resumes_after_allow(self):
        worker = self.worker(status="suspended_approval")
        approval = {"approval_id": "approval-1", "decision": "allow"}
        with (
            mock.patch.object(supervisor, "resume_claude_worker", return_value={"pid": 5555}) as resume,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            result = supervisor.handle_worker_approval_state(
                {}, {}, {}, worker, pending=[], resolved=[approval], alive=False,
            )
        self.assertEqual(result, (True, True))
        resume.assert_called_once_with({}, worker, {}, approval=approval)

    def test_live_denial_preserves_registry_and_worktree_protection(self):
        worker = self.worker()
        worker["workspace_root"] = "/task/identity-repair"
        state = {"workers": {worker["run_id"]: worker}, "queue": {"events": {}}}
        handles = {key: worker[key] for key in ("pid", "worker_unit", "log_path")}
        approval = {"approval_id": "denied-tool", "decision": "deny", "note": "Use a scoped alternative"}
        with (
            mock.patch.object(supervisor, "resume_claude_worker") as resume,
            mock.patch.object(supervisor, "finalize_queue_event_record") as finalize,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            result = supervisor.handle_worker_approval_state(
                {}, state, {}, worker, pending=[], resolved=[approval], alive=True,
            )
            # A denied operation is delivered to the live CLI, which may choose
            # an alternative. It does not terminate that attempt or its task.
            self.assertEqual(result, (False, True))
            self.assertEqual(worker["status"], "running")
            self.assertEqual(worker["last_approval_id"], "denied-tool")
            self.assertEqual(approval["decision"], "deny")
            self.assertEqual({key: worker[key] for key in handles}, handles)
            self.assertIsNone(worker["deferred_action"])
            self.assertIsNone(worker["deferred_tool_use"])
            self.assertEqual(
                supervisor.handle_worker_approval_state(
                    {}, state, {}, worker, pending=[], resolved=[approval], alive=True,
                ),
                (False, False),
            )
            resume.assert_not_called()
            finalize.assert_not_called()
        # Reproduce the destructive downstream chain: a false terminal record
        # was pruned, making its still-in-use worktree eligible for cleanup.
        prune_worker_records(state)
        self.assertIn(worker["run_id"], state["workers"])
        self.assertIn("/task/identity-repair", active_worker_workspace_roots(state))

    def test_dead_denial_still_finalizes_failed_attempt(self):
        worker = self.worker(status="suspended_approval")
        approval = {"approval_id": "denied-tool", "decision": "deny", "note": "Operation not allowed"}
        with (
            mock.patch.object(supervisor, "resume_claude_worker") as resume,
            mock.patch.object(supervisor, "finalize_queue_event_record") as finalize,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            result = supervisor.handle_worker_approval_state(
                {}, {}, {}, worker, pending=[], resolved=[approval], alive=False,
            )
        self.assertEqual(result, (True, True))
        self.assertEqual(worker["status"], "failed")
        finalize.assert_called_once_with({}, {}, worker, "failed", "Operation not allowed")
        resume.assert_not_called()

    def _resume_command(self, runtime_overrides: dict, provider: str = "claude2") -> list:
        worker = self.worker(status="suspended_approval")
        worker["provider"] = provider
        config = {
            "paths": {
                "status_file": "/tmp/canonical/ai-status.json",
                "state_file": "/tmp/canonical/state.json",
            },
            "providers": {
                provider: {"runtime": {"cli": "claude", **runtime_overrides}},
            },
        }
        process = mock.Mock()
        with (
            mock.patch.object(supervisor, "command_exists", return_value="/usr/bin/claude"),
            mock.patch.object(
                supervisor, "spawn_background_process",
                return_value=(process, None),
            ) as spawn,
            mock.patch.object(supervisor, "background_process_pid", return_value=9999),
            mock.patch.object(supervisor, "apply_worker_unit_env", return_value="drts-worker-x.service"),
            mock.patch.object(supervisor, "new_runtime_id", return_value=f"{provider}-resume-test"),
        ):
            supervisor.resume_claude_worker(config, worker, {})
        return spawn.call_args.args[0]

    def test_configured_permission_prompt_tool_is_passed_to_resume_command(self):
        command = self._resume_command(
            {"permission_prompt_tool": "mcp__orchestrator_approval_broker__approval_prompt"}
        )
        self.assertIn("--permission-prompt-tool", command)
        self.assertEqual(
            command[command.index("--permission-prompt-tool") + 1],
            "mcp__orchestrator_approval_broker__approval_prompt",
        )

    def test_unset_permission_prompt_tool_omits_flag_from_resume_for_backward_compatibility(self):
        command = self._resume_command({})
        self.assertNotIn("--permission-prompt-tool", command)

    def test_resume_uses_print_mode_so_permission_prompt_tool_is_not_a_cli_no_op(self):
        # The installed Claude CLI's own --help documents
        # "--permission-prompt-tool ... (only works with --print)". Resume
        # is spawned with no interactive stdin (see
        # control_plane.runtime.supervisor_runtime.resume_claude_worker's
        # call to spawn_background_process), so without -p/--print the
        # flag this test configures would be silently inert.
        for provider in ("claude", "claude2"):
            with self.subTest(provider=provider):
                command = self._resume_command(
                    {"permission_prompt_tool": "mcp__orchestrator_approval_broker__approval_prompt"},
                    provider=provider,
                )
                self.assertIn("-p", command)
                self.assertIn("--permission-prompt-tool", command)
                # Same-session continuation: resume targets the existing
                # session rather than starting a fresh one.
                self.assertIn("--resume", command)
                self.assertEqual(
                    command[command.index("--resume") + 1],
                    "session-1",
                )
                # -p must precede --output-format so the CLI treats this as
                # a single noninteractive continuation turn, not a fresh
                # interactive session.
                self.assertLess(command.index("-p"), command.index("--output-format"))

    def test_resume_print_mode_continuation_message_is_configurable(self):
        command = self._resume_command({"resume_continuation_message": "Proceed with the approved tool call."})
        self.assertEqual(
            command[command.index("-p") + 1],
            "Proceed with the approved tool call.",
        )

    def test_resume_print_mode_has_a_default_continuation_message(self):
        command = self._resume_command({})
        self.assertIn("-p", command)
        self.assertTrue(command[command.index("-p") + 1])


if __name__ == "__main__":
    unittest.main()
