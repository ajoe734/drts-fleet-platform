from __future__ import annotations

"""Identity-aware lane health primitives."""

from hashlib import sha256
from typing import Any, Mapping


def identity_fingerprint(
    provider_family: str,
    account_id: str | None,
    organization_id: str | None = None,
) -> str | None:
    account = str(account_id or "").strip()
    if not account:
        return None
    material = "\x1f".join(
        (str(provider_family or "").strip().lower(), account, str(organization_id or "").strip())
    )
    return sha256(material.encode("utf-8")).hexdigest()[:24]


def quota_pool_key(provider_family: str, identity: str | None, quota_scope: str | None) -> str | None:
    if not identity:
        return None
    family = str(provider_family or "").strip().lower()
    scope = str(quota_scope or "default").strip().lower() or "default"
    return f"{family}:{identity}:{scope}"


def pause_matches_lane(
    pause: Mapping[str, Any],
    identity: Mapping[str, Any] | None,
    pool_key: str | None,
    lane_id: str | None = None,
) -> bool:
    """Whether one pause entry applies, given what is known about the lane.

    An identity or quota-pool scope is resolved through the capability report.
    When that report cannot answer -- it was missing, unreadable, or written
    with no providers in it -- every such pause used to match nothing, so the
    dispatcher read a paused fleet as an open one. On 2026-08-19 a report was
    written with an empty providers map and a 27-hour auth pause silently
    stopped applying to both lanes it covered.

    Unknown identity is not evidence of a healthy lane. It only means the lanes
    that *share* the account cannot be identified, so the fallback is the lane
    the pause recorded: keep the one known to have failed, release the rest.
    """
    scope = str(pause.get("scope") or "lane")
    if scope == "lane":
        return True
    if scope == "identity":
        if identity:
            return pause.get("identity_fingerprint") == identity.get("fingerprint")
        return _covers_recorded_lane(pause, lane_id)
    if scope == "quota_pool":
        if pool_key:
            return pause.get("quota_pool") == pool_key
        return _covers_recorded_lane(pause, lane_id)
    return False


def _covers_recorded_lane(pause: Mapping[str, Any], lane_id: str | None) -> bool:
    recorded = str(pause.get("lane_id") or "")
    return bool(recorded) and lane_id is not None and recorded == str(lane_id)
