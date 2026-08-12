#!/usr/bin/env python3
from __future__ import annotations

import json
import signal
import subprocess
import tempfile
import types
import pathlib
import time
from datetime import datetime, timezone
import unittest
import os
from pathlib import Path
from unittest import mock

from control_plane.runtime import supervisor_runtime as supervisor
import worker_tree_guard


def _git(cwd: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        text=True,
        capture_output=True,
        check=True,
    )


def _install_canonical_status_script(root: Path) -> None:
    script = root / "scripts" / "ai_status.py"
    script.parent.mkdir(parents=True, exist_ok=True)
    script.symlink_to(supervisor._RUNTIME_ROOT / "scripts" / "ai_status.py")


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

    def test_detects_qwen_quota_failure_inside_json_result_log(self) -> None:
        worker = self._worker_for_log(
            "\n".join(
                [
                    '{"type":"assistant","message":{"content":[{"type":"text","text":"Qwen OAuth quota exceeded: Your free daily quota has been reached."}]}}',
                    '{"type":"result","subtype":"success","result":"Qwen OAuth quota exceeded: Your free daily quota has been reached."}',
                ]
            )
            + "\n"
        )

        self.assertEqual(
            supervisor.detect_worker_failure(worker),
            "Qwen OAuth quota exceeded: Your free daily quota has been reached.",
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


class DiskGuardTests(unittest.TestCase):
    def _repo_config(self, root: Path) -> dict:
        (root / "ai-status.json").write_text('{"tasks":[]}\n', encoding="utf-8")
        return {
            "paths": {
                "status_file": str(root / "ai-status.json"),
                "activity_log": str(root / "ai-activity-log.jsonl"),
                "state_file": str(root / ".orchestrator/state.json"),
            },
            "branch_strategy": {
                "worker_worktrees": {
                    "enabled": True,
                    "root": ".artifacts/worktrees/auto",
                }
            },
            "supervisor": {
                "disk_guard": {
                    "enabled": True,
                    "worktree_retention_days": 3,
                    "max_worktrees_removed_per_tick": 20,
                    "remove_dirty_worktrees": False,
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

    def test_prunes_only_stale_clean_inactive_auto_worktrees(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            root.mkdir()
            self._init_repo(root)
            base = root / ".artifacts/worktrees/auto"
            clean = base / "codex-old-clean"
            dirty = base / "codex-old-dirty"
            active = base / "codex-old-active"
            _git(root, "worktree", "add", "-b", "codex/old-clean", str(clean), "dev")
            _git(root, "worktree", "add", "-b", "codex/old-dirty", str(dirty), "dev")
            _git(root, "worktree", "add", "-b", "codex/old-active", str(active), "dev")
            (dirty / "scratch.txt").write_text("untracked work\n", encoding="utf-8")
            old = time.time() - 4 * 86400
            for path in (clean, dirty, active):
                os.utime(path, (old, old))

            result = supervisor.prune_stale_worker_worktrees(
                self._repo_config(root),
                {
                    "workers": {
                        "active-run": {
                            "status": "running",
                            "workspace_root": str(active),
                        }
                    }
                },
                {
                    "worktree_retention_days": 3,
                    "max_worktrees_removed_per_tick": 20,
                    "remove_dirty_worktrees": False,
                    "archive_dirty_worktrees": False,
                    "force_remove_dirty_worktrees_after_archive": False,
                },
            )

            self.assertEqual(result["removed"], 1)
            self.assertFalse(clean.exists())
            self.assertTrue(dirty.exists())
            self.assertTrue(active.exists())

    def test_prunes_stale_dirty_worktree_after_archiving_changes(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            archive_root = Path(tmpdir) / "archive"
            root.mkdir()
            self._init_repo(root)
            base = root / ".artifacts/worktrees/auto"
            dirty = base / "codex-old-dirty"
            _git(root, "worktree", "add", "-b", "codex/old-dirty", str(dirty), "dev")
            dirty_path = str(dirty.resolve())
            (dirty / "scratch.txt").write_text("untracked work\n", encoding="utf-8")
            old = time.time() - 4 * 86400
            os.utime(dirty, (old, old))

            result = supervisor.prune_stale_worker_worktrees(
                self._repo_config(root),
                {"workers": {}},
                {
                    "worktree_retention_days": 3,
                    "max_worktrees_removed_per_tick": 20,
                    "archive_root": str(archive_root),
                },
            )

            self.assertEqual(result["removed"], 1)
            self.assertEqual(result["archived"], 1)
            self.assertFalse(dirty.exists())
            bundles = sorted(archive_root.iterdir())
            self.assertEqual(len(bundles), 1)
            manifest = json.loads((bundles[0] / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["worktree_path"], dirty_path)
            self.assertEqual((bundles[0] / "files" / "scratch.txt").read_text(encoding="utf-8"), "untracked work\n")

    def test_releases_inactive_auto_worktrees_without_waiting_for_retention(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            archive_root = Path(tmpdir) / "archive"
            root.mkdir()
            self._init_repo(root)
            base = root / ".artifacts/worktrees/auto"
            completed = base / "codex-completed"
            running = base / "codex-running"
            _git(root, "worktree", "add", "-b", "codex/completed", str(completed), "dev")
            _git(root, "worktree", "add", "-b", "codex/running", str(running), "dev")
            (completed / "scratch.txt").write_text("left behind\n", encoding="utf-8")

            result = supervisor.release_inactive_worker_worktrees(
                self._repo_config(root),
                {
                    "workers": {
                        "completed-run": {
                            "status": "completed",
                            "workspace_root": str(completed),
                        },
                        "running-run": {
                            "status": "running",
                            "workspace_root": str(running),
                        },
                    }
                },
                {"archive_root": str(archive_root)},
            )

            self.assertEqual(result["removed"], 1)
            self.assertEqual(result["archived"], 1)
            self.assertFalse(completed.exists())
            self.assertTrue(running.exists())

    def test_release_skips_locked_initializing_worktree_without_archiving(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "repo"
            archive_root = Path(tmpdir) / "archive"
            root.mkdir()
            self._init_repo(root)
            locked = root / ".artifacts/worktrees/auto/claude-initializing"
            _git(root, "worktree", "add", "--detach", str(locked), "dev")
            _git(root, "worktree", "lock", "--reason", "initializing", str(locked))
            (locked / "scratch.txt").write_text("unfinished\n", encoding="utf-8")

            result = supervisor.release_inactive_worker_worktrees(
                self._repo_config(root),
                {"workers": {}},
                {"archive_root": str(archive_root)},
            )

            self.assertEqual(result["removed"], 0)
            self.assertEqual(result["archived"], 0)
            self.assertEqual(result["skipped"], 1)
            self.assertTrue(locked.exists())
            self.assertFalse(archive_root.exists())
            self.assertIn("initializing", " ".join(result["warnings"]))

    def test_inactive_worktree_cleanup_is_throttled_between_ticks(self) -> None:
        state: dict = {}
        result = {
            "checked": 1,
            "removed": 0,
            "skipped": 1,
            "failed": 0,
            "archived": 0,
            "errors": [],
        }
        config = {
            "supervisor": {
                "worker_workspace_cleanup": {"release_interval_seconds": 60}
            }
        }

        with mock.patch.object(
            supervisor, "release_inactive_worker_worktrees", return_value=result
        ) as release:
            self.assertTrue(supervisor.cleanup_inactive_worker_worktrees(config, state))
            self.assertFalse(supervisor.cleanup_inactive_worker_worktrees(config, state))

        release.assert_called_once()
        self.assertEqual(
            state["maintenance"]["worker_workspace_cleanup"]["last_result"],
            result,
        )


class ProcessQueueDispatchGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {},
            "agents": {
                "codex": {
                    "id": "codex",
                    "name": "Codex",
                    "display_name": "Codex",
                    "provider": "codex",
                    "adapter": "codex",
                }
            },
            "providers": {
                "codex": {
                    "delivery_mode": "codex",
                }
            },
        }
        self.provider_report: dict[str, object] = {}

    def test_build_request_uses_provider_model_preference_for_qwen_agent(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "agents": {
                "qwen": {
                    "id": "qwen",
                    "display_name": "Qwen",
                    "provider": "qwen",
                    "adapter": "qwen",
                }
            },
            "providers": {
                "qwen": {
                    "delivery_mode": "qwen",
                    "model_preference": {
                        "qwen": "qwen3-coder-plus",
                    },
                }
            },
        }

        request = supervisor.build_request(
            config,
            {
                "target_agent": "qwen",
                "message": "wake",
            },
        )

        self.assertEqual(request.agent_id, "qwen")
        self.assertEqual(request.provider, "qwen")
        self.assertEqual(request.metadata["model_preference"], "qwen3-coder-plus")

    def test_skips_stale_owned_dispatch_event_after_task_completion(self) -> None:
        queued_task = {
            "id": "BUS-VAL-001",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-05T11:45:16Z",
        }
        queued_event = supervisor.build_dispatch_event(
            queued_task,
            "Codex",
            "owned_in_progress_dispatch",
            {"BUS-VAL-001": queued_task},
        )
        queue_payload = {
            "event_id": "evt-stale",
            "event_key": queued_event["key"],
            "task_id": "BUS-VAL-001",
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
            "message": "wake",
        }
        state = {"queue": {"events": {}}, "workers": {}}
        current_status = {
            "tasks": [
                {
                    **queued_task,
                    "status": "done",
                    "last_update": "2026-04-05T12:00:00Z",
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value=current_status),
            mock.patch.object(supervisor, "start_worker_for_request", side_effect=AssertionError("stale event should not start a worker")),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-stale"]
        self.assertEqual(record["status"], "completed")
        self.assertEqual(record["skip_reason"], "stale_dispatch_event")

    def test_dispatch_and_stale_validation_share_dependency_evidence(self) -> None:
        dependency = {
            "id": "DEP-1",
            "status": "done",
            "task_class": "implementation",
            "integration_status": "merged_to_dev",
            "merge_commit": "abc123",
        }
        task = {
            "id": "BUS-VAL-PARITY-001",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": ["DEP-1"],
        }
        tasks = {"DEP-1": dependency, task["id"]: task}
        event = {
            "task_id": task["id"],
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
        }

        with mock.patch.object(supervisor, "integration_evidence_for_tasks", return_value={"DEP-1": True}):
            decision = supervisor.resolve_current_dispatch_target(self.config, task, tasks)
            self.assertIsNotNone(decision)
            queued = supervisor.build_dispatch_event(task, decision.target_agent, decision.reason.value, tasks)
            self.assertEqual(supervisor.current_dispatch_event_key(self.config, event, tasks), queued["key"])

        with mock.patch.object(supervisor, "integration_evidence_for_tasks", return_value={"DEP-1": False}):
            self.assertIsNone(supervisor.resolve_current_dispatch_target(self.config, task, tasks))
            self.assertIsNone(supervisor.current_dispatch_event_key(self.config, event, tasks))

    def test_marks_event_without_message_manual_pending_without_crashing(self) -> None:
        task = {
            "id": "BUS-VAL-MALFORMED-001",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-05T11:45:16Z",
        }
        queue_payload = {
            "event_id": "evt-missing-message",
            "task_id": task["id"],
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
        }
        state = {"queue": {"events": {}}, "workers": {}}

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [task]}),
            mock.patch.object(
                supervisor,
                "start_worker_for_request",
                side_effect=AssertionError("malformed event must not start a worker"),
            ),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-missing-message"]
        self.assertEqual(record["status"], "manual_pending")
        self.assertEqual(record["error"], "invalid_queue_event_missing_message")
        write_activity_log.assert_called_once()

    def test_skips_queued_dispatch_when_external_integration_is_pending(self) -> None:
        task = {
            "id": "BUS-VAL-CI-001",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "integration_status": "ci_pending",
            "ci_status": "pending",
            "pr_url": "https://github.com/example/repo/pull/1",
            "last_update": "2026-04-05T11:45:16Z",
        }
        queued_event = supervisor.build_dispatch_event(
            task,
            "Codex",
            "owned_in_progress_dispatch",
            {"BUS-VAL-CI-001": task},
        )
        queue_payload = {
            "event_id": "evt-ci-pending",
            "event_key": queued_event["key"],
            "task_id": "BUS-VAL-CI-001",
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
            "message": "wake",
        }
        state = {"queue": {"events": {}}, "workers": {}}

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [task]}),
            mock.patch.object(
                supervisor,
                "start_worker_for_request",
                side_effect=AssertionError("CI-pending task should not start a worker"),
            ),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-ci-pending"]
        self.assertEqual(record["status"], "completed")
        self.assertEqual(record["skip_reason"], "stale_dispatch_event")

    def test_chair_does_not_directly_dispatch_task_with_pending_integration(self) -> None:
        task = {
            "id": "BUS-VAL-CI-002",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "integration_status": "ci_pending",
            "ci_status": "pending",
        }

        self.assertIsNone(
            supervisor.chair_dispatch_action_reason(
                self.config,
                task,
                {"BUS-VAL-CI-002": task},
            )
        )

    def test_proactive_claim_does_not_reassign_task_with_pending_integration(self) -> None:
        task = {
            "id": "BUS-VAL-CI-003",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "integration_status": "ci_pending",
            "ci_status": "pending",
        }

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            self.config,
            task=task,
            task_map={"BUS-VAL-CI-003": task},
            idle_agent_name="Gemini",
            idle_agent_names=["Gemini"],
            agent_loads={"Codex": [1], "Gemini": []},
            helper_settings={
                "enabled": True,
                "task_statuses": ["in_progress"],
                "availability_first": True,
                "allow_any_idle_lane": True,
            },
            review_statuses={"review"},
            finalize_statuses={"review_approved"},
            dependency_done_statuses={"done"},
        )

        self.assertIsNone(plan)

    def test_build_request_uses_task_brief_context_for_execution_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            status_path = tmp / "ai-status.json"
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "BUS-VAL-002",
                                "title": "Execution review",
                                "status": "review",
                                "owner": "Claude",
                                "reviewer": "Qwen",
                                "artifacts": ["docs/example.md"],
                                "next": "Review the execution slice.",
                            }
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            config = {
                "paths": {"status_file": str(status_path)},
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "status_field": "status",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                },
                "agents": {
                    "qwen": {
                        "id": "qwen",
                        "display_name": "Qwen",
                        "provider": "qwen",
                        "adapter": "qwen",
                    }
                },
                "providers": {"qwen": {"delivery_mode": "qwen"}},
            }

            request = supervisor.build_request(
                config,
                {
                    "target_agent": "qwen",
                    "message": "wake",
                    "task_id": "BUS-VAL-002",
                    "metadata": {
                        "mode": "execution",
                        "task": {
                            "id": "BUS-VAL-002",
                            "status": "review",
                            "owner": "Claude",
                            "reviewer": "Qwen",
                            "artifacts": ["docs/example.md"],
                        },
                    },
                },
            )

            self.assertIn(".orchestrator/task-briefs/BUS-VAL-002.md", request.context_files)
            self.assertNotIn("current-work.md", request.context_files)
            self.assertNotIn("ai-activity-log.jsonl", request.context_files)
            self.assertNotIn("docs-site/index.html", request.context_files)

    def test_dispatch_ready_tasks_accepts_backlog_as_owned_ready(self) -> None:
        state = {"queue": {"events": {}}, "workers": {}, "seen_event_keys": {}}
        status = {
            "tasks": [
                {
                    "id": "BUS-VAL-003",
                    "status": "backlog",
                    "owner": "Codex",
                    "reviewer": "",
                    "depends_on": [],
                    "artifacts": ["docs/example.md"],
                }
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(self.config, state)

        self.assertTrue(changed)
        queue_delivery_event.assert_called_once()
        event = queue_delivery_event.call_args.args[1]
        self.assertEqual(event["reason"], "owned_ready_dispatch")
        self.assertEqual(event["task_id"], "BUS-VAL-003")

    def test_dispatcher_honors_codex2_lane_capacity_override(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"codex2": 3},
                "max_dispatches_per_tick": 4,
            },
            "agents": {
                "codex2": {
                    "id": "codex2",
                    "display_name": "Codex2",
                    "provider": "codex2",
                    "adapter": "codex",
                }
            },
            "providers": {"codex2": {"delivery_mode": "codex"}},
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-active": {
                    "run_id": "run-active",
                    "task_id": "CODEX2-ACTIVE",
                    "agent_id": "codex2",
                    "provider": "codex2",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
            "seen_event_keys": {},
        }
        status = {
            "tasks": [
                {"id": "CODEX2-ACTIVE", "status": "in_progress", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-1", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-2", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-3", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertTrue(changed)
        queued_task_ids = [call.args[1]["task_id"] for call in queue_delivery_event.call_args_list]
        self.assertEqual(queued_task_ids, ["CODEX2-NEXT-1", "CODEX2-NEXT-2"])

    def test_lane_capacity_override_zero_disables_lane(self) -> None:
        settings = {
            "max_tasks_per_agent": 4,
            "max_tasks_per_agent_by_lane": {"gemini": 0},
        }

        self.assertEqual(supervisor.max_tasks_per_agent_for_lane(settings, "Gemini"), 0)

    def test_first_viable_agent_skips_disabled_lane(self) -> None:
        config = {
            "ready_dispatcher": {
                "max_tasks_per_agent": 2,
                "max_tasks_per_agent_by_lane": {"gemini": 0, "codex": 2},
            },
            "agents": {
                "gemini": {"display_name": "Gemini", "provider": "gemini"},
                "codex": {"display_name": "Codex", "provider": "codex"},
            },
        }

        result = supervisor.first_viable_agent(
            config,
            ["Gemini", "Codex"],
            exclude=set(),
        )

        self.assertEqual(result, "Codex")

    def test_dispatcher_round_robins_ready_reviews_across_lanes(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"claude": 5, "claude2": 3},
                "max_dispatches_per_tick": 2,
            },
            "agents": {
                "claude": {
                    "id": "claude",
                    "display_name": "Claude",
                    "provider": "claude",
                },
                "claude2": {
                    "id": "claude2",
                    "display_name": "Claude2",
                    "provider": "claude2",
                },
            },
            "providers": {},
        }
        state = {"queue": {"events": {}}, "workers": {}, "seen_event_keys": {}}
        status = {
            "tasks": [
                {"id": "CLAUDE-REV-1", "status": "review", "owner": "Codex", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE-REV-2", "status": "review", "owner": "Codex", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE2-REV-1", "status": "review", "owner": "Codex", "reviewer": "Claude2", "depends_on": []},
                {"id": "CLAUDE2-REV-2", "status": "review", "owner": "Codex", "reviewer": "Claude2", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertTrue(changed)
        queued = [(call.args[1]["task_id"], call.args[1]["target_agent"]) for call in queue_delivery_event.call_args_list]
        self.assertEqual(
            queued,
            [("CLAUDE-REV-1", "Claude"), ("CLAUDE2-REV-1", "Claude2")],
        )

    def test_dispatcher_returns_to_first_lane_after_each_ready_lane_gets_one(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"claude": 5, "claude2": 3},
                "max_dispatches_per_tick": 3,
            },
            "agents": {
                "claude": {
                    "id": "claude",
                    "display_name": "Claude",
                    "provider": "claude",
                },
                "claude2": {
                    "id": "claude2",
                    "display_name": "Claude2",
                    "provider": "claude2",
                },
            },
            "providers": {},
        }
        state = {"queue": {"events": {}}, "workers": {}, "seen_event_keys": {}}
        status = {
            "tasks": [
                {"id": "CLAUDE-REV-1", "status": "review", "owner": "Codex", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE-REV-2", "status": "review", "owner": "Codex", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE2-REV-1", "status": "review", "owner": "Codex", "reviewer": "Claude2", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertTrue(changed)
        queued = [(call.args[1]["task_id"], call.args[1]["target_agent"]) for call in queue_delivery_event.call_args_list]
        self.assertEqual(
            queued,
            [("CLAUDE-REV-1", "Claude"), ("CLAUDE2-REV-1", "Claude2"), ("CLAUDE-REV-2", "Claude")],
        )

    def test_dispatcher_rotates_start_lane_across_ticks(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"claude": 5, "claude2": 3, "codex": 3, "codex2": 3},
                "max_dispatches_per_tick": 2,
            },
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
                "claude2": {"id": "claude2", "display_name": "Claude2", "provider": "claude2"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "codex2": {"id": "codex2", "display_name": "Codex2", "provider": "codex2"},
            },
            "providers": {},
        }
        status = {
            "tasks": [
                {"id": "CLAUDE-REV-1", "status": "review", "owner": "Ops", "reviewer": "Claude", "depends_on": []},
                {"id": "CLAUDE2-REV-1", "status": "review", "owner": "Ops", "reviewer": "Claude2", "depends_on": []},
                {"id": "CODEX-REV-1", "status": "review", "owner": "Ops", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-REV-1", "status": "review", "owner": "Ops", "reviewer": "Codex2", "depends_on": []},
            ]
        }
        first_state = {"queue": {"events": {}}, "workers": {}, "seen_event_keys": {}, "ready_dispatcher": {}}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as first_queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, first_state, provider_report={})

        self.assertTrue(changed)
        first_queued = [
            (call.args[1]["task_id"], call.args[1]["target_agent"]) for call in first_queue_delivery_event.call_args_list
        ]
        self.assertEqual(
            first_queued,
            [("CLAUDE-REV-1", "Claude"), ("CLAUDE2-REV-1", "Claude2")],
        )
        self.assertEqual(first_state["ready_dispatcher"]["next_agent_cursor"], 2)

        second_state = {
            "queue": {"events": {}},
            "workers": {},
            "seen_event_keys": {},
            "ready_dispatcher": {"next_agent_cursor": first_state["ready_dispatcher"]["next_agent_cursor"]},
        }
        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as second_queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, second_state, provider_report={})

        self.assertTrue(changed)
        second_queued = [
            (call.args[1]["task_id"], call.args[1]["target_agent"]) for call in second_queue_delivery_event.call_args_list
        ]
        self.assertEqual(
            second_queued,
            [("CODEX-REV-1", "Codex"), ("CODEX2-REV-1", "Codex2")],
        )

    def test_outstanding_delivery_counts_skip_events_with_active_workers(self) -> None:
        config = {
            "ready_dispatcher": {
                "active_worker_statuses": ["running", "manual_pending"],
            }
        }
        state = {
            "queue": {
                "events": {
                    "evt-active": {"status": "started"},
                    "evt-pending": {"status": "queued"},
                }
            },
            "workers": {
                "run-active": {
                    "queue_event_id": "evt-active",
                    "agent_id": "codex2",
                    "task_id": "CODEX2-ACTIVE",
                    "status": "running",
                }
            },
        }
        events = [
            {
                "event_id": "evt-active",
                "event_key": "dispatcher:Codex2:CODEX2-ACTIVE",
                "target_agent": "codex2",
                "task_id": "CODEX2-ACTIVE",
            },
            {
                "event_id": "evt-pending",
                "event_key": "dispatcher:Codex2:CODEX2-PENDING",
                "target_agent": "codex2",
                "task_id": "CODEX2-PENDING",
            },
        ]

        with mock.patch.object(supervisor, "load_event_queue", return_value=events):
            agents, task_agents, event_keys = supervisor.outstanding_delivery_indexes(config, state)
            counts = supervisor.outstanding_delivery_agent_counts(config, state)

        self.assertEqual(agents, {"codex2"})
        self.assertEqual(task_agents, {("CODEX2-PENDING", "codex2")})
        self.assertEqual(event_keys, {"dispatcher:Codex2:CODEX2-PENDING"})
        self.assertEqual(counts, {"codex2": 1})

    def test_dispatcher_does_not_double_count_started_events_against_lane_capacity(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"codex2": 3},
                "max_dispatches_per_tick": 4,
            },
            "agents": {
                "codex2": {
                    "id": "codex2",
                    "display_name": "Codex2",
                    "provider": "codex2",
                    "adapter": "codex",
                }
            },
            "providers": {"codex2": {"delivery_mode": "codex"}},
        }
        active_task = {"id": "CODEX2-ACTIVE", "status": "in_progress", "owner": "Codex2", "reviewer": "Codex", "depends_on": []}
        active_event = supervisor.build_dispatch_event(
            active_task,
            "Codex2",
            "owned_in_progress_dispatch",
            {"CODEX2-ACTIVE": active_task},
        )
        active_event["event_id"] = "evt-active"
        state = {
            "queue": {"events": {"evt-active": {"status": "started", "run_id": "run-active"}}},
            "workers": {
                "run-active": {
                    "run_id": "run-active",
                    "queue_event_id": "evt-active",
                    "task_id": "CODEX2-ACTIVE",
                    "agent_id": "codex2",
                    "provider": "codex2",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
            "seen_event_keys": {},
        }
        status = {
            "tasks": [
                active_task,
                {"id": "CODEX2-NEXT-1", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-2", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
                {"id": "CODEX2-NEXT-3", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[active_event]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertTrue(changed)
        queued_task_ids = [call.args[1]["task_id"] for call in queue_delivery_event.call_args_list]
        self.assertEqual(queued_task_ids, ["CODEX2-NEXT-1", "CODEX2-NEXT-2"])

    def test_prune_completed_dispatch_pauses_removes_done_task_entries(self) -> None:
        state = {
            "dispatch_pauses": [
                {"task_id": "DONE-1", "worker_run_id": "run-1"},
                {"task_id": "ACTIVE-1", "worker_run_id": "run-2"},
            ]
        }
        status = {
            "tasks": [
                {"id": "DONE-1", "status": "done"},
                {"id": "ACTIVE-1", "status": "review"},
            ]
        }

        changed = supervisor.prune_completed_dispatch_pauses(state, status)

        self.assertTrue(changed)
        self.assertEqual(state["dispatch_pauses"], [{"task_id": "ACTIVE-1", "worker_run_id": "run-2"}])

    def test_prune_completed_dispatch_pauses_removes_stale_entries_when_task_has_active_worker(self) -> None:
        state = {
            "dispatch_pauses": [
                {"task_id": "ACTIVE-1", "worker_run_id": "run-1"},
                {"task_id": "PAUSED-1", "worker_run_id": "run-2"},
            ],
            "workers": {
                "live-1": {"task_id": "ACTIVE-1", "status": "running"},
            },
        }
        status = {
            "tasks": [
                {"id": "ACTIVE-1", "status": "in_progress"},
                {"id": "PAUSED-1", "status": "backlog"},
            ]
        }

        changed = supervisor.prune_completed_dispatch_pauses(state, status)

        self.assertTrue(changed)
        self.assertEqual(state["dispatch_pauses"], [{"task_id": "PAUSED-1", "worker_run_id": "run-2"}])

    def test_prune_completed_dispatch_pauses_removes_entries_for_tasks_updated_after_pause(self) -> None:
        state = {
            "dispatch_pauses": [
                {"task_id": "REASSIGNED-1", "worker_run_id": "run-1", "paused_at": "2026-04-19T16:03:02Z"},
                {"task_id": "CURRENT-1", "worker_run_id": "run-2", "paused_at": "2026-04-19T16:10:43Z"},
            ],
            "workers": {},
        }
        status = {
            "tasks": [
                {"id": "REASSIGNED-1", "status": "backlog", "last_update": "2026-04-19T16:10:27Z"},
                {"id": "CURRENT-1", "status": "backlog", "last_update": "2026-04-19T16:10:35Z"},
            ]
        }

        changed = supervisor.prune_completed_dispatch_pauses(state, status)

        self.assertTrue(changed)
        self.assertEqual(state["dispatch_pauses"], [{"task_id": "CURRENT-1", "worker_run_id": "run-2", "paused_at": "2026-04-19T16:10:43Z"}])

    def test_prune_completed_dispatch_pauses_removes_recovered_taskless_auth_pause(self) -> None:
        state = {
            "provider_pauses": {
                "gemini": {
                    "kind": "quota",
                    "reason": "quota exhausted",
                    "paused_at": "2026-05-17T13:51:45Z",
                    "resume_at": 9999999999,
                }
            },
            "dispatch_pauses": [
                {
                    "provider": "codex",
                    "task_id": None,
                    "worker_run_id": "codex-stale-auth",
                    "failure_kind": "auth",
                    "summary": "auth: archived log context mentioned token_invalidated",
                    "paused_at": "2026-05-17T15:27:57Z",
                },
                {
                    "provider": "gemini",
                    "task_id": None,
                    "worker_run_id": "gemini-quota",
                    "failure_kind": "quota/terminal",
                    "summary": "quota/terminal: reason: 'QUOTA_EXHAUSTED'",
                    "paused_at": "2026-05-17T13:51:45Z",
                },
            ],
            "workers": {},
        }
        provider_report = {
            "providers": {"codex": {"auth_ready": True}, "gemini": {"auth_ready": True}},
            "agent_adapters": {"codex": {"supported": True}, "gemini": {"supported": True}},
        }

        changed = supervisor.prune_completed_dispatch_pauses(
            state,
            {"tasks": []},
            config=self.config,
            provider_report=provider_report,
        )

        self.assertTrue(changed)
        self.assertEqual(state["dispatch_pauses"], [])

    def test_starts_current_owned_dispatch_event(self) -> None:
        current_task = {
            "id": "BUS-VAL-004",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-05T14:54:01Z",
        }
        current_event = supervisor.build_dispatch_event(
            current_task,
            "Codex",
            "owned_in_progress_dispatch",
            {"BUS-VAL-004": current_task},
        )
        queue_payload = {
            "event_id": "evt-current",
            "event_key": current_event["key"],
            "task_id": "BUS-VAL-004",
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
            "message": "wake",
        }
        state = {"queue": {"events": {}}, "workers": {}}
        request = types.SimpleNamespace(agent_id="codex")
        delivery = {"manual_confirmation_required": False, "auto_delivered": True}

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [current_task]}),
            mock.patch.object(supervisor, "build_request", return_value=request) as build_request,
            mock.patch.object(supervisor, "start_worker_for_request", return_value=(True, "run-123", delivery)) as start_worker,
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-current"]
        self.assertEqual(record["status"], "started")
        self.assertEqual(record["run_id"], "run-123")
        build_request.assert_called_once_with(self.config, queue_payload)
        start_worker.assert_called_once()

    def test_process_queue_defers_worker_start_when_disk_guard_blocks_dispatch(self) -> None:
        queued_task = {
            "id": "BUS-VAL-005",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-05T14:54:01Z",
        }
        queued_event = supervisor.build_dispatch_event(
            queued_task,
            "Codex",
            "owned_in_progress_dispatch",
            {"BUS-VAL-005": queued_task},
        )
        queue_payload = {
            "event_id": "evt-disk",
            "event_key": queued_event["key"],
            "task_id": "BUS-VAL-005",
            "target_agent": "codex",
            "target_display_name": "Codex",
            "reason": "owned_in_progress_dispatch",
            "message": "wake",
        }
        state = {
            "queue": {"events": {}},
            "workers": {},
            "disk_guard": {
                "dispatch_blocked": True,
                "reason": "disk usage 90.00% >= 85.00%",
            },
        }
        config = {**self.config, "supervisor": {"disk_guard": {"enabled": True}}}

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [queued_task]}),
            mock.patch.object(supervisor, "build_request", side_effect=AssertionError("worker request should be deferred")),
            mock.patch.object(supervisor, "start_worker_for_request", side_effect=AssertionError("worker should not start")),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.process_queue(config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-disk"]
        self.assertEqual(record["status"], "queued")
        self.assertEqual(record["attempt_count"], 0)
        self.assertEqual(record["deferred_reason"], "disk_guard")

    def test_dispatcher_can_requeue_same_task_after_previous_failure(self) -> None:
        current_task = {
            "id": "REG-002",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": [],
            "last_update": "2026-04-06T09:00:00Z",
            "artifacts": ["services/registry/promotion/"],
            "next": "continue",
        }
        state = {
            "queue": {
                "events": {
                    "evt-old": {
                        "status": "failed",
                        "run_id": "old-run",
                    }
                }
            },
            "workers": {
                "old-run": {
                    "run_id": "old-run",
                    "queue_event_id": "evt-old",
                    "task_id": "REG-002",
                    "agent_id": "codex",
                    "status": "failed",
                }
            },
            "seen_event_keys": {"dispatcher:Codex:REG-002:owned_in_progress_dispatch:stale-signature": "2026-04-06T08:59:00Z"},
        }
        status = {"tasks": [current_task]}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(self.config, state)

        self.assertTrue(changed)
        queue_delivery_event.assert_called_once()
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "REG-002")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "owned_in_progress_dispatch")

    def test_dispatcher_does_not_queue_new_events_when_disk_guard_blocks_dispatch(self) -> None:
        current_task = {
            "id": "REG-DISK-001",
            "status": "in_progress",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": [],
        }
        state = {
            "queue": {"events": {}},
            "workers": {},
            "seen_event_keys": {},
            "disk_guard": {
                "dispatch_blocked": True,
                "reason": "disk usage 90.00% >= 85.00%",
            },
        }
        status = {"tasks": [current_task]}
        config = {**self.config, "supervisor": {"disk_guard": {"enabled": True}}}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", side_effect=AssertionError("new event should not be queued")),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["queue"]["events"], {})
        self.assertEqual(state["disk_guard"]["last_dispatch_block_source"], "ready_dispatcher")

    def test_dispatcher_queues_owner_finalize_after_review_approved(self) -> None:
        current_task = {
            "id": "REG-002",
            "status": "review_approved",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": ["REG-001"],
            "last_update": "2026-04-06T15:00:00Z",
        }
        dependency = {
            "id": "REG-001",
            "status": "done",
            "owner": "Codex",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-06T14:00:00Z",
        }
        state = {"queue": {"events": {}}, "workers": {}}
        status = {"tasks": [dependency, current_task]}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(self.config, state)

        self.assertTrue(changed)
        queue_delivery_event.assert_called_once()
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "REG-002")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "owned_finalize_dispatch")

    def test_dispatcher_waits_for_done_not_review_approved_dependencies(self) -> None:
        current_task = {
            "id": "FB-003",
            "status": "todo",
            "owner": "Claude",
            "reviewer": "Codex",
            "depends_on": ["REG-002"],
            "last_update": "2026-04-06T15:00:00Z",
        }
        dependency = {
            "id": "REG-002",
            "status": "review_approved",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": ["REG-001"],
            "last_update": "2026-04-06T14:00:00Z",
        }
        state = {"queue": {"events": {}}, "workers": {}}
        status = {"tasks": [dependency, current_task]}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(self.config, state)

        self.assertTrue(changed)
        queued_task_ids = [call.args[1]["task_id"] for call in queue_delivery_event.call_args_list]
        self.assertNotIn("FB-003", queued_task_ids)

    def test_dispatcher_helper_claims_ready_todo_when_owner_is_busy_with_finalize(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["todo"],
                    "require_owner_higher_priority_load": True,
                }
            },
            "worker_reassignment": {
                "owner_fallbacks": {
                    "Copilot": ["Codex", "Claude", "Gemini"],
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
            },
            "providers": {},
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-finalize": {
                    "run_id": "run-finalize",
                    "task_id": "LP-005",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_finalize_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "LP-005", "status": "review_approved", "owner": "Copilot", "reviewer": "Codex", "depends_on": []},
                {"id": "FB-003", "status": "todo", "owner": "Copilot", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        persist.assert_called_once()
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "FB-003")
        self.assertEqual(kwargs["new_owner"], "Codex")
        self.assertEqual(kwargs["new_reviewer"], "Copilot")
        self.assertEqual(kwargs["handoff_to"], "Codex")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "FB-003")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "owned_ready_dispatch")

    def test_dispatcher_availability_first_claims_in_progress_when_owner_is_busy(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["in_progress", "review", "review_approved", "todo"],
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
        state = {
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
        status = {
            "tasks": [
                {"id": "BUSY-1", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
                {"id": "REG-100", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        persist.assert_called_once()
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "REG-100")
        self.assertEqual(kwargs["new_owner"], "Codex")
        self.assertEqual(kwargs["new_reviewer"], "Claude")
        self.assertEqual(kwargs["handoff_to"], "Codex")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "REG-100")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "owned_in_progress_dispatch")

    def test_dispatcher_availability_first_skips_quota_paused_idle_lane(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["in_progress"],
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
        state = {
            "queue": {"events": {}},
            "provider_pause_schema": 3,
            "provider_pauses": {
                "codex": {
                    "kind": "quota",
                    "scope": "lane",
                    "lane_id": "codex",
                    "schema": 3,
                    "reason": "provider quota exhausted",
                    "paused_at": "2026-04-16T00:00:00Z",
                    "resume_at": 9999999999,
                }
            },
            "workers": {
                "run-busy": {
                    "run_id": "run-busy",
                    "task_id": "BUSY-PAUSED",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "BUSY-PAUSED", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
                {"id": "REG-PAUSED", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "REG-PAUSED")
        self.assertEqual(kwargs["new_owner"], "Claude")
        self.assertEqual(kwargs["new_reviewer"], "Copilot")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "REG-PAUSED")
        self.assertEqual(queued_event["target_agent"], "Claude")
        self.assertEqual(queued_event["reason"], "owned_in_progress_dispatch")

    def test_dispatcher_availability_first_claims_review_approved_when_owner_is_busy(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["review_approved"],
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
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-busy": {
                    "run_id": "run-busy",
                    "task_id": "BUSY-2",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "BUSY-2", "status": "in_progress", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
                {"id": "FIN-100", "status": "review_approved", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "FIN-100")
        self.assertEqual(kwargs["new_owner"], "Codex")
        self.assertEqual(kwargs["new_reviewer"], "Claude")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "FIN-100")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "owned_finalize_dispatch")

    def test_dispatcher_availability_first_claims_review_when_reviewer_is_busy(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["review"],
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
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-busy": {
                    "run_id": "run-busy",
                    "task_id": "BUSY-3",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "running",
                    "request_snapshot": {"reason": "review_ready_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "BUSY-3", "status": "review", "owner": "Claude", "reviewer": "Copilot", "depends_on": []},
                {"id": "REV-100", "status": "review", "owner": "Claude", "reviewer": "Copilot", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "REV-100")
        self.assertEqual(kwargs["new_owner"], "Claude")
        self.assertEqual(kwargs["new_reviewer"], "Codex")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "REV-100")
        self.assertEqual(queued_event["target_agent"], "Codex")
        self.assertEqual(queued_event["reason"], "review_ready_dispatch")

    def test_dispatcher_does_not_helper_claim_when_owner_is_not_busy(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["todo"],
                    "require_owner_higher_priority_load": True,
                }
            },
            "worker_reassignment": {
                "owner_fallbacks": {
                    "Copilot": ["Codex", "Claude", "Gemini"],
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
            },
            "providers": {},
        }
        state = {"queue": {"events": {}}, "workers": {}}
        status = {
            "tasks": [
                {"id": "FB-003", "status": "todo", "owner": "Copilot", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state)

        self.assertTrue(changed)
        persist.assert_not_called()
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "FB-003")
        self.assertEqual(queued_event["target_agent"], "Copilot")

    def test_skips_duplicate_start_when_active_worker_already_exists(self) -> None:
        current_task = {
            "id": "P3-001",
            "status": "review",
            "owner": "Claude",
            "reviewer": "Gemini",
            "depends_on": [],
            "last_update": "2026-04-06T05:30:43Z",
        }
        current_event = supervisor.build_dispatch_event(
            current_task,
            "Gemini",
            "review_ready_dispatch",
            {"P3-001": current_task},
        )
        queue_payload = {
            "event_id": "evt-current",
            "event_key": current_event["key"],
            "task_id": "P3-001",
            "target_agent": "gemini",
            "target_display_name": "Gemini",
            "reason": "review_ready_dispatch",
            "message": "wake",
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "gemini-run-1": {
                    "run_id": "gemini-run-1",
                    "queue_event_id": "evt-current",
                    "status": "running",
                }
            },
        }

        with (
            mock.patch.object(supervisor, "load_event_queue", return_value=[queue_payload]),
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [current_task]}),
            mock.patch.object(supervisor, "start_worker_for_request", side_effect=AssertionError("duplicate queue event should not start another worker")),
        ):
            changed = supervisor.process_queue(self.config, state, self.provider_report)

        self.assertTrue(changed)
        record = state["queue"]["events"]["evt-current"]
        self.assertEqual(record["status"], "started")
        self.assertEqual(record["run_id"], "gemini-run-1")


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


class ReconcileStatusFromGitThrottleTests(unittest.TestCase):
    def setUp(self) -> None:
        self._clear_reconcile_registry()

    def tearDown(self) -> None:
        self._clear_reconcile_registry()

    def _clear_reconcile_registry(self) -> None:
        supervisor._RECONCILE_PROCS.clear()

    def _config(self, root: Path, *, interval: float | None = None) -> dict[str, object]:
        supervisor_cfg: dict[str, object] = {}
        if interval is not None:
            supervisor_cfg["git_reconcile_interval_seconds"] = interval
        config: dict[str, object] = {
            "paths": {"status_file": str(root / "ai-status.json")},
            "supervisor": supervisor_cfg,
        }
        return config

    def _fake_job(self) -> mock.MagicMock:
        job = mock.MagicMock()
        job.done.return_value = False
        return job

    def test_first_call_starts_job_and_stamps_timestamp(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "ai-status.json").write_text("{}", encoding="utf-8")
            (root / "scripts").mkdir()
            script = root / "scripts" / "ai_status.py"
            script.write_text("# placeholder\n", encoding="utf-8")
            config = self._config(root)
            state: dict[str, object] = {"supervisor": {}}
            with mock.patch.object(
                supervisor,
                "_start_git_reconcile_job",
                return_value=self._fake_job(),
            ) as start_job:
                ran = supervisor.reconcile_status_from_git(config, state)
            self.assertFalse(ran)
            start_job.assert_called_once_with(config)
            self.assertIn("last_git_reconcile_at", state["supervisor"])  # type: ignore[index]

    def test_second_call_within_window_skips_job(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "ai-status.json").write_text("{}", encoding="utf-8")
            (root / "scripts").mkdir()
            (root / "scripts" / "ai_status.py").write_text("# placeholder\n", encoding="utf-8")
            config = self._config(root, interval=60.0)
            # Timestamp 5s ago — within 60s window.
            recent = supervisor.datetime.now(supervisor.timezone.utc) - supervisor.timedelta(seconds=5)
            state = {
                "supervisor": {
                    "last_git_reconcile_at": recent.replace(microsecond=0)
                    .isoformat()
                    .replace("+00:00", "Z"),
                }
            }
            with mock.patch.object(supervisor, "_start_git_reconcile_job") as start_job:
                ran = supervisor.reconcile_status_from_git(config, state)
            self.assertFalse(ran)
            start_job.assert_not_called()

    def test_second_call_after_window_starts_job(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "ai-status.json").write_text("{}", encoding="utf-8")
            (root / "scripts").mkdir()
            (root / "scripts" / "ai_status.py").write_text("# placeholder\n", encoding="utf-8")
            config = self._config(root, interval=60.0)
            # Timestamp 120s ago — well outside 60s window.
            old = supervisor.datetime.now(supervisor.timezone.utc) - supervisor.timedelta(seconds=120)
            state = {
                "supervisor": {
                    "last_git_reconcile_at": old.replace(microsecond=0)
                    .isoformat()
                    .replace("+00:00", "Z"),
                }
            }
            with mock.patch.object(
                supervisor,
                "_start_git_reconcile_job",
                return_value=self._fake_job(),
            ) as start_job:
                ran = supervisor.reconcile_status_from_git(config, state)
            self.assertFalse(ran)
            start_job.assert_called_once_with(config)

    def test_skips_when_status_file_path_missing(self) -> None:
        # OPS-STATE-RECONCILE-002 guard: don't raise KeyError when config
        # omits paths.status_file (e.g. minimal test config).
        config: dict[str, object] = {"paths": {}, "supervisor": {}}
        state: dict[str, object] = {"supervisor": {}}
        with mock.patch.object(supervisor, "_start_git_reconcile_job") as start_job:
            ran = supervisor.reconcile_status_from_git(config, state)
        self.assertFalse(ran)
        start_job.assert_not_called()


class PollWorkersRecoveryTests(unittest.TestCase):
    def test_agent_dispatch_loads_skip_events_with_active_workers(self) -> None:
        config = {
            "ready_dispatcher": {"active_worker_statuses": ["running"]},
            "agents": {"codex2": {"id": "codex2", "display_name": "Codex2"}},
        }
        state = {
            "queue": {
                "events": {
                    "evt-active": {"status": "started"},
                    "evt-pending": {"status": "queued"},
                }
            },
            "workers": {
                "run-active": {
                    "queue_event_id": "evt-active",
                    "agent_id": "codex2",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        events = [
            {
                "event_id": "evt-active",
                "target_agent": "codex2",
                "target_display_name": "Codex2",
                "reason": "owned_in_progress_dispatch",
            },
            {
                "event_id": "evt-pending",
                "target_agent": "codex2",
                "target_display_name": "Codex2",
                "reason": "owned_finalize_dispatch",
            },
        ]

        with mock.patch.object(supervisor, "load_event_queue", return_value=events):
            loads = supervisor.agent_dispatch_loads(config, state, {"running"})

        self.assertEqual(loads, {"Codex2": [2, 1]})

    def test_dead_worker_for_open_task_is_marked_failed_not_completed(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "EX-001",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "EX-001", "status": "in_progress", "owner": "Codex", "reviewer": "Claude"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(worker["last_error"], "Worker exited before the task reached a terminal status.")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_dead_worker_that_reported_advancement_is_yielded(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            result_path = Path(tmpdir) / "result.json"
            result_path.write_text(
                json.dumps({"outcome": "advanced", "summary": "Verification needs a later retry."}),
                encoding="utf-8",
            )
            config = {
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                },
                "supervisor": {"stall_after_seconds": 300, "worker_yield": {"cooldown_seconds": 120}},
                "ready_dispatcher": {},
                "providers": {},
                "agents": {"codex": {"id": "codex", "display_name": "Codex"}},
            }
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "EX-010",
                        "provider": "codex",
                        "agent_id": "codex",
                        "status": "running",
                        "queue_event_id": "evt-1",
                        "pid": 999999,
                        "last_event_at": "2026-04-06T09:00:00Z",
                        "result_path": str(result_path),
                    }
                },
            }
            status = {"tasks": [{"id": "EX-010", "status": "in_progress", "owner": "Codex", "reviewer": "Claude"}]}

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=False),
                mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(config, state)

            self.assertTrue(changed)
            self.assertEqual(state["workers"]["run-1"]["status"], "yielded")
            self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
            self.assertIn("EX-010:codex", state["worker_yields"])
            self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_yielded")

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "write_activity_log") as second_log,
            ):
                self.assertFalse(supervisor.poll_workers(config, state))
            self.assertEqual(state["workers"]["run-1"]["status"], "yielded")
            second_log.assert_not_called()

    def test_dead_worker_that_reported_blocked_updates_canonical_task(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _install_canonical_status_script(root)
            status_path = root / "ai-status.json"
            status_path.write_text(
                json.dumps(
                    {"tasks": [{"id": "EX-012", "status": "in_progress", "owner": "Codex", "reviewer": "Claude"}]}
                ),
                encoding="utf-8",
            )
            result_path = root / ".orchestrator" / "worker-results" / "run-1.json"
            result_path.parent.mkdir(parents=True)
            result_path.write_text(
                json.dumps({"outcome": "blocked", "summary": "git verification timed out", "blocker": "git status timed out"}),
                encoding="utf-8",
            )
            config = {
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                },
                "paths": {"status_file": str(status_path), "state_file": str(root / ".orchestrator" / "state.json")},
                "supervisor": {"stall_after_seconds": 300},
                "ready_dispatcher": {},
                "providers": {},
                "agents": {"codex": {"id": "codex", "display_name": "Codex"}},
            }
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "EX-012",
                        "provider": "codex",
                        "agent_id": "codex",
                        "status": "running",
                        "queue_event_id": "evt-1",
                        "pid": 999999,
                        "last_event_at": "2026-04-06T09:00:00Z",
                        "result_path": str(result_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=False),
                mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(config, state)

            self.assertTrue(changed)
            self.assertEqual(state["workers"]["run-1"]["status"], "completed")
            self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
            task = json.loads(status_path.read_text(encoding="utf-8"))["tasks"][0]
            self.assertEqual(task["status"], "blocked")
            self.assertEqual(task["next"], "git status timed out")
            self.assertIn(".orchestrator/worker-results/run-1.json", task["evidence_refs"])
            self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_completed")

    def test_dead_parent_with_live_process_group_enters_draining(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300, "process_group_drain_seconds": 30},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {"codex": {"id": "codex", "display_name": "Codex"}},
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "EX-011",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "EX-011", "status": "in_progress", "owner": "Codex", "reviewer": "Claude"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "process_group_is_alive", return_value=True),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "draining")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "started")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_draining")

    def test_dead_worker_for_open_task_can_be_reassigned(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "qwen": {"id": "qwen", "display_name": "Qwen"},
                "codex": {"id": "codex", "display_name": "Codex"},
                "claude": {"id": "claude", "display_name": "Claude"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "EX-002",
                    "provider": "qwen",
                    "agent_id": "qwen",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "EX-002", "status": "in_progress", "owner": "Qwen", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(
                supervisor,
                "maybe_reassign_task_after_worker_failure",
                return_value="Claude",
            ) as maybe_reassign,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "reassigned")
        self.assertEqual(worker["reassigned_to"], "Claude")
        self.assertEqual(worker["last_error"], "Worker exited before the task reached a terminal status.")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        maybe_reassign.assert_called_once_with(
            config,
            worker,
            "Worker exited before the task reached a terminal status.",
            terminal=True,
            state=state,
        )
        write_activity_log.assert_not_called()

    def test_dead_owner_worker_that_advanced_task_to_review_is_completed(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FBP-008",
                    "provider": "claude",
                    "agent_id": "claude",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-15T16:19:02Z",
                    "request_snapshot": {"reason": "owned_ready_dispatch"},
                }
            },
        }
        status = {"tasks": [{"id": "FBP-008", "status": "review", "owner": "Claude", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "completed")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_completed")

    def test_dead_owner_worker_completed_when_status_write_lands_between_loads(self) -> None:
        """Race protection: worker writes status='review' to ai-status.json then exits
        within the same supervisor tick. The task_map cached at the top of the tick
        still shows 'in_progress'; only a fresh re-read sees 'review'. The supervisor
        must not flag this as 'exited before terminal status'."""
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "PBK-UI-003",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-05-18T19:07:30Z",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        stale_status = {"tasks": [{"id": "PBK-UI-003", "status": "in_progress", "owner": "Codex", "reviewer": "Gemini2"}]}
        fresh_status = {"tasks": [{"id": "PBK-UI-003", "status": "review", "owner": "Codex", "reviewer": "Gemini2"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", side_effect=[stale_status, fresh_status]),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "completed")
        self.assertNotIn("last_error", {k: v for k, v in worker.items() if k == "last_error" and v})
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_completed")
        self.assertIn("fresh re-read", write_activity_log.call_args.args[1]["message"])

    def test_dead_owner_worker_still_terminal_when_fresh_status_unchanged(self) -> None:
        """When the fresh re-read confirms the task did not advance, the worker is
        still flagged as 'exited before terminal status' (the race-protection re-read
        must not paper over genuine premature exits)."""
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "EX-009",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-05-18T19:07:30Z",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
        }
        # Both cached and fresh agree: still in_progress (worker really did exit prematurely).
        status = {"tasks": [{"id": "EX-009", "status": "in_progress", "owner": "Codex", "reviewer": "Claude"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(worker["last_error"], "Worker exited before the task reached a terminal status.")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_dead_worker_generic_exit_rehydrates_auth_failure_from_log(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "codex2.log"
            log_path.write_text('error: refresh_token_reused\n', encoding="utf-8")
            config = {
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                },
                "supervisor": {"stall_after_seconds": 300},
                "ready_dispatcher": {},
                "providers": {},
                "agents": {
                    "claude": {"id": "claude", "display_name": "Claude"},
                    "codex2": {"id": "codex2", "display_name": "Codex2", "provider": "codex2"},
                },
            }
            state = {
                "queue": {"events": {"evt-1": {"status": "started"}}},
                "provider_pauses": {},
                "workers": {
                    "run-1": {
                        "run_id": "run-1",
                        "task_id": "EX-010",
                        "provider": "codex2",
                        "agent_id": "codex2",
                        "status": "running",
                        "queue_event_id": "evt-1",
                        "pid": 999999,
                        "log_path": str(log_path),
                        "last_event_at": "2026-05-20T04:50:59Z",
                    }
                },
            }
            status = {"tasks": [{"id": "EX-010", "status": "in_progress", "owner": "Codex2", "reviewer": "Claude"}]}
            real_detect = supervisor.detect_worker_failure_signal
            calls = {"count": 0}

            def flaky_detect(worker: dict[str, object]) -> supervisor.WorkerFailureSignal | None:
                calls["count"] += 1
                if calls["count"] == 1:
                    return None
                return real_detect(worker)  # type: ignore[arg-type]

            with (
                mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "load_status", return_value=status),
                mock.patch.object(supervisor, "load_provider_report", return_value={}),
                mock.patch.object(supervisor, "retry_due_workers", return_value=False),
                mock.patch.object(supervisor, "pid_is_alive", return_value=False),
                mock.patch.object(supervisor, "detect_worker_failure_signal", side_effect=flaky_detect),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(worker["last_error_kind"], "auth")
        self.assertIn("refresh_token_reused", worker["last_error"])
        self.assertEqual(state["provider_pauses"]["codex2"]["kind"], "auth")
        self.assertIn("refresh_token_reused", state["provider_pauses"]["codex2"]["reason"])
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_dead_reviewer_worker_that_advanced_task_to_review_approved_is_completed(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FBP-008",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-15T16:30:07Z",
                    "request_snapshot": {"reason": "review_ready_dispatch"},
                }
            },
        }
        status = {"tasks": [{"id": "FBP-008", "status": "review_approved", "owner": "Claude", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "completed")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_completed")

    def test_dead_finalize_worker_still_waiting_on_done_is_marked_failed(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FBP-008",
                    "provider": "claude",
                    "agent_id": "claude",
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-15T16:31:00Z",
                    "request_snapshot": {"reason": "owned_finalize_dispatch"},
                }
            },
        }
        status = {"tasks": [{"id": "FBP-008", "status": "review_approved", "owner": "Claude", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(worker["last_error"], "Worker exited before the task reached a terminal status.")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_dead_waiting_approval_worker_is_failed_and_approval_is_resolved(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {},
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "manual_pending"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "OC-002",
                    "provider": "claude",
                    "agent_id": "claude",
                    "status": "waiting_approval",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "OC-002", "status": "review", "owner": "Codex", "reviewer": "Claude"}]}
        approval_state = {
            "pending": [
                {
                    "approval_id": "apr-1",
                    "worker_run_id": "run-1",
                    "task_id": "OC-002",
                    "provider": "claude",
                    "tool_name": "Bash",
                    "created_at": "2026-04-06T09:01:00Z",
                }
            ],
            "history": [],
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value=approval_state),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "resolve_approval") as resolve_approval,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "failed")
        self.assertEqual(worker["last_error"], "Worker exited while waiting for approval.")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        resolve_approval.assert_called_once_with(
            config,
            "apr-1",
            decision="deny",
            note="Auto-denied because the worker exited before approval could be applied.",
            remember=False,
        )
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_dead_claude_waiting_approval_worker_with_session_is_suspended(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "active_worker_statuses": [
                    "running",
                    "waiting_approval",
                    "suspended_approval",
                    "manual_pending",
                ]
            },
            "providers": {},
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "manual_pending"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "LP-004",
                    "provider": "claude",
                    "agent_id": "claude",
                    "status": "waiting_approval",
                    "queue_event_id": "evt-1",
                    "pid": 999999,
                    "session_id": "sess-123",
                    "resume_token": "sess-123",
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "LP-004", "status": "in_progress", "owner": "Claude", "reviewer": "Codex"}]}
        approval_state = {
            "pending": [
                {
                    "approval_id": "apr-1",
                    "worker_run_id": "run-1",
                    "task_id": "LP-004",
                    "provider": "claude",
                    "tool_name": "ToolSearch",
                    "created_at": "2026-04-06T09:01:00Z",
                }
            ],
            "history": [],
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value=approval_state),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "resolve_approval") as resolve_approval,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "suspended_approval")
        self.assertEqual(worker["deferred_action"], "apr-1")
        self.assertEqual(worker["last_event_at"], "2026-04-06T09:01:00Z")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "manual_pending")
        resolve_approval.assert_not_called()
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_waiting_approval")

    def test_dead_stale_worker_is_reaped_when_task_assignment_moved(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done", "review_approved"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "codex": {"id": "codex", "name": "Codex"},
                "claude": {"id": "claude", "name": "Claude"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "manual_pending"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "EX-001",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "manual_pending",
                    "queue_event_id": "evt-1",
                    "pid": None,
                    "last_event_at": "2026-04-06T09:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "EX-001", "status": "review", "owner": "Grok", "reviewer": "Claude"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "superseded")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_superseded")

    def test_stalled_worker_returns_to_running_after_new_log_activity(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done", "review_approved"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "LP-002",
                    "provider": "codex",
                    "agent_id": "codex",
                    "status": "stalled",
                    "queue_event_id": "evt-1",
                    "pid": 1234,
                    "last_event_at": "2026-04-06T14:20:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "LP-002", "status": "in_progress", "owner": "Codex", "reviewer": "Copilot"}]}

        def bump_log_activity(_config, worker):
            worker["last_event_at"] = "2026-04-06T14:31:28Z"

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "update_from_log", side_effect=bump_log_activity),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "running")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_recovered")

    def test_manual_pending_file_inbox_worker_is_reaped_after_auth_recovers(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done", "review_approved"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "codex": {"id": "codex", "display_name": "Codex"},
                "copilot": {"id": "copilot", "display_name": "Copilot"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "manual_pending"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FBP-010-SIDECAR-REVIEW",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "mode": "file_inbox",
                    "status": "manual_pending",
                    "queue_event_id": "evt-1",
                    "pid": None,
                    "last_event_at": "2026-04-16T00:23:21Z",
                }
            },
        }
        status = {
            "tasks": [
                {
                    "id": "FBP-010-SIDECAR-REVIEW",
                    "status": "review",
                    "owner": "Codex",
                    "reviewer": "Copilot",
                }
            ]
        }
        provider_report = {
            "providers": {
                "copilot": {
                    "auth_ready": True,
                    "local_cli_worker_supported": True,
                }
            }
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value=provider_report),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=False),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertNotIn("run-1", state["workers"])
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_reaped")
        self.assertIn("auth recovered", write_activity_log.call_args.args[1]["message"])

    def test_stalled_worker_is_terminated_after_extended_stall(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["todo", "in_progress"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FB-003",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "stalled",
                    "queue_event_id": "evt-1",
                    "pid": 1234,
                    "last_event_at": "2026-04-06T14:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "FB-003", "status": "todo", "owner": "Copilot", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "update_from_log", side_effect=lambda *_args, **_kwargs: None),
            mock.patch.object(supervisor, "terminate_worker_pid") as terminate_worker_pid,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "failed")
        terminate_worker_pid.assert_called_once_with(1234)
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "failed")
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_failed")

    def test_stalled_worker_can_be_reassigned_after_extended_stall(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["todo", "in_progress"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "qwen": {"id": "qwen", "display_name": "Qwen"},
                "codex": {"id": "codex", "display_name": "Codex"},
                "claude": {"id": "claude", "display_name": "Claude"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "FB-004",
                    "provider": "qwen",
                    "agent_id": "qwen",
                    "status": "stalled",
                    "queue_event_id": "evt-1",
                    "pid": 1234,
                    "last_event_at": "2026-04-06T14:00:00Z",
                }
            },
        }
        status = {"tasks": [{"id": "FB-004", "status": "in_progress", "owner": "Qwen", "reviewer": "Codex"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "update_from_log", side_effect=lambda *_args, **_kwargs: None),
            mock.patch.object(supervisor, "terminate_worker_pid") as terminate_worker_pid,
            mock.patch.object(
                supervisor,
                "maybe_reassign_task_after_worker_failure",
                return_value="Claude",
            ) as maybe_reassign,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "reassigned")
        self.assertEqual(worker["reassigned_to"], "Claude")
        self.assertIn("terminated for redispatch", worker["last_error"])
        terminate_worker_pid.assert_called_once_with(1234)
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        maybe_reassign.assert_called_once()
        self.assertIn("terminated for redispatch", maybe_reassign.call_args.args[2])
        self.assertEqual(maybe_reassign.call_args.kwargs, {"terminal": True, "state": state})
        write_activity_log.assert_not_called()

    def test_alive_worker_is_superseded_after_reassignment(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "owned_statuses": ["in_progress", "todo"],
                "done_statuses": ["done", "review_approved"],
                "active_worker_statuses": ["running", "waiting_approval", "suspended_approval", "manual_pending", "retry_backoff", "stalled"],
            },
            "providers": {},
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot"},
                "gemini": {"id": "gemini", "display_name": "Gemini"},
            },
        }
        state = {
            "queue": {"events": {"evt-1": {"status": "started"}}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "REG-002",
                    "provider": "copilot",
                    "agent_id": "copilot",
                    "status": "stalled",
                    "queue_event_id": "evt-1",
                    "pid": 2222,
                    "last_event_at": "2026-04-06T14:19:47Z",
                }
            },
        }
        status = {"tasks": [{"id": "REG-002", "status": "review", "owner": "Codex", "reviewer": "Gemini"}]}

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "terminate_worker_pid", return_value=True) as terminate_worker_pid,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        self.assertEqual(state["workers"]["run-1"]["status"], "superseded")
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        terminate_worker_pid.assert_called_once_with(2222)
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_superseded")


    def test_completion_only_adapter_gets_longer_stall_watchdog(self) -> None:
        config = {"supervisor": {"completion_only_worker_stall_after_seconds": 1200}, "agents": {"gemini": {"adapter": "antigravity"}, "codex": {"adapter": "codex"}}}
        self.assertEqual(supervisor.worker_stall_timeout_seconds(config, {"agent_id": "gemini"}, 300), 1200)
        self.assertEqual(supervisor.worker_stall_timeout_seconds(config, {"agent_id": "codex"}, 300), 300)

    def test_completion_only_memory_guard_preempts_silent_near_limit_worker(self) -> None:
        config = {
            "supervisor": {
                "completion_only_adapters": ["antigravity"],
                "completion_only_memory_termination_ratio": 0.9,
                "completion_only_memory_grace_seconds": 60,
            },
            "agents": {"gemini2": {"adapter": "antigravity"}},
        }
        worker = {
            "agent_id": "gemini2",
            "last_event_at": "2026-08-09T13:00:00Z",
            "resource_usage": {"memory_current_bytes": 1450, "memory_max_bytes": 1600},
        }
        reason = supervisor.completion_only_memory_termination_reason(
            config,
            worker,
            datetime(2026, 8, 9, 13, 2, tzinfo=timezone.utc),
        )
        self.assertTrue(reason.startswith("memory_limit_imminent:"))

    def test_premature_exit_with_scope_oom_is_classified_from_telemetry(self) -> None:
        reason = supervisor.resolve_terminal_worker_reason(
            {"resource_usage": {"memory_events": {"oom_kill": 1}}},
            supervisor.PREMATURE_EXIT_REASON,
        )
        self.assertEqual(reason, "cgroup_oom: worker scope reported memory.oom_kill")


    def test_claude_resume_reuses_worker_scope(self) -> None:
        config = {"paths": {"state_file": "/tmp/state.json", "status_file": "/tmp/status.json"}, "providers": {"claude": {"runtime": {"cli": "claude"}}}}
        worker = {"run_id": "run-1", "provider": "claude", "agent_id": "claude", "task_id": "TASK-1", "session_id": "session-1", "scope_unit": "drts-worker-run-1.scope"}
        process = types.SimpleNamespace(pid=7)
        with mock.patch.object(supervisor, "command_exists", return_value="claude"), mock.patch.object(supervisor, "spawn_background_process", return_value=(process, Path("/tmp/resume.log"))) as spawn:
            supervisor.resume_claude_worker(config, worker, {"providers": {"claude": {}}})
        env = spawn.call_args.kwargs["env"]
        self.assertEqual(env["ORCH_WORKER_SCOPE_UNIT"], "drts-worker-run-1.scope")
        self.assertIn("ORCH_WORKER_SCOPE_PROPERTIES", env)


