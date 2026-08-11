from __future__ import annotations

"""Identity-aware lane health and capacity primitives.

Lane names are stable scheduler handles; the account behind a profile is not.
This module deliberately keeps those concerns separate.
"""

from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Mapping


EXECUTION_STATUSES = frozenset({"running", "started", "draining", "fallback", "retry_backoff", "stalled"})
SESSION_STATUSES = frozenset({"waiting_approval", "suspended_approval", "manual_pending"})


def identity_fingerprint(provider_family: str, account_id: str | None, organization_id: str | None = None) -> str | None:
    """Return a non-reversible identity key suitable for runtime state."""
    account = str(account_id or "").strip()
    if not account:
        return None
    material = "\x1f".join((str(provider_family or "").strip().lower(), account, str(organization_id or "").strip()))
    return sha256(material.encode("utf-8")).hexdigest()[:24]


def quota_pool_key(provider_family: str, identity: str | None, quota_scope: str | None) -> str | None:
    if not identity:
        return None
    family = str(provider_family or "").strip().lower()
    scope = str(quota_scope or "default").strip().lower() or "default"
    return f"{family}:{identity}:{scope}"


def lane_identity_changed(previous: Mapping[str, Any] | None, current: Mapping[str, Any] | None) -> bool:
    if not previous or not current:
        return False
    old = str(previous.get("fingerprint") or "")
    new = str(current.get("fingerprint") or "")
    return bool(old and new and old != new)


def worker_capacity_counts(workers: Mapping[str, Any], lane_id: str) -> dict[str, int]:
    execution = sessions = control = 0
    for worker in workers.values():
        if not isinstance(worker, Mapping) or str(worker.get("agent_id") or "") != lane_id:
            continue
        status = str(worker.get("status") or "")
        if status in EXECUTION_STATUSES:
            if str(worker.get("role") or worker.get("metadata", {}).get("control_role") or "") == "chair":
                control += 1
            else:
                execution += 1
        elif status in SESSION_STATUSES:
            sessions += 1
    return {"execution": execution, "sessions": sessions, "control": control}


def pause_matches_lane(pause: Mapping[str, Any], identity: Mapping[str, Any] | None, pool_key: str | None) -> bool:
    scope = str(pause.get("scope") or "lane")
    if scope == "lane":
        return True
    if scope == "identity":
        return bool(identity and pause.get("identity_fingerprint") == identity.get("fingerprint"))
    if scope == "quota_pool":
        return bool(pool_key and pause.get("quota_pool") == pool_key)
    return False


@dataclass(frozen=True)
class LaneAvailability:
    state: str
    dispatchable: bool
    reason: str | None = None
