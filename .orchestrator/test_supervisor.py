#!/usr/bin/env python3
from __future__ import annotations

import json
import signal
import subprocess
import tempfile
import pathlib
from datetime import datetime, timezone
import unittest
import os
from pathlib import Path
from unittest import mock

import supervisor


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
        self.assertEqual(
            state["dispatch_pauses"],
            [
                {
                    "provider": "gemini",
                    "task_id": None,
                    "worker_run_id": "gemini-quota",
                    "failure_kind": "quota/terminal",
                    "summary": "quota/terminal: reason: 'QUOTA_EXHAUSTED'",
                    "paused_at": "2026-05-17T13:51:45Z",
                }
            ],
        )

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
        request = object()
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
            "quota_paused_agents": {
                "codex": {
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
            mock.patch.object(supervisor, "dispatch_underutilization_sidecars", return_value=False),
            mock.patch.object(supervisor, "dispatch_underutilization_main_tasks", return_value=False) as main_backfill,
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
        main_backfill.assert_called_once()

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
            mock.patch.object(supervisor, "dispatch_underutilization_sidecars", return_value=False),
            mock.patch.object(supervisor, "dispatch_underutilization_main_tasks", return_value=False) as main_backfill,
            mock.patch.object(supervisor, "process_queue", return_value=False),
            mock.patch.object(supervisor, "sync_github_bus", return_value=False),
            mock.patch.object(supervisor, "trim_worker_history"),
            mock.patch.object(supervisor, "trim_seen_events"),
            mock.patch.object(supervisor, "save_runtime_state"),
        ):
            supervisor.run_once(config, watch=False, replay=False, once=True, manage_pid_file=False)

        write_pid.assert_not_called()
        main_backfill.assert_called_once()

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
    def _config(self, root: Path, *, interval: float | None = None) -> dict[str, object]:
        supervisor_cfg: dict[str, object] = {}
        if interval is not None:
            supervisor_cfg["git_reconcile_interval_seconds"] = interval
        config: dict[str, object] = {
            "paths": {"status_file": str(root / "ai-status.json")},
            "supervisor": supervisor_cfg,
        }
        return config

    def test_first_call_runs_and_stamps_timestamp(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "ai-status.json").write_text("{}", encoding="utf-8")
            (root / "scripts").mkdir()
            script = root / "scripts" / "ai_status.py"
            script.write_text("# placeholder\n", encoding="utf-8")
            config = self._config(root)
            state: dict[str, object] = {"supervisor": {}}
            fake_result = subprocess.CompletedProcess(args=[], returncode=0, stdout="reconcile-from-git: no drift found against origin/dev\n", stderr="")
            with mock.patch.object(supervisor.subprocess, "run", return_value=fake_result) as run_mock:
                ran = supervisor.reconcile_status_from_git(config, state)
            self.assertTrue(ran)
            run_mock.assert_called_once()
            self.assertIn("last_git_reconcile_at", state["supervisor"])  # type: ignore[index]

    def test_second_call_within_window_skips_subprocess(self) -> None:
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
            with mock.patch.object(supervisor.subprocess, "run") as run_mock:
                ran = supervisor.reconcile_status_from_git(config, state)
            self.assertFalse(ran)
            run_mock.assert_not_called()

    def test_second_call_after_window_runs_subprocess(self) -> None:
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
            fake_result = subprocess.CompletedProcess(args=[], returncode=0, stdout="reconcile-from-git: no drift found against origin/dev\n", stderr="")
            with mock.patch.object(supervisor.subprocess, "run", return_value=fake_result) as run_mock:
                ran = supervisor.reconcile_status_from_git(config, state)
            self.assertTrue(ran)
            run_mock.assert_called_once()

    def test_skips_when_status_file_path_missing(self) -> None:
        # OPS-STATE-RECONCILE-002 guard: don't raise KeyError when config
        # omits paths.status_file (e.g. minimal test config).
        config: dict[str, object] = {"paths": {}, "supervisor": {}}
        state: dict[str, object] = {"supervisor": {}}
        with mock.patch.object(supervisor.subprocess, "run") as run_mock:
            ran = supervisor.reconcile_status_from_git(config, state)
        self.assertFalse(ran)
        run_mock.assert_not_called()


class UnderutilizationSidecarDispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)
        (self.root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
        (self.root / "sidecar_catalog.json").write_text('{"templates": []}\n', encoding="utf-8")
        (self.root / "activity-log.jsonl").write_text("", encoding="utf-8")
        (self.root / "event-queue.jsonl").write_text("", encoding="utf-8")
        self.config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "paths": {
                "status_file": str(self.root / "ai-status.json"),
                "sidecar_catalog": str(self.root / "sidecar_catalog.json"),
                "activity_log": str(self.root / "activity-log.jsonl"),
                "event_queue": str(self.root / "event-queue.jsonl"),
            },
            "ready_dispatcher": {
                "active_worker_statuses": [
                    "running",
                    "started",
                    "waiting_approval",
                    "manual_pending",
                    "retry_backoff",
                    "suspended_approval",
                    "stalled",
                    "fallback",
                ],
                "dependency_done_statuses": ["done"],
            },
            "underutilization_dispatch": {
                "enabled": True,
                "threshold_ratio": 0.5,
                "continuous_window_seconds": 900,
                "cooldown_seconds": 900,
                "max_new_sidecars_per_wave": 2,
                "max_active_sidecars_per_agent": 1,
                "productive_worker_statuses": ["running", "waiting_approval", "suspended_approval", "retry_backoff"],
            },
            "agents": {
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
                "gemini": {"id": "gemini", "display_name": "Gemini", "provider": "gemini"},
                "qwen": {"id": "qwen", "display_name": "Qwen", "provider": "qwen"},
            },
        }

    def test_waits_full_window_before_creating_sidecars(self) -> None:
        state = {"queue": {"events": {}}, "workers": {}, "underutilization": {}}

        with (
            mock.patch.object(supervisor, "create_sidecar_task", side_effect=AssertionError("should not create before the window")),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.dispatch_underutilization_sidecars(self.config, state)

        self.assertTrue(changed)
        self.assertIsNotNone(state["underutilization"]["below_threshold_since"])
        self.assertIsNone(state["underutilization"].get("last_sidecar_wave_at"))
        write_activity_log.assert_not_called()

    def test_creates_visible_sidecar_after_continuous_low_utilization_window(self) -> None:
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "TEL-001",
                    "agent_id": "codex",
                    "provider": "codex",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_in_progress_dispatch"},
                }
            },
            "underutilization": {
                "below_threshold_since": "2026-04-10T00:00:00Z",
                "last_sidecar_wave_at": None,
                "last_sidecar_wave_reason": None,
            },
        }
        parent_task = {
            "id": "APP-001",
            "phase": "Phase 5: Persona and Application Surfaces",
            "status": "todo",
            "owner": "Claude",
            "reviewer": "Codex",
            "depends_on": [],
            "title": "Define BFF query surfaces",
            "summary_zh": "整理 operator console 與 workbench 的 BFF query contract。",
            "artifacts": ["services/control-plane/bff/"],
            "last_update": "2026-04-10T00:05:00Z",
        }
        created_sidecar = {
            "id": "APP-001-SIDECAR-BFF-HANDOFF",
            "phase": "Phase 5: Persona and Application Surfaces",
            "status": "todo",
            # preferred_agents_for_sidecar('bff_handoff_packet') no longer
            # includes Qwen (Qwen was retired from the active agent roster);
            # Gemini is the next preferred idle agent in this test's state.
            "owner": "Gemini",
            "reviewer": "Claude",
            "depends_on": [],
            "title": "Prepare APP-001 BFF and frontend handoff packet",
            "summary_zh": "平行支援 APP-001，先整理 BFF query gap、operator journey 與前端 handoff materials，不改 canonical truth。",
            "artifacts": ["support/sidecars/APP-001/APP-001-SIDECAR-BFF-HANDOFF.md"],
            "task_class": "sidecar",
            "auto_generated": True,
            "helper_parent": "APP-001",
            "helper_kind": "bff_handoff_packet",
            "mutates_canonical": False,
            "auto_created_by": "supervisor-underutilization",
            "last_update": "2026-04-10T00:16:05Z",
        }
        status_before = {"tasks": [parent_task]}
        status_after = {"tasks": [parent_task, created_sidecar]}

        with (
            mock.patch.object(supervisor, "load_status", side_effect=[status_before, status_after]),
            mock.patch.object(supervisor, "load_sidecar_catalog", return_value=[]),
            mock.patch.object(supervisor, "create_sidecar_task", return_value=(True, "")) as create_sidecar_task,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            mock.patch.object(supervisor, "utc_now", return_value="2026-04-10T00:16:05Z"),
        ):
            changed = supervisor.dispatch_underutilization_sidecars(self.config, state)

        self.assertTrue(changed)
        create_sidecar_task.assert_called_once()
        kwargs = create_sidecar_task.call_args.kwargs
        self.assertEqual(kwargs["sidecar_id"], "APP-001-SIDECAR-BFF-HANDOFF")
        self.assertEqual(kwargs["owner"], "Gemini")
        self.assertEqual(kwargs["reviewer"], "Claude")
        self.assertEqual(kwargs["helper_parent"], "APP-001")
        self.assertEqual(kwargs["helper_kind"], "bff_handoff_packet")
        self.assertFalse(kwargs["mutates_canonical"])
        queue_delivery_event.assert_called_once()
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "APP-001-SIDECAR-BFF-HANDOFF")
        self.assertEqual(queued_event["target_agent"], "Gemini")
        self.assertEqual(queued_event["task"]["task_class"], "sidecar")
        self.assertEqual(state["underutilization"]["last_sidecar_wave_at"], "2026-04-10T00:16:05Z")
        self.assertIn("created 1 visible sidecar", state["underutilization"]["last_sidecar_wave_reason"])
        self.assertIn("APP-001-SIDECAR-BFF-HANDOFF", state.get("tasks", {}))
        activity_types = [call.args[1]["type"] for call in write_activity_log.call_args_list]
        self.assertIn("sidecar_task_created", activity_types)
        self.assertIn("sidecar_wave_started", activity_types)

    def test_resets_underutilization_timer_when_utilization_recovers(self) -> None:
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-1": {"run_id": "run-1", "task_id": "REG-004", "agent_id": "codex", "provider": "codex", "status": "running"},
                "run-2": {"run_id": "run-2", "task_id": "OSS-001", "agent_id": "gemini", "provider": "gemini", "status": "running"},
            },
            "underutilization": {
                "below_threshold_since": "2026-04-10T00:00:00Z",
                "last_sidecar_wave_at": None,
                "last_sidecar_wave_reason": None,
            },
        }

        changed = supervisor.dispatch_underutilization_sidecars(self.config, state)

        self.assertTrue(changed)
        self.assertIsNone(state["underutilization"]["below_threshold_since"])

    def test_cooldown_prevents_duplicate_sidecar_wave(self) -> None:
        state = {
            "queue": {"events": {}},
            "workers": {},
            "underutilization": {
                "below_threshold_since": "2026-04-10T00:00:00Z",
                "last_sidecar_wave_at": "2026-04-10T00:10:00Z",
                "last_sidecar_wave_reason": "already created a wave recently",
            },
        }

        with (
            mock.patch.object(supervisor, "create_sidecar_task", side_effect=AssertionError("cooldown should prevent new sidecars")),
            mock.patch.object(supervisor, "utc_now", return_value="2026-04-10T00:20:00Z"),
        ):
            changed = supervisor.dispatch_underutilization_sidecars(self.config, state)

        self.assertFalse(changed)
        self.assertEqual(state["underutilization"]["last_sidecar_wave_reason"], "already created a wave recently")

    def test_skips_duplicate_signature_when_matching_sidecar_already_exists(self) -> None:
        state = {
            "queue": {"events": {}},
            "workers": {},
            "underutilization": {
                "below_threshold_since": "2026-04-10T00:00:00Z",
                "last_sidecar_wave_at": None,
                "last_sidecar_wave_reason": None,
            },
        }
        parent_task = {
            "id": "APP-001",
            "phase": "Phase 5: Persona and Application Surfaces",
            "status": "todo",
            "owner": "Claude",
            "reviewer": "Codex",
            "depends_on": [],
            "title": "Define BFF query surfaces",
            "summary_zh": "整理 operator console 與 workbench 的 BFF query contract。",
            "artifacts": ["services/control-plane/bff/"],
            "last_update": "2026-04-10T00:05:00Z",
        }
        existing_sidecar = {
            "id": "APP-001-SIDECAR-BFF-HANDOFF",
            "phase": "Phase 5: Persona and Application Surfaces",
            "status": "done",
            "owner": "Qwen",
            "reviewer": "Claude",
            "depends_on": [],
            "title": "Prepare APP-001 BFF and frontend handoff packet",
            "summary_zh": "已完成支援包。",
            "artifacts": ["support/sidecars/APP-001/APP-001-SIDECAR-BFF-HANDOFF.md"],
            "task_class": "sidecar",
            "auto_generated": True,
            "helper_parent": "APP-001",
            "helper_kind": "bff_handoff_packet",
            "mutates_canonical": False,
            "auto_created_by": "supervisor-underutilization",
            "last_update": "2026-04-10T00:07:00Z",
        }
        status = {"tasks": [parent_task, existing_sidecar]}

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_sidecar_catalog", return_value=[]),
            mock.patch.object(supervisor, "create_sidecar_task", side_effect=AssertionError("duplicate signature should not create another sidecar")),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
            mock.patch.object(supervisor, "utc_now", return_value="2026-04-10T00:16:05Z"),
        ):
            changed = supervisor.dispatch_underutilization_sidecars(self.config, state)

        self.assertTrue(changed)
        self.assertEqual(
            state["underutilization"]["last_sidecar_wave_reason"],
            "underutilized but no sidecar candidates matched the catalog or dynamic fallback",
        )
        activity_types = [call.args[1]["type"] for call in write_activity_log.call_args_list]
        self.assertEqual(activity_types, ["sidecar_wave_skipped"])


class UnderutilizationMainTaskDispatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        self.root = Path(self.tmpdir.name)
        (self.root / "ai-status.json").write_text('{"tasks": []}\n', encoding="utf-8")
        (self.root / "activity-log.jsonl").write_text("", encoding="utf-8")
        (self.root / "event-queue.jsonl").write_text("", encoding="utf-8")
        self.config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "paths": {
                "status_file": str(self.root / "ai-status.json"),
                "activity_log": str(self.root / "activity-log.jsonl"),
                "event_queue": str(self.root / "event-queue.jsonl"),
            },
            "ready_dispatcher": {
                "active_worker_statuses": [
                    "running",
                    "started",
                    "waiting_approval",
                    "manual_pending",
                    "retry_backoff",
                    "suspended_approval",
                    "stalled",
                    "fallback",
                ],
                "dependency_done_statuses": ["done"],
                "helper_claim": {
                    "enabled": True,
                    "task_statuses": ["todo", "in_progress", "review", "review_approved"],
                    "availability_first": True,
                    "allow_any_idle_lane": True,
                    "require_assigned_agent_busy": True,
                },
            },
            "underutilization_dispatch": {
                "enabled": True,
                "threshold_ratio": 0.5,
                "continuous_window_seconds": 900,
                "cooldown_seconds": 900,
                "max_new_main_tasks_per_wave": 2,
                "productive_worker_statuses": ["running", "waiting_approval", "suspended_approval", "retry_backoff"],
            },
            "agents": {
                "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
                "qwen": {"id": "qwen", "display_name": "Qwen", "provider": "qwen"},
            },
        }

    def test_backfills_main_review_task_to_idle_lane(self) -> None:
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-1": {
                    "run_id": "run-1",
                    "task_id": "BUSY-REVIEW",
                    "agent_id": "codex",
                    "provider": "codex",
                    "status": "running",
                    "request_snapshot": {"reason": "review_ready_dispatch"},
                }
            },
            "underutilization": {
                "below_threshold_since": "2026-04-10T00:00:00Z",
                "last_main_task_wave_at": None,
            },
        }
        status = {
            "tasks": [
                {"id": "BUSY-REVIEW", "status": "review", "owner": "Claude", "reviewer": "Codex", "depends_on": []},
                {"id": "MAIN-101", "status": "review", "owner": "Claude", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_event_queue", return_value=[]),
            mock.patch.object(supervisor, "persist_task_reassignment", return_value=True) as persist,
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_delivery_event,
            mock.patch.object(supervisor, "write_activity_log"),
            mock.patch.object(supervisor, "utc_now", return_value="2026-04-10T00:16:05Z"),
        ):
            changed = supervisor.dispatch_underutilization_main_tasks(self.config, state)

        self.assertTrue(changed)
        kwargs = persist.call_args.kwargs
        self.assertEqual(kwargs["task_id"], "MAIN-101")
        self.assertEqual(kwargs["new_owner"], "Claude")
        self.assertEqual(kwargs["new_reviewer"], "Qwen")
        queued_event = queue_delivery_event.call_args.args[1]
        self.assertEqual(queued_event["task_id"], "MAIN-101")
        self.assertEqual(queued_event["target_agent"], "Qwen")
        self.assertEqual(queued_event["reason"], "review_ready_dispatch")


class PollWorkersRecoveryTests(unittest.TestCase):
    def test_lower_priority_worker_is_superseded_when_finalize_backlog_exists(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "active_worker_statuses": ["running", "started", "waiting_approval", "manual_pending", "retry_backoff", "suspended_approval", "stalled", "fallback"],
                "finalize_statuses": ["review_approved"],
                "dependency_done_statuses": ["done"],
            },
            "providers": {},
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot"},
                "codex": {"id": "codex", "display_name": "Codex"},
                "claude": {"id": "claude", "display_name": "Claude"},
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
                    "status": "running",
                    "queue_event_id": "evt-1",
                    "pid": 12345,
                    "last_event_at": "2999-01-01T00:00:00Z",
                    "request_snapshot": {"reason": "owned_ready_dispatch"},
                }
            },
        }
        status = {
            "tasks": [
                {"id": "FB-003", "status": "todo", "owner": "Copilot", "reviewer": "Codex", "depends_on": []},
                {"id": "EX-001", "status": "review_approved", "owner": "Copilot", "reviewer": "Claude", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "terminate_worker_pid") as terminate_worker_pid,
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "write_activity_log") as write_activity_log,
        ):
            changed = supervisor.poll_workers(config, state)

        self.assertTrue(changed)
        worker = state["workers"]["run-1"]
        self.assertEqual(worker["status"], "superseded")
        self.assertIn("prioritize higher-priority review/finalize work", worker["last_error"])
        self.assertEqual(state["queue"]["events"]["evt-1"]["status"], "completed")
        terminate_worker_pid.assert_called_once_with(12345)
        self.assertEqual(write_activity_log.call_args.args[1]["type"], "worker_superseded")

    def test_lower_priority_worker_kept_when_lane_capacity_available(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "supervisor": {"stall_after_seconds": 300},
            "ready_dispatcher": {
                "active_worker_statuses": ["running", "started", "waiting_approval", "manual_pending", "retry_backoff", "suspended_approval", "stalled", "fallback"],
                "finalize_statuses": ["review_approved"],
                "dependency_done_statuses": ["done"],
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"codex2": 3},
            },
            "providers": {},
            "agents": {
                "codex2": {"id": "codex2", "display_name": "Codex2"},
                "codex": {"id": "codex", "display_name": "Codex"},
            },
        }
        state = {
            "queue": {
                "events": {
                    "evt-low": {"status": "started"},
                    "evt-high": {"status": "started"},
                }
            },
            "workers": {
                "run-low": {
                    "run_id": "run-low",
                    "task_id": "PBK-UI-004",
                    "provider": "codex2",
                    "agent_id": "codex2",
                    "status": "running",
                    "queue_event_id": "evt-low",
                    "pid": 12345,
                    "last_event_at": "2999-01-01T00:00:00Z",
                    "request_snapshot": {"reason": "owned_ready_dispatch"},
                },
                "run-high": {
                    "run_id": "run-high",
                    "task_id": "PBK-UI-003-SIDECAR-REVIEW",
                    "provider": "codex2",
                    "agent_id": "codex2",
                    "status": "running",
                    "queue_event_id": "evt-high",
                    "pid": 12346,
                    "last_event_at": "2999-01-01T00:00:00Z",
                    "request_snapshot": {"reason": "owned_finalize_dispatch"},
                },
            },
        }
        status = {
            "tasks": [
                {"id": "PBK-UI-003-SIDECAR-REVIEW", "status": "review_approved", "owner": "Codex2", "reviewer": "Claude2", "depends_on": []},
                {"id": "PBK-UI-004", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": ["PBK-UI-003"]},
                {"id": "PBK-UI-003", "status": "done", "owner": "Claude2", "reviewer": "Codex", "depends_on": []},
            ]
        }

        with (
            mock.patch.object(supervisor, "load_approval_state", return_value={"pending": [], "history": []}),
            mock.patch.object(supervisor, "load_status", return_value=status),
            mock.patch.object(supervisor, "load_provider_report", return_value={}),
            mock.patch.object(supervisor, "retry_due_workers", return_value=False),
            mock.patch.object(supervisor, "pid_is_alive", return_value=True),
            mock.patch.object(supervisor, "terminate_worker_pid") as terminate_worker_pid,
            mock.patch.object(supervisor, "detect_worker_failure", return_value=None),
            mock.patch.object(supervisor, "utc_now", return_value="2026-04-06T09:01:00Z"),
            mock.patch.object(supervisor, "write_activity_log"),
        ):
            supervisor.poll_workers(config, state)

        self.assertEqual(state["workers"]["run-low"]["status"], "running")
        self.assertEqual(state["workers"]["run-high"]["status"], "running")
        terminate_worker_pid.assert_not_called()

    def test_covered_higher_priority_worker_does_not_supersede_full_lane(self) -> None:
        config = {
            "ready_dispatcher": {
                "active_worker_statuses": ["running"],
                "finalize_statuses": ["review_approved"],
                "dependency_done_statuses": ["done"],
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"codex2": 2},
            },
            "agents": {"codex2": {"id": "codex2", "display_name": "Codex2"}},
        }
        low_worker = {
            "task_id": "PBK-UI-004",
            "provider": "codex2",
            "agent_id": "codex2",
            "status": "running",
            "request_snapshot": {"reason": "owned_ready_dispatch"},
        }
        state = {
            "queue": {"events": {}},
            "workers": {
                "run-low": low_worker,
                "run-high": {
                    "task_id": "PBK-UI-003-SIDECAR-REVIEW",
                    "provider": "codex2",
                    "agent_id": "codex2",
                    "status": "running",
                    "request_snapshot": {"reason": "owned_finalize_dispatch"},
                },
            },
        }
        task_map = {
            "PBK-UI-003-SIDECAR-REVIEW": {"id": "PBK-UI-003-SIDECAR-REVIEW", "status": "review_approved", "owner": "Codex2", "reviewer": "Claude2", "depends_on": []},
            "PBK-UI-004": {"id": "PBK-UI-004", "status": "todo", "owner": "Codex2", "reviewer": "Codex", "depends_on": []},
        }

        self.assertFalse(
            supervisor.higher_priority_ready_task_exists(
                config,
                low_worker,
                task_map,
                state=state,
                active_statuses={"running"},
            )
        )

    def test_chair_guarded_higher_priority_task_does_not_supersede_full_lane(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "active_worker_statuses": ["running"],
                "review_statuses": ["review"],
                "dependency_done_statuses": ["done"],
                "max_tasks_per_agent": 1,
                "max_tasks_per_agent_by_lane": {"codex2": 1},
            },
            "agents": {"codex2": {"id": "codex2", "display_name": "Codex2"}},
        }
        low_worker = {
            "task_id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
            "provider": "codex2",
            "agent_id": "codex2",
            "status": "running",
            "queue_event_id": "evt-low",
            "request_snapshot": {"reason": "owned_in_progress_dispatch"},
        }
        state = {
            "queue": {"events": {"evt-low": {"status": "started"}}},
            "workers": {"run-low": low_worker},
            "failure_streaks": {
                "PBK-UI-003:reviewer": {
                    "task_id": "PBK-UI-003",
                    "role": "reviewer",
                    "agent": "Codex2",
                    "awaiting_chair": True,
                }
            },
        }
        task_map = {
            "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR": {
                "id": "ADM-UI-RD-006-UNBLOCK-HISTORY-REPAIR",
                "status": "in_progress",
                "owner": "Codex2",
                "reviewer": "Claude2",
                "depends_on": [],
            },
            "PBK-UI-003": {
                "id": "PBK-UI-003",
                "status": "review",
                "owner": "Claude2",
                "reviewer": "Codex2",
                "depends_on": [],
            },
        }

        with mock.patch.object(supervisor, "load_event_queue", return_value=[]):
            self.assertFalse(
                supervisor.higher_priority_ready_task_exists(
                    config,
                    low_worker,
                    task_map,
                    state=state,
                    active_statuses={"running"},
                )
            )

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
                "quota_paused_agents": {},
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


