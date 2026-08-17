#!/usr/bin/env python3
from __future__ import annotations

import json
import signal
import subprocess
import tempfile
import types
import pathlib
from datetime import datetime, timezone
import unittest
import os
from pathlib import Path
from unittest import mock

import common
from control_plane.runtime import supervisor_runtime as supervisor
from orchestrator_test_support import EvidenceOutputIsolation


def _git(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        text=True,
        capture_output=True,
        check=True,
    )


class CommandActivityLogSummaryTests(unittest.TestCase):
    def test_summarizes_codex_exec_prompt_without_logging_full_prompt(self) -> None:
        prompt = "read a very large task packet\n" + ("x" * 1000)
        summary = supervisor.summarize_command_for_activity_log(
            ["codex", "exec", "--model", "gpt-5.2", prompt]
        )

        self.assertEqual(summary["argv0"], "codex")
        self.assertEqual(summary["prompt_chars"], len(prompt))
        self.assertIn("prompt_sha256", summary)
        self.assertNotIn(prompt, summary["args_preview"])
        self.assertLessEqual(len(summary["prompt_preview"]), 243)

    def test_summarizes_flag_prompt_without_logging_argument_value(self) -> None:
        prompt = "dispatch worker context"
        summary = supervisor.summarize_command_for_activity_log(
            ["agent", "run", "--prompt", prompt, "--other", "value"]
        )

        self.assertEqual(summary["args_preview"], ["agent", "run", "--other", "value"])
        self.assertEqual(summary["prompt_chars"], len(prompt))


class DetectWorkerFailureTests(unittest.TestCase):
    def _worker_for_log(self, content: str) -> dict[str, str]:
        handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
        handle.write(content)
        handle.flush()
        handle.close()
        self.addCleanup(Path(handle.name).unlink, missing_ok=True)
        return {"log_path": handle.name}

    def test_ignores_error_markers_inside_captured_log_output(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "codex",
                    "I am reading ai-activity-log.jsonl for context.",
                    '262-{"ts": "2026-04-05T13:36:01Z", "message": "Error: Model \\"grok-code-fast-1\\" from --model flag is not available."}',
                    'worker_retry_scheduled: {"message": "Transient worker failure detected; retry 1 scheduled at 2026-04-05T13:48:48Z: reason: \\"QUOTA_EXHAUSTED\\""}',
                    "No local failure happened in this session.",
                ]
            )
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_embedded_auth_error_from_ripgrep_context_line(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "Reviewing provider pause records.",
                    '7198-      "reason": "Failed to authenticate. API Error: 401 authentication_error: Invalid authentication credentials",',
                    '7890:      "summary": "\\"gemini2 auth is IneligibleTierError (permanent?) — consider reassigning ORX-GV-003 owner in next review.\\",",',
                    "No live auth error was emitted by this worker.",
                ]
            )
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_embedded_auth_error_from_log_context_line(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "Reviewing archived worker logs.",
                    ".orchestrator/logs/20260430T232445367572Z-codex-codex2-b9e02e.log:1888:"
                    '.orchestrator/evidence/codex-20260430T142635Z-221ee21d.json:11: "raw_message": '
                    '"Failed to authenticate. API Error: 401 authentication_error"',
                    "No live auth error was emitted by this worker.",
                ]
            )
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_i18n_error_label_object(self) -> None:
        worker = self._worker_for_log('error: { en: "Error", zh: "錯誤" },\n')

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_test_assertion_error_object_literal(self) -> None:
        worker = self._worker_for_log("error: expect.objectContaining({ message: 'expected copy' })\n")

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_embedded_auth_error_from_json_state_summary_field(self) -> None:
        worker = self._worker_for_log(
            '"summary": "7198- \\"reason\\": \\"Failed to authenticate. API Error: 401 authentication_error: Invalid authentication credentials\\",",\n'
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_embedded_auth_error_from_nested_json_state_summary_field(self) -> None:
        worker = self._worker_for_log(
            '"summary": "\\"summary\\": \\"\\\\\\"gemini2 auth is IneligibleTierError (permanent?) — consider reassigning ORX-GV-003 owner in next review.\\\\\\"\\",",\n'
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_markdown_table_that_mentions_old_ineligible_tier(self) -> None:
        worker = self._worker_for_log(
            "| codex2 | paused | auth | Garbled reason referencing gemini2 IneligibleTierError. |\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_recommendation_text_that_mentions_ineligible_tier(self) -> None:
        worker = self._worker_for_log(
            json.dumps(
                {
                    "type": "assistant",
                    "message": {
                        "content": [
                            {
                                "type": "text",
                                "text": "Verify gemini2 auth health before dispatching ORX-GV-002 because old notes mention IneligibleTierError.",
                            }
                        ]
                    },
                }
            )
            + "\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_chair_narrative_that_mentions_codex_refresh_reuse(self) -> None:
        worker = self._worker_for_log(
            '"Codex2 remains auth-paused after repeated 401 Unauthorized, '
            'token_invalidated, and refresh_token_reused failures and requires manual re-login '
            'before any further dispatch.",\n'
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_shell_search_command_that_mentions_auth_markers(self) -> None:
        worker = self._worker_for_log(
            "/bin/bash -lc \"rg -n 'dispatch_pauses|paused|quota|401 Unauthorized|"
            "token_invalidated|refresh_token_reused|Failed to authenticate' "
            "ai-status.json .orchestrator/state.json\" in /home/edna/workspace/drts-fleet-platform\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_provider_error_inside_captured_exec_output(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "exec",
                    '/bin/bash -lc "cat .orchestrator/logs/old-worker.log" in /repo',
                    " succeeded in 0ms:",
                    "Failed to authenticate. API Error: 401 Invalid authentication credentials",
                    "",
                    "tokens used",
                    "Reviewed old logs; no live auth error happened in this worker.",
                ]
            )
            + "\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure_signal(worker))
        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_assistant_json_auth_text_as_state_authority(self) -> None:
        worker = self._worker_for_log(
            json.dumps(
                {
                    "type": "assistant",
                    "message": {
                        "content": [
                            {
                                "type": "text",
                                "text": "Failed to authenticate. API Error: 401 Invalid authentication credentials",
                            }
                        ]
                    },
                }
            )
            + "\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure_signal(worker))

    def test_ignores_embedded_auth_error_from_claude_tool_result_json(self) -> None:
        worker = self._worker_for_log(
            json.dumps(
                {
                    "type": "user",
                    "message": {
                        "role": "user",
                        "content": [
                            {
                                "tool_use_id": "toolu_test",
                                "type": "tool_result",
                                "content": '7198-      "reason": "Failed to authenticate. API Error: 401 authentication_error: Invalid authentication credentials",',
                            }
                        ],
                    },
                }
            )
            + "\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_auth_error_mentions_from_assistant_thinking_json(self) -> None:
        worker = self._worker_for_log(
            json.dumps(
                {
                    "type": "assistant",
                    "message": {
                        "content": [
                            {
                                "type": "thinking",
                                "thinking": "Provider notes mention claude had auth 401 and gemini2 had IneligibleTierError, but this is analysis, not a live worker failure.",
                            }
                        ]
                    },
                }
            )
            + "\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_detects_real_model_availability_failure(self) -> None:
        worker = self._worker_for_log('Error: Model "grok-code-fast-1" from --model flag is not available.\n')

        self.assertEqual(
            supervisor.detect_worker_failure(worker),
            'Error: Model "grok-code-fast-1" from --model flag is not available.',
        )

    def test_detects_real_gemini_quota_failure(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "retryDelayMs: 1807388.816191,",
                    "reason: 'QUOTA_EXHAUSTED'",
                    "An unexpected critical error occurred:[object Object]",
                ]
            )
            + "\n"
        )

        self.assertEqual(
            supervisor.detect_worker_failure(worker),
            "reason: 'QUOTA_EXHAUSTED'",
        )

    def test_detects_oauth_quota_failure_inside_json_result_log(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    '{"type":"assistant","message":{"content":[{"type":"text","text":"OAuth quota exceeded: Your free daily quota has been reached."}]}}',
                    '{"type":"result","subtype":"success","result":"OAuth quota exceeded: Your free daily quota has been reached."}',
                ]
            )
            + "\n"
        )

        self.assertEqual(
            supervisor.detect_worker_failure(worker),
            "OAuth quota exceeded: Your free daily quota has been reached.",
        )

    def test_detects_claude_auth_failure_inside_json_result_log(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    '{"type":"assistant","message":{"content":[{"type":"text","text":"Failed to authenticate. API Error: 401 {\\"type\\":\\"error\\",\\"error\\":{\\"type\\":\\"authentication_error\\",\\"message\\":\\"Invalid authentication credentials\\"}}"}]}}',
                    '{"type":"result","is_error":true,"result":"Failed to authenticate. API Error: 401 {\\"type\\":\\"error\\",\\"error\\":{\\"type\\":\\"authentication_error\\",\\"message\\":\\"Invalid authentication credentials\\"}}"}',
                ]
            )
            + "\n"
        )

        self.assertIn("Failed to authenticate", supervisor.detect_worker_failure(worker) or "")
        signal = supervisor.detect_worker_failure_signal(worker)
        self.assertIsNotNone(signal)
        self.assertTrue(signal.provider_pause_authorized)
        self.assertEqual(signal.source, "json_result_error")

    def test_detects_codex_refresh_token_reuse_as_auth_failure(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "Error: Your authentication token has been invalidated. Please log out and sign in again.",
                    "reason: refresh_token_reused",
                ]
            )
            + "\n"
        )

        detected = supervisor.detect_worker_failure(worker)
        self.assertEqual(detected, "reason: refresh_token_reused")
        signal = supervisor.detect_worker_failure_signal(worker)
        self.assertIsNotNone(signal)
        self.assertTrue(signal.provider_pause_authorized)
        self.assertEqual(signal.source, "raw_process_line")
        result = supervisor.classify_worker_failure({}, {"provider": "codex2"}, detected)
        self.assertEqual(result["kind"], "auth")

    def test_detects_codex_token_invalidated_error_line(self) -> None:
        worker = self._worker_for_log(
            "Error: Your authentication token has been invalidated. Please log out and sign in again.\n"
        )

        detected = supervisor.detect_worker_failure(worker)
        self.assertEqual(
            detected,
            "Error: Your authentication token has been invalidated. Please log out and sign in again.",
        )
        result = supervisor.classify_worker_failure({}, {"provider": "codex"}, detected)
        self.assertEqual(result["kind"], "auth")

    def test_detects_copilot_no_quota_plain_text_log(self) -> None:
        worker = self._worker_for_log("402 You have no quota (Request ID: test)\n")

        self.assertEqual(
            supervisor.detect_worker_failure(worker),
            "402 You have no quota (Request ID: test)",
        )

    def test_detects_gemini_ineligible_tier_auth_failure(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "Error authenticating: IneligibleTierError: Your current account is not eligible for Gemini Code Assist for individuals, the free version of Gemini Code Assist.",
                    "reasonCode: 'RESTRICTED_DASHER_USER'",
                    "An unexpected critical error occurred:IneligibleTierError: Your current account is not eligible for Gemini Code Assist for individuals.",
                ]
            )
            + "\n"
        )

        detected = supervisor.detect_worker_failure(worker)
        self.assertIsNotNone(detected)
        self.assertTrue("IneligibleTierError" in (detected or "") or "RESTRICTED_DASHER_USER" in (detected or ""))

    def test_ignores_json_artifact_listing_that_contains_unauthorized_path_names(self) -> None:
        worker = self._worker_for_log(
            '{"type":"result","result":"apps/platform-admin-web/.next/server/chunks/ssr/0ssi_next_dist_client_components_builtin_unauthorized_0to1781.js\\napps/platform-admin-web/.next/server/app/_not-found/page.js"}\n'
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_transcribed_limit_error_inside_review_notes(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "Reviewer note:",
                    'Auto-reassigned ownership from Claude to Copilot after repeated provider failure: {"type":"result","result":"You\'ve hit your limit · resets 12am (Asia/Taipei)","worker_run_id":"claude-123"}',
                    "No local failure happened in this session.",
                ]
            )
            + "\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_numbered_markdown_dump_that_mentions_quota_text(self) -> None:
        worker = self._worker_for_log(
            '{"type":"result","result":"39\\t- `Claude`: governance-review; next: Auto-reassigned ownership from Qwen to Claude after repeated Qwen quota/terminal: Qwen OAuth quota exceeded: Your free daily quota has been reached.\\n40\\tTo continue using Qwen Code without waiting, upgrade to the Alibaba Cloud Coding Plan."}\n'
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_diff_hunk_that_mentions_old_terminal_failure(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "codex",
                    '+**Status:** `review` — shared L0 currently keeps sidecar `GAP-P2S3-007-SIDECAR-ACCEPTANCE` at `status=review` with owner=`Codex`, reviewer=`Codex2`, `last_update=2026-04-18T04:32:26Z`, and `next=\"Auto-reassigned review from Qwen to Codex2 after repeated Qwen terminal: [API Error: 401 invalid access token or token expired]\"`.',
                    "+  - `2026-04-18T04:32:18Z` `Qwen` worker start 後，再於 `2026-04-18T04:32:31Z` 因 terminal `401 invalid access token or token expired` 被自動改派回 `Codex2`。",
                    "No local failure happened in this session.",
                ]
            )
            + "\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_ignores_current_work_excerpt_that_mentions_auto_reassignment(self) -> None:
        worker = self._worker_for_log(
            "current-work.md:145:- 2026-04-18T04:27:18Z Orchestrator: `GAP-P2S3-007-SIDECAR-ACCEPTANCE` Auto-reassigned review from Qwen to Codex2 after repeated Qwen terminal: [API Error: 401 invalid access token or token expired]\n"
        )

        self.assertIsNone(supervisor.detect_worker_failure(worker))

    def test_classifies_gemini_capacity_failure(self) -> None:
        config = {"worker_retry": {"transient_error_patterns": ["429", "resource_exhausted", "rate limit"]}}
        worker = {"provider": "gemini"}

        result = supervisor.classify_worker_failure(config, worker, "status: 429 RESOURCE_EXHAUSTED")

        self.assertEqual(result["kind"], "capacity")
        self.assertTrue(result["transient"])

    def test_classifies_gemini_auth_failure(self) -> None:
        config = {"worker_retry": {"transient_error_patterns": ["429", "resource_exhausted", "rate limit"]}}
        worker = {"provider": "gemini"}

        result = supervisor.classify_worker_failure(config, worker, "status: 401 unauthorized")

        self.assertEqual(result["kind"], "auth")
        self.assertFalse(result["transient"])

    def test_classifies_gemini_ineligible_tier_as_auth_failure(self) -> None:
        config = {"worker_retry": {"transient_error_patterns": ["429", "resource_exhausted", "rate limit"]}}
        worker = {"provider": "gemini2"}

        result = supervisor.classify_worker_failure(
            config,
            worker,
            "IneligibleTierError: Your current account is not eligible for Gemini Code Assist for individuals.",
        )

        self.assertEqual(result["kind"], "auth")
        self.assertFalse(result["transient"])

    def test_rejects_non_actionable_chair_auth_pause_reason(self) -> None:
        self.assertFalse(
            supervisor.chair_provider_pause_reason_is_actionable(
                "auth",
                "Investigate supervisor pause-propagation bug and cross-lane issue citing gemini2 IneligibleTierError.",
            )
        )

    def test_allows_concrete_chair_auth_pause_reason(self) -> None:
        self.assertTrue(
            supervisor.chair_provider_pause_reason_is_actionable(
                "auth",
                "Failed to authenticate. API Error: 401 authentication_error: Invalid authentication credentials",
            )
        )

    def test_classifies_claude_authentication_error(self) -> None:
        config = {"worker_retry": {"transient_error_patterns": ["429", "resource_exhausted", "rate limit"]}}
        worker = {"provider": "claude"}

        result = supervisor.classify_worker_failure(
            config,
            worker,
            'Failed to authenticate. API Error: 401 {"error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
        )

        self.assertEqual(result["kind"], "auth")
        self.assertFalse(result["transient"])

    def test_classifies_gemini_unknown_critical_failure(self) -> None:
        config = {"worker_retry": {"transient_error_patterns": ["429", "resource_exhausted", "rate limit"]}}
        worker = {"provider": "gemini"}

        result = supervisor.classify_worker_failure(config, worker, "An unexpected critical error occurred:[object Object]")

        self.assertEqual(result["kind"], "unknown_critical")
        self.assertFalse(result["transient"])

    def test_formats_runtime_timestamp_in_taipei_time(self) -> None:
        self.assertEqual(
            supervisor.format_runtime_timestamp_local("2026-04-06T14:35:42Z"),
            "2026-04-06 22:35:42",
        )


