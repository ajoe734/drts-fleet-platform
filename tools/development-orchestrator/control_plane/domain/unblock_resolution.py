"""Decide whether a completed helper still covers a parent's open blocker."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def _timestamp(value: Any) -> datetime | None:
    try:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result


def parent_resume_blocker(
    status: dict[str, Any], parent: dict[str, Any], helper: dict[str, Any] | None,
) -> str | None:
    """None permits helper-backed resume; a reason requires fresh resolution.

    Explicit Supervisor resumes without a helper remain a separate operation.
    Task last_update is not the blocker clock: notes and reassignment change it.
    """
    if not helper or helper.get("task_class") != "unblock" or helper.get("status") != "done":
        return "helper is not a completed unblock task"
    if helper.get("helper_parent") != parent.get("id"):
        return "helper belongs to a different parent"
    disposition = str(helper.get("resolved_parent_status") or "").lower()
    if disposition and disposition not in {"todo", "backlog", "in_progress"}:
        return f"helper keeps parent {disposition}"
    completed_at = _timestamp(helper.get("resolved_parent_at") or helper.get("last_update"))
    for blocker in status.get("blockers", []) or []:
        if not isinstance(blocker, dict) or blocker.get("task_id") != parent.get("id") or blocker.get("status") != "open":
            continue
        blocked_at = _timestamp(blocker.get("created_at"))
        if blocked_at is not None and (completed_at is None or blocked_at > completed_at):
            return "parent has an open blocker newer than the completed helper"
    return None
