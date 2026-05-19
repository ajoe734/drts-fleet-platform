from __future__ import annotations

import os

from adapters.base import BaseAdapter, DeliveryCapability, DeliveryRequest, DeliveryResult
from common import (
    agent_config_for,
    apply_orchestrator_runtime_env,
    command_exists,
    delivery_workspace_root,
    new_runtime_id,
    runtime_log_path,
    spawn_background_process,
)


class CodexAdapter(BaseAdapter):
    name = "codex"

    def capability(self, agent_id: str) -> DeliveryCapability:
        cli = command_exists("codex")
        supported = bool(cli)
        return DeliveryCapability(
            adapter=self.name,
            supported=supported,
            requires_manual_confirmation=not supported,
            can_auto_deliver=supported,
            can_auto_approve_edits=supported,
            delivery_mode="codex",
            verified="verified" if supported else "unavailable",
            host="Codex CLI",
            notes="Uses verified Codex CLI approval flags for orchestrated runs." if supported else "Codex CLI is not installed.",
        )

    def deliver(self, request: DeliveryRequest) -> DeliveryResult:
        capability = self.capability(request.agent_id)
        if not capability.supported:
            return DeliveryResult(
                ok=False,
                adapter=self.name,
                mode="codex",
                target=request.agent_id,
                auto_delivered=False,
                manual_confirmation_required=True,
                error=capability.notes,
                notes=capability.notes,
            )

        agent_cfg = agent_config_for(self.config, request.agent_id)
        provider_key = agent_cfg.get("provider", "codex")
        provider = self.config.get("providers", {}).get(provider_key, {})
        codex_settings = provider.get("codex", {})
        cli = codex_settings.get("cli") or "codex"
        workspace_root = delivery_workspace_root(self.config, request.metadata)
        command = [
            cli,
            "exec",
            "-C",
            str(workspace_root),
            "-c",
            f'ask_for_approval="{codex_settings.get("ask_for_approval", "never")}"',
            "-s",
            codex_settings.get("sandbox_mode", "workspace-write"),
            "--skip-git-repo-check",
        ]
        if codex_settings.get("dangerously_bypass"):
            command.append("--dangerously-bypass-approvals-and-sandbox")
        command.append(request.message)

        env = os.environ.copy()
        config_home = codex_settings.get("config_home")
        if config_home:
            env["CODEX_HOME"] = os.path.expanduser(config_home)
        apply_orchestrator_runtime_env(env, self.config, request.metadata)

        run_id = new_runtime_id("codex")
        log_path = runtime_log_path("codex", request.agent_id)
        process, _ = spawn_background_process(
            command,
            cwd=workspace_root,
            log_path=log_path,
            env=env,
        )

        return DeliveryResult(
            ok=True,
            adapter=self.name,
            mode="codex",
            target=agent_config_for(self.config, request.agent_id).get("display_name", request.agent_id),
            auto_delivered=True,
            manual_confirmation_required=False,
            notes="Codex CLI wake-up started in the background.",
            command=command,
            log_path=str(log_path),
            pid=process.pid,
            run_id=run_id,
        )
