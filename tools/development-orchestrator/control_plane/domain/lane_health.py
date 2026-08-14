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
) -> bool:
    scope = str(pause.get("scope") or "lane")
    if scope == "lane":
        return True
    if scope == "identity":
        return bool(identity and pause.get("identity_fingerprint") == identity.get("fingerprint"))
    if scope == "quota_pool":
        return bool(pool_key and pause.get("quota_pool") == pool_key)
    return False
