"""Answering "which agent is this" from configuration and status.

Display names, legacy aliases, lane membership, the adapter and provider behind
an agent id, and how stale that provider's last report is. Lookups, not
decisions: nothing here changes state or chooses what happens next.

Extracted verbatim from control_plane/runtime/supervisor_runtime.py. Every
function here had no dependency on anything else in that module, so moving them
cannot introduce an import cycle.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from common import (
    agent_config_for,
    load_status,
    normalize_agent_id,
    # The runtime module reads this under a name that says what the timestamp
    # is, not what format it is in. Keep that reading here.
    parse_iso_utc as parse_runtime_timestamp,
)


def adapter_info_for_agent(
    config: dict[str, Any],
    provider_report: dict[str, Any],
    agent_id: str,
) -> dict[str, Any]:
    agent = agent_config_for(config, agent_id)
    candidates = [
        str(agent.get("id") or "").strip(),
        str(agent.get("provider") or "").strip(),
        normalize_agent_id(agent_id),
    ]
    adapters = (provider_report.get("agent_adapters", {}) or {}) if isinstance(provider_report, dict) else {}
    for candidate in candidates:
        info = adapters.get(normalize_agent_id(candidate))
        if isinstance(info, dict):
            return info
    return {}


def display_name_is_legacy_alias(name: str | None) -> bool:
    return "legacy alias" in str(name or "").lower()


def known_agent_display_names(config: dict[str, Any]) -> set[str]:
    names = {
        str(agent.get("display_name") or agent.get("name") or agent_id).strip()
        for agent_id, agent in (config.get("agents", {}) or {}).items()
        if str(agent.get("display_name") or agent.get("name") or agent_id).strip()
    }
    try:
        status = load_status(config)
    except Exception:
        status = {}
    for agent in status.get("agents", []) or []:
        if not isinstance(agent, dict):
            continue
        name = str(agent.get("name") or "").strip()
        if name:
            names.add(name)
    return names


def ordered_idle_agent_names(idle_agent_names: list[str], agent_loads: dict[str, list[int]]) -> list[str]:
    indexed = list(enumerate(idle_agent_names))
    indexed.sort(
        key=lambda item: (
            len(agent_loads.get(item[1], [])),
            min(agent_loads.get(item[1], [99])),
            item[0],
        )
    )
    return [name for _index, name in indexed]


def provider_report_age_seconds(
    path: Path, report: dict[str, Any] | None, *, now: datetime | None = None
) -> float:
    """Age of a cached capability report; infinite when it cannot be dated."""
    now = now or datetime.now(timezone.utc)
    generated_at = parse_runtime_timestamp(str((report or {}).get("generated_at") or ""))
    if generated_at is not None:
        return max(0.0, (now - generated_at).total_seconds())
    try:
        return max(0.0, now.timestamp() - path.stat().st_mtime)
    except OSError:
        return float("inf")


def provider_report_key_for_agent(config: dict[str, Any], agent_id: str) -> str:
    agent = agent_config_for(config, agent_id)
    candidates = [
        str(agent.get("provider") or "").strip(),
        str(agent.get("id") or "").strip(),
        normalize_agent_id(agent_id),
    ]
    return candidates[0] or normalize_agent_id(agent_id)


def resolve_agent_model_preference(config: dict[str, Any], agent: dict[str, Any]) -> str | None:
    explicit = str(agent.get("model_preference") or "").strip()
    if explicit:
        return explicit

    provider_id = str(agent.get("provider") or agent.get("id") or "").strip()
    provider = config.get("providers", {}).get(provider_id, {})
    model_preference = provider.get("model_preference", {})
    if not isinstance(model_preference, dict):
        return None

    agent_id = str(agent.get("id") or "").strip()
    direct = str(model_preference.get(agent_id) or "").strip()
    if direct:
        return direct

    if agent_id == provider_id:
        default = str(model_preference.get("default") or "").strip()
        if default:
            return default
    return None


def status_agent_names_by_lane(status: dict[str, Any] | None) -> dict[str, str]:
    names: dict[str, str] = {}
    if not isinstance(status, dict):
        return names
    for agent in status.get("agents", []) or []:
        if not isinstance(agent, dict):
            continue
        name = str(agent.get("name") or "").strip()
        if not name:
            continue
        normalized = normalize_agent_id(name)
        if normalized:
            names[normalized] = name
    return names
