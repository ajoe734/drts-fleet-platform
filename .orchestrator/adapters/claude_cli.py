from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

from adapters.base import DeliveryCapability, DeliveryRequest, DeliveryResult
from adapters.claude_code import ClaudeCodeAdapter
from common import (
    agent_config_for,
    apply_orchestrator_runtime_env,
    config_path,
    delivery_workspace_root,
    new_runtime_id,
    runtime_log_path,
    shell_quote,
    spawn_background_process,
    command_exists,
    run_command,
    runtime_env_overrides,
)

_CLAUDE_AUTH_STATUS_TIMEOUT_SECONDS = 10.0
_CLAUDE_AUTH_STATUS_TTL_SECONDS = 30.0
_CLAUDE_AUTH_READY_CACHE: dict[tuple[str, str, str, str], tuple[float, bool]] = {}


def _claude_provider_for_agent(config: dict, agent_id: str) -> tuple[str, dict]:
    agent = agent_config_for(config, agent_id)
    provider_key = str(agent.get("provider") or "claude").strip() or "claude"
    return provider_key, config.get("providers", {}).get(provider_key, {})


def _claude_runtime_env(runtime: dict, *, ensure_dirs: bool = False) -> dict[str, str]:
    overrides = runtime_env_overrides(runtime)
    if ensure_dirs:
        for key in ("HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"):
            if overrides.get(key):
                Path(overrides[key]).mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update(overrides)
    return env


def _claude_cli_path(config: dict, runtime: dict) -> str | None:
    workspace_root = config_path(config, "status_file").parents[0]
    return command_exists(runtime.get("cli") or "claude", search_roots=[workspace_root])


def _claude_auth_cache_key(cli: str, env: dict[str, str] | None) -> tuple[str, str, str, str]:
    source = env or {}
    return (
        cli,
        source.get("HOME", ""),
        source.get("CLAUDE_CONFIG_DIR", ""),
        source.get("PATH", ""),
    )


def _claude_auth_ready(cli: str | None, env: dict[str, str] | None = None) -> bool:
    if not cli:
        return False

    cache_key = _claude_auth_cache_key(cli, env)
    now = time.monotonic()
    cached = _CLAUDE_AUTH_READY_CACHE.get(cache_key)
    if cached and now - cached[0] < _CLAUDE_AUTH_STATUS_TTL_SECONDS:
        return cached[1]

    try:
        status = run_command(
            [cli, "auth", "status"],
            env=env,
            timeout=_CLAUDE_AUTH_STATUS_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        _CLAUDE_AUTH_READY_CACHE[cache_key] = (now, False)
        return False

    if status.returncode != 0 or not status.stdout:
        _CLAUDE_AUTH_READY_CACHE[cache_key] = (now, False)
        return False
    try:
        payload = json.loads(status.stdout)
    except json.JSONDecodeError:
        _CLAUDE_AUTH_READY_CACHE[cache_key] = (now, False)
        return False

    ready = bool(payload.get("loggedIn"))
    _CLAUDE_AUTH_READY_CACHE[cache_key] = (now, ready)
    return ready


class ClaudeCLIAdapter(ClaudeCodeAdapter):
    name = "claude_cli"

    def capability(self, agent_id: str) -> DeliveryCapability:
        provider_key, provider = _claude_provider_for_agent(self.config, agent_id)
        provider_info = (self.provider_capabilities or {}).get("providers", {}).get(provider_key, {})
        runtime = provider.get("runtime", {})
        cli = _claude_cli_path(self.config, runtime)
        auth_env = _claude_runtime_env(runtime)
        auth_ready = bool(provider_info.get("auth_ready")) or _claude_auth_ready(cli, env=auth_env)
        if cli and auth_ready:
            notes = "Uses non-interactive Claude CLI sessions with the local approval broker hooks."
            if runtime.get("config_home"):
                notes = f"{notes} Auth is isolated by provider runtime.config_home."
            return DeliveryCapability(
                adapter=self.name,
                supported=True,
                requires_manual_confirmation=False,
                can_auto_deliver=True,
                can_auto_approve_edits=True,
                delivery_mode="claude_cli",
                verified="verified",
                host="Claude Code CLI",
                notes=notes,
            )
        fallback = super().capability(agent_id)
        missing_reason = "Claude CLI is not installed" if not cli else "Claude CLI is installed but not authenticated"
        return DeliveryCapability(
            adapter=self.name,
            supported=fallback.supported,
            requires_manual_confirmation=True,
            can_auto_deliver=False,
            can_auto_approve_edits=fallback.can_auto_approve_edits,
            delivery_mode="file_inbox",
            verified="partial",
            host="Claude Code CLI + inbox fallback",
            notes=f"{missing_reason} for provider `{provider_key}`, so delivery falls back to the workspace inbox path.",
        )

    def deliver(self, request: DeliveryRequest) -> DeliveryResult:
        provider_key, provider = _claude_provider_for_agent(self.config, request.agent_id)
        provider_info = (self.provider_capabilities or {}).get("providers", {}).get(provider_key, {})
        runtime = provider.get("runtime", {})
        cli = _claude_cli_path(self.config, runtime)
        env = _claude_runtime_env(runtime, ensure_dirs=True)
        auth_ready = bool(provider_info.get("auth_ready")) or _claude_auth_ready(cli, env=env)
        if not cli or not auth_ready:
            result = super().deliver(request)
            result.adapter = self.name
            result.mode = "file_inbox"
            if not cli:
                result.notes = f"{result.notes}. Claude CLI is unavailable, so inbox fallback was used."
            else:
                result.notes = f"{result.notes}. Claude CLI provider `{provider_key}` is not authenticated, so inbox fallback was used."
            return result

        output_format = runtime.get("output_format", "stream-json")
        command = [
            cli,
            "-p",
            request.message,
            "--output-format",
            output_format,
        ]
        if output_format == "stream-json":
            command.append("--verbose")
        if runtime.get("include_hook_events", True):
            command.append("--include-hook-events")

        if runtime.get("enable_auto_mode_if_supported", True) and provider_info.get("supports_auto_approve"):
            command.extend(["--permission-mode", runtime.get("auto_permission_mode", "auto")])
        else:
            command.extend(["--permission-mode", runtime.get("permission_mode", "acceptEdits")])

        mcp_config = runtime.get("mcp_config")
        if mcp_config:
            command.extend(["--mcp-config", str(config_path(self.config, "claude_mcp_config"))])

        run_id = new_runtime_id(provider_key)
        log_path = runtime_log_path(provider_key, request.agent_id)
        workspace_root = delivery_workspace_root(self.config, request.metadata)
        env.update(
            {
                "ORCH_RUN_ID": run_id,
                "ORCH_TASK_ID": request.task_id or "",
                "ORCH_AGENT_ID": request.agent_id,
                "ORCH_REASON": request.reason or "",
                "ORCH_CONTEXT_FILES": "\n".join(request.context_files),
                "ORCH_TARGET_FILES": "\n".join(request.target_files),
            }
        )
        apply_orchestrator_runtime_env(env, self.config, request.metadata)
        process, _ = spawn_background_process(
            command,
            cwd=workspace_root,
            log_path=log_path,
            env=env,
        )
        return DeliveryResult(
            ok=True,
            adapter=self.name,
            mode="claude_cli",
            target=request.agent_id,
            auto_delivered=True,
            manual_confirmation_required=False,
            notes=f"Claude CLI wake-up started in the background for provider `{provider_key}`.",
            command=command,
            log_path=str(log_path),
            pid=process.pid,
            run_id=run_id,
            metadata={"shell_command": shell_quote(command)},
        )
