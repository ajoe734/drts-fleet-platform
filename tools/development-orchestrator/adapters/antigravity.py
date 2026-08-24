from __future__ import annotations

import os
from pathlib import Path

from adapters.base import BaseAdapter, DeliveryCapability, DeliveryRequest, DeliveryResult
from common import (
    agent_config_for,
    antigravity_rotation_config,
    apply_orchestrator_runtime_env,
    apply_worker_unit_env,
    background_process_pid,
    command_exists,
    config_path,
    delivery_workspace_root,
    new_runtime_id,
    runtime_env_overrides,
    runtime_log_path,
    select_rotation_model,
    spawn_background_process,
    to_bool,
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
    if to_bool(settings.get("assume_authed")):
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
        # A stale --add-dir entry makes agy fail on startup, which surfaces as an
        # opaque worker death. Drop paths that no longer exist instead.
        if not path.is_dir():
            continue
        resolved = str(path)
        if resolved not in seen:
            seen.add(resolved)
            result.append(resolved)
    return result


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
                "(run `agy` once to sign in). Automatic delivery is unavailable until then."
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
            host="Antigravity CLI",
            notes=notes,
        )

    def deliver(self, request: DeliveryRequest) -> DeliveryResult:
        capability = self.capability(request.agent_id)
        if not capability.supported or not capability.can_auto_deliver:
            return DeliveryResult(
                ok=False,
                adapter=self.name,
                mode="antigravity",
                target=agent_config_for(self.config, request.agent_id).get("display_name", request.agent_id),
                auto_delivered=False,
                manual_confirmation_required=True,
                error=capability.notes,
                notes=capability.notes,
            )

        provider_key, provider, settings = _provider_for_agent(self.config, request.agent_id)
        cli = _cli_path(self.config, settings)
        if not cli:
            note = "Antigravity CLI was available during capability probing but is no longer resolvable before dispatch."
            return DeliveryResult(
                ok=False,
                adapter=self.name,
                mode="antigravity",
                target=request.agent_id,
                auto_delivered=False,
                manual_confirmation_required=True,
                error=note,
                notes=note,
            )

        command = [cli]
        # An unattended lane cannot answer a permission prompt, so auto-approval
        # stays on: without it the worker blocks forever on the first tool call.
        # That decides *whether* tools run, not *what they may reach*, and those
        # are separable -- `agy` accepts both flags together.
        #
        # Sandboxing is therefore the default. Five of seven lanes were running
        # with approval disabled and no restriction of any kind, which is the
        # only enforcement surface they have: they carry no .claude/ settings
        # (a worktree checkout has none), and the MCP approval tool is never
        # consulted because auto-approval means nothing is ever asked. The deny
        # list in permission_broker.py reaches neither, so it protects the
        # chatbox session and nothing that actually edits files.
        #
        # A lane that genuinely needs an unrestricted terminal can set
        # `"sandbox": false`; an explicit false overrides this default without
        # a redeploy.
        if to_bool(settings.get("skip_permissions"), default=True):
            command.append("--dangerously-skip-permissions")
        if to_bool(settings.get("sandbox"), default=True):
            command.append("--sandbox")
        # Model rotation is the only AGY model authority. The shared cooldown
        # file selects the high-reasoning primary or fallback pool; request-level
        # model hints are deliberately ignored.
        rotation = antigravity_rotation_config(settings)
        rotation_slot: str | None = None
        rotation_model: str | None = None
        if rotation["enabled"]:
            rotation_slot, rotation_model, both_cooling = select_rotation_model(
                self.config, provider_key, rotation
            )
            if both_cooling:
                note = (
                    "Antigravity model rotation: both the Gemini and fallback pools are "
                    "cooling down; deferring to inbox until one frees."
                )
                return DeliveryResult(
                    ok=False,
                    adapter=self.name,
                    mode="antigravity",
                    target=request.agent_id,
                    auto_delivered=False,
                    manual_confirmation_required=False,
                    error=note,
                    notes=note,
                )
            model = str(rotation_model or "").strip()
        else:
            model = str(request.metadata.get("model_preference") or settings.get("model") or "").strip()
        if model:
            command.extend(["--model", model])
        command.extend(["--effort", "high", "--output-format", "stream-json"])
        # The provider hard limit is intentionally separate from supervisor
        # progress freshness. It prevents a long task from being killed at the
        # CLI boundary while the supervisor remains the only stall authority.
        print_timeout = str(settings.get("print_timeout") or "2h").strip()
        if print_timeout:
            command.extend(["--print-timeout", print_timeout])
        workspace_root = delivery_workspace_root(self.config, request.metadata)
        for directory in _include_directories(self.config, settings, Path(str(workspace_root))):
            command.extend(["--add-dir", directory])
        # In agy 1.1.1, --print is a string flag whose next argument is the
        # prompt. Keep it last so another flag cannot be consumed as the prompt.
        command.extend(["--print", request.message])

        run_id = request.run_id or new_runtime_id(provider_key)
        log_path = runtime_log_path(provider_key, request.agent_id)
        env = _runtime_env(settings, ensure_dirs=True)
        apply_orchestrator_runtime_env(
            env,
            self.config,
            request.metadata,
            run_id=run_id,
            queue_event_id=request.queue_event_id,
            task_id=request.task_id,
            agent_id=request.agent_id,
            provider=request.provider,
        )
        worker_unit = apply_worker_unit_env(env, self.config, run_id, request.metadata)
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
            pid=background_process_pid(process),
            run_id=run_id,
            metadata=(
                {"rotation_slot": rotation_slot, "rotation_model": rotation_model, "worker_unit": worker_unit}
                if rotation_slot
                else {"worker_unit": worker_unit}
            ),
        )