class SingleSupervisorGuardTests(unittest.TestCase):
    def test_supervisor_cmdline_matches_actual_python_process(self) -> None:
        repo_root = str(supervisor.THIS_DIR.parent.resolve())

        self.assertTrue(
            supervisor.supervisor_cmdline_matches_current_script(
                ["/usr/bin/python3", ".orchestrator/control_plane/runtime/supervisor_runtime.py", "--config", "config.json"],
                repo_root,
            )
        )

    def test_supervisor_cmdline_ignores_timeout_parent_wrapper(self) -> None:
        repo_root = str(supervisor.THIS_DIR.parent.resolve())

        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(
                ["timeout", "15", "/usr/bin/python3", ".orchestrator/control_plane/runtime/supervisor_runtime.py", "--verbose"],
                repo_root,
            )
        )

    def test_supervisor_cmdline_ignores_shell_launcher(self) -> None:
        repo_root = str(supervisor.THIS_DIR.parent.resolve())

        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(
                ["/bin/bash", "-lc", "python3 .orchestrator/control_plane/runtime/supervisor_runtime.py --verbose"],
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


class WorkerReassignmentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = {
            "worker_reassignment": {
                "enabled": True,
                "after_attempts": 2,
                "reassign_on_terminal_failure": True,
                "owner_fallbacks": {
                    "Gemini": ["Codex", "Claude", "Grok"],
                },
                "reviewer_fallbacks": {
                    "Gemini": ["Codex", "Claude", "Grok"],
                },
            },
            "agents": {
                "claude": {"display_name": "Claude"},
                "gemini": {"display_name": "Gemini"},
                "codex": {"display_name": "Codex"},
                "grok": {"display_name": "Grok"},
            },
        }

    def test_default_reassignment_fallbacks_do_not_reintroduce_qwen(self) -> None:
        settings = supervisor.worker_reassignment_settings({})

        serialized = json.dumps(settings.get("owner_fallbacks", {})) + json.dumps(settings.get("reviewer_fallbacks", {}))
        self.assertNotIn("Qwen", serialized)
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

    def test_reassigns_finalize_task_to_new_owner_after_repeated_failure(self) -> None:
        config = {
            **self.config,
            "worker_reassignment": {
                **self.config["worker_reassignment"],
                "owner_fallbacks": {
                    **self.config["worker_reassignment"]["owner_fallbacks"],
                    "Claude": ["Qwen", "Grok", "Gemini"],
                },
                "reviewer_fallbacks": {
                    **self.config["worker_reassignment"]["reviewer_fallbacks"],
                    "Claude": ["Qwen", "Grok", "Gemini"],
                },
            },
            "agents": {
                **self.config["agents"],
                "qwen": {"display_name": "Qwen"},
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
                    "status": "review_approved",
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

        self.assertEqual(reassigned_to, "Qwen")
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "RUN-001")
        self.assertEqual(kwargs["new_owner"], "Qwen")
        self.assertEqual(kwargs["new_reviewer"], "Codex")

    def test_reassign_skips_quota_paused_fallback_agent(self) -> None:
        config = {
            **self.config,
            "worker_reassignment": {
                **self.config["worker_reassignment"],
                "owner_fallbacks": {
                    **self.config["worker_reassignment"]["owner_fallbacks"],
                    "Claude": ["Qwen", "Grok", "Gemini"],
                },
                "reviewer_fallbacks": {
                    **self.config["worker_reassignment"]["reviewer_fallbacks"],
                    "Claude": ["Qwen", "Grok", "Gemini"],
                },
            },
            "agents": {
                **self.config["agents"],
                "qwen": {"display_name": "Qwen"},
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
                    "status": "review_approved",
                    "owner": "Claude",
                    "reviewer": "Codex",
                }
            ]
        }
        state = {
            "provider_pause_schema": 3,
            "provider_pauses": {
                "qwen": {
                    "kind": "quota",
                    "scope": "lane",
                    "lane_id": "qwen",
                    "schema": 3,
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

        self.assertEqual(reassigned_to, "Grok")
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "RUN-PAUSED")
        self.assertEqual(kwargs["new_owner"], "Grok")
        self.assertEqual(kwargs["new_reviewer"], "Codex")

    def test_retry_wrapper_passes_state_into_reassignment(self) -> None:
        config = {
            **self.config,
            "worker_retry": {
                "max_attempts": 0,
                "fallback_mode": "none",
            },
        }
        state = {}
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
        state = {}
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


class ChairmanFlowTests(unittest.TestCase):
    def test_rejected_chair_action_is_acknowledged_in_decision_packet(self) -> None:
        config = {"agents": {"codex": {"display_name": "Codex"}}}
        payload = {
            "task_actions": [
                {
                    "task_id": "MISSING-001",
                    "action": "dispatch_now",
                    "target_agent": "Codex",
                    "reason": "Dispatch it now",
                }
            ]
        }
        with (
            mock.patch.object(supervisor, "load_status", return_value={"tasks": []}),
            mock.patch.object(supervisor, "write_activity_log") as activity,
        ):
            changed = supervisor.apply_chair_task_actions(config, {}, payload, {})

        self.assertFalse(changed)
        self.assertEqual(payload["action_outcomes"][0]["status"], "rejected")
        self.assertEqual(payload["action_outcomes"][0]["task_id"], "MISSING-001")
        self.assertEqual(activity.call_args.args[1]["type"], "chair_task_action_rejected")

    def test_chair_review_message_includes_provider_health_context(self) -> None:
        message = supervisor.build_chair_review_message(
            {
                "paths": {},
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                },
            },
            reason="provider_health_triage",
            markdown_path=Path(".orchestrator/chair-reviews/test.md"),
            json_path=Path(".orchestrator/chair-reviews/test.json"),
            approval_state={"pending": []},
            state={
                "provider_pauses": {
                    "claude": {
                        "kind": "auth",
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                        "resume_at": None,
                    }
                },
                "dispatch_pauses": [
                    {
                        "provider": "claude",
                        "task_id": "OPX-DP-003-SIDECAR-ACCEPTANCE",
                        "failure_kind": "auth",
                        "summary": "auth: Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                ],
                "failure_streaks": {},
            },
            provider_report={
                "providers": {
                    "codex": {
                        "auth_ready": True,
                        "local_cli_worker_supported": True,
                    }
                }
            },
        )

        self.assertIn("Provider lane pauses / degraded lanes", message)
        self.assertIn("claude", message)
        self.assertIn("Invalid authentication credentials", message)
        self.assertIn("Dispatch-capable lanes", message)
        self.assertIn("codex (Codex): not_paused=true", message)
        self.assertIn("Dispatch pauses requiring chair attention", message)
        self.assertIn("OPX-DP-003-SIDECAR-ACCEPTANCE", message)

    def test_chair_review_message_requires_approval_actions_for_approval_triage(self) -> None:
        message = supervisor.build_chair_review_message(
            {"paths": {}},
            reason="approval_triage",
            markdown_path=Path(".orchestrator/chair-reviews/test.md"),
            json_path=Path(".orchestrator/chair-reviews/test.json"),
            approval_state={
                "pending": [
                    {
                        "approval_id": "apr-1",
                        "task_id": "ORX-FN-001",
                        "tool_name": "Agent",
                        "risk_class": "unknown",
                        "tool_input": {"description": "Review settlement matrix code"},
                    }
                ]
            },
            state={"failure_streaks": {}, "provider_pauses": {}, "dispatch_pauses": []},
        )

        self.assertIn("每一個 pending approval 都必須在 `approval_actions` 中明確", message)
        self.assertIn("description=Review settlement matrix code", message)

    def test_validate_chair_review_context_requires_pending_approval_resolution(self) -> None:
        payload = {
            "version": 1,
                        "decision": "operational_review",
            "approval_ttl_minutes": 45,
            "reason": "approval remains unsafe",
            "blocked_by": [],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [],
        }
        approval_state = {
            "pending": [
                {
                    "approval_id": "apr-1",
                    "status": "pending",
                    "decision": None,
                }
            ]
        }

        self.assertIn(
            "approval_triage must resolve pending approvals",
            supervisor.validate_chair_review_context(payload, reason="approval_triage", approval_state=approval_state),
        )
        payload["approval_actions"] = [{"approval_id": "apr-1", "decision": "deny", "reason": "not safe"}]
        self.assertIsNone(
            supervisor.validate_chair_review_context(payload, reason="approval_triage", approval_state=approval_state)
        )
        payload["provider_actions"] = [
            {"agent": "Claude2", "action": "pause", "kind": "capacity", "reason": "stale prompt"}
        ]
        self.assertEqual(
            supervisor.validate_chair_review_context(payload, reason="approval_triage", approval_state=approval_state),
            "approval_triage must not emit provider_actions",
        )

    def test_agent_read_only_approval_is_routine_safe(self) -> None:
        approval = {
            "tool_name": "Agent",
            "risk_class": "unknown",
            "tool_input": {
                "description": "Review settlement matrix code",
                "prompt": "Read these files thoroughly and report any issues. Do not edit files.",
                "subagent_type": "Explore",
            },
        }

        self.assertTrue(supervisor._approval_is_routine_safe(approval))

    def test_chair_review_reason_prioritizes_provider_health_triage(self) -> None:
        reason = supervisor.chair_review_reason(
            {
                "provider_pauses": {
                    "claude": {
                        "kind": "auth",
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                }
            },
            {"pending": []},
        )

        self.assertEqual(reason, "provider_health_triage")

    def test_repeated_failure_records_ignore_tasks_covered_by_workspace_baseline_task(self) -> None:
        state = {
            "failure_streaks": {
                "UI-FE-ADM-FLT:owner": {
                    "task_id": "UI-FE-ADM-FLT",
                    "role": "owner",
                    "agent": "Codex",
                    "awaiting_chair": True,
                },
                "UI-FE-TEN-PSG:owner": {
                    "task_id": "UI-FE-TEN-PSG",
                    "role": "owner",
                    "agent": "Codex",
                    "awaiting_chair": True,
                },
            }
        }
        status = {
            "tasks": [
                {
                    "id": supervisor.WORKSPACE_BASELINE_TASK_ID,
                    "status": "in_progress",
                    "helper_kind": supervisor.WORKSPACE_BASELINE_HELPER_KIND,
                    "covers_task_ids": ["UI-FE-ADM-FLT"],
                }
            ]
        }

        records = supervisor.repeated_failure_records(state, status)

        self.assertEqual([item["task_id"] for item in records], ["UI-FE-TEN-PSG"])

    def test_chair_review_reason_skips_reassignment_when_workspace_baseline_task_covers_loops(self) -> None:
        reason = supervisor.chair_review_reason(
            {
                "failure_streaks": {
                    "UI-FE-ADM-FLT:owner": {
                        "task_id": "UI-FE-ADM-FLT",
                        "role": "owner",
                        "agent": "Codex",
                        "awaiting_chair": True,
                    }
                },
                "provider_pauses": {},
                "dispatch_pauses": [
                    {
                        "task_id": "UI-FE-ADM-FLT",
                        "provider": "codex",
                        "failure_kind": "terminal",
                        "paused_at": "2026-05-28T00:00:00Z",
                    }
                ],
            },
            {"pending": []},
            status={
                "tasks": [
                    {
                        "id": supervisor.WORKSPACE_BASELINE_TASK_ID,
                        "status": "in_progress",
                        "helper_kind": supervisor.WORKSPACE_BASELINE_HELPER_KIND,
                        "covers_task_ids": ["UI-FE-ADM-FLT"],
                    }
                ]
            },
            config={"paths": {}},
        )

        self.assertEqual(reason, "operational_review")

    def test_chair_review_reason_prioritizes_dependency_ready_blocked_tasks(self) -> None:
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "ADM-UI-RD-005",
                    "status": "blocked",
                    "owner": "Codex",
                    "reviewer": "Codex2",
                    "depends_on": ["DEP-001"],
                    "next": "Closeout blocked because shared branch HEAD moved to a mixed commit.",
                },
            ]
        }

        reason = supervisor.chair_review_reason(
            {
                "provider_pauses": {
                    "gemini": {
                        "kind": "quota",
                        "reason": "QUOTA_EXHAUSTED",
                        "paused_at": "2026-05-18T00:00:00Z",
                    }
                }
            },
            {"pending": []},
            status=status,
            config={"paths": {}},
        )

        self.assertEqual(reason, "blocked_task_triage")

    def test_chair_review_message_includes_dependency_ready_blocked_tasks(self) -> None:
        message = supervisor.build_chair_review_message(
            {
                "paths": {},
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                },
            },
            reason="blocked_task_triage",
            markdown_path=Path(".orchestrator/chair-reviews/test.md"),
            json_path=Path(".orchestrator/chair-reviews/test.json"),
            approval_state={"pending": []},
            state={"failure_streaks": {}, "provider_pauses": {}, "dispatch_pauses": []},
            provider_report={},
            status={
                "tasks": [
                    {"id": "DEP-001", "status": "done"},
                    {
                        "id": "ADM-UI-RD-005",
                        "status": "blocked",
                        "owner": "Codex",
                        "reviewer": "Codex2",
                        "depends_on": ["DEP-001"],
                        "next": "Closeout blocked because shared branch HEAD moved to a mixed commit.",
                    },
                ]
            },
        )

        self.assertIn("Dependency-ready blocked tasks requiring chair repair", message)
        self.assertIn("ADM-UI-RD-005", message)
        self.assertIn("kind=history_repair", message)
        self.assertIn("create_unblock_task", message)

    def test_blocked_task_triage_requires_unblock_task_action(self) -> None:
        payload = {
            "version": 1,
            "decision": "operational_review",
            "approval_ttl_minutes": 45,
            "reason": "blocked task needs repair",
            "blocked_by": [],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [],
        }
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {"id": "TEN-UI-RD-010", "status": "blocked", "depends_on": ["DEP-001"]},
            ]
        }

        self.assertEqual(
            supervisor.validate_chair_review_context(
                payload,
                reason="blocked_task_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            ),
            "blocked_task_triage must resolve blocked tasks via TEN-UI-RD-010:create_unblock_task",
        )
        payload["task_actions"] = [
            {
                "task_id": "TEN-UI-RD-010",
                "action": "create_unblock_task",
                "unblock_kind": "planning_decision",
                "reason": "Missing tenant approval-rule contract needs planning.",
            }
        ]
        self.assertIsNone(supervisor.validate_chair_review_payload(payload))
        self.assertIsNone(
            supervisor.validate_chair_review_context(
                payload,
                reason="blocked_task_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            )
        )

    def test_blocked_task_triage_requires_parent_resume_when_unblock_child_is_done(self) -> None:
        payload = {
            "version": 1,
            "decision": "operational_review",
            "approval_ttl_minutes": 45,
            "reason": "blocked parent should resume after existing unblock child",
            "blocked_by": [],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [],
        }
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "ADM-UI-RD-006",
                    "status": "blocked",
                    "owner": "Codex2",
                    "reviewer": "Codex",
                    "depends_on": ["DEP-001"],
                    "next": "See support/unblock/ADM-UI-RD-006/ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR.md",
                },
                {
                    "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                    "status": "done",
                    "task_class": "unblock",
                    "helper_parent": "ADM-UI-RD-006",
                    "helper_kind": "history_repair",
                    "next": "Repair route documented and pushed.",
                },
            ]
        }

        self.assertEqual(
            supervisor.validate_chair_review_context(
                payload,
                reason="blocked_task_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            ),
            "blocked_task_triage must resolve blocked tasks via ADM-UI-RD-006:resume_parent_task",
        )
        payload["task_actions"] = [
            {
                "task_id": "ADM-UI-RD-006",
                "action": "resume_parent_task",
                "resume_status": "todo",
                "reason": "Completed history-repair helper already documented the rebuild route.",
            }
        ]
        self.assertIsNone(supervisor.validate_chair_review_payload(payload))
        self.assertIsNone(
            supervisor.validate_chair_review_context(
                payload,
                reason="blocked_task_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            )
        )

    def test_reassignment_triage_synthesizes_followup_unblock_action(self) -> None:
        payload = {
            "version": 1,
            "decision": "operational_review",
            "approval_ttl_minutes": 45,
            "reason": "reassign the failing owner first",
            "blocked_by": [
                "UI-FE-DRV-ONB remains blocked (history_repair); not reassignable while blocked."
            ],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [
                "Run blocked_task_triage for UI-FE-DRV-ONB: create history_repair unblock task."
            ],
        }
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "UI-FE-DRV-ONB",
                    "status": "blocked",
                    "owner": "Codex2",
                    "reviewer": "Claude2",
                    "depends_on": ["DEP-001"],
                    "next": "History repair audit still required.",
                },
            ]
        }

        self.assertEqual(
            supervisor.validate_chair_review_context(
                payload,
                reason="reassignment_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            ),
            "reassignment_triage must materialize follow-up task actions via UI-FE-DRV-ONB:create_unblock_task",
        )

        normalized = supervisor.normalize_chair_review_payload_for_reason(
            payload,
            reason="reassignment_triage",
            config={"paths": {}},
            status=status,
        )

        self.assertEqual(
            normalized["task_actions"],
            [
                {
                    "task_id": "UI-FE-DRV-ONB",
                    "action": "create_unblock_task",
                    "unblock_kind": "history_repair",
                    "reason": (
                        "Chairman follow-up from reassignment_triage: UI-FE-DRV-ONB remains "
                        "dependency-ready blocked; materialize the history_repair unblock path now."
                    ),
                }
            ],
        )
        self.assertIsNone(supervisor.validate_chair_review_payload(normalized))
        self.assertIsNone(
            supervisor.validate_chair_review_context(
                normalized,
                reason="reassignment_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            )
        )

    def test_reassignment_triage_synthesizes_resume_parent_followup_action(self) -> None:
        payload = {
            "version": 1,
            "decision": "operational_review",
            "approval_ttl_minutes": 45,
            "reason": "reassign other work but resume the repaired blocked parent",
            "blocked_by": [
                "ADM-UI-RD-006 remains blocked only because the parent has not been resumed yet."
            ],
            "approval_actions": [],
            "reassignment_actions": [],
            "task_actions": [],
            "provider_actions": [],
            "recommended_focus": [
                "Resume ADM-UI-RD-006 after the completed history_repair unblock child."
            ],
        }
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "ADM-UI-RD-006",
                    "status": "blocked",
                    "owner": "Codex2",
                    "reviewer": "Codex",
                    "depends_on": ["DEP-001"],
                    "next": "Completed history-repair helper already documented the rebuild route.",
                },
                {
                    "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                    "status": "done",
                    "task_class": "unblock",
                    "helper_parent": "ADM-UI-RD-006",
                    "helper_kind": "history_repair",
                    "next": "Repair route documented and pushed.",
                },
            ]
        }

        normalized = supervisor.normalize_chair_review_payload_for_reason(
            payload,
            reason="reassignment_triage",
            config={"paths": {}},
            status=status,
        )

        self.assertEqual(
            normalized["task_actions"],
            [
                {
                    "task_id": "ADM-UI-RD-006",
                    "action": "resume_parent_task",
                    "resume_status": "todo",
                    "reason": (
                        "Chairman follow-up from reassignment_triage: "
                        "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR already resolved the blocker for "
                        "ADM-UI-RD-006; resume the parent."
                    ),
                }
            ],
        )
        self.assertIsNone(
            supervisor.validate_chair_review_context(
                normalized,
                reason="reassignment_triage",
                approval_state={"pending": []},
                config={"paths": {}},
                status=status,
            )
        )

    def test_provider_report_age_uses_generated_at(self) -> None:
        now = datetime(2026, 8, 4, 12, 0, 0, tzinfo=timezone.utc)
        age = supervisor.provider_report_age_seconds(
            Path("/nonexistent/provider_capabilities.json"),
            {"generated_at": "2026-08-04T11:45:00Z"},
            now=now,
        )
        self.assertEqual(age, 900.0)

    def test_provider_report_age_is_infinite_when_undateable(self) -> None:
        age = supervisor.provider_report_age_seconds(
            Path("/nonexistent/provider_capabilities.json"), {}
        )
        self.assertEqual(age, float("inf"))

    def test_stale_provider_report_is_reprobed(self) -> None:
        """A cached report that is never refreshed can strand a healthy lane."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "provider_capabilities.json"
            path.write_text(
                json.dumps({"generated_at": "2026-08-01T00:00:00Z", "providers": {}}),
                encoding="utf-8",
            )
            config = {
                "paths": {"provider_capabilities": str(path)},
                "supervisor": {"auto_refresh_provider_capabilities": True},
            }
            fresh = {"generated_at": "2026-08-04T00:00:00Z", "providers": {"claude": {}}}
            with (
                mock.patch.object(supervisor, "build_provider_capabilities", return_value=fresh) as build,
                mock.patch.object(supervisor, "write_provider_capabilities") as write,
            ):
                report = supervisor.load_provider_report(config)
            build.assert_called_once()
            write.assert_called_once()
            self.assertEqual(report, fresh)

    def test_fresh_provider_report_is_not_reprobed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "provider_capabilities.json"
            generated_at = (
                datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            )
            cached = {"generated_at": generated_at, "providers": {"claude": {}}}
            path.write_text(json.dumps(cached), encoding="utf-8")
            config = {
                "paths": {"provider_capabilities": str(path)},
                "supervisor": {"auto_refresh_provider_capabilities": True},
            }
            with mock.patch.object(supervisor, "build_provider_capabilities") as build:
                report = supervisor.load_provider_report(config)
            build.assert_not_called()
            self.assertEqual(report, cached)

    def test_provider_profile_path_mismatch_is_reprobed_even_when_periodic_refresh_is_off(self) -> None:
        """A changed agy profile must not dispatch against an old auth snapshot."""
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "provider_capabilities.json"
            cached = {
                "providers": {
                    "gemini": {"paths": {"antigravity_app_data": "/old/.gemini/antigravity-cli"}}
                }
            }
            path.write_text(json.dumps(cached), encoding="utf-8")
            config = {
                "paths": {"provider_capabilities": str(path)},
                "supervisor": {"auto_refresh_provider_capabilities": False},
                "providers": {"gemini": {"antigravity": {"config_home": "/new"}}},
            }
            fresh = {"providers": {"gemini": {"auth_ready": False}}}
            with (
                mock.patch.object(supervisor, "build_provider_capabilities", return_value=fresh) as build,
                mock.patch.object(supervisor, "write_provider_capabilities") as write,
            ):
                report = supervisor.load_provider_report(config)
            build.assert_called_once()
            write.assert_called_once_with(config, report=fresh)
            self.assertEqual(report, fresh)

    def test_provider_health_review_respects_cooldown_after_recent_pause_review(self) -> None:
        state = {
            "provider_pauses": {
                "claude": {
                    "kind": "auth",
                    "scope": "lane",
                    "lane_id": "claude",
                    "schema": 3,
                    "reason": "Invalid authentication credentials",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            },
            "dispatch_pauses": [],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": "2026-04-30T12:52:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }
        config = {"chair_review": {"enabled": True}}

        with (
            mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
            mock.patch.object(supervisor, "choose_chair_reviewer") as choose_chair_reviewer,
        ):
            queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

        self.assertFalse(queued)
        choose_chair_reviewer.assert_not_called()

    def test_dispatch_pause_review_respects_cooldown_after_recent_review(self) -> None:
        state = {
            "provider_pauses": {},
            "dispatch_pauses": [
                {
                    "provider": "codex2",
                    "task_id": "IAM-PRT-001",
                    "failure_kind": "quota/terminal",
                    "paused_at": "2026-04-30T12:51:53Z",
                }
            ],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": "2026-04-30T12:52:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }
        config = {"chair_review": {"enabled": True}}

        with (
            mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
            mock.patch.object(supervisor, "choose_chair_reviewer") as choose_chair_reviewer,
        ):
            queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

        self.assertFalse(queued)
        choose_chair_reviewer.assert_not_called()

    def test_dispatch_pause_recorded_after_last_review_bypasses_cooldown(self) -> None:
        state = {
            "provider_pauses": {},
            "dispatch_pauses": [
                {
                    "provider": "codex2",
                    "task_id": "IAM-PRT-001",
                    "failure_kind": "quota/terminal",
                    "paused_at": "2026-04-30T13:10:00Z",
                }
            ],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": "2026-04-30T12:52:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }

        self.assertTrue(
            supervisor.chair_review_needs_immediate_attention(state, {"tasks": []})
        )

    def test_dependency_ready_blocked_task_does_not_bypass_cooldown(self) -> None:
        status = {
            "tasks": [
                {"id": "DEP-001", "status": "done"},
                {
                    "id": "ADM-UI-RD-005",
                    "status": "blocked",
                    "owner": "Codex",
                    "reviewer": "Codex2",
                    "depends_on": ["DEP-001"],
                    "next": "Closeout blocked because shared branch HEAD moved to a mixed commit.",
                },
            ]
        }
        state = {
            "provider_pauses": {},
            "dispatch_pauses": [],
            "failure_streaks": {},
            "chair_review": {
                "last_review_at": "2026-04-30T12:52:00Z",
                "cooldown_until": "2099-01-01T00:00:00Z",
            },
        }
        config = {"paths": {}, "chair_review": {"enabled": True}}

        # The blocked task is still triage-worthy, so the reason stays set...
        self.assertEqual(
            supervisor.chair_review_reason(state, {"pending": []}, status=status, config=config),
            "blocked_task_triage",
        )

        # ...but it must not re-queue a review on every tick while the cooldown
        # is active, because the chair cannot clear the condition itself.
        with (
            mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
            mock.patch.object(supervisor, "choose_chair_reviewer") as choose_chair_reviewer,
        ):
            queued = supervisor.queue_chair_review(config, state, status, provider_report={})

        self.assertFalse(queued)
        choose_chair_reviewer.assert_not_called()

    def test_urgent_chair_review_can_use_lane_with_primary_work(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = {
                "agents": {
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                },
                "chair_review": {"enabled": True},
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
            }
            state = {
                "queue": {"events": {}},
                "workers": {},
                "seen_event_keys": {},
                "provider_pauses": {
                    "claude": {
                        "kind": "auth",
                        "scope": "lane",
                        "lane_id": "claude",
                        "schema": 3,
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                },
                "provider_pause_schema": 3,
                "chair_review": {},
            }
            status = {
                "tasks": [
                    {
                        "id": "DRV-UI-002",
                        "status": "backlog",
                        "owner": "Codex",
                        "reviewer": "Claude",
                        "depends_on": [],
                    }
                ]
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
                mock.patch.object(supervisor, "enqueue_event") as enqueue_event,
                mock.patch.object(supervisor, "write_activity_log"),
            ):
                queued = supervisor.queue_chair_review(config, state, status, provider_report={})

        self.assertTrue(queued)
        self.assertEqual(state["chair_review"]["active_review"]["agent"], "Codex")
        self.assertEqual(state["chair_review"]["active_review"]["reason"], "provider_health_triage")
        enqueue_event.assert_called_once()

    def test_chair_reviewer_skips_lane_without_auto_delivery(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            (root / "ai-status.json").write_text('{"agents": [{"name": "Gemini"}, {"name": "Codex"}], "tasks": []}\n', encoding="utf-8")
            config = {
                "agents": {
                    "gemini": {"id": "gemini", "display_name": "Gemini", "provider": "gemini"},
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                },
                "paths": {
                    "event_queue": str(root / "event-queue.jsonl"),
                    "status_file": str(root / "ai-status.json"),
                },
                "ready_dispatcher": {"active_worker_statuses": []},
            }
            state = {"workers": {}, "queue": {"events": {}}, "provider_pauses": {}, "chair_review": {}}
            status = {"agents": [{"name": "Gemini"}, {"name": "Codex"}], "tasks": []}
            provider_report = {
                "agent_adapters": {
                    "gemini": {"supported": True, "can_auto_deliver": False},
                    "codex": {"supported": True, "can_auto_deliver": True},
                }
            }

            chosen = supervisor.choose_chair_reviewer(config, state, status, provider_report)

        self.assertEqual(chosen, ("codex", "Codex"))

    def test_chair_reviewer_skips_stale_adapter_capability_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            (root / "ai-status.json").write_text('{"agents": [{"name": "Gemini"}, {"name": "Codex"}], "tasks": []}\n', encoding="utf-8")
            config = {
                "agents": {
                    "gemini": {
                        "id": "gemini",
                        "display_name": "Gemini",
                        "provider": "gemini",
                        "adapter": "antigravity",
                    },
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex", "adapter": "codex"},
                },
                "paths": {
                    "event_queue": str(root / "event-queue.jsonl"),
                    "status_file": str(root / "ai-status.json"),
                },
                "ready_dispatcher": {"active_worker_statuses": []},
            }
            state = {"workers": {}, "queue": {"events": {}}, "provider_pauses": {}, "chair_review": {}}
            status = {"agents": [{"name": "Gemini"}, {"name": "Codex"}], "tasks": []}
            provider_report = {
                "agent_adapters": {
                    "gemini": {"adapter": "gemini", "supported": True, "can_auto_deliver": True},
                    "codex": {"adapter": "codex", "supported": True, "can_auto_deliver": True},
                }
            }

            chosen = supervisor.choose_chair_reviewer(config, state, status, provider_report)

        self.assertEqual(chosen, ("codex", "Codex"))


    def test_urgent_chair_review_can_recover_busy_lane_when_capacity_available(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            (root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
            config = {
                "agents": {
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                },
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "ready_dispatcher": {
                    "active_worker_statuses": ["running"],
                    "max_tasks_per_agent_by_lane": {"codex": 2},
                },
            }
            state = {
                "workers": {
                    "w-codex": {
                        "agent_id": "codex",
                        "status": "running",
                        "queue_event_id": "evt-codex-recover",
                    }
                },
                "queue": {
                    "events": {
                        "evt-codex-recover": {
                            "status": "started",
                        }
                    }
                },
                "provider_pauses": {},
                "chair_review": {},
            }

            chosen = supervisor.choose_chair_reviewer(
                config,
                state,
                {"tasks": []},
                {},
                allow_primary_work_fallback=True,
            )

        self.assertEqual(chosen, ("codex", "Codex"))

    def test_urgent_chair_review_records_blocked_when_no_lane_available(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = {
                "agents": {
                    "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
                },
                "chair_review": {"enabled": True},
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
            }
            state = {
                "queue": {"events": {}},
                "workers": {},
                "provider_pauses": {
                    "claude": {
                        "kind": "auth",
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                },
                "chair_review": {},
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": []}),
                mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            ):
                queued = supervisor.queue_chair_review(config, state, {"tasks": []}, provider_report={})

        self.assertTrue(queued)
        self.assertEqual(state["chair_review"]["blocked"]["reason"], "provider_health_triage")
        self.assertIsNone(state["chair_review"].get("active_review"))
        write_activity_log.assert_called_once()

    def test_duplicate_chair_provider_pause_is_noop(self) -> None:
        state = {
            "provider_pauses": {
                "claude": {
                    "kind": "auth",
                    "reason": "Invalid authentication credentials",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            }
        }
        config = {"agents": {"claude": {"display_name": "Claude", "provider": "claude"}}}

        changed = supervisor.apply_chair_provider_action(
            config,
            state,
            {
                "agent": "Claude",
                "action": "pause",
                "kind": "auth",
                "reason": "Invalid authentication credentials",
            },
        )

        self.assertFalse(changed)
        self.assertEqual(state["provider_pauses"]["claude"]["paused_at"], "2026-04-30T12:51:53Z")

    def test_chair_clear_pause_rejects_future_resume_at(self) -> None:
        state = {
            "provider_pauses": {
                "copilot": {
                    "kind": "quota",
                    "scope": "lane",
                    "lane_id": "copilot",
                    "schema": 3,
                    "reason": "Quota exhausted",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": 4102444800.0,
                }
            },
            "provider_pause_schema": 3,
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            config = {
                "agents": {"copilot": {"display_name": "Copilot", "provider": "copilot"}},
                "paths": {"activity_log": str(Path(tmpdir) / "activity-log.jsonl")},
            }
            changed = supervisor.apply_chair_provider_action(
                config,
                state,
                {
                    "agent": "Copilot",
                    "action": "clear_pause",
                    "reason": "Quota limits have been met.",
                },
            )

        self.assertFalse(changed)
        self.assertIn("copilot", state["provider_pauses"])
        self.assertEqual(state["provider_pause_schema"], 3)

    def test_dispatcher_skips_task_waiting_on_chair_reassignment(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {},
            "chair_review": {"enabled": True},
            "agents": {
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
            },
        }
        state = {
            "queue": {"events": {}},
            "workers": {},
            "seen_event_keys": {},
            "failure_streaks": {
                "REG-777:owner": {
                    "task_id": "REG-777",
                    "role": "owner",
                    "agent": "Codex",
                    "count": 2,
                    "threshold": 2,
                    "awaiting_chair": True,
                }
            },
        }
        status = {
            "tasks": [
                {
                    "id": "REG-777",
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
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertFalse(changed)
        queue_delivery_event.assert_not_called()

    def test_refresh_chair_review_state_applies_approval_actions(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260429T000000Z-claude.md"
            json_path = review_dir / "20260429T000000Z-claude.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
                        "approval_ttl_minutes": 45,
                        "reason": "safe and idle",
                        "blocked_by": [],
                        "approval_actions": [
                            {
                                "approval_id": "apr-1",
                                "decision": "allow",
                                "reason": "read-only context check",
                                "remember": False,
                            }
                        ],
                        "reassignment_actions": [],
                        "task_actions": [],
                        "provider_actions": [
                            {
                                "agent": "Gemini2",
                                "action": "pause",
                                "kind": "capacity",
                                "reason": "Noisy approval triage output should not mutate provider state.",
                            }
                        ],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
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
                        "agent_id": "claude",
                        "agent": "Claude",
                        "reason": "approval_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(
                    supervisor,
                    "safe_load_approval_state",
                    return_value={
                        "pending": [
                            {
                                "approval_id": "apr-1",
                                "tool_name": "Read",
                                "risk_class": "safe_read",
                            }
                        ],
                        "history": [],
                    },
                ),
                mock.patch.object(supervisor, "resolve_approval") as resolve_approval,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            resolve_approval.assert_called_once_with(
                config,
                "apr-1",
                decision="allow",
                note="read-only context check",
                remember=False,
            )
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["last_reviewer"], "Claude")
            self.assertNotIn("gemini2", state.get("provider_pauses", {}))

    def test_refresh_chair_review_state_classifies_lost_queue_event(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "missing.md"
            json_path = review_dir / "missing.json"
            config = {
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
                "queue": {"events": {}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "gemini",
                        "agent": "Gemini",
                        "reason": "provider_health_triage",
                        "queue_event_id": "evt-missing",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            records = [
                json.loads(line)
                for line in (root / "activity-log.jsonl").read_text(encoding="utf-8").splitlines()
                if line.strip()
            ]
            self.assertEqual(records[-1]["type"], "chair_review_lost_queue_event")

    def test_refresh_chair_review_state_applies_reassignments_and_preserves_separation(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _install_canonical_status_script(root)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260429T000000Z-claude2.md"
            json_path = review_dir / "20260429T000000Z-claude2.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
                        "approval_ttl_minutes": 45,
                        "reason": "break owner failure loop",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [
                            {
                                "task_id": "OPX-MD-003",
                                "role": "owner",
                                "from": "Codex2",
                                "to": "Codex",
                                "reason": "Codex2 hit repeated terminal failures.",
                            },
                            {
                                "task_id": "OPX-MD-003",
                                "role": "reviewer",
                                "from": "Codex",
                                "to": "Claude",
                                "reason": "Keep owner and reviewer separate after the owner move.",
                            },
                        ],
                        "task_actions": [],
                        "provider_actions": [],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "OPX-MD-003",
                                "owner": "Codex2",
                                "reviewer": "Codex",
                                "status": "in_progress",
                                "last_update": "2026-04-29T00:00:00Z",
                            }
                        ],
                        "handoffs": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                    "claude": {"display_name": "Claude", "provider": "claude"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "failure_streaks": {
                    "OPX-MD-003:owner": {
                        "task_id": "OPX-MD-003",
                        "role": "owner",
                        "agent": "Codex2",
                        "awaiting_chair": True,
                    },
                    "OPX-MD-003:reviewer": {
                        "task_id": "OPX-MD-003",
                        "role": "reviewer",
                        "agent": "Codex",
                        "awaiting_chair": True,
                    },
                },
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude2",
                        "agent": "Claude2",
                        "reason": "reassignment_triage",
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
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            updated = json.loads(status_path.read_text(encoding="utf-8"))
            task = updated["tasks"][0]
            self.assertEqual(task["owner"], "Codex")
            self.assertEqual(task["reviewer"], "Claude")
            self.assertEqual(task["status"], "todo")
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertNotIn("OPX-MD-003:owner", state["failure_streaks"])
            self.assertNotIn("OPX-MD-003:reviewer", state["failure_streaks"])
            self.assertEqual(state["chair_reassignment_guards"]["OPX-MD-003:owner"]["to"], "Codex")
            self.assertEqual(state["chair_reassignment_guards"]["OPX-MD-003:reviewer"]["to"], "Claude")

    def test_chair_reassignment_rejects_owner_move_to_current_reviewer(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            status_path = root / "ai-status.json"
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "PBK-UI-004",
                                "owner": "Codex",
                                "reviewer": "Codex2",
                                "status": "in_progress",
                                "last_update": "2026-05-18T00:00:00Z",
                            }
                        ],
                        "handoffs": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                },
            }
            state = {"queue": {"events": {}}, "workers": {}, "failure_streaks": {}}

            with mock.patch.object(supervisor, "execute_task_board_command") as execute:
                changed = supervisor.apply_chair_reassignment_action(
                    config,
                    state,
                    {
                        "task_id": "PBK-UI-004",
                        "role": "owner",
                        "from": "Codex",
                        "to": "Codex2",
                        "reason": "Codex hit repeated terminal failures.",
                    },
                    provider_report={},
                )

            self.assertFalse(changed)
            execute.assert_not_called()
            task = json.loads(status_path.read_text(encoding="utf-8"))["tasks"][0]
            self.assertEqual(task["owner"], "Codex")
            self.assertEqual(task["reviewer"], "Codex2")

    def test_refresh_chair_review_state_reassigns_backlog_owner_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _install_canonical_status_script(root)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260430T000000Z-gemini.md"
            json_path = review_dir / "20260430T000000Z-gemini.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
                        "approval_ttl_minutes": None,
                        "reason": "Claude auth lane is degraded; move backlog owner work.",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [
                            {
                                "task_id": "OPX-DP-003-SIDECAR-ACCEPTANCE",
                                "role": "owner",
                                "from": "Claude",
                                "to": "Claude2",
                                "reason": "Claude auth failed before doing work.",
                            }
                        ],
                        "task_actions": [],
                        "provider_actions": [],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "OPX-DP-003-SIDECAR-ACCEPTANCE",
                                "owner": "Claude",
                                "reviewer": "Codex2",
                                "status": "backlog",
                                "last_update": "2026-04-30T12:43:03Z",
                            }
                        ],
                        "handoffs": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "claude": {"display_name": "Claude", "provider": "claude"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "failure_streaks": {
                    "OPX-DP-003-SIDECAR-ACCEPTANCE:owner": {
                        "task_id": "OPX-DP-003-SIDECAR-ACCEPTANCE",
                        "role": "owner",
                        "agent": "Claude",
                        "awaiting_chair": True,
                    }
                },
                "chair_review": {
                    "active_review": {
                        "agent_id": "gemini",
                        "agent": "Gemini",
                        "reason": "provider_health_triage",
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
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            updated = json.loads(status_path.read_text(encoding="utf-8"))
            task = updated["tasks"][0]
            self.assertEqual(task["owner"], "Claude2")
            self.assertEqual(task["status"], "todo")
            self.assertNotIn("OPX-DP-003-SIDECAR-ACCEPTANCE:owner", state["failure_streaks"])

    def test_refresh_chair_review_state_applies_provider_pause_and_reassignment(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _install_canonical_status_script(root)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260430T000000Z-claude.md"
            json_path = review_dir / "20260430T000000Z-claude.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
                        "approval_ttl_minutes": None,
                        "reason": "Gemini2 lane is degraded; pause it and move backlog work to a healthy owner.",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [
                            {
                                "task_id": "ORX-GV-003",
                                "role": "owner",
                                "from": "Gemini2",
                                "to": "Claude2",
                                "reason": "Gemini2 provider-health worker stalled while output already existed.",
                            }
                        ],
                        "task_actions": [],
                        "provider_actions": [
                            {
                                "agent": "Gemini2",
                                "action": "pause",
                                "kind": "auth",
                                # chair_provider_pause_reason_is_actionable now requires
                                # a concrete auth marker (e.g. "status: 401") in the reason.
                                "reason": "Provider-health worker returned status: 401 from Gemini2; pause until reauth.",
                                "reset_seconds": None,
                            }
                        ],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "ORX-GV-003",
                                "owner": "Gemini2",
                                "reviewer": "Codex",
                                "status": "backlog",
                                "last_update": "2026-04-30T14:30:00Z",
                            }
                        ],
                        "handoffs": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "gemini2": {"display_name": "Gemini2", "provider": "gemini2"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                    "codex": {"display_name": "Codex", "provider": "codex"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude",
                        "agent": "Claude",
                        "reason": "provider_health_triage",
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
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            updated = json.loads(status_path.read_text(encoding="utf-8"))
            task = updated["tasks"][0]
            self.assertEqual(task["owner"], "Claude2")
            self.assertEqual(task["reviewer"], "Codex")
            self.assertEqual(task["status"], "todo")
            self.assertEqual(state["provider_pauses"]["gemini2"]["kind"], "auth")
            self.assertIsNone(state["chair_review"]["active_review"])

    def test_refresh_chair_review_state_dispatches_review_approved_task_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260430T000000Z-claude.json.md"
            json_path = review_dir / "20260430T000000Z-claude.json"
            status_path = root / "ai-status.json"
            event_queue_path = root / "event-queue.jsonl"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
            "approval_ttl_minutes": 45,
                        "reason": "finalize owner should be woken now",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [],
                        "task_actions": [
                            {
                                "task_id": "OPX-CM-003",
                                "action": "dispatch_now",
                                "reason": "Owner already has review-approved work ready to finalize.",
                            }
                        ],
                        "recommended_focus": [],
                        "provider_actions": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "OPX-CM-003",
                                "owner": "Codex",
                                "reviewer": "Claude",
                                "status": "review_approved",
                                "depends_on": [],
                                "artifacts": [],
                                "last_update": "2026-04-30T00:00:00Z",
                            }
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            event_queue_path.write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(event_queue_path),
                },
                "schema": {
                    "tasks_path": "tasks",
                    "task_id_field": "id",
                    "status_field": "status",
                    "assignee_field": "owner",
                    "reviewer_field": "reviewer",
                },
                "agents": {
                    "codex": {
                        "id": "codex",
                        "display_name": "Codex",
                        "provider": "codex",
                        "adapter": "codex",
                    },
                    "claude": {
                        "id": "claude",
                        "display_name": "Claude",
                        "provider": "claude",
                        "adapter": "claude",
                    },
                },
                "providers": {
                    "codex": {"delivery_mode": "codex"},
                    "claude": {"delivery_mode": "claude"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude",
                        "agent": "Claude",
                        "reason": "operational_review",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            self.assertIsNone(state["chair_review"]["active_review"])
            events = [json.loads(line) for line in event_queue_path.read_text(encoding="utf-8").splitlines() if line.strip()]
            self.assertEqual(events, [])

    def test_refresh_chair_review_state_applies_unblock_task_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260518T000000Z-claude2.md"
            json_path = review_dir / "20260518T000000Z-claude2.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
            "approval_ttl_minutes": 45,
                        "reason": "blocked parent needs an unblock task",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [],
                        "task_actions": [
                            {
                                "task_id": "ADM-UI-RD-005",
                                "action": "create_unblock_task",
                                "unblock_kind": "history_repair",
                                "target_agent": "Codex",
                                "reviewer": "Codex2",
                                "reason": "Shared branch history must be disentangled.",
                            }
                        ],
                        "provider_actions": [],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {"id": "DEP-001", "status": "done"},
                            {
                                "id": "ADM-UI-RD-005",
                                "owner": "Codex",
                                "reviewer": "Codex2",
                                "status": "blocked",
                                "depends_on": ["DEP-001"],
                                "next": "Closeout blocked because shared branch HEAD moved to a mixed commit.",
                            },
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude2",
                        "agent": "Claude2",
                        "reason": "blocked_task_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "create_chair_unblock_task", return_value=True) as create_unblock,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            create_unblock.assert_called_once()
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["last_reason"], "blocked_task_triage")

    def test_refresh_chair_review_state_materializes_workspace_baseline_task_from_reassignment_focus(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260528T000000Z-claude.md"
            json_path = review_dir / "20260528T000000Z-claude.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
            "approval_ttl_minutes": 45,
                        "reason": "No reassignment improves machine truth.",
                        "blocked_by": [
                            "Shared workspace-baseline blocker keeps the UI-FE wave from typecheck/build completion."
                        ],
                        "approval_actions": [],
                        "reassignment_actions": [],
                        "task_actions": [],
                        "provider_actions": [],
                        "recommended_focus": [
                            "Create a workspace-baseline repair task before re-dispatching the UI-FE wave."
                        ],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text('{"tasks": []}\n', encoding="utf-8")
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "failure_streaks": {
                    "UI-FE-ADM-FLT:owner": {
                        "task_id": "UI-FE-ADM-FLT",
                        "role": "owner",
                        "agent": "Codex",
                        "awaiting_chair": True,
                    }
                },
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude",
                        "agent": "Claude",
                        "reason": "reassignment_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "create_chair_workspace_baseline_task", return_value=True) as create_task,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            create_task.assert_called_once()
            self.assertEqual(create_task.call_args.kwargs["preferred_owner"], "Claude")
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["last_reason"], "reassignment_triage")

    def test_refresh_chair_review_state_synthesizes_reassignment_followup_unblock_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260528T000500Z-claude2.md"
            json_path = review_dir / "20260528T000500Z-claude2.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "operational_review",
            "approval_ttl_minutes": 45,
                        "reason": "Move failing owner off Codex and unblock the blocked parent.",
                        "blocked_by": [
                            "UI-FE-DRV-ONB remains blocked (history_repair); not reassignable while blocked."
                        ],
                        "approval_actions": [],
                        "reassignment_actions": [],
                        "task_actions": [],
                        "provider_actions": [],
                        "recommended_focus": [
                            "Run blocked_task_triage for UI-FE-DRV-ONB: create history_repair unblock task."
                        ],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {"id": "DEP-001", "status": "done"},
                            {
                                "id": "UI-FE-DRV-ONB",
                                "owner": "Codex2",
                                "reviewer": "Claude2",
                                "status": "blocked",
                                "depends_on": ["DEP-001"],
                                "next": "History repair audit still required.",
                            },
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                    "claude2": {"display_name": "Claude2", "provider": "claude2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "claude2",
                        "agent": "Claude2",
                        "reason": "reassignment_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "create_chair_unblock_task", return_value=True) as create_unblock,
                mock.patch.object(supervisor, "create_chair_workspace_baseline_task", return_value=False),
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            create_unblock.assert_called_once()
            action = create_unblock.call_args.args[2]
            self.assertEqual(action["task_id"], "UI-FE-DRV-ONB")
            self.assertEqual(action["action"], "create_unblock_task")
            self.assertEqual(action["unblock_kind"], "history_repair")
            self.assertIn("reassignment_triage", action["reason"])
            self.assertEqual(
                state["chair_review"]["last_decision"]["task_actions"][0]["task_id"],
                "UI-FE-DRV-ONB",
            )
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["last_reason"], "reassignment_triage")

    def test_materialize_workspace_baseline_task_from_last_decision_uses_last_reviewer(self) -> None:
        config = {"paths": {"status_file": "ai-status.json"}}
        state = {
            "chair_review": {
                "last_reason": "reassignment_triage",
                "last_reviewer": "Claude",
                "last_decision": {
                    "reason": "Shared workspace-baseline blocker",
                    "blocked_by": ["@drts/ui-tokens and @drts/contracts module resolution"],
                    "recommended_focus": ["Dispatch a workspace-baseline repair task"],
                },
            }
        }

        with mock.patch.object(supervisor, "create_chair_workspace_baseline_task", return_value=True) as create_task:
            changed = supervisor.materialize_workspace_baseline_task_from_last_decision(
                config,
                state,
                provider_report={},
            )

        self.assertTrue(changed)
        create_task.assert_called_once_with(
            config,
            state,
            state["chair_review"]["last_decision"],
            {},
            preferred_owner="Claude",
        )

    def test_workspace_baseline_delivery_is_owned_by_ready_dispatcher(self) -> None:
        self.assertFalse(
            supervisor.ensure_workspace_baseline_task_dispatch(
                {"paths": {"status_file": "ai-status.json"}},
                {},
                provider_report={},
            )
        )

    def test_refresh_chair_review_state_applies_resume_parent_task_action(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            review_dir = root / "chair-reviews"
            review_dir.mkdir(parents=True, exist_ok=True)
            markdown_path = review_dir / "20260518T000100Z-codex.md"
            json_path = review_dir / "20260518T000100Z-codex.json"
            status_path = root / "ai-status.json"
            markdown_path.write_text("# Review\n", encoding="utf-8")
            json_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "decision": "blocked_task_triage",
            "approval_ttl_minutes": 45,
                        "reason": "existing unblock child is already done",
                        "blocked_by": [],
                        "approval_actions": [],
                        "reassignment_actions": [],
                        "task_actions": [
                            {
                                "task_id": "ADM-UI-RD-006",
                                "action": "resume_parent_task",
                                "resume_status": "todo",
                                "reason": "Completed history-repair helper already documented the rebuild route.",
                            }
                        ],
                        "provider_actions": [],
                        "recommended_focus": [],
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            status_path.write_text(
                json.dumps(
                    {
                        "tasks": [
                            {"id": "DEP-001", "status": "done"},
                            {
                                "id": "ADM-UI-RD-006",
                                "owner": "Codex2",
                                "reviewer": "Codex",
                                "status": "blocked",
                                "depends_on": ["DEP-001"],
                                "next": "See support/unblock/ADM-UI-RD-006/ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR.md",
                            },
                            {
                                "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                                "owner": "Codex2",
                                "reviewer": "Codex",
                                "status": "done",
                                "task_class": "unblock",
                                "helper_parent": "ADM-UI-RD-006",
                                "helper_kind": "history_repair",
                            },
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_path),
                    "state_file": str(root / "state.json"),
                    "approval_queue": str(root / "approval-queue.json"),
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                },
                "agents": {
                    "codex": {"display_name": "Codex", "provider": "codex"},
                    "codex2": {"display_name": "Codex2", "provider": "codex2"},
                },
                "chair_review": {"enabled": True, "cooldown_seconds": 900},
            }
            state = {
                "queue": {"events": {"evt-chair": {"status": "completed"}}},
                "workers": {},
                "chair_review": {
                    "active_review": {
                        "agent_id": "codex",
                        "agent": "Codex",
                        "reason": "blocked_task_triage",
                        "queue_event_id": "evt-chair",
                        "markdown_path": str(markdown_path),
                        "json_path": str(json_path),
                    }
                },
            }

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "apply_chair_parent_resume_action", return_value=True) as resume_parent,
            ):
                changed = supervisor.refresh_chair_review_state(config, state, provider_report={})

            self.assertTrue(changed)
            resume_parent.assert_called_once()
            self.assertIsNone(state["chair_review"]["active_review"])
            self.assertEqual(state["chair_review"]["last_reason"], "blocked_task_triage")

    def test_proactive_claim_respects_chair_reassignment_guard(self) -> None:
        config = {
            "agents": {
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            }
        }
        task = {
            "id": "OPX-IN-001",
            "status": "todo",
            "owner": "Codex",
            "reviewer": "Claude",
            "depends_on": [],
        }
        state = {
            "chair_reassignment_guards": {
                "OPX-IN-001:owner": {
                    "task_id": "OPX-IN-001",
                    "role": "owner",
                    "from": "Codex2",
                    "to": "Codex",
                    "expires_at": "2999-01-01T00:00:00Z",
                }
            }
        }

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            config,
            task=task,
            task_map={"OPX-IN-001": task},
            idle_agent_name="Codex2",
            idle_agent_names=["Codex2"],
            agent_loads={"Codex": [0], "Codex2": [99]},
            helper_settings={
                "enabled": True,
                "task_statuses": ["todo", "in_progress", "review", "review_approved"],
                "availability_first": True,
                "allow_any_idle_lane": True,
                "prefer_assigned_when_idle": True,
                "require_assigned_agent_busy": True,
                "require_owner_higher_priority_load": False,
            },
            review_statuses={"review"},
            finalize_statuses={"review_approved"},
            dependency_done_statuses={"done"},
            state=state,
        )

        self.assertIsNone(plan)

    def test_proactive_claim_respects_paused_explicit_owner(self) -> None:
        """Don't reshuffle a task whose explicit owner is paused but not loaded.

        Regression: when Gemini's lane is quota-paused (or its CLI dangling),
        availability-first auto-claim used to drain Gemini-owned backlog onto
        Codex2 (the only "idle" lane), even though Gemini was unavailable
        rather than busy. The fix: when the assigned owner is paused AND has
        no active work, leave the task waiting for that lane.

        See: feedback_supervisor_ignores_explicit_owner.md +
             feedback_cli_symlink_staleness.md
        """
        config = {
            "agents": {
                "gemini": {"display_name": "Gemini", "provider": "gemini"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            }
        }
        task = {
            "id": "PROD-RAIL-001",
            "status": "backlog",
            "owner": "Gemini",
            "reviewer": "Gemini2",
            "depends_on": [],
        }
        # Gemini is quota-paused; Codex2 is idle.
        state = {
            "provider_pause_schema": 3,
            "provider_pauses": {
                "gemini": {
                    "schema": 3,
                    "kind": "quota",
                    "reason": "QUOTA_EXHAUSTED",
                    "paused_at": "2026-05-19T02:07:48Z",
                    "resume_at": 9999999999.0,
                }
            }
        }

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            config,
            task=task,
            task_map={"PROD-RAIL-001": task},
            idle_agent_name="Codex2",
            idle_agent_names=["Codex2"],
            agent_loads={"Gemini": [], "Codex2": []},
            helper_settings={
                "enabled": True,
                "task_statuses": ["backlog", "todo", "in_progress", "review", "review_approved"],
                "availability_first": True,
                "allow_any_idle_lane": True,
                "prefer_assigned_when_idle": True,
                "require_assigned_agent_busy": True,
                "require_owner_higher_priority_load": False,
                "respect_explicit_owner_when_paused": True,
            },
            review_statuses={"review"},
            finalize_statuses={"review_approved"},
            dependency_done_statuses={"done"},
            state=state,
        )

        self.assertIsNone(
            plan,
            "Paused explicit owner with no active load must not be reshuffled; "
            "task should wait for the assigned lane to resume.",
        )

    def test_proactive_claim_reassigns_disabled_lane_owner(self) -> None:
        """A lane disabled via capacity=0 should not keep tasks stuck forever."""
        config = {
            "ready_dispatcher": {
                "max_tasks_per_agent": 2,
                "max_tasks_per_agent_by_lane": {
                    "gemini": 0,
                    "codex": 4,
                    "codex2": 4,
                },
            },
            "worker_reassignment": {
                "owner_fallbacks": {"Gemini": ["Codex", "Codex2"]},
                "reviewer_fallbacks": {"Gemini": ["Codex", "Codex2"]},
            },
            "agents": {
                "gemini": {"display_name": "Gemini", "provider": "gemini"},
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            },
        }
        task = {
            "id": "TENBIZ-012",
            "status": "todo",
            "owner": "Gemini",
            "reviewer": "Codex2",
            "depends_on": [],
        }

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            config,
            task=task,
            task_map={"TENBIZ-012": task},
            idle_agent_name="Codex",
            idle_agent_names=["Codex", "Codex2"],
            agent_loads={"Gemini": [3], "Codex": [99], "Codex2": [99]},
            helper_settings={
                "enabled": True,
                "task_statuses": ["backlog", "todo", "in_progress", "review", "review_approved"],
                "availability_first": False,
                "allow_any_idle_lane": False,
                "prefer_assigned_when_idle": True,
                "require_assigned_agent_busy": True,
                "require_owner_higher_priority_load": True,
                "respect_explicit_owner_when_paused": True,
            },
            review_statuses={"review"},
            finalize_statuses={"review_approved"},
            dependency_done_statuses={"done"},
            state={"provider_pauses": {}},
        )

        self.assertIsNotNone(plan)
        self.assertEqual(plan["claim_agent"], "Codex")
        self.assertEqual(plan["new_owner"], "Codex")
        self.assertEqual(plan["new_reviewer"], "Codex2")

    def test_proactive_claim_still_reshuffles_when_explicit_owner_busy(self) -> None:
        """The paused-owner guard must not block legitimate busy reshuffling.

        If the explicit owner is actually loaded with other tasks (not just
        paused), availability-first reshuffling is still the right behavior.
        """
        config = {
            "agents": {
                "codex": {"display_name": "Codex", "provider": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2"},
            }
        }
        task = {
            "id": "FIN-GOV-001",
            "status": "backlog",
            "owner": "Codex",
            "reviewer": "Codex2",
            "depends_on": [],
        }
        # Codex is NOT paused but has 2 active tasks already.
        state: dict = {"provider_pauses": {}}

        plan = supervisor.proactive_claim_plan_for_idle_agent(
            config,
            task=task,
            task_map={"FIN-GOV-001": task},
            idle_agent_name="Codex2",
            idle_agent_names=["Codex2"],
            # Codex carries higher-priority load already; Codex2 is idle.
            agent_loads={"Codex": [0, 1]},
            helper_settings={
                "enabled": True,
                "task_statuses": ["backlog", "todo", "in_progress", "review", "review_approved"],
                "availability_first": True,
                "allow_any_idle_lane": True,
                "prefer_assigned_when_idle": True,
                "require_assigned_agent_busy": True,
                "require_owner_higher_priority_load": False,
                "respect_explicit_owner_when_paused": True,
            },
            review_statuses={"review"},
            finalize_statuses={"review_approved"},
            dependency_done_statuses={"done"},
            state=state,
        )

        self.assertIsNotNone(
            plan,
            "When owner is busy (not paused), availability-first reshuffle is still valid.",
        )

    def test_helper_claim_settings_default_respects_paused_owner(self) -> None:
        """`respect_explicit_owner_when_paused` defaults to True.

        Default-true is the safer behavior — protects against the
        availability-first cascade documented in
        feedback_supervisor_ignores_explicit_owner.md. Operators can
        explicitly set False in config to restore the old behavior.
        """
        settings = supervisor.helper_claim_settings({})
        self.assertTrue(settings["respect_explicit_owner_when_paused"])

    def test_dispatch_paused_when_provider_auth_is_not_ready(self) -> None:
        config = {"agents": {"gemini2": {"display_name": "Gemini2", "provider": "gemini2"}}}
        provider_report = {"providers": {"gemini2": {"auth_ready": False}}}

        self.assertTrue(supervisor.is_agent_dispatch_paused(config, {}, "gemini2", provider_report=provider_report))

    def test_numbered_lane_does_not_inherit_primary_provider_pause(self) -> None:
        config = {
            "agents": {
                "claude": {"display_name": "Claude", "provider": "claude"},
                "claude2": {"display_name": "Claude2", "provider": "claude2"},
            }
        }
        state = {
            "provider_pauses": {
                "claude": {
                    "kind": "auth",
                    "scope": "lane",
                    "lane_id": "claude",
                    "schema": 3,
                    "reason": "Invalid authentication credentials",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            },
            "provider_pause_schema": 3,
        }
        provider_report = {
            "providers": {
                "claude": {"auth_ready": False},
                "claude2": {"auth_ready": True},
            }
        }

        self.assertTrue(supervisor.is_agent_dispatch_paused(config, state, "claude", provider_report=provider_report))
        self.assertFalse(supervisor.is_agent_dispatch_paused(config, state, "claude2", provider_report=provider_report))

    def test_numbered_lane_does_not_fallback_to_primary_provider_report(self) -> None:
        config = {"agents": {"claude2": {"display_name": "Claude2", "provider": "claude2"}}}
        provider_report = {"providers": {"claude": {"auth_ready": False}}}

        self.assertFalse(supervisor.is_agent_dispatch_paused(config, {}, "claude2", provider_report=provider_report))

    def test_auth_pause_does_not_expire_from_surface_auth_ready_probe(self) -> None:
        config = {"agents": {"claude": {"display_name": "Claude", "provider": "claude"}}}
        state = {
            "provider_pauses": {
                "claude": {
                    "kind": "auth",
                    "reason": "Invalid authentication credentials",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            },
        }
        provider_report = {"providers": {"claude": {"auth_ready": True}}}

        expired = supervisor.expire_provider_pauses(config, state, provider_report)

        self.assertEqual(expired, [])
        self.assertIn("claude", state["provider_pauses"])
        self.assertTrue(supervisor.is_agent_dispatch_paused(config, state, "claude", provider_report=provider_report))

    def test_identity_auth_pause_clears_after_real_probe_on_current_lane(self) -> None:
        config = {
            "agents": {
                "codex": {"display_name": "Codex", "provider": "codex", "adapter": "codex"},
                "codex2": {"display_name": "Codex2", "provider": "codex2", "adapter": "codex"},
            }
        }
        state = {
            "provider_pause_schema": 3,
            "provider_pauses": {
                "identity:codex:account-b": {
                    "kind": "auth",
                    "scope": "identity",
                    "lane_id": "codex",
                    "identity_fingerprint": "account-b",
                    "reason": "Refresh token was revoked",
                    "paused_at": "2026-08-09T00:00:00Z",
                    "resume_at": None,
                }
            },
        }
        provider_report = {
            "providers": {
                "codex": {"identity": {"fingerprint": "account-a"}},
                "codex2": {"identity": {"fingerprint": "account-b"}},
            }
        }

        with (
            mock.patch.object(
                supervisor, "_provider_auth_recovery_probe", return_value=(True, "inference_ok")
            ) as probe,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            expired = supervisor.expire_provider_pauses(config, state, provider_report)

        self.assertEqual(expired, ["identity:codex:account-b"])
        self.assertEqual(probe.call_args.args[1], "codex2")
        self.assertEqual(state["provider_pauses"], {})

    def test_stale_auth_pause_with_capacity_evidence_is_reclassified(self) -> None:
        config = {
            "agents": {"gemini": {"display_name": "Gemini", "provider": "gemini"}},
            "worker_retry": {"capacity_pause_seconds": 300},
        }
        state = {
            "provider_pause_schema": 3,
            "provider_pauses": {
                "gemini": {
                    "kind": "auth",
                    "scope": "lane",
                    "lane_id": "gemini",
                    "reason": "Eligibility check failed: RESOURCE_EXHAUSTED (code 429)",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            },
        }

        with mock.patch.object(supervisor, "write_activity_log"):
            expired = supervisor.expire_provider_pauses(config, state, {"providers": {}})

        pause = state["provider_pauses"]["gemini"]
        self.assertEqual(expired, [])
        self.assertEqual(pause["kind"], "capacity")
        self.assertEqual(pause["resume_at_source"], "reclassified_capacity")
        self.assertGreater(pause["resume_at"], datetime.now(timezone.utc).timestamp())

    def test_reason_hint_pause_probes_and_clears_after_reset_time(self) -> None:
        config = {"agents": {"codex2": {"display_name": "Codex2", "provider": "codex2"}}}
        state = {
            "provider_pauses": {
                "codex2": {
                    "kind": "quota",
                    "scope": "lane",
                    "lane_id": "codex2",
                    "schema": 3,
                    "reason": "The worker log ended with repeated usage limit errors and a retry time of Jan 1, 2020 12:58 AM.",
                    "paused_at": "2026-06-28T17:03:39Z",
                    "resume_at": None,
                }
            },
            "provider_pause_schema": 3,
        }
        provider_report = {"providers": {"codex2": {"auth_ready": True}}}
        fresh_report = {"providers": {"codex2": {"installed": True, "auth_ready": True}}}

        with mock.patch.object(supervisor, "_force_recovery_probe", return_value=fresh_report):
            expired = supervisor.expire_provider_pauses(config, state, provider_report)

        self.assertEqual(expired, ["codex2"])
        self.assertNotIn("codex2", state["provider_pauses"])

    def test_reason_hint_pause_stays_paused_until_probe_clears_it(self) -> None:
        config = {"agents": {"codex2": {"display_name": "Codex2", "provider": "codex2"}}}
        state: dict[str, object] = {}
        supervisor.pause_provider(
            state,
            "codex2",
            "The lane is rate-limited and resets Jul 1, 5pm (UTC).",
            kind="quota",
            reset_seconds=None,
        )

        entry = state["provider_pauses"]["codex2"]
        self.assertEqual(entry.get("resume_at_source"), "reason_hint")
        self.assertIsNotNone(entry.get("resume_at"))
        self.assertTrue(
            supervisor.is_agent_dispatch_paused(
                config,
                state,
                "codex2",
                provider_report={"providers": {"codex2": {"auth_ready": True}}},
            )
        )

    def _pause_entry(self, reason: str, *, kind: str, reset_seconds: int | None) -> dict:
        state: dict[str, object] = {}
        supervisor.pause_provider(
            state, "codex2", reason, kind=kind, reset_seconds=reset_seconds
        )
        return state["provider_pauses"]["codex2"]

    def test_reset_hint_later_than_caller_default_wins(self) -> None:
        # Quota pauses hardcode reset_seconds=14400, which used to discard the
        # provider's own reset time. The lane then woke 4h later, hit the same
        # quota error and re-paused, on repeat.
        before = datetime.now(timezone.utc).timestamp()
        entry = self._pause_entry(
            "You've hit your usage limit. Resets in 96h.",
            kind="quota",
            reset_seconds=14400,
        )

        self.assertEqual(entry.get("resume_at_source"), "reason_hint")
        self.assertGreaterEqual(entry["resume_at"], before + 96 * 3600 - 60)

    def test_reset_hint_shorter_than_caller_default_does_not_pull_wakeup_forward(
        self,
    ) -> None:
        before = datetime.now(timezone.utc).timestamp()
        entry = self._pause_entry(
            "429 Too Many Requests. Resets in 5m.",
            kind="capacity",
            reset_seconds=14400,
        )

        self.assertEqual(entry.get("resume_at_source"), "reset_seconds")
        self.assertGreaterEqual(entry["resume_at"], before + 14400 - 60)

    def test_pause_without_reset_hint_keeps_caller_reset_seconds(self) -> None:
        before = datetime.now(timezone.utc).timestamp()
        entry = self._pause_entry(
            "quota_exhausted: no reset time stated",
            kind="quota",
            reset_seconds=14400,
        )

        self.assertEqual(entry.get("resume_at_source"), "reset_seconds")
        self.assertGreaterEqual(entry["resume_at"], before + 14400 - 60)

    def test_auth_pause_ignores_reset_hint_and_stays_indefinite(self) -> None:
        entry = self._pause_entry(
            "invalid api key. Resets in 96h.", kind="auth", reset_seconds=None
        )

        self.assertIsNone(entry["resume_at"])
        self.assertNotIn("resume_at_source", entry)


class WorkerTreeGuardSettingsTests(unittest.TestCase):
    def test_defaults_off_with_canonical_blocking_globs(self) -> None:
        settings = worker_tree_guard.worker_tree_guard_settings({})
        self.assertFalse(settings["enabled"])
        self.assertFalse(settings["log_only"])
        # All fragile surfaces from branch-strategy.md §11.1.
        for needed in [
            ".orchestrator/control_plane/runtime/supervisor_runtime.py",
            ".orchestrator/control_plane/**",
            ".orchestrator/skills/**",
            ".orchestrator/templates/*",
            ".orchestrator/config*.json",
            ".orchestrator/branch_routing.py",
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
        settings = worker_tree_guard.worker_tree_guard_settings(config)
        self.assertTrue(settings["enabled"])
        self.assertEqual(settings["blocking_globs"], ["my-special-file.txt"])

    def test_empty_globs_list_falls_back_to_defaults(self) -> None:
        config = {"branch_strategy": {"worker_tree_guard": {"blocking_globs": []}}}
        settings = worker_tree_guard.worker_tree_guard_settings(config)
        self.assertIn(".orchestrator/control_plane/runtime/supervisor_runtime.py", settings["blocking_globs"])


class WorkerTreeGuardMatchingTests(unittest.TestCase):
    GLOBS = [
        ".orchestrator/control_plane/runtime/supervisor_runtime.py",
        ".orchestrator/skills/**",
        ".orchestrator/templates/*",
        ".orchestrator/config*.json",
        "docs/**",
        ".husky/**",
    ]

    def test_exact_file_matches(self) -> None:
        self.assertEqual(
            worker_tree_guard._worker_tree_guard_matches(".orchestrator/control_plane/runtime/supervisor_runtime.py", self.GLOBS),
            ".orchestrator/control_plane/runtime/supervisor_runtime.py",
        )

    def test_double_star_matches_direct_child(self) -> None:
        self.assertEqual(
            worker_tree_guard._worker_tree_guard_matches(".orchestrator/skills/task-closeout.md", self.GLOBS),
            ".orchestrator/skills/**",
        )

    def test_double_star_matches_nested_child(self) -> None:
        self.assertEqual(
            worker_tree_guard._worker_tree_guard_matches("docs/ops/branch-strategy.md", self.GLOBS),
            "docs/**",
        )

    def test_single_star_matches_one_level_only(self) -> None:
        self.assertEqual(
            worker_tree_guard._worker_tree_guard_matches(".orchestrator/templates/wakeup.txt", self.GLOBS),
            ".orchestrator/templates/*",
        )

    def test_runtime_state_files_do_not_match(self) -> None:
        for path in ["ai-status.json", "current-work.md", "docs-site/index.html"]:
            with self.subTest(path=path):
                # docs-site is outside the docs/** blocking pattern when
                # treated as a separate top-level directory.
                self.assertIsNone(
                    worker_tree_guard._worker_tree_guard_matches(path, self.GLOBS)
                )

    def test_unrelated_paths_do_not_match(self) -> None:
        self.assertIsNone(
            worker_tree_guard._worker_tree_guard_matches("apps/driver/src/index.tsx", self.GLOBS)
        )


class CheckWorkerTreeGuardTests(unittest.TestCase):
    def _enabled_config(self, log_only: bool = False) -> dict:
        return {
            "branch_strategy": {
                "worker_tree_guard": {
                    "enabled": True,
                    "log_only": log_only,
                    "blocking_globs": [
                        ".orchestrator/control_plane/runtime/supervisor_runtime.py",
                        ".orchestrator/skills/**",
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
        result = worker_tree_guard.check_worker_tree_guard({}, reason="owned_in_progress_dispatch")
        self.assertIsNone(result)

    def test_skip_reason_owned_finalize_dispatch_returns_none(self) -> None:
        with mock.patch.object(
            worker_tree_guard.subprocess, "run", return_value=self._porcelain([".orchestrator/control_plane/runtime/supervisor_runtime.py"])
        ):
            result = worker_tree_guard.check_worker_tree_guard(
                self._enabled_config(), reason="owned_finalize_dispatch"
            )
        self.assertIsNone(result)

    def test_dirty_fragile_surface_returns_block_payload(self) -> None:
        with mock.patch.object(
            worker_tree_guard.subprocess, "run", return_value=self._porcelain([".orchestrator/skills/foo.md"])
        ):
            result = worker_tree_guard.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNotNone(result)
        self.assertEqual(result["dirty_paths"], [".orchestrator/skills/foo.md"])
        self.assertIn(".orchestrator/skills/**", result["matched_globs"])
        self.assertFalse(result["log_only"])

    def test_dirty_only_runtime_state_returns_none(self) -> None:
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=self._porcelain(["ai-status.json", "current-work.md"]),
        ):
            result = worker_tree_guard.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNone(result)

    def test_log_only_mode_carries_flag_through(self) -> None:
        with mock.patch.object(
            worker_tree_guard.subprocess,
            "run",
            return_value=self._porcelain([".orchestrator/control_plane/runtime/supervisor_runtime.py"]),
        ):
            result = worker_tree_guard.check_worker_tree_guard(
                self._enabled_config(log_only=True), reason="owned_in_progress_dispatch"
            )
        self.assertIsNotNone(result)
        self.assertTrue(result["log_only"])

    def test_git_command_failure_fails_open(self) -> None:
        proc = mock.MagicMock()
        proc.returncode = 128
        proc.stdout = ""
        proc.stderr = "fatal: not a git repository"
        with mock.patch.object(worker_tree_guard.subprocess, "run", return_value=proc):
            result = worker_tree_guard.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNone(result, "guard must not block on its own diagnostic failure")

    def test_rename_porcelain_format_takes_new_path(self) -> None:
        proc = mock.MagicMock()
        proc.returncode = 0
        proc.stdout = "R  old/path.md -> .orchestrator/skills/renamed.md"
        proc.stderr = ""
        with mock.patch.object(worker_tree_guard.subprocess, "run", return_value=proc):
            result = worker_tree_guard.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNotNone(result)
        self.assertEqual(result["dirty_paths"], [".orchestrator/skills/renamed.md"])




class ReconcileStatusFromGitAsyncTests(unittest.TestCase):
    """Git reconciliation stays asynchronous but uses the canonical writer."""

    class FakeResult:
        def __init__(
            self,
            returncode: int = 0,
            stdout: str = "",
            stderr: str = "",
            payload: object | None = None,
        ) -> None:
            self.returncode = returncode
            self.stdout = stdout
            self.stderr = stderr
            self.payload = payload

        @property
        def ok(self) -> bool:
            return self.returncode == 0

        @property
        def error(self) -> str:
            return self.stderr or self.stdout or "unknown error"

    class FakeJob:
        def __init__(self, *, done: bool = False, result: object | None = None) -> None:
            self.completed = done
            self.value = result

        def done(self) -> bool:
            return self.completed

        def result(self) -> object:
            return self.value

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        root = pathlib.Path(self._tmp.name)
        (root / "scripts").mkdir()
        (root / "scripts" / "ai_status.py").write_text("# stub\n")
        (root / ".orchestrator").mkdir()
        (root / "ai-status.json").write_text("{}")
        self.config = {
            "paths": {
                "status_file": str(root / "ai-status.json"),
                "activity_log": str(root / "ai-activity-log.jsonl"),
            },
            "supervisor": {"git_reconcile_interval_seconds": 60},
        }
        # ensure the registry is empty across tests
        self._clear_reconcile_registry()

    def tearDown(self) -> None:
        self._clear_reconcile_registry()
        self._tmp.cleanup()

    def _clear_reconcile_registry(self) -> None:
        supervisor._RECONCILE_PROCS.clear()

    def test_first_call_starts_background_job_and_returns_false(self) -> None:
        state: dict = {}
        job = self.FakeJob()
        with mock.patch.object(supervisor, "_start_git_reconcile_job", return_value=job) as start:
            changed = supervisor.reconcile_status_from_git(self.config, state)
        self.assertFalse(changed)
        start.assert_called_once_with(self.config)
        self.assertIn("last_git_reconcile_at", state.get("supervisor", {}))
        self.assertEqual(len(supervisor._RECONCILE_PROCS), 1)

    def test_subsequent_call_while_in_flight_does_not_respawn(self) -> None:
        state: dict = {}
        job = self.FakeJob()
        with mock.patch.object(supervisor, "_start_git_reconcile_job", return_value=job) as start:
            supervisor.reconcile_status_from_git(self.config, state)
            changed = supervisor.reconcile_status_from_git(self.config, state)
        self.assertFalse(changed)
        self.assertEqual(start.call_count, 1, "must NOT re-start while in flight")

    def test_completion_applies_stdout_and_returns_true(self) -> None:
        state: dict = {}
        job = self.FakeJob()
        with mock.patch.object(supervisor, "_start_git_reconcile_job", return_value=job):
            supervisor.reconcile_status_from_git(self.config, state)
        job.completed = True
        job.value = self.FakeResult(
            payload=[{"task_id": "UI-X", "prior_status": "review", "sha": "abc123"}]
        )
        with mock.patch.object(supervisor, "write_activity_log") as log:
            changed = supervisor.reconcile_status_from_git(self.config, state)
        self.assertTrue(changed)
        self.assertEqual(len(supervisor._RECONCILE_PROCS), 0,
                         "registry must clear after applying completion")
        # Activity log invoked with the reconcile message
        calls = [c.args[1] for c in log.call_args_list]
        self.assertTrue(any(
            c.get("type") == "reconcile_status_from_git" and "UI-X" in c.get("message", "")
            for c in calls
        ))

    def test_throttle_blocks_spawn_within_interval(self) -> None:
        state = {"supervisor": {
            "last_git_reconcile_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }}
        with mock.patch.object(supervisor, "_start_git_reconcile_job") as start:
            changed = supervisor.reconcile_status_from_git(self.config, state)
        self.assertFalse(changed)
        start.assert_not_called()

    def test_completion_with_failed_command_logs_failure_and_returns_false(self) -> None:
        state: dict = {}
        job = self.FakeJob()
        with mock.patch.object(supervisor, "_start_git_reconcile_job", return_value=job):
            supervisor.reconcile_status_from_git(self.config, state)
        job.completed = True
        job.value = self.FakeResult(returncode=2, stderr="boom: missing remote\n")
        with mock.patch.object(supervisor, "write_activity_log") as log:
            changed = supervisor.reconcile_status_from_git(self.config, state)
        self.assertFalse(changed)
        types = [c.args[1].get("type") for c in log.call_args_list]
        self.assertIn("reconcile_status_from_git_failed", types)




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
    def test_terminate_worker_pid_stops_the_entire_process_group(self) -> None:
        process = subprocess.Popen(
            ["sh", "-c", "sleep 30 & wait"],
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(lambda: process.poll() is None and supervisor.terminate_worker_pid(process.pid))

        self.assertTrue(supervisor.terminate_worker_pid(process.pid))
        process.wait(timeout=2)
        self.assertFalse(supervisor.process_group_is_alive(process.pid))

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
            "provider_pause_schema": 3,
            "provider_pauses": {"claude2": {"kind": "auth", "scope": "lane", "lane_id": "claude2", "schema": 3, "resume_at": None, "paused_at": supervisor.utc_now()}},
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

    Root cause: the unblock generator's recursion guard checked only
    `task_is_sidecar(parent)`, but auto-generated unblock/repair tasks carry
    `task_class="unblock"`, so they slipped past and triaged into ever-deeper
    repair-of-the-repair tasks. The fix keys the base case on
    `is_governance_artifact` + a lineage-depth cap, and escalates to a human
    instead of digging deeper.
    """

    def test_is_governance_artifact_detects_each_marker(self) -> None:
        self.assertTrue(supervisor.is_governance_artifact({"task_class": "unblock"}))
        self.assertTrue(supervisor.is_governance_artifact({"task_class": "sidecar"}))
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