class CandidateLifecycleMigrationTests(unittest.TestCase):
    def test_migrates_only_unversioned_task_state(self) -> None:
        config = {"paths": {"status_file": "/tmp/ai-status.json"}}
        result = mock.MagicMock(ok=True)
        with mock.patch.object(supervisor, "run_task_board_command", return_value=result) as command:
            changed = supervisor.ensure_candidate_lifecycle_migration(
                config,
                {"tasks": [{"id": "LEGACY-001"}]},
            )
        self.assertTrue(changed)
        command.assert_called_once_with(config, "migrate-candidate-lifecycle")

    def test_skips_already_migrated_task_state(self) -> None:
        with mock.patch.object(supervisor, "run_task_board_command") as command:
            changed = supervisor.ensure_candidate_lifecycle_migration(
                {},
                {"tasks": [{"id": "CURRENT-001", "candidate_lifecycle_version": 1}]},
            )
        self.assertFalse(changed)
        command.assert_not_called()


class ExecutionWorkspaceTests(unittest.TestCase):
    def _repo_config(self, root: Path) -> dict:
        (root / "ai-status.json").write_text('{"tasks":[]}\n', encoding="utf-8")
        return {
            "paths": {"status_file": str(root / "ai-status.json")},
            "agents": {
                "codex2": {
                    "id": "codex2",
                    "display_name": "Codex2",
                    "provider": "codex2",
                    "adapter": "codex",
                }
            },
            "providers": {"codex2": {"delivery_mode": "codex"}},
            "branch_strategy": {
                "worker_worktrees": {
                    "enabled": True,
                    "root": ".artifacts/worktrees/auto",
                }
            },
        }

    def _init_repo(self, root: Path) -> None:
        _git(root, "init", "-b", "dev")
        _git(root, "config", "user.email", "test@example.com")
        _git(root, "config", "user.name", "Test User")
        (root / "README.md").write_text("test\n", encoding="utf-8")
        _git(root, "add", "README.md")
        _git(root, "commit", "-m", "init")

    def test_reuses_existing_worktree_for_task_branch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            existing = root / ".artifacts/worktrees/auto/codex2-pbk-ui-003"
            _git(root, "worktree", "add", "-b", "codex2/pbk-ui-003", str(existing), "dev")

            request = supervisor.DeliveryRequest(
                agent_id="codex2",
                provider="codex2",
                delivery_mode="codex",
                message="wake",
                task_id="PBK-UI-003",
                metadata={"mode": "execution"},
            )
            workspace, branch, base_branch, source = supervisor.ensure_execution_workspace(
                self._repo_config(root),
                request,
                supervisor.route_task("PBK-UI-003"),
            )

            self.assertEqual(workspace, existing.resolve())
            self.assertEqual(branch, "codex2/pbk-ui-003")
            self.assertEqual(base_branch, "dev")
            self.assertEqual(source, "existing_worktree")

    def test_reuses_existing_worktree_for_execution_branch_override(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            existing = root / ".artifacts/worktrees/auto/gemini-iam-ses-002"
            _git(root, "worktree", "add", "-b", "codex/iam-ses-002-post-p0", str(existing), "dev")

            request = supervisor.DeliveryRequest(
                agent_id="gemini",
                provider="gemini",
                delivery_mode="antigravity",
                message="wake",
                task_id="IAM-SES-002",
                metadata={
                    "mode": "execution",
                    "task": {"execution_branch": "codex/iam-ses-002-post-p0"},
                },
            )
            workspace, branch, base_branch, source = supervisor.ensure_execution_workspace(
                self._repo_config(root),
                request,
                supervisor.route_task("IAM-SES-002"),
            )

            self.assertEqual(workspace, existing.resolve())
            self.assertEqual(branch, "codex/iam-ses-002-post-p0")
            self.assertEqual(base_branch, "dev")
            self.assertEqual(source, "existing_worktree")

    def test_does_not_reuse_unmanaged_worktree_for_task_branch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            unmanaged = Path(tmpdir) / "pbk-ui-003"
            _git(root, "worktree", "add", "-b", "codex2/pbk-ui-003", str(unmanaged), "dev")

            request = supervisor.DeliveryRequest(
                agent_id="codex2",
                provider="codex2",
                delivery_mode="codex",
                message="wake",
                task_id="PBK-UI-003",
                metadata={"mode": "execution"},
            )
            workspace, branch, _base_branch, source = supervisor.ensure_execution_workspace(
                self._repo_config(root),
                request,
                supervisor.route_task("PBK-UI-003"),
            )

            self.assertEqual(branch, "codex2/pbk-ui-003")
            self.assertEqual(source, "created_worktree")
            self.assertNotEqual(workspace, unmanaged.resolve())
            self.assertEqual(workspace, (root / ".artifacts/worktrees/auto/codex2-pbk-ui-003").resolve())
            self.assertEqual(_git(workspace, "branch", "--show-current").stdout.strip(), "codex2/pbk-ui-003")

    def test_creates_isolated_worktree_for_new_task_branch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)

            request = supervisor.DeliveryRequest(
                agent_id="codex2",
                provider="codex2",
                delivery_mode="codex",
                message="wake",
                task_id="PBK-UI-004",
                metadata={"mode": "execution"},
            )
            workspace, branch, _base_branch, source = supervisor.ensure_execution_workspace(
                self._repo_config(root),
                request,
                supervisor.route_task("PBK-UI-004"),
            )

            self.assertEqual(branch, "codex2/pbk-ui-004")
            self.assertEqual(source, "created_worktree")
            self.assertEqual(workspace, (root / ".artifacts/worktrees/auto/codex2-pbk-ui-004").resolve())
            self.assertEqual(_git(workspace, "branch", "--show-current").stdout.strip(), "codex2/pbk-ui-004")

    def test_does_not_reuse_canonical_root_when_task_branch_is_checked_out_there(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            _git(root, "switch", "-c", "codex2/pbk-ui-003")

            request = supervisor.DeliveryRequest(
                agent_id="codex2",
                provider="codex2",
                delivery_mode="codex",
                message="wake",
                task_id="PBK-UI-003",
                metadata={"mode": "execution"},
            )
            workspace, branch, _base_branch, source = supervisor.ensure_execution_workspace(
                self._repo_config(root),
                request,
                supervisor.route_task("PBK-UI-003"),
            )

            self.assertEqual(branch, "codex2/pbk-ui-003")
            self.assertEqual(source, "created_worktree")
            self.assertNotEqual(workspace, root.resolve())
            self.assertEqual(workspace, (root / ".artifacts/worktrees/auto/codex2-pbk-ui-003").resolve())
            self.assertEqual(_git(workspace, "branch", "--show-current").stdout.strip(), "codex2/pbk-ui-003")

    def test_creates_isolated_worktree_for_coordination_worker(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)

            request = supervisor.DeliveryRequest(
                agent_id="codex2",
                provider="codex2",
                delivery_mode="codex",
                message="chair wake",
                task_id=None,
                reason="chair_review:provider_health_triage",
                metadata={"mode": "coordination", "workspace_key": "chair-provider_health_triage"},
            )
            workspace, branch, base_branch, source = supervisor.ensure_execution_workspace(
                self._repo_config(root),
                request,
                None,
            )
            supervisor.attach_workspace_metadata(
                self._repo_config(root),
                request,
                workspace,
                branch,
                base_branch,
                source,
            )

            self.assertIsNone(branch)
            self.assertEqual(base_branch, "dev")
            self.assertEqual(source, "created_coordination_worktree")
            self.assertEqual(
                workspace,
                (root / ".artifacts/worktrees/auto/codex2-coordination-chair-provider_health_triage").resolve(),
            )
            self.assertNotEqual(workspace, root.resolve())
            self.assertEqual(_git(workspace, "rev-parse", "--is-inside-work-tree").stdout.strip(), "true")
            self.assertEqual(_git(workspace, "branch", "--show-current").stdout.strip(), "")
            self.assertIn("isolated coordination worktree", request.message)
            self.assertEqual(request.metadata["workspace_root"], str(workspace))








class RunOnceSupervisorStateTests(unittest.TestCase):
    def test_mode_occupancy_does_not_count_active_queue_event_as_pending(self) -> None:
        state = {
            "workers": {
                "run-1": {
                    "status": "running",
                    "queue_event_id": "evt-active",
                    "request_snapshot": {
                        "reason": "owned_ready_dispatch",
                        "metadata": {"mode": "execution"},
                    },
                }
            },
            "queue": {
                "events": {
                    "evt-active": {"status": "started", "mode": "execution", "run_id": "run-1"},
                    "evt-queued": {"status": "queued", "mode": "execution"},
                    "evt-pending": {"status": "manual_pending", "mode": "coordination"},
                }
            },
            "supervisor": {},
        }

        supervisor.update_supervisor_mode_metadata(
            state,
            focus_mode="execution",
            heartbeat_at="2026-05-18T00:00:00Z",
        )

        self.assertEqual(
            state["supervisor"]["mode_occupancy"]["execution"],
            {"running": 1, "pending": 0, "queued": 1},
        )
        self.assertEqual(
            state["supervisor"]["mode_occupancy"]["coordination"],
            {"running": 0, "pending": 1, "queued": 0},
        )

    def test_heartbeat_lag_seconds_reports_gap(self) -> None:
        lag = supervisor.heartbeat_lag_seconds(
            "2026-04-06T12:00:00Z",
            "2026-04-06T12:00:12Z",
        )

        self.assertEqual(lag, 12.0)

    def test_mark_supervisor_stopped_clears_pid_workers_and_chair_review(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            state_path = root / "state.json"
            event_queue_path = root / "event-queue.jsonl"
            activity_log_path = root / "activity-log.jsonl"
            status_path = root / "ai-status.json"
            approval_path = root / "approval-queue.json"
            state_path.write_text(
                json.dumps(
                    {
                        "queue": {
                            "events": {
                                "evt-worker": {"status": "started", "run_id": "run-worker"},
                                "evt-chair": {"status": "started", "run_id": "run-chair"},
                            }
                        },
                        "workers": {
                            "run-worker": {
                                "run_id": "run-worker",
                                "status": "running",
                                "pid": 4242,
                                "queue_event_id": "evt-worker",
                                "task_id": "TASK-1",
                                "provider": "codex",
                                "request_snapshot": {
                                    "reason": "owned_in_progress_dispatch",
                                    "metadata": {"mode": "execution"},
                                },
                            },
                        },
                        "chair_review": {
                            "active_review": {
                                "agent": "Gemini2",
                                "agent_id": "gemini2",
                                "reason": "provider_health_triage",
                                "queue_event_id": "evt-chair",
                            }
                        },
                        "supervisor": {
                            "pid": 4241,
                            "focus_mode": "execution",
                            "mode_status": "active",
                            "lifecycle": "running",
                        },
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            event_queue_path.write_text(
                "\n".join(
                    [
                        json.dumps({"event_id": "evt-worker"}),
                        json.dumps({"event_id": "evt-chair"}),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            activity_log_path.write_text("", encoding="utf-8")
            status_path.write_text('{"tasks":[]}\n', encoding="utf-8")
            approval_path.write_text('{"pending":[],"history":[]}\n', encoding="utf-8")
            config = {
                "paths": {
                    "state_file": str(state_path),
                    "event_queue": str(event_queue_path),
                    "activity_log": str(activity_log_path),
                    "status_file": str(status_path),
                    "approval_queue": str(approval_path),
                },
                "ready_dispatcher": {
                    "active_worker_statuses": ["running", "stalled", "waiting_approval", "manual_pending"]
                },
            }

            with mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate:
                changed = supervisor.mark_supervisor_stopped(
                    config,
                    reason="signal:SIGTERM",
                    signum=15,
                    terminate_workers=True,
                )

            self.assertTrue(changed)
            terminate.assert_called_once_with(4242)
            saved = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertIsNone(saved["supervisor"]["pid"])
            self.assertEqual(saved["supervisor"]["last_pid"], 4241)
            self.assertEqual(saved["supervisor"]["lifecycle"], "stopped")
            self.assertEqual(saved["supervisor"]["mode_status"], "stopped")
            self.assertEqual(saved["supervisor"]["stop_reason"], "signal:SIGTERM")
            self.assertEqual(saved["workers"]["run-worker"]["status"], "interrupted")
            self.assertIsNone(saved["workers"]["run-worker"]["pid"])
            self.assertEqual(saved["workers"]["run-worker"]["stopped_pid"], 4242)
            self.assertEqual(saved["queue"]["events"]["evt-worker"]["status"], "failed")
            self.assertIn("Supervisor stopped", saved["queue"]["events"]["evt-worker"]["error"])
            self.assertEqual(saved["queue"]["events"]["evt-chair"]["status"], "failed")
            self.assertIsNone(saved["chair_review"]["active_review"])
            self.assertEqual(saved["chair_review"]["interrupted_review"]["agent_id"], "gemini2")
            self.assertEqual(saved["chair_review"]["interrupted_review"]["reason"], "provider_health_triage")
            self.assertEqual(
                saved["chair_review"]["interrupted_review"]["interruption_reason"],
                "signal:SIGTERM",
            )
            self.assertEqual(saved["supervisor"]["mode_occupancy"]["execution"]["running"], 0)

    def test_signal_handler_raises_controlled_shutdown(self) -> None:
        with self.assertRaises(supervisor.SupervisorShutdown) as ctx:
            supervisor.raise_supervisor_shutdown(signal.SIGTERM, None)

        self.assertEqual(ctx.exception.signum, signal.SIGTERM)
        self.assertEqual(ctx.exception.reason, "signal:SIGTERM")

    def test_run_once_re_stamps_current_pid_after_watch_reload(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {},
            "watcher": {},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {},
        }
        initial_state = {
            "queue": {"events": {}},
            "workers": {},
            "approvals": {},
            "supervisor": {
                "pid": 61209,
                "started_at": "2026-04-05T12:44:57Z",
                "last_heartbeat_at": "2026-04-06T04:17:26Z",
            },
        }
        saved_state: dict[str, object] = {}

        def capture_save(_config: dict[str, object], state: dict[str, object]) -> None:
            saved_state.clear()
            saved_state.update(state)

        with (
            mock.patch.object(supervisor, "write_supervisor_pid"),
            mock.patch.object(supervisor, "load_runtime_state", side_effect=[dict(initial_state), dict(initial_state)]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [], "execution_mode": "supervisor_managed_execution"}),
            mock.patch.object(supervisor, "prune_stale_approvals", return_value=False),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "run_scan", return_value=False),
            mock.patch.object(supervisor, "poll_workers", return_value=False),
            mock.patch.object(supervisor, "reconcile_queue_records", return_value=False),
            mock.patch.object(supervisor, "prune_event_queue", return_value=False),
            mock.patch.object(supervisor, "dispatch_ready_tasks", return_value=False),
            mock.patch.object(supervisor, "process_queue", return_value=False),
            mock.patch.object(supervisor, "sync_github_bus", return_value=False),
            mock.patch.object(supervisor, "trim_worker_history"),
            mock.patch.object(supervisor, "trim_seen_events"),
            mock.patch.object(supervisor, "save_runtime_state", side_effect=capture_save),
        ):
            supervisor.run_once(config, watch=True, replay=False)

        self.assertEqual(saved_state["supervisor"]["pid"], os.getpid())
        self.assertIsNotNone(saved_state["supervisor"]["last_heartbeat_at"])
        self.assertEqual(saved_state["supervisor"]["started_at"], saved_state["supervisor"]["last_heartbeat_at"])

    def test_run_once_can_skip_pid_file_management(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {},
            "watcher": {},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {},
        }

        with (
            mock.patch.object(supervisor, "write_supervisor_pid") as write_pid,
            mock.patch.object(supervisor, "load_runtime_state", return_value={"queue": {"events": {}}, "workers": {}, "approvals": {}, "supervisor": {}}),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [], "execution_mode": "supervisor_managed_execution"}),
            mock.patch.object(supervisor, "prune_stale_approvals", return_value=False),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "run_scan", return_value=False),
            mock.patch.object(supervisor, "poll_workers", return_value=False),
            mock.patch.object(supervisor, "reconcile_queue_records", return_value=False),
            mock.patch.object(supervisor, "prune_event_queue", return_value=False),
            mock.patch.object(supervisor, "dispatch_ready_tasks", return_value=False),
            mock.patch.object(supervisor, "process_queue", return_value=False),
            mock.patch.object(supervisor, "sync_github_bus", return_value=False),
            mock.patch.object(supervisor, "trim_worker_history"),
            mock.patch.object(supervisor, "trim_seen_events"),
            mock.patch.object(supervisor, "save_runtime_state"),
        ):
            supervisor.run_once(config, watch=False, replay=False, once=True, manage_pid_file=False)

        write_pid.assert_not_called()

    def test_main_once_skips_daemon_pid_management(self) -> None:
        args = mock.Mock(
            quiet=False,
            config="config.json",
            poll_interval=None,
            no_watch=False,
            replay=False,
            verbose=False,
            once=True,
        )

        with (
            mock.patch.object(supervisor, "parse_args", return_value=args),
            mock.patch.object(supervisor, "load_config", return_value={"supervisor": {"poll_interval_seconds": 2.0}}),
            mock.patch.object(supervisor, "terminate_older_supervisors") as terminate_old,
            mock.patch.object(supervisor.atexit, "register") as register_exit,
            mock.patch.object(supervisor, "write_supervisor_pid") as write_pid,
            mock.patch.object(supervisor, "run_once", return_value=False) as run_once,
        ):
            result = supervisor.main()

        self.assertEqual(result, 0)
        terminate_old.assert_not_called()
        register_exit.assert_not_called()
        write_pid.assert_not_called()
        run_once.assert_called_once()
        self.assertFalse(run_once.call_args.kwargs["manage_pid_file"])

    def test_safe_load_approval_state_filters_non_pending_entries(self) -> None:
        config: dict[str, object] = {}

        with mock.patch.object(
            supervisor,
            "load_approval_state",
            return_value={
                "pending": [
                    {"approval_id": "apr-1", "status": "pending"},
                    {"approval_id": "apr-2", "status": "denied"},
                ],
                "history": [{"approval_id": "apr-old", "status": "resolved"}],
            },
        ):
            state = supervisor.safe_load_approval_state(config)

        self.assertEqual(state["pending"], [{"approval_id": "apr-1", "status": "pending"}])
        self.assertEqual(state["history"], [{"approval_id": "apr-old", "status": "resolved"}])


class WorkerProcessActivityTests(unittest.TestCase):
    def test_parses_proc_stat_with_spaces_in_process_name(self) -> None:
        parsed = supervisor.parse_proc_stat_process_accounting(
            "123 (worker with spaces) R 7 0 0 0 0 0 0 0 0 0 11 13"
        )

        self.assertEqual(parsed, (7, 24))




class SingleSupervisorGuardTests(unittest.TestCase):
    def test_supervisor_cmdline_matches_actual_python_process(self) -> None:
        repo_root = str(supervisor.REPO_ROOT)

        self.assertTrue(
            supervisor.supervisor_cmdline_matches_current_script(
                ["/usr/bin/python3", "tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py", "--config", "config.json"],
                repo_root,
            )
        )

    def test_supervisor_cmdline_ignores_timeout_parent_wrapper(self) -> None:
        repo_root = str(supervisor.REPO_ROOT)

        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(
                ["timeout", "15", "/usr/bin/python3", "tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py", "--verbose"],
                repo_root,
            )
        )

    def test_supervisor_cmdline_ignores_shell_launcher(self) -> None:
        repo_root = str(supervisor.REPO_ROOT)

        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(
                ["/bin/bash", "-lc", "python3 tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py --verbose"],
                repo_root,
            )
        )

    def test_terminate_older_supervisors_kills_only_older_matching_processes(self) -> None:
        config = {"activity_log": "/tmp/fake-log.jsonl"}
        killed: list[tuple[int, int]] = []
        alive = {101: True, 202: True, 404: True}

        def fake_kill(pid: int, sig: int) -> None:
            killed.append((pid, sig))
            if sig in {supervisor.signal.SIGTERM, supervisor.signal.SIGKILL}:
                alive[pid] = False

        with (
            mock.patch.object(supervisor, "iter_matching_supervisor_pids", return_value=[101, 202, 404]),
            mock.patch.object(supervisor, "pid_is_alive", side_effect=lambda pid: alive.get(pid, False)),
            mock.patch.object(supervisor.os, "getpid", return_value=202),
            mock.patch.object(supervisor.os, "kill", side_effect=fake_kill),
            mock.patch.object(supervisor.time, "sleep"),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            supervisor.terminate_older_supervisors(config)

        self.assertEqual(killed, [(101, supervisor.signal.SIGTERM)])
        write_activity_log.assert_called_once()
        payload = write_activity_log.call_args.args[1]
        self.assertEqual(payload["type"], "supervisor_replaced")
        self.assertEqual(payload["old_pid"], 101)
        self.assertEqual(payload["new_pid"], 202)


class WorkerReassignmentTests(EvidenceOutputIsolation, unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.config = {
            "worker_reassignment": {
                "enabled": True,
                "after_attempts": 2,
                "reassign_on_terminal_failure": True,
                "owner_fallbacks": {
                    "Gemini": ["Codex", "Claude", "Claude2"],
                },
                "reviewer_fallbacks": {
                    "Gemini": ["Codex", "Claude", "Claude2"],
                },
            },
            "agents": {
                "claude": {"display_name": "Claude"},
                "gemini": {"display_name": "Gemini"},
                "codex": {"display_name": "Codex"},
                "claude2": {"display_name": "Claude2"},
            },
        }

    def test_default_reassignment_fallbacks_do_not_reintroduce_retired_lanes(self) -> None:
        settings = supervisor.worker_reassignment_settings({})

        serialized = json.dumps(settings.get("owner_fallbacks", {})) + json.dumps(settings.get("reviewer_fallbacks", {}))
        self.assertNotIn("Qwen", serialized)
        self.assertNotIn("Grok", serialized)
        self.assertIn("Claude2", serialized)
        self.assertIn("Gemini2", serialized)

    def test_reassigns_review_task_to_new_reviewer_after_repeated_failure(self) -> None:
        worker = {
            "task_id": "P3-001",
            "agent_id": "gemini",
            "retry_count": 1,
            "run_id": "gemini-run-1",
        }
        status = {
            "tasks": [
                {
                    "id": "P3-001",
                    "status": "review",
                    "owner": "Claude",
                    "reviewer": "Gemini",
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            reassigned_to = supervisor.maybe_reassign_task_after_worker_failure(
                self.config,
                worker,
                "status: 429",
            )

        self.assertEqual(reassigned_to, "Codex")
        persist.assert_called_once()
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "P3-001")
        self.assertEqual(kwargs["new_owner"], "Claude")
        self.assertEqual(kwargs["new_reviewer"], "Codex")
        self.assertEqual(kwargs["handoff_to"], "Codex")
        write_activity_log.assert_called_once()
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "task_reassigned")

    def test_reassigns_owned_task_to_new_owner_after_repeated_failure(self) -> None:
        worker = {
            "task_id": "LP-003",
            "agent_id": "gemini",
            "retry_count": 1,
            "run_id": "gemini-run-2",
        }
        status = {
            "tasks": [
                {
                    "id": "LP-003",
                    "status": "in_progress",
                    "owner": "Gemini",
                    "reviewer": "Claude",
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            reassigned_to = supervisor.maybe_reassign_task_after_worker_failure(
                self.config,
                worker,
                "status: 429",
            )

        self.assertEqual(reassigned_to, "Codex")
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "LP-003")
        self.assertEqual(kwargs["new_owner"], "Codex")
        self.assertEqual(kwargs["new_reviewer"], "Claude")

    def test_reassigns_owner_task_to_new_owner_after_repeated_failure(self) -> None:
        config = {
            **self.config,
            "worker_reassignment": {
                **self.config["worker_reassignment"],
                "owner_fallbacks": {
                    **self.config["worker_reassignment"]["owner_fallbacks"],
                    "Claude": ["Claude2", "Gemini", "Codex"],
                },
                "reviewer_fallbacks": {
                    **self.config["worker_reassignment"]["reviewer_fallbacks"],
                    "Claude": ["Claude2", "Gemini", "Codex"],
                },
            },
            "agents": {
                **self.config["agents"],
            },
        }
        worker = {
            "task_id": "RUN-001",
            "agent_id": "claude",
            "retry_count": 5,
            "run_id": "claude-run-9",
        }
        status = {
            "tasks": [
                {
                    "id": "RUN-001",
                    "status": "in_progress",
                    "owner": "Claude",
                    "reviewer": "Codex",
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            reassigned_to = supervisor.maybe_reassign_task_after_worker_failure(
                config,
                worker,
                "You've hit your limit · resets 1pm (Asia/Taipei)",
                terminal=True,
            )

        self.assertEqual(reassigned_to, "Claude2")
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "RUN-001")
        self.assertEqual(kwargs["new_owner"], "Claude2")
        self.assertEqual(kwargs["new_reviewer"], "Codex")

    def test_reassign_skips_quota_paused_fallback_agent(self) -> None:
        config = {
            **self.config,
            "worker_reassignment": {
                **self.config["worker_reassignment"],
                "owner_fallbacks": {
                    **self.config["worker_reassignment"]["owner_fallbacks"],
                    "Claude": ["Claude2", "Gemini", "Codex"],
                },
                "reviewer_fallbacks": {
                    **self.config["worker_reassignment"]["reviewer_fallbacks"],
                    "Claude": ["Claude2", "Gemini", "Codex"],
                },
            },
            "agents": {
                **self.config["agents"],
                "claude2": {"display_name": "Claude2"},
            },
        }
        worker = {
            "task_id": "RUN-PAUSED",
            "agent_id": "claude",
            "retry_count": 5,
            "run_id": "claude-run-paused",
        }
        status = {
            "tasks": [
                {
                    "id": "RUN-PAUSED",
                    "status": "in_progress",
                    "owner": "Claude",
                    "reviewer": "Codex",
                }
            ]
        }
        state = {
            "provider_pauses": {
                "claude2": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "claude2",
                    "kind": "quota",
                    "reason": "provider quota exhausted",
                    "paused_at": "2026-04-16T00:00:00Z",
                    "resume_at": 9999999999,
                }
            }
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            reassigned_to = supervisor.maybe_reassign_task_after_worker_failure(
                config,
                worker,
                "You've hit your limit · resets 1pm (Asia/Taipei)",
                terminal=True,
                state=state,
            )

        self.assertEqual(reassigned_to, "Gemini")
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "RUN-PAUSED")
        self.assertEqual(kwargs["new_owner"], "Gemini")
        self.assertEqual(kwargs["new_reviewer"], "Codex")

    def test_retry_wrapper_passes_state_into_reassignment(self) -> None:
        config = {
            **self.config,
            "worker_retry": {
                "max_attempts": 0,
                "fallback_mode": "none",
            },
        }
        state = {"provider_pauses": {}}
        worker = {
            "run_id": "gemini-run-wrapper",
            "task_id": "WRAP-001",
            "provider": "gemini",
            "agent_id": "gemini",
            "retry_count": 0,
            "queue_event_id": "evt-wrap-1",
        }

        with (
            mock.patch.object(supervisor, "request_for_worker", return_value={"task_id": "WRAP-001"}),
            mock.patch.object(supervisor, "maybe_reassign_task_after_worker_failure", return_value="Codex") as maybe_reassign,
            mock.patch.object(supervisor, "finalize_queue_event_record"),
        ):
            handled, changed = supervisor.maybe_trigger_retry_or_fallback(
                config,
                state,
                {},
                worker,
                "status: 429",
            )

        self.assertTrue(handled)
        self.assertTrue(changed)
        self.assertEqual(worker["status"], "reassigned")
        self.assertEqual(worker["reassigned_to"], "Codex")
        self.assertIs(maybe_reassign.call_args.kwargs["state"], state)

    def test_capacity_retry_temporarily_pauses_exact_lane(self) -> None:
        config = {
            **self.config,
            "agents": {
                **self.config["agents"],
                "gemini2": {"display_name": "Gemini2", "provider": "gemini2"},
            },
            "worker_retry": {
                "max_attempts": 1,
                "backoff_schedule_seconds": [60],
                "jitter_seconds": 0,
                "fallback_mode": "none",
                "transient_error_patterns": ["429", "resource_exhausted", "no capacity available"],
            },
        }
        state = {}
        worker = {
            "run_id": "gemini2-run-capacity",
            "task_id": "CAP-001",
            "provider": "gemini2",
            "agent_id": "gemini2",
            "retry_count": 0,
            "queue_event_id": "evt-capacity-1",
            "log_path": "/tmp/gemini2-run-capacity.log",
        }

        with (
            mock.patch.object(supervisor, "request_for_worker", return_value={"task_id": "CAP-001"}),
            mock.patch.object(supervisor, "maybe_reassign_task_after_worker_failure", return_value=None),
            mock.patch.object(supervisor, "record_worker_evidence", return_value=".orchestrator/evidence/capacity.json"),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            handled, changed = supervisor.maybe_trigger_retry_or_fallback(
                config,
                state,
                {"providers": {"gemini2": {"auth_ready": True}}},
                worker,
                "status: 429 RESOURCE_EXHAUSTED No capacity available for model gemini-2.5-flash",
            )

        self.assertTrue(handled)
        self.assertTrue(changed)
        self.assertEqual(worker["status"], "retry_backoff")
        self.assertIn("gemini2", state["provider_pauses"])
        self.assertEqual(state["provider_pauses"]["gemini2"]["kind"], "capacity")
        self.assertTrue(
            supervisor.is_agent_dispatch_paused(
                config,
                state,
                "gemini2",
                provider_report={"providers": {"gemini2": {"auth_ready": True}}},
            )
        )

    def test_live_capacity_failure_terminates_and_pauses_exact_lane(self) -> None:
        config = {
            "agents": {
                "gemini2": {"display_name": "Gemini2", "provider": "gemini2"},
            },
            "worker_retry": {
                "max_attempts": 1,
                "backoff_schedule_seconds": [60],
                "jitter_seconds": 0,
                "fallback_mode": "none",
                "transient_error_patterns": ["429", "resource_exhausted", "no capacity available"],
            },
            "ready_dispatch": {
                "active_worker_statuses": ["running", "retry_backoff", "stalled", "waiting_approval", "manual_pending"],
            },
        }
        state = {
            "queue": {"events": {"evt-live-capacity": {"status": "started"}}},
            "workers": {
                "gemini2-live-capacity": {
                    "run_id": "gemini2-live-capacity",
                    "provider": "gemini2",
                    "agent_id": "gemini2",
                    "task_id": None,
                    "pid": 4242,
                    "status": "running",
                    "mode": "coordination",
                    "request_snapshot": {"reason": "chair_review:reassignment_triage", "metadata": {"mode": "coordination"}},
                    "queue_event_id": "evt-live-capacity",
                    "last_event_at": "2026-04-30T13:33:00Z",
                    "retry_count": 0,
                }
            },
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": []}),
            mock.patch.object(supervisor, "load_provider_report", return_value={"providers": {"gemini2": {"auth_ready": True}}}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "update_from_log"),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(
                supervisor,
                "detect_worker_failure_signal",
                return_value=supervisor.WorkerFailureSignal(
                    "status: 429 RESOURCE_EXHAUSTED No capacity available for model gemini-2.5-pro",
                    source="raw_process_line",
                    provider_pause_authorized=True,
                ),
            ),
            mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate,
            mock.patch.object(supervisor, "request_for_worker", return_value={"task_id": None}),
            mock.patch.object(supervisor, "maybe_reassign_task_after_worker_failure", return_value=None),
            mock.patch.object(supervisor, "record_worker_evidence", return_value=".orchestrator/evidence/live-capacity.json"),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        terminate.assert_called_once_with(4242)
        worker = state["workers"]["gemini2-live-capacity"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(state["queue"]["events"]["evt-live-capacity"]["status"], "failed")
        self.assertEqual(state["provider_pauses"]["gemini2"]["kind"], "capacity")

    def test_live_coordination_log_excerpt_does_not_pause_provider(self) -> None:
        handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
        handle.write(
            "\n".join(
                [
                    "exec",
                    '/bin/bash -lc "cat .orchestrator/logs/old-worker.log" in /repo',
                    " succeeded in 0ms:",
                    "Failed to authenticate. API Error: 401 Invalid authentication credentials",
                    "",
                    "tokens used",
                    "Reviewed archived auth failures; no live auth error happened in this worker.",
                ]
            )
            + "\n"
        )
        handle.flush()
        handle.close()
        self.addCleanup(Path(handle.name).unlink, missing_ok=True)
        config = {
            "agents": {
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            },
            "ready_dispatch": {
                "active_worker_statuses": ["running", "retry_backoff", "stalled", "waiting_approval", "manual_pending"],
            },
        }
        state = {
            "queue": {"events": {"evt-chair": {"status": "started"}}},
            "workers": {
                "codex2-chair": {
                    "run_id": "codex2-chair",
                    "provider": "codex2",
                    "agent_id": "codex2",
                    "task_id": None,
                    "pid": 4243,
                    "status": "running",
                    "mode": "coordination",
                    "request_snapshot": {"reason": "chair_review:provider_health_triage", "metadata": {"mode": "coordination"}},
                    "queue_event_id": "evt-chair",
                    "last_event_at": "2999-01-01T00:00:00Z",
                    "retry_count": 0,
                    "log_path": handle.name,
                }
            },
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": []}),
            mock.patch.object(supervisor, "load_provider_report", return_value={"providers": {"codex2": {"auth_ready": True}}}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "update_from_log"),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            supervisor.poll_workers(config, state)

        terminate.assert_not_called()
        self.assertNotIn("provider_pauses", state)
        self.assertEqual(state["workers"]["codex2-chair"]["status"], "running")

    def test_finalize_terminal_wrapper_passes_state_into_reassignment(self) -> None:
        config = dict(self.config)
        state = {"provider_pauses": {}}
        worker = {
            "run_id": "claude-run-wrapper",
            "task_id": "WRAP-002",
            "provider": "claude",
            "agent_id": "claude",
            "queue_event_id": "evt-wrap-2",
        }

        with (
            mock.patch.object(supervisor, "maybe_reassign_task_after_worker_failure", return_value="Grok") as maybe_reassign,
            mock.patch.object(supervisor, "finalize_queue_event_record"),
        ):
            handled = supervisor.finalize_terminal_worker_outcome(
                config,
                state,
                worker,
                "You've hit your limit",
            )

        self.assertTrue(handled)
        self.assertEqual(worker["status"], "reassigned")
        self.assertEqual(worker["reassigned_to"], "Grok")
        self.assertIs(maybe_reassign.call_args.kwargs["state"], state)




class WorkerTreeGuardSettingsTests(unittest.TestCase):
    def test_defaults_off_with_canonical_blocking_globs(self) -> None:
        settings = supervisor.worker_tree_guard_settings({})
        self.assertFalse(settings["enabled"])
        self.assertFalse(settings["log_only"])
        # All fragile surfaces from branch-strategy.md §11.1.
        for needed in [
            "tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py",
            "tools/development-orchestrator/control_plane/**",
            "tools/development-orchestrator/skills/**",
            "tools/development-orchestrator/templates/*",
            ".orchestrator/config*.json",
            "tools/development-orchestrator/branch_routing.py",
            "docs/ops/branch-strategy.md",
            ".github/workflows/**",
            ".husky/**",
        ]:
            self.assertIn(needed, settings["blocking_globs"])

    def test_override_overrides_globs_completely(self) -> None:
        config = {
            "branch_strategy": {
                "worker_tree_guard": {
                    "enabled": True,
                    "blocking_globs": ["my-special-file.txt"],
                }
            }
        }
        settings = supervisor.worker_tree_guard_settings(config)
        self.assertTrue(settings["enabled"])
        self.assertEqual(settings["blocking_globs"], ["my-special-file.txt"])

    def test_empty_globs_list_falls_back_to_defaults(self) -> None:
        config = {"branch_strategy": {"worker_tree_guard": {"blocking_globs": []}}}
        settings = supervisor.worker_tree_guard_settings(config)
        self.assertIn("tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py", settings["blocking_globs"])


class WorkerTreeGuardMatchingTests(unittest.TestCase):
    GLOBS = [
        "tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py",
        "tools/development-orchestrator/skills/**",
        "tools/development-orchestrator/templates/*",
        ".orchestrator/config*.json",
        "docs/**",
        ".husky/**",
    ]

    def test_exact_file_matches(self) -> None:
        self.assertEqual(
            supervisor._worker_tree_guard_matches("tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py", self.GLOBS),
            "tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py",
        )

    def test_double_star_matches_direct_child(self) -> None:
        self.assertEqual(
            supervisor._worker_tree_guard_matches("tools/development-orchestrator/skills/task-closeout.md", self.GLOBS),
            "tools/development-orchestrator/skills/**",
        )

    def test_double_star_matches_nested_child(self) -> None:
        self.assertEqual(
            supervisor._worker_tree_guard_matches("docs/ops/branch-strategy.md", self.GLOBS),
            "docs/**",
        )

    def test_single_star_matches_one_level_only(self) -> None:
        self.assertEqual(
            supervisor._worker_tree_guard_matches("tools/development-orchestrator/templates/wakeup.txt", self.GLOBS),
            "tools/development-orchestrator/templates/*",
        )

    def test_runtime_state_files_do_not_match(self) -> None:
        for path in ["ai-status.json", "current-work.md", "tools/development-orchestrator/dashboard/index.html"]:
            with self.subTest(path=path):
                # docs-site is outside the docs/** blocking pattern when
                # treated as a separate top-level directory.
                self.assertIsNone(
                    supervisor._worker_tree_guard_matches(path, self.GLOBS)
                )

    def test_unrelated_paths_do_not_match(self) -> None:
        self.assertIsNone(
            supervisor._worker_tree_guard_matches("apps/driver/src/index.tsx", self.GLOBS)
        )


class CheckWorkerTreeGuardTests(unittest.TestCase):
    def _enabled_config(self, log_only: bool = False) -> dict:
        return {
            "branch_strategy": {
                "worker_tree_guard": {
                    "enabled": True,
                    "log_only": log_only,
                    "blocking_globs": [
                        "tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py",
                        "tools/development-orchestrator/skills/**",
                        "docs/**",
                    ],
                }
            }
        }

    def _porcelain(self, paths: list[str]) -> mock.MagicMock:
        proc = mock.MagicMock()
        proc.returncode = 0
        proc.stdout = "\n".join(f" M {p}" for p in paths)
        proc.stderr = ""
        return proc

    def test_disabled_returns_none(self) -> None:
        result = supervisor.check_worker_tree_guard({}, reason="owned_in_progress_dispatch")
        self.assertIsNone(result)

    def test_dirty_fragile_surface_returns_block_payload(self) -> None:
        with mock.patch.object(
            supervisor.subprocess, "run", return_value=self._porcelain(["tools/development-orchestrator/skills/foo.md"])
        ):
            result = supervisor.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNotNone(result)
        self.assertEqual(result["dirty_paths"], ["tools/development-orchestrator/skills/foo.md"])
        self.assertIn("tools/development-orchestrator/skills/**", result["matched_globs"])
        self.assertFalse(result["log_only"])

    def test_dirty_only_runtime_state_returns_none(self) -> None:
        with mock.patch.object(
            supervisor.subprocess,
            "run",
            return_value=self._porcelain(["ai-status.json", "current-work.md"]),
        ):
            result = supervisor.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNone(result)

    def test_log_only_mode_carries_flag_through(self) -> None:
        with mock.patch.object(
            supervisor.subprocess,
            "run",
            return_value=self._porcelain(["tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py"]),
        ):
            result = supervisor.check_worker_tree_guard(
                self._enabled_config(log_only=True), reason="owned_in_progress_dispatch"
            )
        self.assertIsNotNone(result)
        self.assertTrue(result["log_only"])

    def test_git_command_failure_fails_open(self) -> None:
        proc = mock.MagicMock()
        proc.returncode = 128
        proc.stdout = ""
        proc.stderr = "fatal: not a git repository"
        with mock.patch.object(supervisor.subprocess, "run", return_value=proc):
            result = supervisor.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNone(result, "guard must not block on its own diagnostic failure")

    def test_rename_porcelain_format_takes_new_path(self) -> None:
        proc = mock.MagicMock()
        proc.returncode = 0
        proc.stdout = "R  old/path.md -> tools/development-orchestrator/skills/renamed.md"
        proc.stderr = ""
        with mock.patch.object(supervisor.subprocess, "run", return_value=proc):
            result = supervisor.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNotNone(result)
        self.assertEqual(result["dirty_paths"], ["tools/development-orchestrator/skills/renamed.md"])




class WorkerAttemptCooldownTests(unittest.TestCase):
    def test_ready_dispatch_skips_terminal_progress_attempt_before_redispatch(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {"enabled": True},
            "agents": {
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
            },
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "codex-yield-001": {
                    "run_id": "codex-yield-001",
                    "task_id": "YIELD-001",
                    "agent_id": "codex",
                    "status": "completed",
                    "terminal_outcome": "progress",
                    "completed_at": "2026-08-14T12:00:00Z",
                    "redispatch_after": "2999-01-01T00:00:00Z",
                }
            },
        }
        status = {
            "tasks": [
                {
                    "id": "YIELD-001",
                    "status": "todo",
                    "owner": "Codex",
                    "reviewer": "Claude",
                    "depends_on": [],
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event") as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertFalse(changed)
        queue_delivery_event.assert_not_called()

    def test_expired_progress_attempt_does_not_block_redispatch(self) -> None:
        workers = {
            "codex-yield-002": {
                "run_id": "codex-yield-002",
                "task_id": "YIELD-002",
                "agent_id": "codex",
                "status": "completed",
                "terminal_outcome": "progress",
                "completed_at": "2020-01-01T00:00:00Z",
                "redispatch_after": "2020-01-01T00:00:00Z",
            }
        }

        self.assertFalse(supervisor.redispatch_is_deferred(workers, "YIELD-002", "Codex"))


class DispatchCooldownTests(unittest.TestCase):
    """Cooldown protects freshly-dispatched workers from voluntary supersede.

    See `worker_in_dispatch_cooldown` in the Supervisor runtime. Cooldown is
    measured against the timestamp embedded in the worker run_id; for
    workers whose run_id has no parseable timestamp (legacy / synthetic
    fixtures), cooldown is bypassed so the historical supersede behaviour
    is preserved.
    """

    def test_parse_returns_none_for_short_slug(self) -> None:
        self.assertIsNone(supervisor.parse_worker_dispatched_at("run-1"))
        self.assertIsNone(supervisor.parse_worker_dispatched_at(None))
        self.assertIsNone(supervisor.parse_worker_dispatched_at(""))

    def test_parse_extracts_timestamp_from_production_run_id(self) -> None:
        dt = supervisor.parse_worker_dispatched_at("codex-20260526T043357Z-d168b9f0")
        self.assertIsNotNone(dt)
        from datetime import datetime, timezone
        self.assertEqual(
            dt, datetime(2026, 5, 26, 4, 33, 57, tzinfo=timezone.utc)
        )

    def test_cooldown_false_when_disabled(self) -> None:
        worker = {"status": "running", "run_id": "codex-20260526T043357Z-aaa"}
        self.assertFalse(supervisor.worker_in_dispatch_cooldown(worker, 0))
        self.assertFalse(supervisor.worker_in_dispatch_cooldown(worker, -1))

    def test_cooldown_false_for_non_running_worker(self) -> None:
        from datetime import datetime, timezone
        worker = {"status": "stalled", "run_id": "codex-20260526T043357Z-aaa"}
        now = datetime(2026, 5, 26, 4, 34, 0, tzinfo=timezone.utc)
        self.assertFalse(
            supervisor.worker_in_dispatch_cooldown(worker, 300, now=now),
            "stalled workers must remain recoverable via supersede",
        )

    def test_cooldown_true_for_fresh_running_worker(self) -> None:
        from datetime import datetime, timezone
        worker = {"status": "running", "run_id": "codex-20260526T043357Z-aaa"}
        now = datetime(2026, 5, 26, 4, 34, 0, tzinfo=timezone.utc)
        self.assertTrue(
            supervisor.worker_in_dispatch_cooldown(worker, 300, now=now),
            "running worker dispatched 3s ago is within 300s cooldown",
        )

    def test_cooldown_false_for_stale_worker(self) -> None:
        from datetime import datetime, timezone
        worker = {"status": "running", "run_id": "codex-20260526T043357Z-aaa"}
        now = datetime(2026, 5, 26, 5, 30, 0, tzinfo=timezone.utc)
        self.assertFalse(
            supervisor.worker_in_dispatch_cooldown(worker, 300, now=now),
            "running worker dispatched 56 min ago is outside 300s cooldown",
        )

    def test_cooldown_false_when_runid_has_no_timestamp(self) -> None:
        from datetime import datetime, timezone
        worker = {"status": "running", "run_id": "run-active"}
        now = datetime(2026, 5, 26, 4, 34, 0, tzinfo=timezone.utc)
        self.assertFalse(
            supervisor.worker_in_dispatch_cooldown(worker, 300, now=now),
            "synthetic test fixtures without timestamped run_ids must bypass cooldown",
        )

    def test_ready_dispatch_settings_default_cooldown(self) -> None:
        settings = supervisor.ready_dispatch_settings({})
        self.assertEqual(settings.get("dispatch_cooldown_seconds"), 300)

    def test_ready_dispatch_settings_honors_explicit_zero(self) -> None:
        settings = supervisor.ready_dispatch_settings({
            "ready_dispatcher": {"dispatch_cooldown_seconds": 0}
        })
        self.assertEqual(settings.get("dispatch_cooldown_seconds"), 0)




class SdNotifyTests(unittest.TestCase):
    """OPS-SUPERVISOR-SD-NOTIFY-001: _sd_notify must (a) no-op when
    NOTIFY_SOCKET is unset (covers interactive / --once usage), (b) deliver
    a WATCHDOG=1 datagram to the AF_UNIX socket systemd hands us when set,
    (c) swallow all OS errors (heartbeat must never take the supervisor
    down)."""

    def test_noop_when_notify_socket_unset(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NOTIFY_SOCKET", None)
            with mock.patch.object(supervisor.socket, "socket") as sk:
                supervisor._sd_notify("WATCHDOG=1")
            sk.assert_not_called()

    def test_sends_datagram_when_notify_socket_set(self) -> None:
        fake_sock = mock.MagicMock()
        with mock.patch.dict(os.environ, {"NOTIFY_SOCKET": "/run/systemd/notify"}):
            with mock.patch.object(supervisor.socket, "socket", return_value=fake_sock):
                supervisor._sd_notify("WATCHDOG=1")
        fake_sock.connect.assert_called_once_with("/run/systemd/notify")
        fake_sock.sendall.assert_called_once_with(b"WATCHDOG=1")
        fake_sock.close.assert_called_once()

    def test_abstract_namespace_socket_path_translated(self) -> None:
        # systemd uses @-prefix for abstract namespace; kernel wants \0-prefix.
        fake_sock = mock.MagicMock()
        with mock.patch.dict(os.environ, {"NOTIFY_SOCKET": "@some-abstract"}):
            with mock.patch.object(supervisor.socket, "socket", return_value=fake_sock):
                supervisor._sd_notify("READY=1")
        fake_sock.connect.assert_called_once_with("\0some-abstract")
        fake_sock.sendall.assert_called_once_with(b"READY=1")

    def test_oserror_during_send_is_swallowed(self) -> None:
        # If the systemd socket disappears mid-supervisor (or perms drop),
        # _sd_notify must NOT raise — heartbeat is best-effort.
        fake_sock = mock.MagicMock()
        fake_sock.sendall.side_effect = OSError("broken pipe")
        with mock.patch.dict(os.environ, {"NOTIFY_SOCKET": "/run/systemd/notify"}):
            with mock.patch.object(supervisor.socket, "socket", return_value=fake_sock):
                # MUST NOT raise.
                supervisor._sd_notify("WATCHDOG=1")
        fake_sock.close.assert_called_once()


class ProviderReportPreloadTests(unittest.TestCase):
    # OPS-PROVIDER-REPORT-PRELOAD: caller can pre-load provider_report once per
    # tick and thread it through first_viable_agent / poll_workers /
    # maybe_reassign_task_after_worker_failure instead of each of those
    # reloading it from disk independently.

    def _config(self) -> dict:
        return {
            "agents": [
                {"display_name": "Codex"},
                {"display_name": "Claude"},
            ],
            "provider_report_path": "/dev/null",
            "supervisor": {},
            "ready_dispatcher": {},
        }

    def test_first_viable_agent_uses_passed_provider_report(self) -> None:
        # When provider_report is passed, load_provider_report MUST NOT be called.
        sentinel = {"providers": {"Codex": {"auth_ready": True}}}
        with mock.patch.object(supervisor, "load_provider_report") as mock_load, \
             mock.patch.object(supervisor, "known_agent_display_names", return_value={"Codex", "Claude"}), \
             mock.patch.object(supervisor, "is_agent_dispatch_paused", return_value=False) as mock_paused:
            result = supervisor.first_viable_agent(
                self._config(),
                ["Codex", "Claude"],
                exclude=set(),
                state={"workers": {}},
                provider_report=sentinel,
            )
        mock_load.assert_not_called()
        # is_agent_dispatch_paused must receive the same sentinel.
        self.assertEqual(mock_paused.call_args.kwargs.get("provider_report"), sentinel)
        self.assertEqual(result, "Codex")

    def test_first_viable_agent_falls_back_to_load_when_none(self) -> None:
        # Backwards-compatible: if caller does not pass provider_report and
        # state is given, the function still loads one itself.
        loaded = {"providers": {"Codex": {"auth_ready": True}}}
        with mock.patch.object(supervisor, "load_provider_report", return_value=loaded) as mock_load, \
             mock.patch.object(supervisor, "known_agent_display_names", return_value={"Codex"}), \
             mock.patch.object(supervisor, "is_agent_dispatch_paused", return_value=False) as mock_paused:
            result = supervisor.first_viable_agent(
                self._config(),
                ["Codex"],
                exclude=set(),
                state={"workers": {}},
            )
        mock_load.assert_called_once()
        self.assertEqual(mock_paused.call_args.kwargs.get("provider_report"), loaded)
        self.assertEqual(result, "Codex")

    def test_poll_workers_accepts_provider_report_kwarg(self) -> None:
        # Verifies the new poll_workers signature accepts an optional 3rd
        # positional arg and threads it into retry_due_workers without
        # triggering a second load_provider_report call.
        config = self._config()
        state: dict = {"workers": {}, "queue": {"events": {}}}
        sentinel = {"providers": {}}
        with mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}), \
             mock.patch.object(supervisor, "task_index_from_status", return_value={}), \
             mock.patch.object(supervisor, "load_status", return_value={}), \
             mock.patch.object(supervisor, "redispatch_candidate_statuses", return_value=set()), \
             mock.patch.object(supervisor, "ready_dispatch_settings", return_value={"active_worker_statuses": []}), \
             mock.patch.object(supervisor, "retry_due_workers", return_value=False) as mock_retry, \
             mock.patch.object(supervisor, "load_provider_report") as mock_load:
            # MUST NOT raise; signature accepts the 3rd positional arg.
            supervisor.poll_workers(config, state, sentinel)
        # When provider_report is given, load_provider_report MUST NOT be called.
        mock_load.assert_not_called()
        # retry_due_workers must receive the sentinel that was passed in.
        self.assertEqual(mock_retry.call_args[0][2], sentinel)


class WorkerProcessReaperTests(unittest.TestCase):
    def test_pid_is_alive_reaps_zombie_child(self) -> None:
        with mock.patch.object(supervisor.Path, "read_text", return_value="123 (codex) Z 1 1 1"), \
             mock.patch.object(supervisor.os, "waitpid", return_value=(123, 0)) as waitpid, \
             mock.patch.object(supervisor.os, "kill") as kill:
            alive = supervisor.pid_is_alive(123)

        self.assertFalse(alive)
        waitpid.assert_called_once_with(123, supervisor.os.WNOHANG)
        kill.assert_not_called()

    def test_reap_finished_children_reaps_until_empty(self) -> None:
        with mock.patch.object(
            supervisor.os,
            "waitpid",
            side_effect=[(111, 0), (222, 0), (0, 0)],
        ) as waitpid:
            count = supervisor.reap_finished_children()

        self.assertEqual(count, 2)
        self.assertEqual(waitpid.call_count, 3)
if __name__ == "__main__":
    unittest.main()


class BreakFullDeadlockTests(unittest.TestCase):
    CONFIG = {
        "agents": {"claude2": {"provider": "claude2"}},
        "supervisor": {"deadlock_breaker_cooldown_seconds": 1800},
        "ready_dispatcher": {},
    }

    def _wedged_state(self):
        return {
            "workers": {},
            "queue": {"events": {}},
            "chair_review": {"blocked": {"reason": "no lane"}},
            "provider_pauses": {
                "claude2": {
                    "schema": 3,
                    "scope": "lane",
                    "lane_id": "claude2",
                    "kind": "auth",
                    "resume_at": None,
                    "paused_at": supervisor.utc_now(),
                }
            },
        }

    _STATUS = {"tasks": [{"id": "T1", "status": "backlog"}]}

    def test_clears_lane_when_wedged_and_probe_healthy(self):
        state = self._wedged_state()
        report = {"providers": {"claude2": {"installed": True, "auth_ready": True}}}
        with mock.patch.object(supervisor, "_force_recovery_probe", return_value=report), \
             mock.patch.object(supervisor, "write_activity_log"):
            changed = supervisor.break_full_deadlock(self.CONFIG, state, self._STATUS)
        self.assertTrue(changed)
        self.assertNotIn("claude2", state["provider_pauses"])

    def test_escalates_operator_attention_when_unrecoverable(self):
        state = self._wedged_state()
        report = {"providers": {"claude2": {"installed": True, "auth_ready": False}}}
        with mock.patch.object(supervisor, "_force_recovery_probe", return_value=report), \
             mock.patch.object(supervisor, "write_activity_log") as wal:
            changed = supervisor.break_full_deadlock(self.CONFIG, state, self._STATUS)
        self.assertTrue(changed)
        self.assertIn("claude2", state["provider_pauses"])  # still paused
        self.assertIn("operator_attention", state["deadlock_recovery"])
        kinds = [c.args[1].get("type") for c in wal.call_args_list]
        self.assertIn("operator_attention_required", kinds)

    def test_noop_when_workers_active(self):
        state = self._wedged_state()
        state["workers"] = {"w1": {"agent_id": "claude2", "status": "running"}}
        probe = mock.Mock()
        with mock.patch.object(supervisor, "_force_recovery_probe", probe):
            changed = supervisor.break_full_deadlock(self.CONFIG, state, self._STATUS)
        self.assertFalse(changed)
        probe.assert_not_called()

    def test_noop_when_chair_not_blocked_and_no_paused_lanes(self):
        state = self._wedged_state()
        state["chair_review"] = {}
        state["provider_pauses"] = {}
        with mock.patch.object(supervisor, "_force_recovery_probe") as probe:
            changed = supervisor.break_full_deadlock(self.CONFIG, state, self._STATUS)
        self.assertFalse(changed)
        probe.assert_not_called()

    def test_recovery_runs_when_chair_not_blocked_but_pause_still_blocks(self):
        state = self._wedged_state()
        state["chair_review"] = {}
        report = {"providers": {"claude2": {"installed": True, "auth_ready": True}}}
        with mock.patch.object(supervisor, "_force_recovery_probe", return_value=report), \
             mock.patch.object(supervisor, "write_activity_log"):
            changed = supervisor.break_full_deadlock(self.CONFIG, state, self._STATUS)
        self.assertTrue(changed)
        self.assertNotIn("claude2", state["provider_pauses"])

class CodexRevokedTokenClassificationTests(unittest.TestCase):
    """Fix ①: codex CLI revoked/expired-session 401s only surface as runtime
    ERROR lines; before the fix they were classified as generic 'terminal' (not
    'auth') so the lane never auto-paused."""

    def _worker_for_log(self, content: str) -> dict[str, str]:
        handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
        handle.write(content)
        handle.flush()
        handle.close()
        self.addCleanup(Path(handle.name).unlink, missing_ok=True)
        return {"log_path": handle.name, "provider": "codex2", "agent_id": "Codex2"}

    def test_classifies_codex_revoked_refresh_token_as_auth(self) -> None:
        for reason in (
            "2026-06-14T14:31:58Z ERROR codex_api::endpoint::responses_websocket: "
            "failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/x",
            'Failed to refresh token: 401 Unauthorized: { "code": "refresh_token_invalidated" }',
            "ERROR: Your access token could not be refreshed because your refresh token "
            "was revoked. Please log out and sign in again.",
        ):
            with self.subTest(reason=reason):
                result = supervisor.classify_worker_failure({}, {"provider": "codex2"}, reason)
                self.assertEqual(result["kind"], "auth")
                self.assertFalse(result["transient"])

    def test_detects_codex_revoked_token_from_runtime_error_log(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    "codex",
                    "2026-06-14T14:31:56Z ERROR rmcp::transport::worker: worker quit",
                    "2026-06-14T14:31:58Z ERROR codex_api::endpoint::responses_websocket: "
                    "failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/x",
                    "ERROR: Your access token could not be refreshed because your refresh "
                    "token was revoked. Please log out and sign in again.",
                ]
            )
            + "\n"
        )
        detected = supervisor.detect_worker_failure(worker)
        self.assertIsNotNone(detected)
        self.assertEqual(supervisor.classify_worker_failure({}, worker, detected)["kind"], "auth")


class LaneFailureAutoPauseTests(unittest.TestCase):
    """Fix ②: a lane whose workers keep dying terminally across distinct tasks
    gets auto-paused (capacity), even when the failure text isn't classified as
    auth — so the availability-first scheduler stops re-selecting a dead lane."""

    def _worker(self, task_id: str) -> dict[str, Any]:
        return {"agent_id": "Codex2", "provider": "codex2", "task_id": task_id}

    def test_streak_counts_distinct_tasks_only(self) -> None:
        state: dict[str, Any] = {}
        # same task repeated must not inflate the streak
        results = [supervisor.record_lane_terminal_failure({}, state, "Codex2", "T1") for _ in range(3)]
        self.assertEqual(results, [False, False, False])
        self.assertEqual(state["lane_failure_streaks"]["codex2"]["count"], 1)

    def test_threshold_crossed_after_three_distinct_tasks(self) -> None:
        state: dict[str, Any] = {}
        results = [supervisor.record_lane_terminal_failure({}, state, "Codex2", t) for t in ("T1", "T2", "T3")]
        self.assertEqual(results, [False, False, True])

    def test_autopause_pauses_lane_on_streak(self) -> None:
        state: dict[str, Any] = {}
        for t in ("T1", "T2", "T3"):
            supervisor.maybe_autopause_unhealthy_lane(
                {}, state, self._worker(t), "Worker exited before the task reached a terminal status."
            )
        pauses = supervisor.provider_pause_registry(state)
        self.assertIn("codex2", pauses)
        self.assertEqual(pauses["codex2"]["kind"], "capacity")
        # streak cleared after pausing
        self.assertNotIn("codex2", state.get("lane_failure_streaks", {}))

    def test_clean_completion_resets_streak(self) -> None:
        state: dict[str, Any] = {}
        supervisor.record_lane_terminal_failure({}, state, "Codex2", "T1")
        supervisor.record_lane_terminal_failure({}, state, "Codex2", "T2")
        supervisor.clear_lane_failure(state, "Codex2")
        self.assertNotIn("codex2", state.get("lane_failure_streaks", {}))

    def test_disabled_via_config(self) -> None:
        cfg = {"ready_dispatcher": {"lane_failure_autopause": {"enabled": False}}}
        state: dict[str, Any] = {}
        for t in ("T1", "T2", "T3", "T4"):
            supervisor.maybe_autopause_unhealthy_lane(cfg, state, self._worker(t), "terminal boom")
        self.assertNotIn("codex2", supervisor.provider_pause_registry(state))

    def test_transient_failures_do_not_count(self) -> None:
        state: dict[str, Any] = {}
        # 429 rate-limit is transient/capacity → must not trip the lane-health pause
        for t in ("T1", "T2", "T3", "T4"):
            supervisor.maybe_autopause_unhealthy_lane({}, state, self._worker(t), "status: 429 rate limited")
        self.assertNotIn("codex2", supervisor.provider_pause_registry(state))


class GovernanceRecursionGuardTests(unittest.TestCase):
    """Stop the self-reproducing repair lineage (X -> X-UNBLOCK -> X-UNBLOCK-UNBLOCK).

    The base case keys on `is_governance_artifact` plus a lineage-depth cap and
    escalates instead of creating repair-of-the-repair tasks.
    """

    def test_is_governance_artifact_detects_each_marker(self) -> None:
        self.assertTrue(supervisor.is_governance_artifact({"task_class": "unblock"}))
        self.assertTrue(supervisor.is_governance_artifact({"auto_generated": True}))
        self.assertTrue(supervisor.is_governance_artifact({"helper_parent": "X-001"}))
        # First-class product work is not a governance artifact.
        self.assertFalse(supervisor.is_governance_artifact({"id": "FEAT-001", "task_class": "execution"}))
        self.assertFalse(supervisor.is_governance_artifact({"id": "FEAT-001"}))
        self.assertFalse(supervisor.is_governance_artifact(None))

    def test_governance_lineage_depth_counts_helper_parent_chain(self) -> None:
        root = {"id": "X"}
        child = {"id": "X-UNBLOCK", "helper_parent": "X"}
        grandchild = {"id": "X-UNBLOCK-UNBLOCK", "helper_parent": "X-UNBLOCK"}
        task_map = {"X": root, "X-UNBLOCK": child, "X-UNBLOCK-UNBLOCK": grandchild}
        self.assertEqual(supervisor.governance_lineage_depth(root, task_map), 0)
        self.assertEqual(supervisor.governance_lineage_depth(child, task_map), 1)
        self.assertEqual(supervisor.governance_lineage_depth(grandchild, task_map), 2)

    def test_governance_lineage_depth_is_cycle_safe(self) -> None:
        a = {"id": "A", "helper_parent": "B"}
        b = {"id": "B", "helper_parent": "A"}
        task_map = {"A": a, "B": b}
        # Must terminate (and not blow the stack) on a corrupt cyclic chain.
        self.assertLessEqual(supervisor.governance_lineage_depth(a, task_map), 2)

    def test_chair_review_default_caps_unblock_lineage_depth(self) -> None:
        self.assertEqual(supervisor.chair_review_settings({})["max_unblock_lineage_depth"], 1)

    def test_create_chair_unblock_task_refuses_governance_parent(self) -> None:
        """A blocked unblock/repair task must NOT spawn a deeper repair child."""
        parent = {
            "id": "INVOICES-BILLING-UNBLOCK-HISTORY-REPAIR",
            "status": "blocked",
            "task_class": "unblock",
            "helper_parent": "INVOICES-BILLING",
            "owner": "Codex",
            "reviewer": "Codex2",
            "depends_on": [],
        }
        status = {"tasks": [parent]}
        config = {
            "agents": {
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            }
        }
        state: dict[str, Any] = {}
        action = {"task_id": parent["id"], "reason": "history repair still blocked"}
        with mock.patch.object(supervisor, "load_status", return_value=status), mock.patch.object(
            supervisor, "write_activity_log"
        ) as logged:
            result = supervisor.create_chair_unblock_task(config, state, action, {})

        self.assertFalse(result)
        # Escalated to a human instead of recursing.
        self.assertIn(parent["id"], state.get("governance_escalations", {}))
        logged_types = [call.args[1].get("type") for call in logged.call_args_list if len(call.args) > 1]
        self.assertIn("governance_recursion_blocked", logged_types)


class ProactiveReassignmentAntiFlapTests(unittest.TestCase):
    """Stop the duplicate-empty-branch thrash without blocking the first claim.

    A genuine availability-first claim (owner busy on a *different* task) is
    productive and must still happen. The thrash is the *repeated* steal-back:
    claude -> claude2 -> codex -> codex2, each tick cutting a fresh empty
    `{agent}/{task}` branch off the same base SHA. The fix records a reassignment
    guard the moment a proactive claim lands, so the planner refuses to steal the
    task straight back off the lane it was just handed to (within
    `reassignment_guard_seconds`). The chair path already did this; the proactive
    path was the gap.
    """

    def _config(self):
        # Mirrors test_dispatcher_availability_first_claims_in_progress_when_owner_is_busy
        # (the productive-claim case) so we exercise the same path and assert the
        # anti-flap guard is recorded as a side effect.
        return {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["in_progress", "review", "todo"],
                    "availability_first": True,
                    "allow_any_idle_lane": True,
                    "require_assigned_agent_busy": True,
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
            },
            "providers": {},
        }

    def _state(self):
        # Copilot is busy running BUSY-1; REG-100 is in_progress but unattended.
        return {
            "queue": {"events": {}},
            "workers": {
                "run-busy": {
                    "run_id": "run-busy",
                    "task_id": "BUSY-1",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }

    def _status(self):
        return {
            "tasks": [
                {"id": "BUSY-1", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
                {"id": "REG-100", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
            ]
        }

    def test_first_proactive_claim_records_antiflap_guard(self) -> None:
        """The first availability claim still happens AND drops an anti-flap guard."""
        config = self._config()
        state = self._state()
        status = self._status()
        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        # First claim is preserved (regression guard for the productive case).
        self.assertTrue(changed)
        persist.assert_called_once()
        self.assertEqual(persist.call_args.kwargs["task_id"], "REG-100")
        # And an anti-flap guard now protects REG-100 on its new owner.
        guard = state.get("chair_reassignment_guards", {}).get("REG-100:owner")
        self.assertIsNotNone(guard)
        self.assertEqual(guard["to"], persist.call_args.kwargs["new_owner"])

    def test_recorded_guard_blocks_the_resteal(self) -> None:
        """Once the guard exists, the planner refuses to steal the task back."""
        task = {"id": "REG-100", "status": "in_progress", "owner": "Codex", "reviewer": "Claude", "depends_on": []}
        # Guard from a prior claim: REG-100 was just handed to Codex.
        state = {
            "chair_reassignment_guards": {
                "REG-100:owner": {
                    "task_id": "REG-100",
                    "role": "owner",
                    "from": "Copilot",
                    "to": "Codex",
                    "expires_at": "2999-01-01T00:00:00Z",
                }
            }
        }
        plan = supervisor.proactive_claim_plan_for_idle_agent(
            {"agents": {"codex": {"display_name": "Codex", "provider": "codex"},
                        "codex2": {"display_name": "Codex2", "provider": "codex2"}}},
            task=task,
            task_map={"REG-100": task},
            idle_agent_name="Codex2",
            idle_agent_names=["Codex2"],
            agent_loads={"Codex": [0], "Codex2": [99]},
            helper_settings={
                "enabled": True,
                "task_statuses": ["in_progress", "review", "todo"],
                "availability_first": True,
                "allow_any_idle_lane": True,
                "require_assigned_agent_busy": True,
            },
            state=state,
        )
        self.assertIsNone(plan)


if __name__ == "__main__":
    unittest.main()


class WorktreeNodeModulesProvisioningTests(unittest.TestCase):
    """RCA fix: fresh task worktrees must get node_modules (symlinked from the
    canonical checkout) so workers can typecheck/build at closeout instead of
    stranding `blocked` on a missing/slow per-worktree install."""

    def _mk(self):
        import shutil
        root = Path(tempfile.mkdtemp()); self.addCleanup(lambda: shutil.rmtree(root, ignore_errors=True))
        (root / "node_modules").mkdir()
        (root / "apps" / "foo").mkdir(parents=True); (root / "apps" / "foo" / "node_modules").mkdir()
        (root / "packages" / "bar").mkdir(parents=True); (root / "packages" / "bar" / "node_modules").mkdir()
        dest = Path(tempfile.mkdtemp()); self.addCleanup(lambda: shutil.rmtree(dest, ignore_errors=True))
        (dest / "apps" / "foo").mkdir(parents=True); (dest / "packages" / "bar").mkdir(parents=True)
        return root, dest

    def test_symlinks_root_and_workspace_node_modules(self):
        root, dest = self._mk()
        supervisor._provision_worktree_node_modules(root, dest)
        self.assertTrue((dest / "node_modules").is_symlink())
        self.assertEqual((dest / "node_modules").resolve(), (root / "node_modules").resolve())
        self.assertTrue((dest / "apps" / "foo" / "node_modules").is_symlink())
        self.assertTrue((dest / "packages" / "bar" / "node_modules").is_symlink())

    def test_noop_on_canonical_root(self):
        root, _ = self._mk()
        supervisor._provision_worktree_node_modules(root, root)
        self.assertFalse((root / "node_modules").is_symlink())

    def test_does_not_clobber_existing_node_modules(self):
        root, dest = self._mk()
        (dest / "node_modules").mkdir()
        supervisor._provision_worktree_node_modules(root, dest)
        self.assertFalse((dest / "node_modules").is_symlink())


class AntigravityModelRotationTests(unittest.TestCase):
    """Antigravity lanes auto-rotate Gemini <-> fallback model instead of pausing
    the whole lane when a single model exhausts its quota."""

    def setUp(self) -> None:
        self.rot_file = Path(tempfile.mkdtemp()) / "antigravity-rotation.json"
        self.config = {
            "paths": {"antigravity_rotation": str(self.rot_file)},
            "agents": {
                "gemini": {"display_name": "Gemini", "provider": "gemini", "adapter": "antigravity"},
                "codex": {"display_name": "Codex", "provider": "codex", "adapter": "codex"},
            },
            "providers": {
                "gemini": {
                    "antigravity": {
                        "cli": "agy",
                        "model_rotation": {
                            "enabled": True,
                            "primary": "",
                            "fallback": "Claude Sonnet 4.6 (Thinking)",
                            "cooldown_seconds": 900,
                        },
                    }
                },
                "codex": {"codex": {"cli": "codex"}},
            },
        }

    def _worker(self, *, slot="gemini"):
        return {
            "run_id": "gemini-run-1",
            "agent_id": "gemini",
            "provider": "gemini",
            "task_id": "T-1",
            "pid": None,
            "queue_event_id": "evt-1",
            "attempt_count": 0,
            "metadata": {"rotation_slot": slot},
        }

    def test_rotation_flow(self) -> None:
        import contextlib
        # 1) Other pool warm -> cool gemini, redispatch, no lane pause.
        state: dict = {}
        worker = self._worker(slot="gemini")
        req = supervisor.DeliveryRequest(agent_id="gemini", provider="gemini", delivery_mode="antigravity", message="go")
        with contextlib.ExitStack() as es:
            request_for_worker = es.enter_context(
                mock.patch.object(supervisor, "request_for_worker", return_value=req)
            )
            es.enter_context(mock.patch.object(supervisor, "record_worker_evidence", return_value="ev"))
            es.enter_context(mock.patch.object(supervisor, "summarize_worker_failure", return_value=("capacity", "hit your limit")))
            es.enter_context(mock.patch.object(supervisor, "finalize_queue_event_record"))
            es.enter_context(mock.patch.object(supervisor, "terminate_worker_pid", return_value=True))
            es.enter_context(mock.patch.object(supervisor, "write_activity_log"))
            start = es.enter_context(mock.patch.object(supervisor, "start_worker_for_request", return_value=(True, "gemini-run-2", None)))
            handled = supervisor.maybe_rotate_antigravity_lane(
                self.config, state, {}, worker, {"kind": "capacity"}, "hit your limit", authorized=True
            )
            handled_again = supervisor.maybe_rotate_antigravity_lane(
                self.config, state, {}, worker, {"kind": "capacity"}, "hit your limit", authorized=True
            )
        self.assertTrue(handled)
        self.assertTrue(handled_again)
        self.assertEqual(worker["status"], "rotated")
        start.assert_called_once()
        request_for_worker.assert_called_once()
        # gemini slot recorded as cooling; lane NOT paused.
        cooldowns = supervisor.load_rotation_cooldowns(self.config, "gemini")
        self.assertGreater(cooldowns["gemini_until"], 0)
        self.assertEqual(cooldowns["claude_until"], 0)
        self.assertNotIn("gemini", supervisor.provider_pause_registry(state))

        # 2) Now the fallback (claude) pool also exhausts -> both cooling -> pause lane.
        worker2 = self._worker(slot="claude")
        with contextlib.ExitStack() as es:
            es.enter_context(mock.patch.object(supervisor, "request_for_worker", return_value=req))
            es.enter_context(mock.patch.object(supervisor, "summarize_worker_failure", return_value=("capacity", "hit your limit")))
            es.enter_context(mock.patch.object(supervisor, "terminate_worker_pid", return_value=True))
            es.enter_context(mock.patch.object(supervisor, "write_activity_log"))
            fin = es.enter_context(mock.patch.object(supervisor, "finalize_terminal_worker_outcome"))
            start = es.enter_context(mock.patch.object(supervisor, "start_worker_for_request", return_value=(True, "x", None)))
            handled2 = supervisor.maybe_rotate_antigravity_lane(
                self.config, state, {}, worker2, {"kind": "capacity"}, "hit your limit", authorized=True
            )
        self.assertTrue(handled2)
        start.assert_not_called()  # both cooling: no redispatch, real pause instead
        fin.assert_called_once()   # delegates to normal terminal handling (reassign/finalize)
        self.assertIn("gemini", supervisor.provider_pause_registry(state))

    def test_skips_non_antigravity_lane(self) -> None:
        state: dict = {}
        worker = {"run_id": "c1", "agent_id": "codex", "provider": "codex", "task_id": "T", "metadata": {}}
        handled = supervisor.maybe_rotate_antigravity_lane(
            self.config, state, {}, worker, {"kind": "quota_terminal"}, "you have no quota", authorized=True
        )
        self.assertFalse(handled)

    def test_skips_when_rotation_disabled(self) -> None:
        cfg = json.loads(json.dumps(self.config))
        cfg["providers"]["gemini"]["antigravity"]["model_rotation"]["enabled"] = False
        state: dict = {}
        handled = supervisor.maybe_rotate_antigravity_lane(
            cfg, state, {}, self._worker(), {"kind": "capacity"}, "hit your limit", authorized=True
        )
        self.assertFalse(handled)

    def test_skips_unauthorized_and_wrong_kind(self) -> None:
        state: dict = {}
        self.assertFalse(
            supervisor.maybe_rotate_antigravity_lane(
                self.config, state, {}, self._worker(), {"kind": "capacity"}, "x", authorized=False
            )
        )
        self.assertFalse(
            supervisor.maybe_rotate_antigravity_lane(
                self.config, state, {}, self._worker(), {"kind": "auth"}, "401", authorized=True
            )
        )


class ChairApprovalBoundaryTests(unittest.TestCase):
    """What the chairman may wave through.

    An approval only exists because `classify_command` said `defer` — "I cannot
    tell, ask someone". Gating the chairman on `classify_command(...) == "allow"`
    therefore let it approve only what would already have run unreviewed, and
    every gap in the pattern set became a permanent deadlock: 149 of 273
    recorded denials carry the chairman's own read-only justification.
    """

    def _bash(self, command: str) -> dict:
        return {
            "tool_name": "Bash",
            "tool_input": {"command": command},
            "risk_class": "needs_review",
        }

    def test_unrecognised_read_only_commands_are_the_chairs_to_approve(self) -> None:
        # Exactly the commands that had two workers suspended for 81 minutes.
        for command in (
            'git cat-file -t fc426709 2>&1; echo "---"; git branch -a --contains fc426709 | head',
            "timeout 900 pnpm exec vitest run tests/unit/tenant-partner.service.test.ts 2>&1 | tail -40",
            "./node_modules/.bin/vitest run tests/unit/x.test.ts",
        ):
            self.assertTrue(
                supervisor._approval_is_routine_safe(self._bash(command)), command
            )

    def test_denied_patterns_stay_beyond_the_chairs_reach(self) -> None:
        for command in (
            "sudo rm -rf /etc",
            "git reset --hard HEAD~5",
            "echo hi && git reset --hard HEAD~5",
            "rm -rf /",
        ):
            self.assertFalse(
                supervisor._approval_is_routine_safe(self._bash(command)), command
            )

    def test_writes_outside_the_workspace_stay_beyond_reach(self) -> None:
        self.assertFalse(
            supervisor._approval_is_routine_safe(
                self._bash("echo pwned > /home/lupin/.bashrc")
            )
        )

    def test_backticks_stay_beyond_reach(self) -> None:
        # Backticks do not nest and are rare in ordinary usage, so they stay
        # refused. `$(...)` is judged like `$VAR` — see
        # CommandSubstitutionBoundaryTest in test_provider_permissions.
        self.assertFalse(
            supervisor._approval_is_routine_safe(self._bash("echo `rm -rf /tmp/x`"))
        )

    def test_substitution_is_treated_the_same_as_a_plain_variable(self) -> None:
        # `rm` is not a denied pattern — it left the safe set, meaning "needs a
        # decision", not "nobody may permit it". Wrapping it in a substitution
        # must not change that, in either direction.
        self.assertEqual(
            supervisor._approval_is_routine_safe(self._bash("rm -rf /tmp/x")),
            supervisor._approval_is_routine_safe(self._bash("echo $(rm -rf /tmp/x)")),
        )

    def test_denied_patterns_inside_a_substitution_stay_beyond_reach(self) -> None:
        for command in ("echo $(rm -rf /)", "x=$(sudo cat /etc/shadow)"):
            self.assertFalse(
                supervisor._approval_is_routine_safe(self._bash(command)), command
            )

    def test_broad_git_push_stays_beyond_reach(self) -> None:
        self.assertFalse(
            supervisor._approval_is_routine_safe(
                self._bash("git push --force origin main")
            )
        )

    def test_ordinary_git_push_remains_approvable(self) -> None:
        self.assertTrue(
            supervisor._approval_is_routine_safe(
                self._bash("git push origin feature-branch")
            )
        )


class ChairDecisionMalformedJsonTests(unittest.TestCase):
    """A bad decision packet must fail the review, not the supervisor.

    A chairman wrote shell single-quote escaping straight into a JSON string.
    `load_json` raises on malformed content by design — right for machine truth,
    where substituting a default would lose state — but a decision packet is
    model output. The decoder escaped `refresh_chair_review_state`, killed the
    process a second after start, and since the file is re-read on every restart
    systemd burned its restart budget and gave up. The fleet was down nine hours
    with no alert.
    """

    # The packet that took the supervisor down: shell single-quote escaping
    # (backslash-apostrophe) written straight into a JSON string value, which
    # JSON does not accept as an escape.
    MALFORMED = (
        "{\n"
        '  "version": 1,\n'
        '  "reason": "Executing ' + chr(92) + chr(39) + 'test_*.py' + chr(92) + chr(39) + ' is read-only."\n'
        "}\n"
    )

    def test_load_json_still_raises_for_machine_truth(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "state.json"
            path.write_text(self.MALFORMED, encoding="utf-8")
            with self.assertRaises(json.JSONDecodeError):
                supervisor.load_json(path, default={})

    def test_a_malformed_packet_fails_the_review_and_not_the_process(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260805T150630Z-gemini2.md"
            json_path = review_dir / "20260805T150630Z-gemini2.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(self.MALFORMED, encoding="utf-8")

            config = {
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "status_field": "status",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                },
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            (root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "gemini2",
                        "agent": "Gemini2",
                        "reason": "approval_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with mock.patch.object(
                supervisor,
                "safe_load_approval_state",
                return_value={"pending": [], "history": []},
            ):
                changed = supervisor.refresh_chair_review_state(
                    config, state, provider_report={}
                )

            # The review is discarded so the chairman can run again, rather than
            # the packet being re-read into the same crash on every tick.
            self.assertTrue(changed)
            self.assertIsNone(state["chair_review"].get("active_review"))

            logged = (root / "activity-log.jsonl").read_text(encoding="utf-8")
            self.assertIn("not valid JSON", logged)
class SupervisorTickContainmentTests(unittest.TestCase):
    """One bad tick must not stop the fleet, and a dead loop must not stay quiet.

    A tick touches every subsystem and reads files written by models, workers and
    other tools, so letting an exception leave the loop made availability equal
    to the least robust line on that path. A malformed decision packet stopped
    dispatch for nine hours: the file was re-read on each restart until systemd
    exhausted its restart budget and gave up.
    """

    def _args(self, **overrides):
        defaults = dict(
            config=None,
            poll_interval=0.0,
            once=False,
            no_watch=True,
            replay=False,
            quiet=True,
            verbose=False,
        )
        defaults.update(overrides)
        return types.SimpleNamespace(**defaults)

    def _run_main(self, tick_side_effects, *, config=None, max_ticks=None):
        """Drive main() with run_once replaced, returning (exit_code, call_count)."""
        calls = {"n": 0}

        def fake_run_once(_config, **_kwargs):
            calls["n"] += 1
            if max_ticks is not None and calls["n"] >= max_ticks:
                raise supervisor.SupervisorShutdown(15)
            effect = tick_side_effects(calls["n"])
            if effect is not None:
                raise effect
            return False

        cfg = config or {"paths": {}, "supervisor": {}}
        with (
            mock.patch.object(supervisor, "parse_args", return_value=self._args()),
            mock.patch.object(supervisor, "load_config", return_value=cfg),
            mock.patch.object(supervisor, "run_once", side_effect=fake_run_once),
            mock.patch.object(supervisor, "terminate_older_supervisors"),
            mock.patch.object(supervisor, "install_supervisor_signal_handlers"),
            mock.patch.object(supervisor, "write_supervisor_pid"),
            mock.patch.object(supervisor, "clear_supervisor_pid"),
            mock.patch.object(supervisor, "mark_supervisor_stopped"),
            mock.patch.object(supervisor, "write_activity_log"),
            mock.patch.object(supervisor, "time") as fake_time,
        ):
            fake_time.sleep.return_value = None
            code = supervisor.main()
        return code, calls["n"]

    def test_a_failing_tick_does_not_stop_the_loop(self) -> None:
        # The first tick raises exactly what took the supervisor down.
        def effects(n):
            if n == 1:
                return json.JSONDecodeError("Invalid \\escape", "{}", 0)
            return None

        code, calls = self._run_main(effects, max_ticks=5)

        self.assertGreater(calls, 1, "the loop stopped on the first failure")
        self.assertEqual(code, 128 + 15)

    def test_recovery_resets_the_failure_count(self) -> None:
        # Alternating failures never reach the limit, so the loop keeps running.
        def effects(n):
            return RuntimeError("boom") if n % 2 else None

        cfg = {"paths": {}, "supervisor": {"tick_failure_limit": 3}}
        code, calls = self._run_main(effects, config=cfg, max_ticks=12)

        self.assertEqual(calls, 12)
        self.assertEqual(code, 128 + 15)

    def test_consecutive_failures_stop_the_loop_deliberately(self) -> None:
        # Spinning silently forever is not better than stopping; stop with a
        # reason so the cause is visible rather than inferred from a crash loop.
        cfg = {"paths": {}, "supervisor": {"tick_failure_limit": 3}}
        code, calls = self._run_main(lambda n: RuntimeError("always"), config=cfg)

        self.assertEqual(calls, 3)
        self.assertEqual(code, 1)

    def test_shutdown_signal_is_still_honoured(self) -> None:
        code, calls = self._run_main(lambda n: None, max_ticks=1)

        self.assertEqual(calls, 1)
        self.assertEqual(code, 128 + 15)
