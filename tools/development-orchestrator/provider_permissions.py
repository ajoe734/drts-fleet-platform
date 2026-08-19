#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import shutil
import base64
from pathlib import Path
from typing import Any

from control_plane.domain.lane_health import identity_fingerprint, quota_pool_key

from common import (
    ROOT,
    SOURCE_ROOT,
    command_exists,
    config_path,
    load_config,
    load_json,
    run_command,
    runtime_env_overrides,
    to_bool,
    utc_now,
    write_json,
)
from provider_credentials import (
    copilot_plaintext_token as _copilot_plaintext_token,
    gemini_settings as _gemini_settings,
    truthy_env as _truthy_env,
)

WORKSPACE_SETTINGS_PATH = ROOT / ".vscode" / "settings.json"
CLAUDE_LOCAL_SETTINGS_PATH = ROOT / ".claude" / "settings.local.json"
CLAUDE_LOCAL_EXAMPLE_PATH = ROOT / ".claude" / "settings.local.example.json"
GEMINI_SETTINGS_PATH = Path.home() / ".gemini" / "settings.json"
GEMINI_OAUTH_CREDS_PATH = Path.home() / ".gemini" / "oauth_creds.json"


def _workspace_settings() -> dict[str, Any]:
    return load_json(WORKSPACE_SETTINGS_PATH, default={}) or {}


def _claude_local_settings() -> dict[str, Any]:
    return load_json(CLAUDE_LOCAL_SETTINGS_PATH, default={}) or {}


def _codex_home(runtime: dict[str, Any] | None = None) -> Path:
    config_home = str((runtime or {}).get("config_home") or "").strip()
    if config_home:
        return Path(os.path.expandvars(os.path.expanduser(config_home)))
    return Path.home() / ".codex"


def _codex_env(runtime: dict[str, Any] | None = None) -> dict[str, str]:
    env = os.environ.copy()
    home = _codex_home(runtime)
    if runtime and str(runtime.get("config_home") or "").strip():
        env["CODEX_HOME"] = str(home)
    return env


