from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from unittest.mock import patch

import permission_broker
import provider_permissions
from provider_permissions import (
    ROOT,
    SOURCE_ROOT,
    _antigravity_app_data_dir,
    _antigravity_auth_ready,
    _antigravity_identity,
    _codex_auth_ready,
    _copilot_auth_ready,
    desired_claude_local_settings,
    _verified_claude_hooks,
    _verified_claude_policy,
    provider_capabilities,
)


class ProviderPermissionsTest(unittest.TestCase):
    def test_verified_claude_hooks_use_absolute_broker_path(self) -> None:
        # ROOT, not SOURCE_ROOT. This asserted SOURCE_ROOT and passed anywhere
        # the two are the same directory -- which is every checkout except the
        # release copies the supervisor actually runs from. Only the release
        # verification gate could tell them apart, and that is where it failed
        # after ORCH-HOOK-PATH-001 changed which one the hook names.
        expected = str(
            Path(ROOT)
            / "tools"
            / "development-orchestrator"
            / "permission_broker.py"
        )
        hooks = _verified_claude_hooks()
        for entries in hooks.values():
            command = entries[0]["hooks"][0]["command"]
            self.assertIn(expected, command)
            self.assertTrue(command.startswith("python3 /"))

    def test_claude_hook_sync_replaces_managed_hooks_and_is_idempotent(self) -> None:
        custom_hook = {
            "hooks": [{"type": "command", "command": "printf custom", "shell": "bash"}]
        }
        current = {
            "hooks": {
                "PreToolUse": [
                    {
                        "hooks": [
                            {
                                "type": "command",
                                "command": (
                                    "python3 /home/demo/project/.orchestrator/permission_broker.py "
                                    "--config /home/demo/project/.orchestrator/config.json hook PreToolUse"
                                ),
                                "shell": "bash",
                            }
                        ]
                    },
                    {
                        "hooks": [
                            {
                                "type": "command",
                                "command": (
                                    "python3 /home/demo/project/.artifacts/releases/orchestrator-old/"
                                    "tools/development-orchestrator/permission_broker.py hook PreToolUse"
                                ),
                                "shell": "bash",
                            }
                        ]
                    },
                    custom_hook,
                ]
            }
        }

        first = desired_claude_local_settings({}, current=current)
        second = desired_claude_local_settings({}, current=first)
        entries = second["hooks"]["PreToolUse"]

        self.assertEqual(second, first)
        self.assertEqual(entries[0], custom_hook)
        self.assertEqual(len(entries), 2)
        command = entries[1]["hooks"][0]["command"]
        self.assertIn(str(ROOT), command)
        self.assertEqual(command.count("permission_broker.py"), 1)

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

    def test_canonical_root_pnpm_install_requires_review(self) -> None:
        command = "pnpm install --frozen-lockfile"

        self.assertEqual(permission_broker.classify_command(command), "defer")

    def test_canonical_root_pnpm_install_via_cd_requires_review(self) -> None:
        command = f"cd {ROOT} && pnpm install --frozen-lockfile"

        self.assertEqual(permission_broker.classify_command(command), "defer")

    def test_worktree_pnpm_install_remains_allowed(self) -> None:
        command = f"cd {ROOT / '.artifacts' / 'worktrees' / 'auto' / 'demo'} && pnpm install --frozen-lockfile"

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
            'python3 tools/development-orchestrator/bin/ai_status.py approve EX-001 "Review approved by Claude."'
        )

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_status_sync_with_absolute_workspace_path_is_auto_allowed(self) -> None:
        command = (
            f'AI_NAME=Claude python3 {ROOT / "tools" / "development-orchestrator" / "bin" / "ai_status.py"} '
            'progress EV-002 "Resubmitting for review." 2>&1'
        )

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_status_sync_help_via_cd_is_auto_allowed(self) -> None:
        command = f"cd {ROOT} && python3 tools/development-orchestrator/bin/ai_status.py --help 2>&1 | head -40"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_status_sync_shell_wrapper_via_cd_is_auto_allowed(self) -> None:
        command = f"cd {ROOT} && bash tools/development-orchestrator/bin/ai-status.sh sync"

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_multiline_status_sync_handoff_is_auto_allowed(self) -> None:
        command = (
            "\\\n"
            "ACTOR=Claude python3 tools/development-orchestrator/bin/ai_status.py handoff WE-002 Claude2 \\\n"
            '  "Docker multi-stage builds complete and ready for review."'
        )

        self.assertEqual(permission_broker.classify_command(command), "allow")

    def test_generic_python_command_via_cd_is_auto_allowed(self) -> None:
        command = f"cd {ROOT} && python3 tools/development-orchestrator/permission_broker.py print-policy"

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
            f'pkill -f "dashboard_server.py" 2>/dev/null; sleep 1\n'
            f'nohup python3 {ROOT / "tools" / "development-orchestrator" / "bin" / "dashboard_server.py"} '
            f'--host 127.0.0.1 --port 4174 --directory {ROOT / "tools" / "development-orchestrator" / "dashboard"} '
            '>> /tmp/dashboard.log 2>&1 &\n'
            'sleep 1 && curl -s http://127.0.0.1:4174/consensus/baton-log.md | head -10'
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
        self.assertIn("Bash(nohup python3 */tools/development-orchestrator/bin/dashboard_server.py *)", policy["allow"])
        self.assertIn("Bash(pkill -f *dashboard_server.py*)", policy["allow"])

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

    def test_codex_auth_ready_checks_login_status(self) -> None:
        logged_in = subprocess.CompletedProcess(["codex", "login", "status"], 0, "Logged in using ChatGPT\n", "")
        logged_out = subprocess.CompletedProcess(["codex", "login", "status"], 1, "Not logged in\n", "")

        with patch("provider_permissions.run_command", return_value=logged_in):
            self.assertTrue(_codex_auth_ready("/usr/bin/codex"))

        with patch("provider_permissions.run_command", return_value=logged_out):
            self.assertFalse(_codex_auth_ready("/usr/bin/codex"))

    def test_provider_capabilities_reports_custom_codex_lane_auth(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            status_file = tmp_path / "ai-status.json"
            activity_log = tmp_path / "ai-activity-log.jsonl"
            current_work = tmp_path / "current-work.md"
            dashboard = tmp_path / "dashboard" / "index.html"
            claude_mcp_config = tmp_path / "claude-approval-broker.mcp.json"
            for path in [status_file, activity_log, current_work, dashboard, claude_mcp_config]:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("", encoding="utf-8")
            codex2_home = tmp_path / "codex2-home"
            codex2_home.mkdir()
            (codex2_home / "auth.json").write_text("{}", encoding="utf-8")
            config = {
                "paths": {
                    "status_file": str(status_file),
                    "activity_log": str(activity_log),
                    "current_work": str(current_work),
                    "dashboard": str(dashboard),
                    "claude_mcp_config": str(claude_mcp_config),
                },
                "agents": {},
                "providers": {
                    "codex": {"codex": {}},
                    "codex2": {
                        "delivery_mode": "codex",
                        "codex": {
                            "cli": "codex",
                            "config_home": str(codex2_home),
                            "ask_for_approval": "never",
                            "sandbox_mode": "workspace-write",
                            "dangerously_bypass": True,
                        },
                    },
                },
            }
            seen_homes: list[str | None] = []

            def fake_command_exists(name: str, **_: object) -> str | None:
                return "/usr/bin/codex" if name == "codex" else None

            def fake_run_command(cmd: list[str], env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
                if cmd == ["/usr/bin/codex", "login", "status"]:
                    seen_homes.append((env or {}).get("CODEX_HOME"))
                    return subprocess.CompletedProcess(cmd, 0, "Logged in using ChatGPT\n", "")
                return subprocess.CompletedProcess(cmd, 0, "", "")

            with (
                patch("provider_permissions.command_exists", side_effect=fake_command_exists),
                patch("provider_permissions.run_command", side_effect=fake_run_command),
            ):
                report = provider_capabilities(config)

        codex2 = report["providers"]["codex2"]
        self.assertTrue(codex2["auth_ready"])
        self.assertEqual(codex2["paths"]["resolved_codex_home"], str(codex2_home))
        self.assertEqual(codex2["paths"]["auth_json"], str(codex2_home / "auth.json"))
        self.assertIn(str(codex2_home), seen_homes)


class GitGlobalOptionsDoNotDefeatDenyRulesTests(unittest.TestCase):
    """`git -C <path> reset --hard` is `git reset --hard` with a target.

    The deny patterns anchor on `^git reset --hard`, and git accepts its own
    global options between the program name and the subcommand, so the deny
    never saw them. Measured on the deployed broker: `git reset --hard
    origin/dev` denied, `git -C /home/lupin/drts-fleet-platform reset --hard
    HEAD` merely asked -- and the second form is the more dangerous one,
    because it acts on a tree the caller is not standing in.

    That matters here specifically: four Claude Code sessions run with their
    cwd inside the canonical checkout, and this broker is the only enforcement
    surface any of them has.
    """

    def _decision(self, command: str) -> str:
        return permission_broker.evaluate_tool_request("Bash", {"command": command}, {})["decision"]

    def test_global_options_do_not_hide_a_denied_git_command(self) -> None:
        for command in (
            "git -C /home/lupin/drts-fleet-platform reset --hard HEAD",
            "git --git-dir=/repo/.git --work-tree=/repo reset --hard",
            "git -c user.name=x -C /repo checkout -- .",
            "git --no-pager -C /repo reset --hard origin/dev",
            "/usr/bin/git -C /repo reset --hard",
        ):
            self.assertEqual(self._decision(command), "deny", command)

    def test_an_invocation_prefix_and_a_global_option_together_still_deny(self) -> None:
        # Both reductions have to compose: stripping only one leaves the other
        # in front of the subcommand.
        self.assertEqual(self._decision("timeout 5 git -C /repo reset --hard HEAD"), "deny")
        self.assertEqual(self._decision("FOO=1 git -C /repo reset --hard HEAD"), "deny")

    def test_the_supervisors_own_approval_surface_agrees(self) -> None:
        # command_hard_boundary_reason gates what the supervisor auto-approves.
        # A spelling that slips past it is approved without anyone reading it.
        self.assertIsNotNone(
            permission_broker.command_hard_boundary_reason("git -C /repo reset --hard HEAD")
        )

    def test_ordinary_git_work_is_untouched(self) -> None:
        # The normalization must not turn reads into refusals, and must leave
        # commands that were never denied exactly where they were.
        # `git checkout dev` became a prompt in ORCH-CANONICAL-HEAD-001, which
        # is a different contract than this one: what matters here is that
        # folding git's global options away did not turn a read into a refusal.
        self.assertNotEqual(self._decision("git checkout dev"), "deny")
        self.assertEqual(self._decision("git status"), "allow")
        for command in ("git -C /repo status", "git -C /repo log --oneline"):
            self.assertNotEqual(self._decision(command), "deny", command)

    def test_a_non_git_program_named_like_one_is_left_alone(self) -> None:
        self.assertNotEqual(self._decision("gitk -C /repo reset --hard"), "deny")


class CanonicalCheckoutHeadGuardTests(unittest.TestCase):
    """Moving HEAD in a working tree several sessions share.

    Nothing is lost by a branch switch, so this is not a deny -- but the
    canonical checkout is shared, and a switch under another session's feet
    makes its next commit land on the wrong branch. On 2026-08-19 that happened
    twice: `git status` in one session showed another's staged rename, and HEAD
    moved to ci/canonical-consistency-v2 mid-task, so commits had to be made
    with explicit pathspecs to avoid capturing an index nobody there owned.

    The operation is legitimate; it just belongs in a tree the session owns.
    ORCH-SESSION-CLAIM-001 made owning one possible, so the same command inside
    a worktree has to stay exactly as frictionless as it was.
    """

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name) / "repo"
        root.mkdir()
        run = lambda *a: subprocess.run(["git", "-C", str(root), *a], check=True, capture_output=True)
        subprocess.run(["git", "init", "-q", "-b", "dev", str(root)], check=True)
        run("config", "user.email", "t@example.com")
        run("config", "user.name", "t")
        (root / "seed").write_text("seed\n", encoding="utf-8")
        run("add", "seed")
        run("commit", "-qm", "seed")
        self.root = root.resolve()
        self.worktree = (self.root / ".artifacts" / "worktrees" / "session").resolve()
        run("worktree", "add", "--detach", "-q", str(self.worktree))
        self._env = mock.patch.dict(os.environ, {"ORCH_CANONICAL_ROOT": str(self.root)}, clear=False)
        self._env.start()
        permission_broker._WORKSPACE_ROOTS_CACHE = None

    def tearDown(self) -> None:
        self._env.stop()
        # The cache outlives the patch, so leaving it set would point every
        # later test's boundary at a directory that no longer exists.
        permission_broker._WORKSPACE_ROOTS_CACHE = None
        self._tmp.cleanup()

    def test_a_branch_switch_in_the_shared_tree_is_held_for_a_person(self) -> None:
        for command in ("git checkout dev", "git checkout -b feature/x", "git switch dev", "git rebase dev"):
            self.assertEqual(permission_broker.classify_command(command), "defer", command)

    def test_the_same_switch_inside_a_worktree_is_untouched(self) -> None:
        # The whole point of the claim: a session that isolated itself must not
        # pay for it. Read with the cd, not segment by segment -- reading the
        # git segment alone resolves it against the canonical root.
        self.assertFalse(
            permission_broker._moves_head_in_the_canonical_checkout(
                f"cd {self.worktree} && git checkout -b feature/x"
            )
        )
        self.assertFalse(
            permission_broker._moves_head_in_the_canonical_checkout(
                f"git -C {self.worktree} switch dev"
            )
        )

    def test_a_linked_worktree_is_not_mistaken_for_the_main_checkout(self) -> None:
        # git writes `.git` as a directory in the main checkout and as a file
        # in every linked worktree, which is what tells them apart here.
        self.assertEqual(permission_broker._enclosing_main_checkout(self.root), self.root)
        self.assertIsNone(permission_broker._enclosing_main_checkout(self.worktree))

    def test_a_denied_command_is_still_denied_not_softened_to_a_prompt(self) -> None:
        # The guard runs after the deny scan on purpose.
        self.assertEqual(permission_broker.classify_command("git reset --hard origin/dev"), "deny")
        self.assertEqual(
            permission_broker.classify_command(f"git -C {self.root} reset --hard HEAD"), "deny"
        )

    def test_work_that_does_not_move_head_is_unaffected(self) -> None:
        for command in ("git status", "git log --oneline", "git commit -m x",
                        "git push origin HEAD", "git pull --ff-only"):
            self.assertEqual(permission_broker.classify_command(command), "allow", command)
        # `git worktree add` is how a session gets a tree of its own, so the
        # guard must not be what stands in its way. Its overall classification
        # depends on path-boundary rules this change does not touch, so the
        # assertion is on the guard itself.
        self.assertFalse(
            permission_broker._moves_head_in_the_canonical_checkout("git worktree add x dev")
        )


if __name__ == "__main__":
    unittest.main()


class AntigravityCapabilityTest(unittest.TestCase):

    def _config(self, *, adapter: str = "antigravity", config_home: str | None = None) -> dict:
        antigravity: dict = {"cli": "agy"}
        if config_home:
            antigravity["config_home"] = config_home
        return {
            "agents": {"gemini": {"provider": "gemini", "adapter": adapter}},
            "providers": {"gemini": {"delivery_mode": "gemini", "antigravity": antigravity}},
        }

    def test_app_data_dir_follows_config_home(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            self.assertEqual(
                _antigravity_app_data_dir({"config_home": tmpdir}),
                Path(tmpdir) / ".gemini" / "antigravity-cli",
            )

    def test_auth_ready_requires_a_non_empty_oauth_token(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            settings = {"cli": "agy", "config_home": tmpdir}
            base = Path(tmpdir) / ".gemini" / "antigravity-cli"
            base.mkdir(parents=True)

            self.assertFalse(_antigravity_auth_ready(settings))

            token = base / "antigravity-oauth-token"
            token.write_text("", encoding="utf-8")
            self.assertFalse(_antigravity_auth_ready(settings))

            token.write_text("token-material", encoding="utf-8")
            self.assertTrue(_antigravity_auth_ready(settings))

    def test_identity_follows_token_not_profile_directory(self) -> None:
        with tempfile.TemporaryDirectory() as left, tempfile.TemporaryDirectory() as right:
            for root in (left, right):
                base = Path(root) / ".gemini" / "antigravity-cli"
                base.mkdir(parents=True)
                (base / "antigravity-oauth-token").write_text("shared-token", encoding="utf-8")

            left_identity = _antigravity_identity({"config_home": left})
            right_identity = _antigravity_identity({"config_home": right})

        self.assertEqual(left_identity["fingerprint"], right_identity["fingerprint"])
        self.assertEqual(left_identity["quota_pool"], right_identity["quota_pool"])

    def test_assume_authed_short_circuits(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            self.assertTrue(
                _antigravity_auth_ready({"config_home": tmpdir, "assume_authed": "true"})
            )


class CompoundCommandClassificationTest(unittest.TestCase):
    """Every part of a compound command has to clear the gate on its own.

    SAFE_BASH_PATTERNS are anchored with ^ but not $, and used to be applied
    with .search() against the whole command, so anything after the first safe
    token was never inspected.
    """

    def test_deny_pattern_in_a_later_segment_denies_the_whole_command(self) -> None:
        self.assertEqual(
            permission_broker.classify_command("echo hi && git reset --hard HEAD~5"),
            "deny",
        )
        self.assertEqual(
            permission_broker.classify_command("git status && sudo rm -rf /etc"),
            "deny",
        )

    def test_unsafe_tail_after_safe_prefix_is_not_allowed(self) -> None:
        self.assertEqual(
            permission_broker.classify_command(
                "git status ; rm -rf /home/lupin/drts-fleet-platform"
            ),
            "defer",
        )

    def test_command_substitution_is_not_allowed(self) -> None:
        for command in ("echo $(rm -rf /tmp/x)", "echo `rm -rf /tmp/x`"):
            self.assertEqual(
                permission_broker.classify_command(command), "defer", command
            )

    def test_write_redirection_is_not_allowed(self) -> None:
        self.assertEqual(
            permission_broker.classify_command("echo pwned > /home/lupin/.bashrc"),
            "defer",
        )

    def test_descriptor_redirection_is_still_allowed(self) -> None:
        self.assertEqual(
            permission_broker.classify_command("git status 2>&1"), "allow"
        )

    def test_separator_inside_quotes_does_not_split(self) -> None:
        # The `;` here is data, not a separator; this stays a single echo.
        self.assertEqual(
            permission_broker.classify_command('echo "a ; rm -rf /tmp/x"'), "allow"
        )

    def test_all_read_only_segments_are_allowed(self) -> None:
        # Exactly the diagnostics Claude workers were being blocked on.
        self.assertEqual(
            permission_broker.classify_command(
                "git branch -a --list '*iam*' 2>&1; echo '---'; git worktree list 2>&1 | head -20"
            ),
            "allow",
        )

    def test_single_safe_command_is_unchanged(self) -> None:
        for command in ("git status", "ls -la", "git log --oneline | head -5"):
            self.assertEqual(
                permission_broker.classify_command(command), "allow", command
            )


class ReadOnlyGitQueryTest(unittest.TestCase):
    def test_read_only_git_queries_are_allowed(self) -> None:
        for command in (
            "git worktree list",
            "git rev-parse HEAD",
            "git ls-tree -r --name-only HEAD",
            "git for-each-ref --format='%(refname)'",
            "git rev-list --count HEAD",
        ):
            self.assertEqual(
                permission_broker.classify_command(command), "allow", command
            )


class DestructiveRemovalTest(unittest.TestCase):
    """`rm` is no longer routine: deleting files needs a human decision."""

    def test_rm_requires_review(self) -> None:
        for command in ("rm file.txt", "rm -rf /tmp/scratch", "rm -r build"):
            self.assertEqual(
                permission_broker.classify_command(command), "defer", command
            )

    def test_rm_of_filesystem_root_is_still_denied(self) -> None:
        self.assertEqual(permission_broker.classify_command("rm -rf /"), "deny")


class WorkspaceRootBoundaryTest(unittest.TestCase):
    """The trust boundary is the workspace, not wherever this code is running.

    The supervisor executes from a reviewed runtime bundle that is not the
    canonical checkout. Deriving the boundary from the module's own location
    pointed every path check at the bundle, so the commands workers are told to
    run — which start `cd <canonical root>` — were all held for approval, while
    the canonical-root pnpm guard was watching the bundle instead.
    """

    def setUp(self) -> None:
        permission_broker._WORKSPACE_ROOTS_CACHE = None

    def tearDown(self) -> None:
        permission_broker._WORKSPACE_ROOTS_CACHE = None

    def test_canonical_root_comes_from_the_worker_environment(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "ORCH_CANONICAL_ROOT": "/home/example/repo",
                "ORCH_WORKSPACE_ROOT": "/home/example/repo/.artifacts/worktrees/task",
            },
            clear=False,
        ):
            roots = [str(root) for root in permission_broker.workspace_roots()]

        self.assertEqual(roots[0], "/home/example/repo")
        self.assertIn("/home/example/repo/.artifacts/worktrees/task", roots)

    def test_commands_in_the_canonical_root_are_not_held_for_approval(self) -> None:
        with mock.patch.dict(
            os.environ, {"ORCH_CANONICAL_ROOT": "/home/example/repo"}, clear=False
        ):
            self.assertEqual(
                permission_broker.classify_command(
                    "cd /home/example/repo && git status"
                ),
                "allow",
            )

    def test_a_dispatched_worktree_outside_the_canonical_root_is_honoured(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "ORCH_CANONICAL_ROOT": "/home/example/repo",
                "ORCH_WORKSPACE_ROOT": "/srv/isolated/task-worktree",
            },
            clear=False,
        ):
            self.assertEqual(
                permission_broker.classify_command(
                    "cd /srv/isolated/task-worktree && ls"
                ),
                "allow",
            )

    def test_paths_outside_every_known_root_still_need_review(self) -> None:
        with mock.patch.dict(
            os.environ, {"ORCH_CANONICAL_ROOT": "/home/example/repo"}, clear=False
        ):
            self.assertEqual(
                permission_broker.classify_command("cd /etc && ls"), "defer"
            )

    def test_canonical_root_pnpm_install_guard_follows_the_canonical_root(self) -> None:
        with mock.patch.dict(
            os.environ, {"ORCH_CANONICAL_ROOT": "/home/example/repo"}, clear=False
        ):
            self.assertEqual(
                permission_broker.classify_command(
                    "cd /home/example/repo && pnpm install"
                ),
                "defer",
            )


class CommandSubstitutionBoundaryTest(unittest.TestCase):
    """`$(...)` is judged like `$VAR`, because neither can be judged statically.

    `git -C "$WT" status` was already permitted, so refusing `WT=$(pwd)` drew
    the line by syntax rather than by risk — and deadlocked ordinary shell
    idiom: five real approvals were held on `cb=$(git merge-base ...)`.
    """

    def _reason(self, command: str):
        return permission_broker.command_hard_boundary_reason(command)

    def test_value_producing_substitution_is_the_reviewers_call(self) -> None:
        for command in (
            "cb=$(git merge-base origin/dev origin/x); git diff $cb origin/x -- a.ts",
            'grep -rn "x" $(readlink -f apps/api/node_modules/@drts/contracts)/src',
            "x=$(pwd); echo $x",
            "x=$(echo $(pwd)); ls",
        ):
            self.assertIsNone(self._reason(command), command)

    def test_it_matches_how_plain_variables_are_already_treated(self) -> None:
        self.assertIsNone(self._reason('WT=/tmp/x; git -C "$WT" rev-parse HEAD'))
        self.assertIsNone(self._reason('WT=$(pwd); git -C "$WT" rev-parse HEAD'))

    def test_destructive_content_inside_a_substitution_still_stops_it(self) -> None:
        # `^`-anchored DENY patterns would skip over a substitution body, so the
        # bodies are checked in their own right.
        for command in (
            "x=$(rm -rf /); echo $x",
            "x=$(sudo cat /etc/shadow); echo $x",
            "y=$(git reset --hard HEAD~3); echo $y",
        ):
            reason = self._reason(command)
            self.assertIsNotNone(reason, command)
            self.assertIn("denied pattern", reason, command)

    def test_a_write_inside_a_substitution_still_stops_it(self) -> None:
        reason = self._reason("x=$(echo pwned > /home/lupin/.bashrc)")
        self.assertIsNotNone(reason)
        self.assertIn("writes outside", reason)

    def test_backticks_and_process_substitution_remain_refused(self) -> None:
        # Rare in ordinary usage, and backticks do not nest, so the cost of
        # keeping them out is low.
        for command in ("echo `rm -rf /tmp/x`", "diff <(ls) <(ls)"):
            self.assertIsNotNone(self._reason(command), command)

    def test_an_unbalanced_substitution_is_refused(self) -> None:
        reason = self._reason("x=$(echo unbalanced")
        self.assertIsNotNone(reason)
        self.assertIn("unbalanced", reason)

    def test_classify_command_is_unchanged_for_substitution(self) -> None:
        # Substitution still never runs unreviewed; only the reviewer's reach
        # changes.
        self.assertEqual(permission_broker.classify_command("x=$(pwd); echo $x"), "defer")


class HookPathIsNotASnapshotTests(unittest.TestCase):
    """The hook must name the repository, not wherever the generator ran.

    `_verified_claude_hooks` built the broker path from SOURCE_ROOT, which is
    the tree this code lives in. A sync run from a release copy therefore baked
    that release's path into the hook permanently -- the live settings still
    named .artifacts/releases/current/... from whenever that last happened.

    That is how `current` acquired a consumer at all. Nothing referenced it on
    purpose; a snapshot did, which left two release pointers with nothing to
    reconcile them and no reason for anyone to keep them together.
    """

    def _command(self) -> str:
        hooks = provider_permissions._verified_claude_hooks()
        return hooks["PreToolUse"][0]["hooks"][0]["command"]

    def test_the_hook_does_not_depend_on_a_release_pointer(self) -> None:
        command = self._command()

        self.assertNotIn(".artifacts/releases/", command)

    def test_the_hook_names_the_canonical_checkout(self) -> None:
        command = self._command()

        self.assertIn(
            str(provider_permissions.ROOT / "tools" / "development-orchestrator"),
            command,
        )

    def test_the_path_is_stable_when_the_code_lives_elsewhere(self) -> None:
        """A release copy generating settings must not pin itself into them."""
        elsewhere = Path("/somewhere/.artifacts/releases/orchestrator-abc123")

        with mock.patch.object(provider_permissions, "SOURCE_ROOT", elsewhere):
            command = self._command()

        self.assertNotIn("orchestrator-abc123", command)
