from __future__ import annotations

import os
from pathlib import Path

from adapters.base import BaseAdapter, DeliveryCapability, DeliveryRequest, DeliveryResult
from adapters.file_inbox import FileInboxAdapter
from common import (
    agent_config_for,
    apply_orchestrator_runtime_env,
    command_exists,
    config_path,
    delivery_workspace_root,
    new_runtime_id,
    runtime_env_overrides,
    runtime_log_path,
    spawn_background_process,
)


# The Antigravity CLI ("agy") is the terminal-first surface for Antigravity agents.
# It runs the same Cascade language-server the IDE uses, headlessly, and supports a
# non-interactive single-shot mode: `agy --print [flags] "<prompt>"`.
# Auth is a one-time interactive sign-in (`agy` with no args -> browser OAuth); on
# SSH/headless hosts it persists a file-based token under the app-data dir.
DEFAULT_CLI = "agy"
DEFAULT_APP_DATA_DIR = Path.home() / ".gemini" / "antigravity-cli"
# Candidate token filenames written after sign-in (file-based token storage). The
# exact name is locked in after the first real sign-in; `token_path` overrides.
TOKEN_CANDIDATES = ("antigravity-oauth-token", "auth.json", "credentials.json", "token.json", "oauth_creds.json")


def _string_list(value: object) -> list[str]:
    if value is None:
        return []
    values = value if isinstance(value, list) else [value]
    result: list[str] = []
    seen: set[str] = set()
    for item in values:
        for part in str(item).split(","):
            text = part.strip()
            if text and text not in seen:
                seen.add(text)
                result.append(text)
    return result