def _jwt_claims(token: str | None) -> dict[str, Any]:
    try:
        payload = str(token or "").split(".")[1]
        payload += "=" * (-len(payload) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8"))
        return decoded if isinstance(decoded, dict) else {}
    except (IndexError, ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return {}


def _codex_identity(runtime: dict[str, Any]) -> dict[str, Any]:
    payload = load_json(_codex_home(runtime) / "auth.json", default={}) or {}
    tokens = payload.get("tokens") if isinstance(payload, dict) else {}
    claims = _jwt_claims((tokens or {}).get("id_token") if isinstance(tokens, dict) else None)
    auth = claims.get("https://api.openai.com/auth") if isinstance(claims.get("https://api.openai.com/auth"), dict) else {}
    account = auth.get("chatgpt_account_id") or claims.get("sub") or (tokens or {}).get("account_id")
    organization = auth.get("poid") or claims.get("organization_id")
    fingerprint = identity_fingerprint("codex", str(account or ""), str(organization or ""))
    quota_scope = str(runtime.get("quota_scope") or runtime.get("model") or "default")
    return {
        "state": "auth_ready" if fingerprint else "identity_unknown",
        "fingerprint": fingerprint,
        "quota_pool": quota_pool_key("codex", fingerprint, quota_scope),
        "provider_family": "codex",
    }


def _claude_identity(binary: str | None, runtime: dict[str, Any]) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(runtime_env_overrides(runtime))
    response = run_command([binary, "auth", "status"], env=env) if binary else None
    try:
        payload = json.loads(response.stdout) if response and response.returncode == 0 else {}
    except json.JSONDecodeError:
        payload = {}
    account = payload.get("email") or payload.get("userId")
    organization = payload.get("orgId")
    fingerprint = identity_fingerprint("claude", str(account or ""), str(organization or ""))
    quota_scope = str(runtime.get("quota_scope") or runtime.get("model") or "default")
    return {
        "state": "auth_ready" if fingerprint else "identity_unknown",
        "fingerprint": fingerprint,
        "quota_pool": quota_pool_key("claude", fingerprint, quota_scope),
        "provider_family": "claude",
    }


def _gemini_env_auth_type(env: dict[str, str] | None = None) -> str | None:
    source = env or os.environ
    if _truthy_env("GOOGLE_GENAI_USE_GCA", source):
        return "oauth-personal"
    if _truthy_env("GEMINI_CLI_USE_COMPUTE_ADC", source):
        return "compute-default-credentials"
    if _truthy_env("GOOGLE_GENAI_USE_VERTEXAI", source):
        return "vertex-ai"
    if source.get("GEMINI_API_KEY"):
        return "gemini-api-key"
    return None


def _gemini_selected_auth_type(
    settings: dict[str, Any],
    *,
    env: dict[str, str] | None = None,
    oauth_creds_path: Path = GEMINI_OAUTH_CREDS_PATH,
) -> str | None:
    return (
        _gemini_env_auth_type(env)
        or settings.get("security", {}).get("auth", {}).get("selectedType")
        or ("oauth-personal" if oauth_creds_path.exists() else None)
    )


# Mirrors adapters/antigravity.py: `agy` keeps its OAuth token under the app
# data dir, and `config_home` maps to the HOME the CLI runs with.
ANTIGRAVITY_TOKEN_CANDIDATES = (
    "antigravity-oauth-token",
    "auth.json",
    "credentials.json",
    "token.json",
    "oauth_creds.json",
)


def _antigravity_app_data_dir(settings: dict[str, Any]) -> Path:
    explicit = settings.get("app_data_dir")
    if explicit:
        return Path(str(explicit)).expanduser()
    config_home = settings.get("config_home")
    if config_home:
        return Path(str(config_home)).expanduser() / ".gemini" / "antigravity-cli"
    return Path.home() / ".gemini" / "antigravity-cli"


def _antigravity_auth_ready(settings: dict[str, Any]) -> bool:
    if str(settings.get("assume_authed") or "").strip().lower() in {"1", "true", "yes", "on"}:
        return True
    explicit = settings.get("token_path")
    if explicit:
        path = Path(str(explicit)).expanduser()
        return path.exists() and path.stat().st_size > 0
    base = _antigravity_app_data_dir(settings)
    for name in ANTIGRAVITY_TOKEN_CANDIDATES:
        path = base / name
        if path.exists() and path.stat().st_size > 0:
            return True
    return False


def _antigravity_identity(settings: dict[str, Any]) -> dict[str, Any]:
    explicit = settings.get("token_path")
    candidates = (
        [Path(str(explicit)).expanduser()]
        if explicit
        else [_antigravity_app_data_dir(settings) / name for name in ANTIGRAVITY_TOKEN_CANDIDATES]
    )
    account_material = ""
    for path in candidates:
        try:
            token = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if not token:
            continue
        account_material = token
        try:
            payload = json.loads(token)
        except json.JSONDecodeError:
            payload = {}
        if isinstance(payload, dict):
            account_material = str(
                payload.get("email")
                or payload.get("account_id")
                or payload.get("user_id")
                or payload.get("sub")
                or token
            )
            for value in payload.values():
                if not isinstance(value, str):
                    continue
                claims = _jwt_claims(value)
                account_material = str(
                    claims.get("email") or claims.get("sub") or account_material
                )
                if account_material != token:
                    break
        else:
            claims = _jwt_claims(token)
            account_material = str(claims.get("email") or claims.get("sub") or token)
        break
    fingerprint = identity_fingerprint("antigravity", account_material)
    return {
        "state": "auth_ready" if fingerprint else "identity_unknown",
        "fingerprint": fingerprint,
        "quota_pool": quota_pool_key("antigravity", fingerprint, "all-models"),
        "provider_family": "antigravity",
    }


def _json_command(command: list[str], *, env: dict[str, str] | None = None) -> dict[str, Any]:
    result = run_command(command, env=env)
    if result.returncode != 0 or not result.stdout:
        return {}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return {}


def _claude_auth_ready(binary: str | None, *, env: dict[str, str] | None = None) -> bool:
    if not binary:
        return False
    payload = _json_command([binary, "auth", "status"], env=env)
    return bool(payload.get("loggedIn"))


def _codex_auth_ready(binary: str | None, *, env: dict[str, str] | None = None) -> bool:
    if not binary:
        return False
    result = run_command([binary, "login", "status"], env=env)
    output = ((result.stdout or "") + (result.stderr or "")).lower()
    return result.returncode == 0 and "logged in" in output and "not logged in" not in output


def _gh_auth_token(binary: str | None) -> str | None:
    if not binary:
        return None
    result = run_command([binary, "auth", "token"])
    token = (result.stdout or "").strip()
    return token or None


def _copilot_auth_ready(gh_binary: str | None) -> bool:
    if _gh_auth_token(gh_binary):
        return True
    if any(os.environ.get(name) for name in ("COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN")):
        return True
    return bool(_copilot_plaintext_token())


def _verified_claude_policy(config: dict[str, Any]) -> dict[str, Any]:
    approval = config.get("providers", {}).get("claude", {}).get("approval", {})
    safe_allow = [
        "Bash(pwd)",
        "Bash(ls *)",
        "Bash(find *)",
        "Bash(rg *)",
        "Bash(cat *)",
        "Bash(sed *)",
        "Bash(head *)",
        "Bash(tail *)",
        "Bash(lsof *)",
        "Bash(git status*)",
        "Bash(git diff*)",
        "Bash(git show*)",
        "Bash(git push *)",
        "Bash(gh issue comment *)",
        "Bash(gh pr create *)",
        "Bash(bash tools/development-orchestrator/bin/ai-status.sh *)",
        "Bash(AI_NAME=* bash tools/development-orchestrator/bin/ai-status.sh *)",
        "Bash(AI_NAME=* bash */tools/development-orchestrator/bin/ai-status.sh *)",
        "Bash(bash */tools/development-orchestrator/bin/ai-status.sh *)",
        "Bash(python3 *)",
        "Bash(python3 -c *)",
        "Bash(cd * && python3 *)",
        "Bash(python3 tools/development-orchestrator/bin/ai_status.py *)",
        "Bash(python3 */tools/development-orchestrator/bin/ai_status.py *)",
        "Bash(cd * && python3 tools/development-orchestrator/bin/ai_status.py *)",
        "Bash(cd * && python3 */tools/development-orchestrator/bin/ai_status.py *)",
        "Bash(AI_NAME=* python3 *)",
        "Bash(AI_NAME=* cd * && python3 *)",
        "Bash(cd * && bash tools/development-orchestrator/bin/ai-status.sh *)",
        "Bash(cd * && bash */tools/development-orchestrator/bin/ai-status.sh *)",
        "Bash(python3 -m unittest discover *)",
        "Bash(cd * && python3 -m unittest discover *)",
        "Bash(python3 -m pytest*)",
        "Bash(cd * && python3 -m pytest*)",
        "Bash(pytest*)",
        "Bash(cd * && pytest*)",
        "Bash(pnpm test*)",
        "Bash(cd * && pnpm test*)",
        "Bash(pnpm run test*)",
        "Bash(cd * && pnpm run test*)",
        "Bash(pnpm --filter * test*)",
        "Bash(pnpm --filter * run test*)",
        "Bash(pnpm exec vitest*)",
        "Bash(cd * && pnpm exec vitest*)",
        "Bash(pnpm vitest*)",
        "Bash(cd * && pnpm vitest*)",
        "Bash(vitest*)",
        "Bash(cd * && vitest*)",
        "Bash(jest*)",
        "Bash(cd * && jest*)",
        "Bash(npx vitest*)",
        "Bash(cd * && npx vitest*)",
        "Bash(apt-get install*python3-pytest*)",
        "Bash(apt install*python3-pytest*)",
        "Bash(python3 -m pip install*pytest*)",
        "Bash(pip install*pytest*)",
        "Bash(pip3 install*pytest*)",
        "Bash(npm test*)",
        "Bash(cd * && npm test*)",
        "Bash(npm run test*)",
        "Bash(cd * && npm run test*)",
        "Bash(cargo test*)",
        "Bash(cd * && cargo test*)",
        "Bash(go test*)",
        "Bash(cd * && go test*)",
        "Bash(python3 -m py_compile *)",
        "Bash(cd * && python3 -m py_compile *)",
        "Bash(python3 */smoke_test.py*)",
        "Bash(cd * && python3 smoke_test.py*)",
        "Bash(curl http://127.0.0.1:*)",
        "Bash(curl -s http://127.0.0.1:*)",
        "Bash(curl -I http://127.0.0.1:*)",
        "Bash(curl http://localhost:*)",
        "Bash(curl -s http://localhost:*)",
        "Bash(curl -I http://localhost:*)",
        "Bash(python3 */tools/development-orchestrator/bin/dashboard_server.py *)",
        "Bash(nohup python3 */tools/development-orchestrator/bin/dashboard_server.py *)",
        "Bash(pkill -f *dashboard_server.py*)",
        "Bash(AI_NAME=* python3 tools/development-orchestrator/bin/ai_status.py *)",
        "Bash(AI_NAME=* python3 */tools/development-orchestrator/bin/ai_status.py *)",
        "Bash(AI_NAME=* cd * && python3 tools/development-orchestrator/bin/ai_status.py *)",
        "Bash(AI_NAME=* cd * && python3 */tools/development-orchestrator/bin/ai_status.py *)",
    ]
    ask = [
        "Bash(curl *)",
        "Bash(wget *)",
        "Bash(apt *)",
        "Bash(npm install *)",
        "Bash(pip install *)",
        "Bash(docker *)",
    ]
    deny = [
        "Bash(git reset --hard*)",
        "Bash(git checkout -- *)",
        "Bash(sudo *)",
        "Bash(rm -rf /*)",
        "Bash(chmod 777 *)",
    ]
    return {
        "defaultMode": approval.get("rule_default_mode", "acceptEdits"),
        "disableBypassPermissionsMode": "disable" if approval.get("disable_bypass_permissions", True) else None,
        "allow": safe_allow,
        "ask": ask,
        "deny": deny,
    }


def _verified_claude_hooks() -> dict[str, Any]:
    broker_path = SOURCE_ROOT / "tools" / "development-orchestrator" / "permission_broker.py"
    command = f"python3 {broker_path} hook"
    hook = lambda event: [{"hooks": [{"type": "command", "command": f"{command} {event}", "shell": "bash"}]}]
    return {
        "PreToolUse": hook("PreToolUse"),
        "PermissionRequest": hook("PermissionRequest"),
        "PermissionDenied": hook("PermissionDenied"),
        "PostToolUse": hook("PostToolUse"),
        "SessionStart": hook("SessionStart"),
        "SessionEnd": hook("SessionEnd"),
        "Stop": hook("Stop"),
    }


def _is_managed_permission_broker_hook(entry: Any) -> bool:
    if not isinstance(entry, dict):
        return False
    return any(
        isinstance(hook, dict)
        and "permission_broker.py" in str(hook.get("command", ""))
        for hook in entry.get("hooks", [])
    )


def desired_workspace_settings(config: dict[str, Any]) -> dict[str, Any]:
    claude_approval = config.get("providers", {}).get("claude", {}).get("approval", {})
    gemini_approval = config.get("providers", {}).get("gemini", {}).get("approval", {})
    return {
        "claudeCode.initialPermissionMode": claude_approval.get("workspace_permission_mode", "acceptEdits"),
        "claudeCode.allowDangerouslySkipPermissions": to_bool(claude_approval.get("allow_dangerous_skip", False)),
        "github.copilot.chat.backgroundAgent.enabled": True,
        "github.copilot.chat.cloudAgent.enabled": True,
        "github.copilot.chat.claudeAgent.enabled": True,
        "github.copilot.chat.claudeAgent.allowDangerouslySkipPermissions": to_bool(
            claude_approval.get("copilot_allow_dangerous_skip", False)
        ),
        "github.copilot.chat.reviewAgent.enabled": True,
        "geminicodeassist.enable": True,
        "geminicodeassist.agentYoloMode": to_bool(gemini_approval.get("workspace_agent_yolo_mode", False)),
    }


def desired_claude_local_settings(config: dict[str, Any], current: dict[str, Any] | None = None) -> dict[str, Any]:
    existing = current or {}
    permissions = existing.get("permissions", {})
    verified_policy = _verified_claude_policy(config)
    allow_values = list(dict.fromkeys([*(permissions.get("allow", []) or []), *verified_policy["allow"]]))
    ask_values = list(dict.fromkeys([*(permissions.get("ask", []) or []), *verified_policy["ask"]]))
    deny_values = list(dict.fromkeys([*(permissions.get("deny", []) or []), *verified_policy["deny"]]))
    allow_set = set(allow_values)
    ask_values = [value for value in ask_values if value not in allow_set]
    ask_set = set(ask_values)
    deny_values = [value for value in deny_values if value not in allow_set and value not in ask_set]
    next_permissions = {
        **permissions,
        "allow": allow_values,
        "ask": ask_values,
        "deny": deny_values,
        "defaultMode": verified_policy["defaultMode"],
    }
    if verified_policy["disableBypassPermissionsMode"]:
        next_permissions["disableBypassPermissionsMode"] = verified_policy["disableBypassPermissionsMode"]
    hooks = existing.get("hooks", {})
    merged_hooks = {**hooks}
    for event, hook_entries in _verified_claude_hooks().items():
        existing_entries = [
            entry
            for entry in hooks.get(event, [])
            if not _is_managed_permission_broker_hook(entry)
        ]
        serialized_existing = {json.dumps(entry, sort_keys=True) for entry in existing_entries}
        merged = list(existing_entries)
        for entry in hook_entries:
            payload = json.dumps(entry, sort_keys=True)
            if payload not in serialized_existing:
                merged.append(entry)
        merged_hooks[event] = merged
    return {**existing, "permissions": next_permissions, "hooks": merged_hooks}


def desired_gemini_settings(config: dict[str, Any]) -> dict[str, Any]:
    approval = config.get("providers", {}).get("gemini", {}).get("approval", {})
    auth_type = _gemini_selected_auth_type(_gemini_settings())
    security: dict[str, Any] = {
        "enablePermanentToolApproval": to_bool(approval.get("enable_permanent_tool_approval", True)),
        "autoAddToPolicyByDefault": to_bool(approval.get("auto_add_to_policy_by_default", True)),
        "disableYoloMode": to_bool(approval.get("disable_yolo_mode", False)),
        "disableAlwaysAllow": to_bool(approval.get("disable_always_allow", False)),
    }
    if auth_type:
        security["auth"] = {"selectedType": auth_type}
    return {
        "general": {
            "defaultApprovalMode": approval.get("default_approval_mode", "auto_edit"),
        },
        "security": security,
    }


def provider_capabilities(config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Report only capabilities used by configured CLI worker lanes."""
    config = config or load_config()
    try:
        search_roots = [config_path(config, "status_file").parents[0]]
    except KeyError:
        search_roots = [ROOT]

    providers: dict[str, dict[str, Any]] = {}
    agents = config.get("agents", {}) or {}
    for provider_key, provider_cfg in (config.get("providers", {}) or {}).items():
        if not isinstance(provider_cfg, dict):
            continue
        matching_agents = [
            (agent_id, agent)
            for agent_id, agent in agents.items()
            if isinstance(agent, dict)
            and str(agent.get("provider") or agent_id).strip() == provider_key
        ]
        adapter = str(
            (matching_agents[0][1].get("adapter") if matching_agents else "")
            or provider_cfg.get("delivery_mode")
            or "file_inbox"
        )
        mode = str(provider_cfg.get("delivery_mode") or adapter)
        installed = False
        auth_ready = False
        identity: dict[str, Any] | None = None
        paths: dict[str, Any] = {}
        selected_model: str | None = None
        host_layer = "File inbox"
        notes = "No configured automatic CLI delivery."

        if adapter == "codex" or mode == "codex":
            runtime = provider_cfg.get("codex", {}) or {}
            binary = command_exists(runtime.get("cli") or "codex", search_roots=search_roots)
            installed = bool(binary)
            auth_ready = bool(binary and _codex_auth_ready(binary, env=_codex_env(runtime)))
            identity = _codex_identity(runtime)
            home = _codex_home(runtime)
            selected_model = str(runtime.get("model") or "").strip() or None
            paths = {
                "binary": binary,
                "config": str(home / "config.toml"),
                "auth_json": str(home / "auth.json") if (home / "auth.json").exists() else None,
                "config_home": runtime.get("config_home"),
                "resolved_codex_home": str(home),
            }
            host_layer = "Codex CLI"
            notes = "Readiness requires the configured Codex CLI and a valid isolated login."

        elif adapter == "claude_cli" or mode == "claude_cli":
            runtime = provider_cfg.get("runtime", {}) or {}
            env = os.environ.copy()
            env.update(runtime_env_overrides(runtime))
            binary = command_exists(runtime.get("cli") or "claude", search_roots=search_roots)
            installed = bool(binary)
            auth_ready = bool(binary and _claude_auth_ready(binary, env=env))
            identity = _claude_identity(binary, runtime)
            selected_model = str(runtime.get("model") or "").strip() or None
            paths = {
                "binary": binary,
                "config_home": runtime.get("config_home"),
                "resolved_home": env.get("HOME"),
                "resolved_xdg_config_home": env.get("XDG_CONFIG_HOME"),
            }
            host_layer = "Claude CLI"
            notes = "Readiness requires the configured Claude CLI and account-scoped auth status."

        elif adapter == "antigravity":
            settings = provider_cfg.get("antigravity", {}) or {}
            binary = command_exists(settings.get("cli") or "agy", search_roots=search_roots)
            installed = bool(binary)
            auth_ready = bool(binary and _antigravity_auth_ready(settings))
            identity = _antigravity_identity(settings)
            rotation = settings.get("model_rotation", {}) or {}
            selected_model = str(rotation.get("primary") or settings.get("model") or "").strip() or None
            app_data = _antigravity_app_data_dir(settings)
            paths = {
                "binary": binary,
                "antigravity_app_data": str(app_data),
                "config_home": settings.get("config_home"),
            }
            host_layer = "Antigravity CLI"
            notes = "Readiness requires agy plus the OAuth token in this lane's isolated app-data directory."

        elif adapter == "copilot_local" or mode == "copilot_local":
            local = provider_cfg.get("local", {}) or {}
            binary = command_exists(local.get("cli") or "copilot", search_roots=search_roots)
            installed = bool(binary)
            auth_ready = bool(binary and _copilot_auth_ready(command_exists("gh")))
            selected_model = str(
                (provider_cfg.get("model_preference", {}) or {}).get("default") or ""
            ).strip() or None
            paths = {"binary": binary}
            host_layer = "Copilot CLI"
            notes = "Readiness requires the local Copilot CLI and a GitHub token."

        elif adapter == "file_inbox":
            installed = True
            paths = (
                {"inbox": str(config_path(config, "inbox_dir"))}
                if "inbox_dir" in (config.get("paths") or {})
                else {}
            )

        ready = bool(installed and auth_ready)
        providers[provider_key] = {
            "installed": installed,
            "adapter": adapter,
            "host_layer": host_layer,
            "delivery_mode": mode,
            "local_cli_worker_supported": ready,
            "supports_auto_approve": ready,
            "supports_defer_resume": adapter == "claude_cli" and installed,
            "auth_ready": auth_ready,
            "selected_model": selected_model,
            "supported_models": list(
                (provider_cfg.get("model_preference", {}) or {}).get("supported", []) or []
            ),
            "verified": "verified" if ready else ("partial" if installed else "unavailable"),
            "paths": paths,
            "identity": identity,
            "notes": [notes],
        }

    agent_adapters: dict[str, dict[str, Any]] = {}
    for agent_id, agent in agents.items():
        if not isinstance(agent, dict):
            continue
        provider_key = str(agent.get("provider") or agent_id)
        provider = providers.get(provider_key, {})
        adapter = str(agent.get("adapter") or provider.get("adapter") or "file_inbox")
        can_auto_deliver = bool(provider.get("local_cli_worker_supported"))
        agent_adapters[agent_id] = {
            "adapter": adapter,
            "supported": bool(provider.get("installed")),
            "requires_manual_confirmation": not can_auto_deliver,
            "can_auto_deliver": can_auto_deliver,
            "can_auto_approve_edits": bool(provider.get("supports_auto_approve")),
            "delivery_mode": provider.get("delivery_mode") if can_auto_deliver else "file_inbox",
            "verified": provider.get("verified", "unavailable"),
            "host": provider.get("host_layer", adapter),
            "notes": (provider.get("notes") or [""])[0],
        }

    shared_state_files = {
        name: str(config_path(config, name))
        for name in ("status_file", "activity_log", "current_work", "dashboard")
        if name in (config.get("paths") or {})
    }
    return {
        "generated_at": utc_now(),
        "workspace": {
            "root": str(config_path(config, "status_file").parents[0])
            if "status_file" in (config.get("paths") or {})
            else str(ROOT),
            "shared_state_files": shared_state_files,
        },
        "agent_adapters": agent_adapters,
        "providers": providers,
    }


def write_provider_capabilities(config: dict[str, Any], report: dict[str, Any] | None = None) -> Path:
    report = report or provider_capabilities(config)
    target = config_path(config, "provider_capabilities")
    described = len(report.get("providers") or {})
    if not described:
        # A report that describes nothing must never replace one that describes
        # something. Every identity-scoped pause resolves through this file, so
        # an empty one silently releases every paused lane: on 2026-08-19 a
        # 27-hour auth pause stopped applying to both lanes it covered and the
        # dispatcher read a paused fleet as an open one.
        #
        # The invariant is deliberately about the two documents, not about the
        # config. An earlier version of this guard compared the report against
        # the providers the config declares, and the very next occurrence walked
        # straight past it -- whatever produced the empty report also presented
        # a config with no providers in it, so the comparison agreed with
        # itself. What the file already contains cannot be argued with.
        previous = load_json(target, default={}) if target.exists() else {}
        if previous.get("providers"):
            sys.stderr.write(
                f"provider capabilities: refusing to overwrite {target} -- the new report "
                f"describes 0 providers, the current one describes "
                f"{len(previous.get('providers') or {})}. Keeping it. "
                f"(config declared {len(config.get('providers') or {})} providers, "
                f"{len(config.get('agents') or {})} agents)\n")
            return target
    write_json(target, report)
    return target


def desired_sync_state(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        "workspace_settings": desired_workspace_settings(config),
        "claude_local_settings": desired_claude_local_settings(config, current=_claude_local_settings()),
        "gemini_settings": desired_gemini_settings(config),
    }


def apply_workspace_settings(config: dict[str, Any]) -> dict[str, Any]:
    settings = _workspace_settings()
    updated = {**settings, **desired_workspace_settings(config)}
    write_json(WORKSPACE_SETTINGS_PATH, updated)
    return updated


def apply_claude_local_settings(config: dict[str, Any]) -> dict[str, Any]:
    updated = desired_claude_local_settings(config, current=_claude_local_settings())
    write_json(CLAUDE_LOCAL_SETTINGS_PATH, updated)
    return updated


def apply_gemini_settings(config: dict[str, Any]) -> dict[str, Any]:
    current = _gemini_settings()
    desired = desired_gemini_settings(config)
    merged_security = {**current.get("security", {}), **desired.get("security", {})}
    if desired.get("security", {}).get("auth"):
        merged_security["auth"] = {
            **current.get("security", {}).get("auth", {}),
            **desired["security"]["auth"],
        }
    updated = {
        "general": {**current.get("general", {}), **desired.get("general", {})},
        "security": merged_security,
    }
    GEMINI_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    write_json(GEMINI_SETTINGS_PATH, updated)
    return updated


def backup_targets(config: dict[str, Any]) -> list[Path]:
    return [WORKSPACE_SETTINGS_PATH, CLAUDE_LOCAL_SETTINGS_PATH, GEMINI_SETTINGS_PATH]


def latest_backup_dir() -> Path | None:
    backups_dir = ROOT / ".orchestrator" / "backups"
    if not backups_dir.exists():
        return None
    candidates = [path for path in backups_dir.iterdir() if path.is_dir()]
    if not candidates:
        return None
    return sorted(candidates)[-1]


def write_backup_manifest(backup_dir: Path, manifest: dict[str, Any]) -> None:
    write_json(backup_dir / "manifest.json", manifest)


def load_backup_manifest(backup_dir: Path) -> dict[str, Any]:
    return load_json(backup_dir / "manifest.json", default={}) or {}


def create_backup(config: dict[str, Any]) -> Path:
    backup_dir = ROOT / ".orchestrator" / "backups" / utc_now().replace(":", "").replace("-", "")
    backup_dir.mkdir(parents=True, exist_ok=True)
    manifest = {"created_at": utc_now(), "files": []}
    for index, target in enumerate(backup_targets(config), start=1):
        entry = {"target_path": str(target), "existed": target.exists(), "backup_file": None}
        if target.exists():
            backup_name = f"{index:02d}-{target.name}"
            shutil.copy2(target, backup_dir / backup_name)
            entry["backup_file"] = backup_name
        manifest["files"].append(entry)
    write_backup_manifest(backup_dir, manifest)
    return backup_dir


def restore_backup(backup_dir: Path) -> list[str]:
    manifest = load_backup_manifest(backup_dir)
    restored: list[str] = []
    for entry in manifest.get("files", []):
        target = Path(entry["target_path"])
        if entry.get("existed"):
            backup_file = backup_dir / entry["backup_file"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(backup_file, target)
            restored.append(str(target))
        elif target.exists():
            target.unlink()
            restored.append(str(target))
    return restored


def main() -> int:
    config = load_config()
    path = write_provider_capabilities(config)
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
