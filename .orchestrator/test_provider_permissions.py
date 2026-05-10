from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import permission_broker
from provider_permissions import (
    ROOT,
    _claude_auth_ready,
    _claude_live_auth_probe,
    _copilot_auth_ready,
    _copilot_plaintext_token,
    _verified_claude_hooks,
    _verified_claude_policy,
)


class ProviderPermissionsTest(unittest.TestCase):
    def test_verified_claude_hooks_use_absolute_broker_path(self) -> None:
        expected = str(Path(ROOT) / ".orchestrator" / "permission_broker.py")
        hooks = _verified_claude_hooks()
        for entries in hooks.values():
            command = entries[0]["hooks"][0]["command"]
            self.assertIn(expected, command)
            self.assertTrue(command.startswith("python3 /"))

    def test_toolsearch_is_auto_allowed(self) -> None:
        evaluation = permission_broker.evaluate_tool_request("ToolSearch", {}, {})

        self.assertEqual(evaluation["decision"], "allow")
        self.assertEqual(evaluation["risk_class"], "safe_read")

    def test_workspace_mkdir_is_auto_allowed(self) -> None:
        command = f"mkdir -p {ROOT / 'tmp' / 'worker-artifacts'}"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_module_unittest_is_auto_allowed(self) -> None:
        command = "python3 -m unittest services.execution.test_artifact_loader 2>&1"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_module_pytest_is_auto_allowed(self) -> None:
        command = (
            "python3 -m pytest services/control-plane/governance/test_capital_pool.py "
            "services/control-plane/governance/test_persona_capital_binding.py -v 2>&1 | head -80"
        )

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_apt_get_python3_pytest_install_is_auto_allowed(self) -> None:
        command = "apt-get install -y python3-pytest 2>&1 | tail -5"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_python_module_pip_pytest_install_and_verify_is_auto_allowed(self) -> None:
        command = "python3 -m pip install pytest --user --quiet 2>&1 | tail -5 && python3 -m pytest --version"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_pip3_pytest_install_is_auto_allowed(self) -> None:
        command = "pip3 install pytest -q 2>&1 | tail -3"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_other_apt_get_install_still_requires_review(self) -> None:
        command = "apt-get install -y ripgrep 2>&1 | tail -5"

        self.assertEqual(permission_broker.classify_command(command), "defer")

    def test_other_pip_install_still_requires_review(self) -> None:
        command = "python3 -m pip install requests --user --quiet 2>&1 | tail -5"

        self.assertEqual(permission_broker.classify_command(command), "defer")

    def test_npm_test_is_auto_allowed(self) -> None:
        command = "npm test -- --runInBand"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_pnpm_test_target_with_tail_is_auto_allowed(self) -> None:
        command = "pnpm test:unit tests/unit/client-integration.test.ts 2>&1 | tail -30"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_pnpm_filtered_test_is_auto_allowed(self) -> None:
        command = "pnpm --filter @drts/api test -- --runInBand 2>&1 | tail -20"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_pnpm_exec_vitest_is_auto_allowed(self) -> None:
        command = "pnpm exec vitest run --passWithNoTests 2>&1 | tail -60"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_pnpm_add_test_dependencies_and_verify_is_auto_allowed(self) -> None:
        command = "pnpm add -D vitest @testing-library/react 2>&1 | tail -20 && pnpm exec vitest --version"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_other_pnpm_add_still_requires_review(self) -> None:
        command = "pnpm add -D tsup 2>&1 | tail -20"

        self.assertEqual(permission_broker.classify_command(command), "defer")

    def test_cargo_test_is_auto_allowed(self) -> None:
        command = "cargo test --lib -- --nocapture"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_go_test_is_auto_allowed(self) -> None:
        command = "go test ./... -run TestApprovalBroker"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_named_smoke_test_is_auto_allowed(self) -> None:
        command = "python3 services/execution/smoke_test_artifact_loader.py 2>&1"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_status_sync_with_quoted_env_value_is_auto_allowed(self) -> None:
        command = (
            'AI_NAME=Claude REVIEW_NOTES_ZH="審查通過：全部測試通過。" '
            'python3 scripts/ai_status.py approve EX-001 "Review approved by Claude."'
        )

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_status_sync_with_absolute_workspace_path_is_auto_allowed(self) -> None:
        command = (
            f'AI_NAME=Claude python3 {ROOT / "scripts" / "ai_status.py"} '
            'progress EV-002 "Resubmitting for review." 2>&1'
        )

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_status_sync_help_via_cd_is_auto_allowed(self) -> None:
        command = f"cd {ROOT} && python3 scripts/ai_status.py --help 2>&1 | head -40"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_status_sync_shell_wrapper_via_cd_is_auto_allowed(self) -> None:
        command = f"cd {ROOT} && bash scripts/ai-status.sh sync"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_multiline_status_sync_handoff_is_auto_allowed(self) -> None:
        command = (
            "\\\n"
            "ACTOR=Claude python3 scripts/ai_status.py handoff WE-002 Qwen \\\n"
            '  "Docker multi-stage builds complete and ready for review."'
        )

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_generic_python_command_via_cd_is_auto_allowed(self) -> None:
        command = f"cd {ROOT} && python3 .orchestrator/permission_broker.py print-policy"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_generic_python_command_with_env_prefix_is_auto_allowed(self) -> None:
        command = "AI_NAME=Claude python3 -c 'print(\"ok\")'"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_local_lsof_port_probe_is_auto_allowed(self) -> None:
        command = "lsof -i :8765 2>/dev/null | head -5"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_commented_read_only_inventory_script_is_auto_allowed(self) -> None:
        command = (
            "# Check tenant portal API routes actually exist (not just empty pages)\n"
            "ls apps/api/src/modules/platform-admin/ 2>/dev/null\n"
            "echo \"---\"\n"
            "ls apps/api/src/modules/tenant-partner/ 2>/dev/null\n"
            "echo \"---\"\n"
            "wc -l apps/tenant-portal-web/app/bookings/page.tsx 2>/dev/null"
        )

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_local_dashboard_restart_sequence_is_auto_allowed(self) -> None:
        command = (
            f"cd {ROOT} && bash scripts/dashboard-ctl.sh restart\n"
            "sleep 1 && curl -s http://127.0.0.1:4174/consensus/baton-log.md | head -10"
        )

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_verified_claude_policy_includes_pnpm_test_allow_rules(self) -> None:
        policy = _verified_claude_policy({})

        self.assertIn("Bash(pnpm test*)", policy["allow"])
        self.assertIn("Bash(pnpm exec vitest*)", policy["allow"])

    def test_verified_claude_policy_includes_generic_python_allow_rules(self) -> None:
        policy = _verified_claude_policy({})

        self.assertIn("Bash(python3 *)", policy["allow"])
        self.assertIn("Bash(cd * && python3 *)", policy["allow"])
        self.assertIn("Bash(AI_NAME=* python3 *)", policy["allow"])

    def test_verified_claude_policy_includes_local_service_rules(self) -> None:
        policy = _verified_claude_policy({})

        self.assertIn("Bash(lsof *)", policy["allow"])
        self.assertIn("Bash(curl -I http://127.0.0.1:*)", policy["allow"])
        self.assertIn("Bash(bash scripts/dashboard-ctl.sh *)", policy["allow"])
        self.assertIn("Bash(nohup python3 */scripts/dashboard_server.py *)", policy["allow"])
        self.assertIn("Bash(setsid -f python3 */scripts/dashboard_server.py *)", policy["allow"])
        self.assertIn("Bash(pkill -f *dashboard_server.py*)", policy["allow"])

    def test_claude_auth_ready_rejects_expired_oauth_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            credentials_path = Path(tmp) / ".claude" / ".credentials.json"
            credentials_path.parent.mkdir(parents=True, exist_ok=True)
            credentials_path.write_text(
                json.dumps({"claudeAiOauth": {"expiresAt": int((time.time() - 300) * 1000)}}),
                encoding="utf-8",
            )
            with patch("provider_permissions._json_command", return_value={"loggedIn": True}):
                self.assertFalse(_claude_auth_ready("/usr/bin/claude", env={"HOME": tmp}))

    def test_claude_auth_ready_accepts_unexpired_oauth_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            credentials_path = Path(tmp) / ".claude" / ".credentials.json"
            credentials_path.parent.mkdir(parents=True, exist_ok=True)
            credentials_path.write_text(
                json.dumps({"claudeAiOauth": {"expiresAt": int((time.time() + 300) * 1000)}}),
                encoding="utf-8",
            )
            with patch("provider_permissions._json_command", return_value={"loggedIn": True}):
                self.assertTrue(_claude_auth_ready("/usr/bin/claude", env={"HOME": tmp}))

    def test_claude_auth_ready_refreshes_expired_oauth_credentials_when_refresh_token_exists(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            credentials_path = Path(tmp) / ".claude" / ".credentials.json"
            credentials_path.parent.mkdir(parents=True, exist_ok=True)
            credentials_path.write_text(
                json.dumps(
                    {
                        "claudeAiOauth": {
                            "expiresAt": int((time.time() - 300) * 1000),
                            "refreshToken": "refresh-demo",
                        }
                    }
                ),
                encoding="utf-8",
            )
            with (
                patch("provider_permissions._json_command", return_value={"loggedIn": True}),
                patch("provider_permissions._claude_live_auth_probe", return_value=True),
            ):
                self.assertTrue(_claude_auth_ready("/usr/bin/claude", env={"HOME": tmp}))

    def test_claude_live_auth_probe_returns_false_on_timeout(self) -> None:
        with patch(
            "provider_permissions.run_command",
            side_effect=subprocess.TimeoutExpired(cmd=["claude"], timeout=20.0),
        ):
            self.assertFalse(_claude_live_auth_probe("/usr/bin/claude"))

    def test_copilot_plaintext_token_reads_camel_case_token_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "storeTokenPlaintext": True,
                        "copilotTokens": {
                            "https://github.com:demo": "gho_demo_token"
                        },
                    }
                ),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"COPILOT_CONFIG_DIR": tmp}, clear=False):
                self.assertEqual(_copilot_plaintext_token(), "gho_demo_token")

    def test_copilot_auth_ready_accepts_camel_case_plaintext_token(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config_path = Path(tmp) / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "storeTokenPlaintext": True,
                        "copilotTokens": {
                            "https://github.com:demo": "gho_demo_token"
                        },
                    }
                ),
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"COPILOT_CONFIG_DIR": tmp}, clear=False):
                self.assertTrue(_copilot_auth_ready(None))


if __name__ == "__main__":
    unittest.main()
