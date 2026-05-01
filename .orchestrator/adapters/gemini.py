from __future__ import annotations

import os
from pathlib import Path

from adapters.base import BaseAdapter, DeliveryCapability, DeliveryRequest, DeliveryResult
from adapters.file_inbox import FileInboxAdapter
from common import (
    agent_config_for,
    command_exists,
    config_path,
    load_json,
    new_runtime_id,
    runtime_log_path,
    runtime_env_overrides,
    spawn_background_process,
)


GEMINI_SETTINGS_PATH = Path.home() / ".gemini" / "settings.json"
GEMINI_OAUTH_CREDS_PATH = Path.home() / ".gemini" / "oauth_creds.json"


def _truthy_env(name: str, env: dict[str, str] | None = None) -> bool:
    source = env or os.environ
    return source.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _gemini_paths(runtime: dict | None = None) -> tuple[Path, Path]:
    overrides = runtime_env_overrides(runtime)
    home = Path(overrides.get("HOME") or str(Path.home()))
    base = home / ".gemini"
    return base / "settings.json", base / "oauth_creds.json"


def _gemini_runtime_env(runtime: dict | None = None, *, ensure_dirs: bool = False) -> dict[str, str]:
    overrides = runtime_env_overrides(runtime)
    if ensure_dirs:
        settings_path, _ = _gemini_paths(runtime)
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        for key in ("HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"):
            if overrides.get(key):
                Path(overrides[key]).mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update(overrides)
    return env


def _gemini_settings(runtime: dict | None = None) -> dict:
    settings_path, _ = _gemini_paths(runtime)
    return load_json(settings_path, default={}) or {}


def _gemini_provider_for_agent(config: dict, agent_id: str) -> tuple[str, dict, dict]:
    agent = agent_config_for(config, agent_id)
    provider_key = str(agent.get("provider") or "gemini").strip() or "gemini"
    provider = config.get("providers", {}).get(provider_key, {})
    return provider_key, provider, provider.get("gemini", {})


def _gemini_selected_auth_type(runtime: dict | None = None, env: dict[str, str] | None = None) -> str | None:
    if _truthy_env("GOOGLE_GENAI_USE_GCA", env):
        return "oauth-personal"
    if _truthy_env("GEMINI_CLI_USE_COMPUTE_ADC", env):
        return "compute-default-credentials"
    if _truthy_env("GOOGLE_GENAI_USE_VERTEXAI", env):
        return "vertex-ai"
    source = env or os.environ
    if source.get("GEMINI_API_KEY"):
        return "gemini-api-key"
    settings = _gemini_settings(runtime)
    _, oauth_creds_path = _gemini_paths(runtime)
    return settings.get("security", {}).get("auth", {}).get("selectedType") or (
        "oauth-personal" if oauth_creds_path.exists() else None
    )


def _gemini_auth_ready(runtime: dict | None = None, env: dict[str, str] | None = None) -> bool:
    auth_type = _gemini_selected_auth_type(runtime, env)
    _, oauth_creds_path = _gemini_paths(runtime)
    source = env or os.environ
    if auth_type == "oauth-personal":
        return oauth_creds_path.exists()
    if auth_type == "gemini-api-key":
        return bool(source.get("GEMINI_API_KEY"))
    if auth_type == "vertex-ai":
        return bool(
            source.get("GOOGLE_API_KEY")
            or (source.get("GOOGLE_CLOUD_PROJECT") and source.get("GOOGLE_CLOUD_LOCATION"))
        )
    if auth_type == "compute-default-credentials":
        return bool(source.get("GOOGLE_APPLICATION_CREDENTIALS") or command_exists("gcloud"))
    return False


class GeminiAdapter(BaseAdapter):
    name = "gemini"

    def capability(self, agent_id: str) -> DeliveryCapability:
        provider_key, _, gemini_settings = _gemini_provider_for_agent(self.config, agent_id)
        cli = command_exists(gemini_settings.get("cli") or "gemini")
        env = _gemini_runtime_env(gemini_settings)
        auth_ready = _gemini_auth_ready(gemini_settings, env)
        supported = bool(cli and auth_ready)
        if cli and auth_ready:
            notes = f"Uses the verified Gemini CLI `--prompt`, local auth config, and approval mode settings for provider `{provider_key}`."
            if gemini_settings.get("config_home"):
                notes = f"{notes} Auth is isolated by provider gemini.config_home."
        elif cli:
            notes = f"Gemini CLI is installed but provider `{provider_key}` is not authenticated for non-interactive use, so delivery falls back to inbox."
        else:
            notes = "Gemini CLI is not installed."
        return DeliveryCapability(
            adapter=self.name,
            supported=bool(cli),
            requires_manual_confirmation=not supported,
            can_auto_deliver=supported,
            can_auto_approve_edits=supported,
            delivery_mode="gemini" if supported else "file_inbox",
            verified="verified" if supported else ("partial" if cli else "unavailable"),
            host="Gemini CLI" if cli else "Gemini CLI + inbox fallback",
            notes=notes,
        )

    def deliver(self, request: DeliveryRequest) -> DeliveryResult:
        capability = self.capability(request.agent_id)
        if not capability.supported or not capability.can_auto_deliver:
            fallback = FileInboxAdapter(config=self.config, provider_capabilities=self.provider_capabilities)
            result = fallback.deliver(request)
            result.adapter = self.name
            result.mode = "file_inbox"
            result.notes = f"{result.notes}. {capability.notes}"
            if not capability.supported:
                result.error = capability.notes
            return DeliveryResult(
                ok=result.ok,
                adapter=result.adapter,
                mode=result.mode,
                target=result.target,
                auto_delivered=result.auto_delivered,
                manual_confirmation_required=result.manual_confirmation_required,
                error=result.error,
                notes=result.notes,
                command=result.command,
                log_path=result.log_path,
                payload_path=result.payload_path,
                pid=result.pid,
                run_id=result.run_id,
                metadata=result.metadata,
            )

        provider_key, provider, gemini_settings = _gemini_provider_for_agent(self.config, request.agent_id)
        gemini_settings = provider.get("gemini", {})
        approval = provider.get("approval", {})
        cli = gemini_settings.get("cli") or "gemini"
        command = [cli, "--prompt", request.message, "--output-format", "json"]
        model = str(request.metadata.get("model_preference") or gemini_settings.get("model") or "").strip()
        if model:
            command.extend(["--model", model])
        approval_mode = approval.get("default_approval_mode")
        if approval_mode:
            command.extend(["--approval-mode", approval_mode])
        if gemini_settings.get("include_directories"):
            command.extend(["--include-directories", str(config_path(self.config, "status_file").parents[0])])

        run_id = new_runtime_id(provider_key)
        log_path = runtime_log_path(provider_key, request.agent_id)
        env = _gemini_runtime_env(gemini_settings, ensure_dirs=True)
        process, _ = spawn_background_process(
            command,
            cwd=config_path(self.config, "status_file").parents[0],
            log_path=log_path,
            env=env,
        )

        return DeliveryResult(
            ok=True,
            adapter=self.name,
            mode="gemini",
            target=agent_config_for(self.config, request.agent_id).get("display_name", request.agent_id),
            auto_delivered=True,
            manual_confirmation_required=False,
            notes=f"Gemini CLI wake-up started in the background for provider `{provider_key}`.",
            command=command,
            log_path=str(log_path),
            pid=process.pid,
            run_id=run_id,
        )
