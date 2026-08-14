from __future__ import annotations

from typing import Any, Mapping


CHAIR_REVIEW_OUTPUT_KEYS = frozenset(
    {
        "version",
        "decision",
        "approval_ttl_minutes",
        "reason",
        "blocked_by",
        "approval_actions",
        "reassignment_actions",
        "task_actions",
        "provider_actions",
        "recommended_focus",
    }
)


def validate_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def normalize_review_defaults(
    payload: Any, settings: Mapping[str, Any]
) -> Any:
    if not isinstance(payload, dict):
        return payload
    normalized = dict(payload)
    if normalized.get("approval_ttl_minutes") is None:
        normalized["approval_ttl_minutes"] = int(
            settings.get("default_approval_ttl_minutes", 45)
        )
    return normalized


def validate_review_payload(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return "payload must be an object"
    missing = [key for key in CHAIR_REVIEW_OUTPUT_KEYS if key not in payload]
    if missing:
        return f"missing keys: {', '.join(sorted(missing))}"
    if payload.get("version") != 1:
        return "version must be 1"
    if not isinstance(payload.get("decision"), str):
        return "decision must be a string"
    approval_ttl = payload.get("approval_ttl_minutes")
    if approval_ttl is not None and not isinstance(approval_ttl, int):
        return "approval_ttl_minutes must be an integer or null"
    if not isinstance(payload.get("reason"), str):
        return "reason must be a string"
    if not validate_string_list(payload.get("blocked_by")):
        return "blocked_by must be a string list"
    for key in (
        "approval_actions",
        "reassignment_actions",
        "task_actions",
        "provider_actions",
    ):
        if not isinstance(payload.get(key), list):
            return f"{key} must be a list"
    if not validate_string_list(payload.get("recommended_focus")):
        return "recommended_focus must be a string list"

    for raw in payload.get("approval_actions", []):
        if not isinstance(raw, dict):
            return "approval_actions items must be objects"
        action = raw
        if action.get("decision") not in {"allow", "deny"}:
            return "approval_actions decision must be allow or deny"
        if not isinstance(action.get("approval_id"), str) or not isinstance(
            action.get("reason"), str
        ):
            return "approval_actions require approval_id and reason strings"
        if "remember" in action and not isinstance(action.get("remember"), bool):
            return "approval_actions remember must be a boolean"

    for raw in payload.get("reassignment_actions", []):
        if not isinstance(raw, dict):
            return "reassignment_actions items must be objects"
        action = raw
        if action.get("role") not in {"owner", "reviewer"}:
            return "reassignment_actions role must be owner or reviewer"
        if any(
            not isinstance(action.get(key), str)
            or not str(action.get(key)).strip()
            for key in ("task_id", "from", "to", "reason")
        ):
            return "reassignment_actions require task_id/from/to/reason strings"

    for action in payload.get("task_actions", []):
        if not isinstance(action, dict):
            return "task_actions items must be objects"
        if action.get("action") not in {
            "dispatch_now",
            "create_unblock_task",
            "resume_parent_task",
        }:
            return "task_actions action must be dispatch_now, create_unblock_task, or resume_parent_task"
        if any(
            not isinstance(action.get(key), str)
            or not str(action.get(key)).strip()
            for key in ("task_id", "reason")
        ):
            return "task_actions require task_id/reason strings"
        for key in ("target_agent", "reviewer", "unblock_kind"):
            if key in action and (
                not isinstance(action.get(key), str)
                or not str(action.get(key)).strip()
            ):
                return f"task_actions {key} must be a non-empty string when provided"
        if "resume_status" in action and str(
            action.get("resume_status") or ""
        ).strip().lower() not in {"backlog", "todo", "in_progress"}:
            return "task_actions resume_status must be backlog, todo, or in_progress when provided"

    for action in payload.get("provider_actions", []):
        if not isinstance(action, dict):
            return "provider_actions items must be objects"
        if action.get("action") not in {"pause", "clear_pause"}:
            return "provider_actions action must be pause or clear_pause"
        if not isinstance(action.get("agent"), str) or not str(
            action.get("agent")
        ).strip():
            return "provider_actions require agent string"
        if action.get("action") == "pause":
            if action.get("kind") not in {"auth", "quota", "capacity", "manual"}:
                return "provider_actions pause kind must be auth, quota, capacity, or manual"
            if not isinstance(action.get("reason"), str) or not str(
                action.get("reason")
            ).strip():
                return "provider_actions pause requires reason string"
            if (
                "reset_seconds" in action
                and action.get("reset_seconds") is not None
                and not isinstance(action.get("reset_seconds"), int)
            ):
                return "provider_actions reset_seconds must be an integer or null"
        if (
            action.get("action") == "clear_pause"
            and "reason" in action
            and not isinstance(action.get("reason"), str)
        ):
            return "provider_actions clear_pause reason must be a string when provided"
    return None