class ReviewOverflowTests(unittest.TestCase):
    def test_review_overflow_claims_for_preferred_idle_reviewer_only(self) -> None:
        config = {
            "ready_dispatcher": {
                "review_overflow": {
                    "enabled": True,
                    "preferred_lanes": ["gemini", "gemini2", "codex", "codex2", "claude"],
                }
            },
            "agents": {
                "claude": {"display_name": "Claude", "provider": "claude"},
                "gemini": {"display_name": "Gemini", "provider": "gemini"},
                "gemini2": {"display_name": "Gemini2", "provider": "gemini2"},
            },
        }
        base = {
            "enabled": True,
            "availability_first": False,
            "allow_any_idle_lane": False,
            "require_owner_higher_priority_load": True,
        }
        settings = supervisor.helper_claim_settings_for_task(config, base, "review", {"review"})
        task = {"id": "REV-1", "status": "review", "owner": "Gemini2", "reviewer": "Claude"}

        with mock.patch.object(supervisor, "load_provider_report", return_value={}):
            plan = supervisor.proactive_claim_plan_for_idle_agent(
                config,
                task=task,
                task_map={"REV-1": task},
                idle_agent_name="Gemini",
                idle_agent_names=["Gemini", "Gemini2"],
                agent_loads={"Claude": [0], "Gemini": [], "Gemini2": []},
                helper_settings=settings,
                review_statuses={"review"},
                finalize_statuses={"review_approved"},
                dependency_done_statuses={"done"},
                state={},
            )

        self.assertEqual(plan["new_owner"], "Gemini2")
        self.assertEqual(plan["new_reviewer"], "Gemini")

    def test_review_overflow_does_not_change_owner_task_policy(self) -> None:
        config = {"ready_dispatcher": {"review_overflow": {"enabled": True}}}
        base = {"availability_first": False, "require_owner_higher_priority_load": True}

        self.assertIs(
            supervisor.helper_claim_settings_for_task(config, base, "todo", {"review"}),
            base,
        )

    def test_dispatcher_overflows_two_reviews_to_two_gemini_slots(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "review_statuses": ["review"],
                "active_worker_statuses": ["running"],
                "max_dispatches_per_tick": 3,
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"claude": 1, "gemini": 2, "gemini2": 2},
                "lane_priority": ["gemini", "gemini2", "claude"],
                "helper_claim": {
                    "enabled": True,
                    "availability_first": False,
                    "allow_any_idle_lane": False,
                    "require_owner_higher_priority_load": True,
                },
                "review_overflow": {
                    "enabled": True,
                    "preferred_lanes": ["gemini", "gemini2", "claude"],
                },
            },
            "agents": {
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
                "gemini": {"id": "gemini", "display_name": "Gemini", "provider": "gemini"},
                "gemini2": {"id": "gemini2", "display_name": "Gemini2", "provider": "gemini2"},
            },
            "providers": {},
        }
        status = {
            "tasks": [
                {"id": "REV-ACTIVE", "status": "review", "owner": "Gemini", "reviewer": "Claude"},
                {"id": "REV-ONE", "status": "review", "owner": "Gemini2", "reviewer": "Claude"},
                {"id": "REV-TWO", "status": "review", "owner": "Codex", "reviewer": "Claude"},
            ]
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "claude-active": {
                    "run_id": "claude-active",
                    "task_id": "REV-ACTIVE",
                    "agent_id": "claude",
                    "provider": "claude",
                    "status": "running",
                    "request_snapshot": {"reason": "review_ready_dispatch"},
                }
            },
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as enqueue,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            changed = supervisor.dispatch_ready_tasks(config, state, provider_report={})

        self.assertTrue(changed)
        self.assertEqual(persist.call_count, 2)
        self.assertEqual(enqueue.call_count, 2)
        self.assertEqual(
            {call.kwargs["new_reviewer"] for call in persist.call_args_list},
            {"Gemini"},
        )
        self.assertEqual(
            {call.kwargs["new_owner"] for call in persist.call_args_list},
            {"Gemini2", "Codex"},
        )


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
                    "task_statuses": ["in_progress", "review", "review_approved", "todo"],
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
                "task_statuses": ["in_progress", "review", "review_approved", "todo"],
                "availability_first": True,
                "allow_any_idle_lane": True,
                "require_assigned_agent_busy": True,
            },
            review_statuses={"review"},
            finalize_statuses={"review_approved"},
            dependency_done_statuses={"done"},
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

    def test_provisioned_symlinks_are_ignored_by_git(self):
        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(root, ignore_errors=True))
        _git(root, "init")
        (root / ".gitignore").write_text("node_modules\n", encoding="utf-8")
        (root / "node_modules").mkdir()
        (root / "apps" / "foo" / "node_modules").mkdir(parents=True)
        destination = root / "worker"
        (destination / "apps" / "foo").mkdir(parents=True)

        supervisor._provision_worktree_node_modules(root, destination)

        for relative_path in ("node_modules", "apps/foo/node_modules"):
            result = subprocess.run(
                ["git", "check-ignore", "-q", relative_path],
                cwd=destination,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)


