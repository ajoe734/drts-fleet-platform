from __future__ import annotations

from adapters.base import BaseAdapter, DeliveryCapability, DeliveryRequest, DeliveryResult
from common import (
    TOOL_ROOT,
    agent_config_for,
    apply_orchestrator_runtime_env,
    apply_worker_unit_env,
    background_process_pid,
    command_exists,
    delivery_workspace_root,
    new_runtime_id,
    runtime_log_path,
    spawn_background_process,
    worker_result_path,
)
from provider_credentials import pi_env, pi_model_ref


DEFAULT_CLI = "pi"
DEFAULT_THINKING = "high"
# pi has no --output-schema/--output-last-message. This extension gives the
# worker a `submit_worker_result` tool that writes worker-result.schema.json to
# DRTS_WORKER_RESULT_PATH, so the supervisor reads it like a Codex result file.
WORKER_RESULT_EXTENSION = TOOL_ROOT / "pi" / "worker-result.ts"


def _provider_for_agent(config: dict, agent_id: str) -> tuple[str, dict]:
    agent = agent_config_for(config, agent_id)
    provider_key = str(agent.get("provider") or "pi").strip() or "pi"
    provider = config.get("providers", {}).get(provider_key, {})
    return provider_key, provider.get("pi", {}) or {}


class PiAdapter(BaseAdapter):
    name = "pi"

    def capability(self, agent_id: str) -> DeliveryCapability:
        _, settings = _provider_for_agent(self.config, agent_id)
        cli = command_exists(settings.get("cli") or DEFAULT_CLI)
        supported = bool(cli)
        return DeliveryCapability(
            adapter=self.name,
            supported=supported,
            requires_manual_confirmation=not supported,
            can_auto_deliver=supported,
            can_auto_approve_edits=supported,
            delivery_mode="pi",
            verified="verified" if supported else "unavailable",
            host="Pi CLI",
            notes=(
                "Runs `pi --mode json` one-shot; pi has no approval prompts, so tools run unattended."
                if supported
                else "Pi CLI is not installed."
            ),
        )

    def deliver(self, request: DeliveryRequest) -> DeliveryResult:
        capability = self.capability(request.agent_id)
        if not capability.supported:
            return DeliveryResult(
                ok=False,
                adapter=self.name,
                mode="pi",
                target=request.agent_id,
                auto_delivered=False,
                manual_confirmation_required=True,
                error=capability.notes,
                notes=capability.notes,
            )

        provider_key, settings = _provider_for_agent(self.config, request.agent_id)
        cli = command_exists(settings.get("cli") or DEFAULT_CLI) or DEFAULT_CLI
        workspace_root = delivery_workspace_root(self.config, request.metadata)
        run_id = new_runtime_id(provider_key)
        result_path = worker_result_path(self.config, run_id)
        # A lane runs only what the orchestrator hands it: the operator's own
        # extensions, skills, prompt templates and themes stay out, and so do
        # project-local .pi resources a task branch might add. AGENTS.md is
        # still loaded, which is where the repository's worker rules live.
        command = [
            cli,
            "--mode",
            "json",
            "--no-session",
            "--no-approve",
            "--no-extensions",
            "--no-skills",
            "--no-prompt-templates",
            "--no-themes",
            "--extension",
            str(WORKER_RESULT_EXTENSION),
        ]
        model = pi_model_ref(settings, request.metadata.get("model_preference"))
        if model:
            command.extend(["--model", model])
        thinking = str(settings.get("thinking") or DEFAULT_THINKING).strip()
        if thinking:
            command.extend(["--thinking", thinking])
        command.extend(str(arg) for arg in settings.get("extra_args") or [])
        # `--` ends option parsing, so a prompt that starts with "-" stays a
        # message; the supervisor's activity log also keys the prompt off it.
        command.extend(["--", request.message])

        env = pi_env(settings)
        env["DRTS_WORKER_RESULT_PATH"] = str(result_path)
        apply_orchestrator_runtime_env(env, self.config, request.metadata)
        log_path = runtime_log_path(provider_key, request.agent_id)
        worker_unit = apply_worker_unit_env(env, self.config, run_id, request.metadata)
        process, _ = spawn_background_process(command, cwd=workspace_root, log_path=log_path, env=env)

        return DeliveryResult(
            ok=True,
            adapter=self.name,
            mode="pi",
            target=agent_config_for(self.config, request.agent_id).get("display_name", request.agent_id),
            auto_delivered=True,
            manual_confirmation_required=False,
            notes=f"Pi CLI wake-up started in the background for provider `{provider_key}`.",
            command=command,
            log_path=str(log_path),
            pid=background_process_pid(process),
            run_id=run_id,
            metadata={"result_path": str(result_path), "worker_unit": worker_unit},
        )