class SingleSupervisorGuardTests(unittest.TestCase):
    def test_supervisor_cmdline_matches_actual_python_process(self) -> None:
        repo_root = str(supervisor.THIS_DIR.parent.resolve())

        self.assertTrue(
            supervisor.supervisor_cmdline_matches_current_script(
                ["/usr/bin/python3", ".orchestrator/supervisor.py", "--config", "config.json"],
                repo_root,
            )
        )

    def test_supervisor_cmdline_ignores_timeout_parent_wrapper(self) -> None:
        repo_root = str(supervisor.THIS_DIR.parent.resolve())

        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(
                ["timeout", "15", "/usr/bin/python3", ".orchestrator/supervisor.py", "--verbose"],
                repo_root,
            )
        )

    def test_supervisor_cmdline_ignores_shell_launcher(self) -> None:
        repo_root = str(supervisor.THIS_DIR.parent.resolve())

        self.assertFalse(
            supervisor.supervisor_cmdline_matches_current_script(
                ["/bin/bash", "-lc", "python3 .orchestrator/supervisor.py --verbose"],
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
            "quota_paused_agents": {
                "qwen": {
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
        state = {"quota_paused_agents": {"qwen": {"resume_at": 9999999999}}}
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
        state = {"quota_paused_agents": {"qwen": {"resume_at": 9999999999}}}
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
            "decision": "approve_sidecars",
            "sidecar_approved": False,
            "approval_ttl_minutes": 45,
            "max_sidecars": 2,
            "reason": "approval remains unsafe",
            "blocked_by": [],
            "blocked_sidecar_parents": [],
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
        payload["approval_actions"] = [{"approval_id": "apr-1", "action": "deny", "reason": "not safe"}]
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
            "sidecar_approved": False,
            "approval_ttl_minutes": 45,
            "max_sidecars": 2,
            "reason": "blocked task needs repair",
            "blocked_by": [],
            "blocked_sidecar_parents": [],
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
            "sidecar_approved": False,
            "approval_ttl_minutes": 45,
            "max_sidecars": 2,
            "reason": "blocked parent should resume after existing unblock child",
            "blocked_by": [],
            "blocked_sidecar_parents": [],
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

    def test_provider_health_review_respects_cooldown_after_recent_pause_review(self) -> None:
        state = {
            "provider_pauses": {
                "claude": {
                    "kind": "auth",
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
                        "reason": "Invalid authentication credentials",
                        "paused_at": "2026-04-30T12:51:53Z",
                    }
                },
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
                    "reason": "Quota exhausted",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": 4102444800.0,
                }
            },
            "quota_paused_agents": {
                "copilot": {
                    "reason": "Quota exhausted",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": 4102444800.0,
                }
            },
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
        self.assertIn("copilot", state["quota_paused_agents"])

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

    def test_dispatcher_skips_legacy_alias_helper_claim(self) -> None:
        config = {
            "schema": {
                "tasks_path": "tasks",
                "task_id_field": "id",
                "status_field": "status",
                "assignee_field": "owner",
                "reviewer_field": "reviewer",
            },
            "ready_dispatcher": {
                "helper_claim": {
                    "enabled": True,
                    "availability_first": True,
                    "allow_any_idle_lane": True,
                    "require_assigned_agent_busy": True,
                }
            },
            "agents": {
                "copilot": {"id": "copilot", "display_name": "Copilot", "provider": "copilot"},
                "grok": {"id": "grok", "display_name": "Copilot (legacy alias)", "provider": "grok"},
            },
        }
        state = {
            "queue": {"events": {}},
            "workers": {},
            "provider_pauses": {
                "copilot": {
                    "kind": "quota",
                    "reason": "quota exhausted",
                    "paused_at": "2026-04-30T15:00:00Z",
                    "resume_at": None,
                }
            },
        }
        status = {
            "tasks": [
                {
                    "id": "OPX-GV-004",
                    "status": "review",
                    "owner": "Codex2",
                    "reviewer": "Copilot",
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

    def test_underutilization_sidecars_wait_for_chair_approval_when_enabled(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "ai-status.json").write_text(
                json.dumps(
                    {
                        "tasks": [
                            {
                                "id": "MAIN-1",
                                "status": "in_progress",
                                "owner": "Codex",
                                "reviewer": "Claude",
                                "depends_on": [],
                                "title": "Main task",
                            }
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n",
                encoding="utf-8",
            )
            (root / "activity-log.jsonl").write_text("", encoding="utf-8")
            (root / "event-queue.jsonl").write_text("", encoding="utf-8")
            (root / "sidecar_catalog.json").write_text('{"templates": []}\n', encoding="utf-8")
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
                    "activity_log": str(root / "activity-log.jsonl"),
                    "event_queue": str(root / "event-queue.jsonl"),
                    "sidecar_catalog": str(root / "sidecar_catalog.json"),
                },
                "chair_review": {"enabled": True},
                "underutilization_dispatch": {
                    "enabled": True,
                    "threshold_ratio": 0.5,
                    "continuous_window_seconds": 60,
                    "cooldown_seconds": 60,
                    "max_new_sidecars_per_wave": 2,
                },
                "agents": {
                    "codex": {"id": "codex", "display_name": "Codex", "provider": "codex"},
                    "claude": {"id": "claude", "display_name": "Claude", "provider": "claude"},
                },
            }
            state = {
                "queue": {"events": {}},
                "workers": {},
                "underutilization": {"below_threshold_since": "2026-04-10T00:00:00Z"},
                "chair_review": {},
            }

            with mock.patch.object(supervisor, "create_sidecar_task") as create_sidecar_task:
                changed = supervisor.dispatch_underutilization_sidecars(config, state)

            self.assertTrue(changed)
            create_sidecar_task.assert_not_called()
            self.assertEqual(
                state["underutilization"]["last_sidecar_wave_reason"],
                "underutilized but waiting for a fresh chairman sidecar approval window",
            )

    def test_refresh_chair_review_state_applies_sidecar_window_and_approval_actions(self) -> None:
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
                        "decision": "approve_sidecars",
                        "sidecar_approved": True,
                        "approval_ttl_minutes": 45,
                        "max_sidecars": 2,
                        "reason": "safe and idle",
                        "blocked_by": [],
                        "blocked_sidecar_parents": [],
                        "approval_actions": [
                            {
                                "approval_id": "apr-1",
                                "action": "allow",
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
            self.assertEqual(state["chair_review"]["max_sidecars"], 2)
            self.assertIsNotNone(state["chair_review"]["sidecar_approved_until"])
            self.assertNotIn("gemini2", state.get("provider_pauses", {}))

    def test_refresh_chair_review_state_accepts_reassignment_aliases_and_preserves_separation(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
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
                        "decision": "approve_sidecars",
                        "sidecar_approved": True,
                        "approval_ttl_minutes": 45,
                        "max_sidecars": 2,
                        "reason": "break owner failure loop",
                        "blocked_by": [],
                        "blocked_sidecar_parents": [],
                        "approval_actions": [],
                        "reassignment_actions": [
                            {
                                "task_id": "OPX-MD-003",
                                "role": "owner",
                                "from_agent": "Codex2",
                                "to_agent": "Codex",
                                "rationale": "Codex2 hit repeated terminal failures.",
                            },
                            {
                                "task_id": "OPX-MD-003",
                                "field": "reviewer",
                                "from": "Codex",
                                "to": "Claude",
                                "rationale": "Keep owner and reviewer separate after the owner move.",
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

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "sync_status_pipeline", return_value=True),
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

            with mock.patch.object(supervisor, "sync_status_pipeline", return_value=True) as sync:
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
            sync.assert_not_called()
            task = json.loads(status_path.read_text(encoding="utf-8"))["tasks"][0]
            self.assertEqual(task["owner"], "Codex")
            self.assertEqual(task["reviewer"], "Codex2")

    def test_refresh_chair_review_state_reassigns_backlog_owner_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
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
                        "sidecar_approved": False,
                        "approval_ttl_minutes": None,
                        "max_sidecars": None,
                        "reason": "Claude auth lane is degraded; move backlog owner work.",
                        "blocked_by": [],
                        "blocked_sidecar_parents": [],
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

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "sync_status_pipeline", return_value=True),
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
                        "sidecar_approved": False,
                        "approval_ttl_minutes": None,
                        "max_sidecars": None,
                        "reason": "Gemini2 lane is degraded; pause it and move backlog work to a healthy owner.",
                        "blocked_by": [],
                        "blocked_sidecar_parents": [],
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

            with (
                mock.patch.object(supervisor, "safe_load_approval_state", return_value={"pending": [], "history": []}),
                mock.patch.object(supervisor, "sync_status_pipeline", return_value=True),
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
                        "decision": "approve_sidecars",
                        "sidecar_approved": False,
                        "approval_ttl_minutes": 45,
                        "max_sidecars": 2,
                        "reason": "finalize owner should be woken now",
                        "blocked_by": [],
                        "blocked_sidecar_parents": [],
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
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]["task_id"], "OPX-CM-003")
            self.assertEqual(events[0]["reason"], "owned_finalize_dispatch")

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
                        "sidecar_approved": False,
                        "approval_ttl_minutes": 45,
                        "max_sidecars": 2,
                        "reason": "blocked parent needs an unblock task",
                        "blocked_by": [],
                        "blocked_sidecar_parents": [],
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
                        "sidecar_approved": False,
                        "approval_ttl_minutes": 45,
                        "max_sidecars": 2,
                        "reason": "No reassignment improves machine truth.",
                        "blocked_by": [
                            "Shared workspace-baseline blocker keeps the UI-FE wave from typecheck/build completion."
                        ],
                        "blocked_sidecar_parents": [],
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

    def test_ensure_workspace_baseline_task_dispatch_queues_owner_event(self) -> None:
        task = {
            "id": "UI-BASELINE-001",
            "status": "backlog",
            "owner": "Claude",
            "reviewer": "Codex",
        }
        state = {}

        with (
            mock.patch.object(supervisor, "load_status", return_value={"tasks": [task]}),
            mock.patch.object(supervisor, "chair_dispatch_action_reason", return_value=("Claude", "owned_ready_dispatch")),
            mock.patch.object(supervisor, "is_agent_dispatch_paused", return_value=False),
            mock.patch.object(supervisor, "ready_dispatch_settings", return_value={"active_worker_statuses": ["running"]}),
            mock.patch.object(supervisor, "outstanding_delivery_agent_counts", return_value={}),
            mock.patch.object(supervisor, "outstanding_delivery_indexes", return_value=(set(), {}, set())),
            mock.patch.object(supervisor, "build_dispatch_event", return_value={"key": "evt-baseline", "task_id": "UI-BASELINE-001"}),
            mock.patch.object(supervisor, "queue_delivery_event", return_value=True) as queue_event,
            mock.patch.object(supervisor, "write_activity_log") as write_log,
        ):
            changed = supervisor.ensure_workspace_baseline_task_dispatch(
                {"paths": {"status_file": "ai-status.json"}},
                state,
                provider_report={},
            )

        self.assertTrue(changed)
        queue_event.assert_called_once()
        write_log.assert_called_once()
        self.assertIn("evt-baseline", state["seen_event_keys"])

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
                        "sidecar_approved": False,
                        "approval_ttl_minutes": 45,
                        "max_sidecars": 2,
                        "reason": "existing unblock child is already done",
                        "blocked_by": [],
                        "blocked_sidecar_parents": [],
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
            agent_loads={"Codex": [0], "Codex2": []},
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
            "provider_pauses": {
                "gemini": {
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
                    "reason": "Invalid authentication credentials",
                    "paused_at": "2026-04-30T12:51:53Z",
                    "resume_at": None,
                }
            },
            "quota_paused_agents": {},
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
            "quota_paused_agents": {},
        }
        provider_report = {"providers": {"claude": {"auth_ready": True}}}

        expired = supervisor.expire_provider_pauses(config, state, provider_report)

        self.assertEqual(expired, [])
        self.assertIn("claude", state["provider_pauses"])
        self.assertTrue(supervisor.is_agent_dispatch_paused(config, state, "claude", provider_report=provider_report))


class WorkerTreeGuardSettingsTests(unittest.TestCase):
    def test_defaults_off_with_canonical_blocking_globs(self) -> None:
        settings = supervisor.worker_tree_guard_settings({})
        self.assertFalse(settings["enabled"])
        self.assertFalse(settings["log_only"])
        # All fragile surfaces from branch-strategy.md §11.1.
        for needed in [
            ".orchestrator/supervisor.py",
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
        settings = supervisor.worker_tree_guard_settings(config)
        self.assertTrue(settings["enabled"])
        self.assertEqual(settings["blocking_globs"], ["my-special-file.txt"])

    def test_empty_globs_list_falls_back_to_defaults(self) -> None:
        config = {"branch_strategy": {"worker_tree_guard": {"blocking_globs": []}}}
        settings = supervisor.worker_tree_guard_settings(config)
        self.assertIn(".orchestrator/supervisor.py", settings["blocking_globs"])


class WorkerTreeGuardMatchingTests(unittest.TestCase):
    GLOBS = [
        ".orchestrator/supervisor.py",
        ".orchestrator/skills/**",
        ".orchestrator/templates/*",
        ".orchestrator/config*.json",
        "docs/**",
        ".husky/**",
    ]

    def test_exact_file_matches(self) -> None:
        self.assertEqual(
            supervisor._worker_tree_guard_matches(".orchestrator/supervisor.py", self.GLOBS),
            ".orchestrator/supervisor.py",
        )

    def test_double_star_matches_direct_child(self) -> None:
        self.assertEqual(
            supervisor._worker_tree_guard_matches(".orchestrator/skills/task-closeout.md", self.GLOBS),
            ".orchestrator/skills/**",
        )

    def test_double_star_matches_nested_child(self) -> None:
        self.assertEqual(
            supervisor._worker_tree_guard_matches("docs/ops/branch-strategy.md", self.GLOBS),
            "docs/**",
        )

    def test_single_star_matches_one_level_only(self) -> None:
        self.assertEqual(
            supervisor._worker_tree_guard_matches(".orchestrator/templates/wakeup.txt", self.GLOBS),
            ".orchestrator/templates/*",
        )

    def test_runtime_state_files_do_not_match(self) -> None:
        for path in ["ai-status.json", "current-work.md", "docs-site/index.html"]:
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
                        ".orchestrator/supervisor.py",
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
        result = supervisor.check_worker_tree_guard({}, reason="owned_in_progress_dispatch")
        self.assertIsNone(result)

    def test_skip_reason_owned_finalize_dispatch_returns_none(self) -> None:
        with mock.patch.object(
            supervisor.subprocess, "run", return_value=self._porcelain([".orchestrator/supervisor.py"])
        ):
            result = supervisor.check_worker_tree_guard(
                self._enabled_config(), reason="owned_finalize_dispatch"
            )
        self.assertIsNone(result)

    def test_dirty_fragile_surface_returns_block_payload(self) -> None:
        with mock.patch.object(
            supervisor.subprocess, "run", return_value=self._porcelain([".orchestrator/skills/foo.md"])
        ):
            result = supervisor.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNotNone(result)
        self.assertEqual(result["dirty_paths"], [".orchestrator/skills/foo.md"])
        self.assertIn(".orchestrator/skills/**", result["matched_globs"])
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
            return_value=self._porcelain([".orchestrator/supervisor.py"]),
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
        proc.stdout = "R  old/path.md -> .orchestrator/skills/renamed.md"
        proc.stderr = ""
        with mock.patch.object(supervisor.subprocess, "run", return_value=proc):
            result = supervisor.check_worker_tree_guard(
                self._enabled_config(), reason="owned_in_progress_dispatch"
            )
        self.assertIsNotNone(result)
        self.assertEqual(result["dirty_paths"], [".orchestrator/skills/renamed.md"])




class DispatchCooldownTests(unittest.TestCase):
    """Cooldown protects freshly-dispatched workers from voluntary supersede.

    See `worker_in_dispatch_cooldown` in supervisor.py. Cooldown is
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




class PruneDoneHandoffsTests(unittest.TestCase):
    """`prune_done_handoffs` bounds ai-status.json's handoffs audit-log tail.

    Without this prune the file grew to ~9 MB / 17k entries during the
    2026-05-26 incident, making the dashboard fetch unusably slow. See
    feedback_ai_status_handoff_bloat.
    """

    def test_noop_under_keep_threshold(self) -> None:
        s = {"handoffs": [{"status": "done"}] * 100}
        supervisor.prune_done_handoffs(s, keep=500)
        self.assertEqual(len(s["handoffs"]), 100)

    def test_pending_entries_always_preserved(self) -> None:
        # 2000 done + 5 pending; even with keep=10, pending entries survive.
        handoffs = (
            [{"status": "done", "task_id": f"D{i}"} for i in range(2000)]
            + [{"status": "pending", "task_id": f"P{i}"} for i in range(5)]
        )
        s = {"handoffs": list(handoffs)}
        supervisor.prune_done_handoffs(s, keep=10)
        kinds = [x.get("status") for x in s["handoffs"]]
        self.assertEqual(kinds.count("pending"), 5,
                         "all pending handoffs must survive prune")
        self.assertEqual(kinds.count("done"), 10,
                         "only the last `keep` done entries survive")

    def test_keeps_most_recent_done_by_position(self) -> None:
        # done entries are appended chronologically; the prune must keep the
        # tail, not the head, so audit history reflects what *just* happened.
        handoffs = [{"status": "done", "task_id": f"T{i}"} for i in range(1000)]
        s = {"handoffs": list(handoffs)}
        supervisor.prune_done_handoffs(s, keep=3)
        self.assertEqual(
            [x["task_id"] for x in s["handoffs"]],
            ["T997", "T998", "T999"],
        )

    def test_missing_handoffs_key_is_safe(self) -> None:
        s = {}
        supervisor.prune_done_handoffs(s, keep=500)  # must not raise
        self.assertNotIn("handoffs", s)

    def test_non_list_handoffs_is_safe(self) -> None:
        # Bad data type — defensive against malformed input.
        s = {"handoffs": "not-a-list"}
        supervisor.prune_done_handoffs(s, keep=500)
        self.assertEqual(s["handoffs"], "not-a-list")  # unchanged




class ReconcileStatusFromGitAsyncTests(unittest.TestCase):
    """OPS-RECONCILE-ASYNC-001: reconcile_status_from_git must spawn the
    git-reconcile subprocess in the background (non-blocking) and finalize
    its result on the NEXT tick, so a slow reconcile cannot freeze the
    supervisor's main dispatch loop.

    Previously the supervisor used `subprocess.run` and synchronously waited
    for the reconcile-from-git subprocess. On a bloated ai-status.json the
    subprocess took ~4 minutes, during which dispatch was completely starved
    and every lane drained to zero (OPS-RECONCILE-INTERVAL-600 throttled
    re-entry but did not address the per-call freeze).
    """

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
        supervisor._RECONCILE_PROCS.clear()

    def tearDown(self) -> None:
        supervisor._RECONCILE_PROCS.clear()
        self._tmp.cleanup()

    def _fake_popen(self, *, alive: bool, returncode: int = 0,
                     stdout: str = "", stderr: str = "") -> mock.MagicMock:
        proc = mock.MagicMock()
        proc.poll.return_value = None if alive else returncode
        proc.returncode = None if alive else returncode
        proc._fake_stdout = stdout
        proc._fake_stderr = stderr
        return proc

    def test_first_call_spawns_popen_and_returns_false(self) -> None:
        # Fresh state — first call spawns Popen and returns False (no
        # result to apply yet).
        state: dict = {}
        with mock.patch.object(supervisor.subprocess, "Popen") as popen:
            popen.return_value = self._fake_popen(alive=True)
            changed = supervisor.reconcile_status_from_git(self.config, state)
        self.assertFalse(changed)
        self.assertEqual(popen.call_count, 1)
        # Throttle timestamp recorded so a re-entry skips spawn.
        self.assertIn("last_git_reconcile_at", state.get("supervisor", {}))
        # In-flight entry registered.
        self.assertEqual(len(supervisor._RECONCILE_PROCS), 1)

    def test_subsequent_call_while_in_flight_does_not_respawn(self) -> None:
        # Simulate: previous tick spawned reconcile; this tick should observe
        # it still running and NOT spawn a second one.
        state: dict = {}
        popen_proc = self._fake_popen(alive=True)
        with mock.patch.object(supervisor.subprocess, "Popen", return_value=popen_proc) as popen:
            supervisor.reconcile_status_from_git(self.config, state)
            # Second call while alive=True
            changed = supervisor.reconcile_status_from_git(self.config, state)
        self.assertFalse(changed)
        self.assertEqual(popen.call_count, 1, "must NOT re-spawn while in flight")

    def test_completion_applies_stdout_and_returns_true(self) -> None:
        # Spawn -> mark completed -> ensure next call reads stdout, emits
        # activity-log entries, clears the registry and returns True.
        state: dict = {}
        # Spawn
        with mock.patch.object(supervisor.subprocess, "Popen") as popen:
            proc = self._fake_popen(alive=True)
            popen.return_value = proc
            supervisor.reconcile_status_from_git(self.config, state)
        # Find the tempfile paths from the registry and prefill them
        entry = next(iter(supervisor._RECONCILE_PROCS.values()))
        entry["stdout_path"].write_text("reconciled UI-X to done\n")
        entry["stderr_path"].write_text("")
        # Mark process completed (rc=0)
        entry["proc"].poll.return_value = 0
        entry["proc"].returncode = 0
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
        # last_git_reconcile_at < interval ago and registry empty -> no spawn.
        state = {"supervisor": {
            "last_git_reconcile_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }}
        with mock.patch.object(supervisor.subprocess, "Popen") as popen:
            changed = supervisor.reconcile_status_from_git(self.config, state)
        self.assertFalse(changed)
        popen.assert_not_called()

    def test_completion_with_nonzero_rc_logs_failure_and_returns_false(self) -> None:
        state: dict = {}
        with mock.patch.object(supervisor.subprocess, "Popen") as popen:
            popen.return_value = self._fake_popen(alive=True)
            supervisor.reconcile_status_from_git(self.config, state)
        entry = next(iter(supervisor._RECONCILE_PROCS.values()))
        entry["stdout_path"].write_text("")
        entry["stderr_path"].write_text("boom: missing remote\n")
        entry["proc"].poll.return_value = 2
        entry["proc"].returncode = 2
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


if __name__ == "__main__":
    unittest.main()