def _truthy(value: object, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _provider_for_agent(config: dict, agent_id: str) -> tuple[str, dict, dict]:
    agent = agent_config_for(config, agent_id)
    provider_key = str(agent.get("provider") or "antigravity").strip() or "antigravity"
    provider = config.get("providers", {}).get(provider_key, {})
    return provider_key, provider, provider.get("antigravity", {})


def _runtime_env(settings: dict, *, ensure_dirs: bool = False) -> dict[str, str]:
    overrides = runtime_env_overrides(settings)
    env = os.environ.copy()
    env.update(overrides)
    if ensure_dirs:
        for key in ("HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME"):
            if overrides.get(key):
                Path(overrides[key]).mkdir(parents=True, exist_ok=True)
    return env


def _cli_path(config: dict, settings: dict) -> str | None:
    workspace_root = config_path(config, "status_file").parents[0]
    return command_exists(settings.get("cli") or DEFAULT_CLI, search_roots=[workspace_root])


def _app_data_dir(settings: dict) -> Path:
    explicit = settings.get("app_data_dir")
    if explicit:
        return Path(str(explicit)).expanduser()
    config_home = settings.get("config_home")
    if config_home:
        # agy stores app data under $HOME/.gemini/antigravity-cli; config_home maps to HOME.
        return Path(str(config_home)).expanduser() / ".gemini" / "antigravity-cli"
    return DEFAULT_APP_DATA_DIR


def _auth_ready(settings: dict) -> bool:
    if _truthy(settings.get("assume_authed"), default=False):
        return True
    explicit = settings.get("token_path")
    if explicit:
        path = Path(str(explicit)).expanduser()
        return path.exists() and path.stat().st_size > 0
    base = _app_data_dir(settings)
    for name in TOKEN_CANDIDATES:
        path = base / name
        if path.exists() and path.stat().st_size > 0:
            return True
    return False


def _include_directories(config: dict, settings: dict, workspace_root: Path) -> list[str]:
    include = settings.get("include_directories")
    directories: list[str] = []
    if include is True:
        directories.append(str(workspace_root))
    elif isinstance(include, list):
        directories.extend(str(v) for v in include if str(v).strip())
    elif isinstance(include, str) and include.strip():
        directories.append(include.strip())
    for value in settings.get("extra_include_directories", []) or []:
        text = str(value).strip()
        if text:
            directories.append(text)
    result: list[str] = []
    seen: set[str] = set()
    for value in directories:
        path = Path(value).expanduser()
        if not path.is_absolute():
            path = workspace_root / path
        resolved = str(path)
        if resolved not in seen:
            seen.add(resolved)
            result.append(resolved)
    return result


def _fallback_to_inbox(adapter: "AntigravityAdapter", request: DeliveryRequest, note: str, *, hard_error: bool) -> DeliveryResult:
    fallback = FileInboxAdapter(config=adapter.config, provider_capabilities=adapter.provider_capabilities)
    result = fallback.deliver(request)
    result.adapter = adapter.name
    result.mode = "file_inbox"
    result.notes = f"{result.notes}. {note}"
    if hard_error:
        result.error = note
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


class AntigravityAdapter(BaseAdapter):
    name = "antigravity"

    def capability(self, agent_id: str) -> DeliveryCapability:
        provider_key, _, settings = _provider_for_agent(self.config, agent_id)
        cli = _cli_path(self.config, settings)
        auth_ready = _auth_ready(settings)
        supported = bool(cli and auth_ready)
        if cli and auth_ready:
            notes = f"Uses the verified Antigravity CLI `agy --print` (Cascade agent) for provider `{provider_key}`."
        elif cli:
            notes = (
                f"Antigravity CLI `agy` is installed but provider `{provider_key}` is not signed in "
                "(run `agy` once to sign in). Delivery falls back to inbox until then."
            )
        else:
            notes = "Antigravity CLI `agy` is not installed (curl -fsSL https://antigravity.google/cli/install.sh | bash)."
        return DeliveryCapability(
            adapter=self.name,
            supported=bool(cli),
            requires_manual_confirmation=not supported,
            can_auto_deliver=supported,
            can_auto_approve_edits=supported,
            delivery_mode="antigravity" if supported else "file_inbox",
            verified="verified" if supported else ("partial" if cli else "unavailable"),
            host="Antigravity CLI" if cli else "Antigravity CLI + inbox fallback",
            notes=notes,
        )

    def deliver(self, request: DeliveryRequest) -> DeliveryResult:
        capability = self.capability(request.agent_id)
        if not capability.supported or not capability.can_auto_deliver:
            return _fallback_to_inbox(self, request, capability.notes, hard_error=not capability.supported)

        provider_key, provider, settings = _provider_for_agent(self.config, request.agent_id)
        cli = _cli_path(self.config, settings)
        if not cli:
            note = "Antigravity CLI was available during capability probing but is no longer resolvable before dispatch."
            return _fallback_to_inbox(self, request, note, hard_error=True)

        command = [cli, "--print"]
        if _truthy(settings.get("skip_permissions"), default=True):
            command.append("--dangerously-skip-permissions")
        if _truthy(settings.get("sandbox"), default=False):
            command.append("--sandbox")
        model = str(request.metadata.get("model_preference") or settings.get("model") or "").strip()
        if model:
            command.extend(["--model", model])
        workspace_root = delivery_workspace_root(self.config, request.metadata)
        for directory in _include_directories(self.config, settings, Path(str(workspace_root))):
            command.extend(["--add-dir", directory])
        # Prompt is the trailing positional argument (Go flag parsing stops at first non-flag).
        command.append(request.message)

        run_id = new_runtime_id(provider_key)
        log_path = runtime_log_path(provider_key, request.agent_id)
        env = _runtime_env(settings, ensure_dirs=True)
        apply_orchestrator_runtime_env(env, self.config, request.metadata)
        process, _ = spawn_background_process(command, cwd=workspace_root, log_path=log_path, env=env)

        return DeliveryResult(
            ok=True,
            adapter=self.name,
            mode="antigravity",
            target=agent_config_for(self.config, request.agent_id).get("display_name", request.agent_id),
            auto_delivered=True,
            manual_confirmation_required=False,
            notes=f"Antigravity CLI `agy --print` wake-up started in the background for provider `{provider_key}`.",
            command=command,
            log_path=str(log_path),
            pid=process.pid,
            run_id=run_id,
        )