class CanonicalEvidencePathTests(unittest.TestCase):
    def test_worker_evidence_uses_canonical_state_root(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            state_path = root / ".orchestrator" / "state.json"
            state_path.parent.mkdir(parents=True)
            state_path.write_text("{}", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(root / "ai-status.json"),
                    "state_file": str(state_path),
                }
            }

            evidence_ref = supervisor.record_worker_evidence(
                config,
                {"run_id": "run-1", "task_id": "TASK-1", "provider": "codex"},
                "Worker exited before the task reached a terminal status.",
            )

            path = root / ".orchestrator" / "evidence" / "run-1.json"
            self.assertEqual(evidence_ref, ".orchestrator/evidence/run-1.json")
            self.assertTrue(path.exists())


class WorkerLogCursorTests(unittest.TestCase):
    def test_reads_only_new_log_bytes_after_initial_scan(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            log_path = Path(tmpdir) / "worker.log"
            log_path.write_text('{"session_id":"session-1"}\n', encoding="utf-8")
            worker = {"log_path": str(log_path)}

            supervisor.update_from_log({}, worker)

            first_offset = worker["log_offset"]
            self.assertEqual(worker["session_id"], "session-1")
            log_path.write_text(
                log_path.read_text(encoding="utf-8") + "https://github.com/acme/project/pull/42\n",
                encoding="utf-8",
            )
            supervisor.update_from_log({}, worker)

            self.assertGreater(worker["log_offset"], first_offset)
            self.assertEqual(worker["pr_url"], "https://github.com/acme/project/pull/42")


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

    def test_dispatch_defers_when_both_rotation_pools_are_cooling(self) -> None:
        supervisor.record_rotation_cooldown(self.config, "gemini", "gemini", 200.0)
        supervisor.record_rotation_cooldown(self.config, "gemini", "claude", 150.0)

        cooldown = supervisor.antigravity_dispatch_cooldown(self.config, "gemini", now=100.0)

        self.assertIsNotNone(cooldown)
        assert cooldown is not None
        self.assertEqual(cooldown[0], 150.0)
        self.assertIn("queue delivery deferred", cooldown[1])

    def test_queue_does_not_retry_a_paused_target_lane(self) -> None:
        state: dict = {}
        supervisor.pause_provider(state, "gemini", "cooling", kind="capacity", reset_seconds=900)
        event = {
            "event_id": "evt-paused",
            "target_agent": "Gemini",
            "message": "review task",
            "task_id": "T-1",
        }
        with mock.patch.object(supervisor, "load_event_queue", return_value=[event]), \
             mock.patch.object(supervisor, "load_status", return_value={"tasks": []}), \
             mock.patch.object(supervisor, "start_worker_for_request") as start:
            changed = supervisor.process_queue(self.config, state, {"providers": {}})

        self.assertTrue(changed)
        self.assertEqual(supervisor.queue_status(state, "evt-paused")["status"], "pending")
        start.assert_not_called()

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


class IdentityScopedPauseTests(unittest.TestCase):
    def test_antigravity_quota_probe_clears_pause_before_reset_hint(self) -> None:
        config = {"agents": {"gemini": {"provider": "gemini", "adapter": "antigravity"}}, "providers": {"gemini": {"antigravity": {"cli": "agy"}}}, "supervisor": {"provider_quota_recovery_probe_cooldown_seconds": 1}}
        state = {"provider_pause_schema": 3, "provider_pauses": {"gemini": {"kind": "quota", "scope": "lane", "lane_id": "gemini", "schema": 3, "reason": "quota", "resume_at": 9999999999, "resume_at_source": "reason_hint"}}}
        with mock.patch.object(supervisor, "_antigravity_quota_recovery_probe", return_value=(True, "inference_ok")), mock.patch.object(supervisor, "write_activity_log"):
            self.assertEqual(supervisor.expire_provider_pauses(config, state, {"providers": {}}), ["gemini"])
        self.assertEqual(state["provider_pauses"], {})
    def test_shared_quota_pool_pauses_both_lanes(self) -> None:
        identity = {"fingerprint": "same", "quota_pool": "codex:same:terra"}
        report = {
            "providers": {
                "codex": {"auth_ready": True, "identity": identity},
                "codex2": {"auth_ready": True, "identity": identity},
            }
        }
        config = {
            "agents": {
                "codex": {"provider": "codex"},
                "codex2": {"provider": "codex2"},
            }
        }
        state: dict[str, object] = {}
        supervisor.pause_provider(state, "codex", "quota exhausted", kind="quota", reset_seconds=60, identity=identity)
        self.assertTrue(supervisor.is_agent_dispatch_paused(config, state, "codex2", provider_report=report))

    def test_new_identity_does_not_inherit_old_quota_pause(self) -> None:
        old = {"fingerprint": "old", "quota_pool": "codex:old:terra"}
        new = {"fingerprint": "new", "quota_pool": "codex:new:terra"}
        config = {"agents": {"codex": {"provider": "codex"}}}
        state: dict[str, object] = {}
        supervisor.pause_provider(state, "codex", "quota exhausted", kind="quota", reset_seconds=60, identity=old)
        self.assertFalse(
            supervisor.is_agent_dispatch_paused(
                config, state, "codex", provider_report={"providers": {"codex": {"auth_ready": True, "identity": new}}}
            )
        )

    def test_suspended_approval_does_not_consume_execution_capacity(self) -> None:
        state = {"workers": {"one": {"agent_id": "claude", "status": "suspended_approval"}}}
        self.assertEqual(supervisor.active_worker_agent_counts(state, {"suspended_approval"}), {})


class CompletedIntegrationEvidenceRecoveryTests(unittest.TestCase):
    def test_reopens_aged_unreachable_completed_integration(self) -> None:
        task = {
            "id": "STALE-MERGE-001",
            "status": "done",
            "task_class": "implementation",
            "integration_status": "merged_to_dev",
            "merge_commit": "deadbeef",
            "integration_recorded_at": "2020-01-01T00:00:00Z",
        }
        dependent = {"id": "WAITING-001", "status": "todo", "depends_on": [task["id"]]}
        config = {
            "supervisor": {"integration_evidence_recovery_grace_seconds": 60},
            "paths": {"status_file": "/tmp/ai-status.json"},
        }
        result = supervisor.TaskBoardCommandResult(0)

        with (
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [task, dependent]}),
            mock.patch.object(supervisor, "integration_evidence_for_tasks", return_value={task["id"]: False}),
            mock.patch.object(supervisor, "execute_task_board_command", return_value=result) as command,
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            self.assertTrue(supervisor.reconcile_invalid_completed_integrations(config, {}))

        self.assertEqual(command.call_args.args[1], "reconcile-integration")
        self.assertEqual(command.call_args.args[2][0], task["id"])
        self.assertEqual(
            command.call_args.kwargs["environ"],
            {
                "AI_STATUS_RECONCILER": "integration_evidence",
                "INTEGRATION_STATUS": "evidence_invalid",
            },
        )

    def test_keeps_recent_completed_integration_for_git_refresh_grace(self) -> None:
        task = {
            "id": "RECENT-MERGE-001",
            "status": "done",
            "task_class": "implementation",
            "integration_status": "merged_to_dev",
            "merge_commit": "deadbeef",
            "integration_recorded_at": supervisor.utc_now(),
        }
        dependent = {"id": "WAITING-001", "status": "todo", "depends_on": [task["id"]]}
        config = {
            "supervisor": {"integration_evidence_recovery_grace_seconds": 60},
            "paths": {"status_file": "/tmp/ai-status.json"},
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [task, dependent]}),
            mock.patch.object(supervisor, "integration_evidence_for_tasks", return_value={task["id"]: False}),
            mock.patch.object(supervisor, "execute_task_board_command") as command,
        ):
            self.assertFalse(supervisor.reconcile_invalid_completed_integrations(config, {}))

        command.assert_not_called()

    def test_keeps_unrelated_historical_completed_integration_closed(self) -> None:
        task = {
            "id": "HISTORICAL-MERGE-001",
            "status": "done",
            "task_class": "implementation",
            "integration_status": "merged_to_dev",
            "merge_commit": "deadbeef",
            "integration_recorded_at": "2020-01-01T00:00:00Z",
        }
        config = {
            "supervisor": {"integration_evidence_recovery_grace_seconds": 60},
            "paths": {"status_file": "/tmp/ai-status.json"},
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [task]}),
            mock.patch.object(supervisor, "integration_evidence_for_tasks", return_value={task["id"]: False}),
            mock.patch.object(supervisor, "execute_task_board_command") as command,
        ):
            self.assertFalse(supervisor.reconcile_invalid_completed_integrations(config, {}))

        command.assert_not_called()

    def test_chair_dispatch_uses_the_shared_domain_decision(self) -> None:
        decision = supervisor.DomainDispatchDecision(
            "TASK-001", "Codex", supervisor.DomainDispatchReason.OWNED_READY
        )
        with mock.patch.object(supervisor, "resolve_current_dispatch_target", return_value=decision) as resolve:
            result = supervisor.chair_dispatch_action_reason(
                {"ready_dispatcher": {}}, {"id": "TASK-001"}, {}
            )

        self.assertEqual(result, ("Codex", "owned_ready_dispatch"))
        resolve.assert_called_once()
