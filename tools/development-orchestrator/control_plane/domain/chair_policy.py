from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Iterable, Mapping


# Explicit Chair-only resume basis: the original review candidate's own CI has
# recovered at the exact same SHA/generation. Never inferred from CI polling.
CANDIDATE_CI_RECOVERED = "candidate_ci_recovered"
CANDIDATE_CI_RECOVERY_IDENTITY_KEYS = (
    "owner", "reviewer", "candidate_sha", "candidate_branch", "candidate_generation", "pr_url"
)
_FULL_SHA = re.compile(r"[0-9a-f]{40}")
_FINGERPRINT = re.compile(r"[0-9a-f]{64}")


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


def open_blocker_fingerprint(blockers: Iterable[Any] | None, task_id: str) -> tuple[str, int]:
    """Digest the exact open blocker records of one task, order-independently.

    Compares whole structured records (not task.next or any free text), so an
    added, removed, or edited open blocker changes the fingerprint.
    """
    rows = sorted(
        json.dumps(blocker, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        for blocker in blockers or []
        if isinstance(blocker, dict)
        and blocker.get("task_id") == task_id
        and str(blocker.get("status") or "").lower() == "open"
    )
    digest = hashlib.sha256(json.dumps(rows, ensure_ascii=False).encode("utf-8")).hexdigest()
    return digest, len(rows)


def candidate_ci_recovery_identity(task: Mapping[str, Any]) -> dict[str, str] | None:
    """Return the retained review identity, or None if no original handoff stands."""
    identity = {key: task.get(key) for key in CANDIDATE_CI_RECOVERY_IDENTITY_KEYS}
    if any(not isinstance(value, str) or not value.strip() for value in identity.values()):
        return None
    if not _FULL_SHA.fullmatch(identity["candidate_sha"]) or identity["owner"] == identity["reviewer"]:
        return None
    if task.get("reviewed_sha") or task.get("merge_sha"):
        return None
    handoff = {key: identity[key] for key in identity if key != "pr_url"}
    if task.get("candidate_review_handoff") != handoff:
        return None
    return identity


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
        if "resume_basis" in action:
            if action.get("action") != "resume_parent_task" or action.get("resume_basis") != CANDIDATE_CI_RECOVERED:
                return f"task_actions resume_basis is only {CANDIDATE_CI_RECOVERED} for resume_parent_task"
            if "helper_task_id" in action:
                return "candidate CI recovery must not name an unblock helper"
            if str(action.get("resume_status") or "in_progress").strip().lower() != "in_progress":
                return "candidate CI recovery resumes in_progress before restoring review"
            if not isinstance(action.get("candidate_sha"), str) or not _FULL_SHA.fullmatch(action["candidate_sha"]):
                return "candidate CI recovery requires a full candidate_sha"
            if not isinstance(action.get("candidate_generation"), str) or not action["candidate_generation"].strip():
                return "candidate CI recovery requires candidate_generation"
            if not isinstance(action.get("blocker_fingerprint"), str) or not _FINGERPRINT.fullmatch(action["blocker_fingerprint"]):
                return "candidate CI recovery requires the observed blocker_fingerprint"

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
