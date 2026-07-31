from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class OptionalAutomation:
    materialize_workspace_baseline_task: Callable[..., bool]
    ensure_workspace_baseline_dispatch: Callable[..., bool]
    dispatch_underutilization_sidecars: Callable[..., bool]
    dispatch_underutilization_main_tasks: Callable[..., bool]

    def reconcile(
        self,
        config: dict[str, Any],
        state: dict[str, Any],
        provider_report: dict[str, Any],
    ) -> bool:
        if not self._enabled(config, "governance_automation", True):
            return False
        changed = self.materialize_workspace_baseline_task(
            config, state, provider_report
        )
        return self.ensure_workspace_baseline_dispatch(
            config, state, provider_report
        ) or changed

    def dispatch(self, config: dict[str, Any], state: dict[str, Any]) -> bool:
        if not self._enabled(config, "underutilization", True):
            return False
        changed = self.dispatch_underutilization_sidecars(config, state)
        return self.dispatch_underutilization_main_tasks(config, state) or changed

    @staticmethod
    def _enabled(config: dict[str, Any], name: str, default: bool) -> bool:
        supervisor = config.get("supervisor") or {}
        automation = (
            supervisor.get("optional_automation", {})
            if isinstance(supervisor, dict)
            else {}
        )
        settings = automation.get(name, {}) if isinstance(automation, dict) else {}
        if isinstance(settings, bool):
            return settings
        if isinstance(settings, dict):
            return bool(settings.get("enabled", default))
        return default
