"""Pure chairman-review validation and triage policy."""
from __future__ import annotations

from typing import Any

from control_plane.domain.chair_policy import validate_review_payload


def pending_approval_items(approval_state: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item
        for item in approval_state.get("pending", []) or []
        if str(item.get("status") or "pending") == "pending" and not item.get("decision")
    ]


def blocked_task_triage_kind(task: dict[str, Any]) -> str:
    text = " ".join(
        str(value or "")
        for value in (
            task.get("id"),
            task.get("title"),
            task.get("summary_zh"),
            task.get("next"),
            " ".join(str(item or "") for item in (task.get("artifacts") or [])),
        )
    ).lower()
    if any(
        marker in text
        for marker in (
            "commit",
            "branch",
            "worktree",
            "task-scoped",
            "history",
            "head moved",
            "pre-commit",
            "push",
        )
    ):
        return "history_repair"
    if any(
        marker in text
        for marker in (
            "contract",
            "discussion_planning",
            "canonical",
            "scope decision",
            "cost-center",
            "approval-rule",
            "quota contract",
            "product",
        )
    ):
        return "planning_decision"
    return "manual_unblock"


def chair_task_action_index(payload: dict[str, Any]) -> dict[str, set[str]]:
    action_index: dict[str, set[str]] = {}
    for action in payload.get("task_actions", []) or []:
        if not isinstance(action, dict):
            continue
        task_id = str(action.get("task_id") or "").strip()
        action_name = str(action.get("action") or "").strip()
        if not task_id or not action_name:
            continue
        action_index.setdefault(task_id, set()).add(action_name)
    return action_index


def validate_chair_review_payload(payload: Any) -> str | None:
    return validate_review_payload(payload)


def chair_provider_pause_reason_is_actionable(kind: str, reason: str) -> bool:
    if kind != "auth":
        return True
    lowered = reason.lower()
    non_actionable_markers = (
        "investigate",
        "verify ",
        "garbled",
        "erroneous",
        "propagat",
        "cross-lane",
        "not a real",
        "mentioned",
        "citing",
    )
    if any(marker in lowered for marker in non_actionable_markers):
        return False
    concrete_auth_markers = (
        "failed to authenticate",
        "authentication_error",
        "invalid authentication credentials",
        "status: 401",
        "api error: 401",
        "error authenticating:",
        "ineligibletiererror:",
        "restricted_dasher_user",
    )
    return any(marker in lowered for marker in concrete_auth_markers)
