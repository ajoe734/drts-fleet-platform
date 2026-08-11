from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Mapping

from .models import TaskRecord


class DispatchReason(str, Enum):
    REVIEW_READY = "review_ready_dispatch"
    OWNED_FINALIZE = "owned_finalize_dispatch"
    OWNED_IN_PROGRESS = "owned_in_progress_dispatch"
    OWNED_READY = "owned_ready_dispatch"


@dataclass(frozen=True)
class DispatchDecision:
    task_id: str
    target_agent: str
    reason: DispatchReason


@dataclass(frozen=True)
class ReadyDispatchPolicy:
    review_statuses: frozenset[str] = frozenset({"review"})
    finalize_statuses: frozenset[str] = frozenset({"review_approved"})
    in_progress_statuses: frozenset[str] = frozenset({"in_progress"})
    owned_statuses: frozenset[str] = frozenset({"todo", "backlog"})
    dependency_done_statuses: frozenset[str] = frozenset({"done"})
    # How long an "integration in flight" record is believed. Nothing in the
    # supervisor refreshes these fields — only a worker writes them, and this
    # policy is what decides whether a worker is dispatched at all. Without a
    # bound, a task whose worker died mid-integration waits for a state change
    # that can no longer happen.
    integration_in_flight_max_age_seconds: int = 6 * 60 * 60

    @classmethod
    def from_config(cls, config: Mapping[str, Any]) -> "ReadyDispatchPolicy":
        supervisor = config.get("supervisor") or {}
        nested = supervisor.get("ready_dispatch") or {}
        legacy = config.get("ready_dispatcher") or {}
        settings = {**legacy, **nested}

        def values(key: str, defaults: frozenset[str]) -> frozenset[str]:
            raw = settings.get(key)
            if not isinstance(raw, (list, tuple, set)):
                return defaults
            normalized = frozenset(str(item).strip().lower() for item in raw if str(item).strip())
            return normalized or defaults

        defaults = cls()
        return cls(
            review_statuses=values("review_statuses", defaults.review_statuses),
            finalize_statuses=values("finalize_statuses", defaults.finalize_statuses),
            in_progress_statuses=values("in_progress_statuses", defaults.in_progress_statuses),
            owned_statuses=values("owned_statuses", defaults.owned_statuses),
            dependency_done_statuses=values(
                "dependency_done_statuses", defaults.dependency_done_statuses
            ),
            integration_in_flight_max_age_seconds=_positive_int(
                settings.get("integration_in_flight_max_age_seconds"),
                defaults.integration_in_flight_max_age_seconds,
            ),
        )

    def as_mapping(self) -> dict[str, list[str]]:
        return {
            "review_statuses": sorted(self.review_statuses),
            "finalize_statuses": sorted(self.finalize_statuses),
            "in_progress_statuses": sorted(self.in_progress_statuses),
            "owned_statuses": sorted(self.owned_statuses),
            "dependency_done_statuses": sorted(self.dependency_done_statuses),
        }


EXTERNAL_INTEGRATION_IN_FLIGHT_STATUSES = frozenset(
    {
        "branch_pushed",
        "pr_open",
        "ci_pending",
        "merged_to_dev",
        "deploy_blocked",
        "dev_deployed",
    }
)


def _positive_int(raw: Any, default: int) -> int:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return value if value > 0 else default


# Workers do not write a status token into `ci_status`; they write a sentence,
# e.g. "CI (integration trunk) failed on run 30918215661". Matching whole words
# catches what they actually record, where an exact-token comparison did not.
_CI_FAILURE_WORDS = frozenset({"failure", "failed", "failing", "cancelled", "canceled", "timed_out", "timeout"})


def ci_status_reports_failure(ci_status: str) -> bool:
    """True when this `ci_status` says the run finished badly, however it is worded."""
    normalized = ci_status.strip().lower()
    if not normalized:
        return False
    words = set(re.split(r"[^a-z_]+", normalized))
    return bool(words & _CI_FAILURE_WORDS)


def integration_record_is_stale(
    record: TaskRecord | Mapping[str, Any],
    *,
    max_age_seconds: int,
    now: datetime | None = None,
) -> bool:
    """True when an in-flight integration record is too old to still be believed.

    Read `integration_recorded_at`, not `last_update`. `last_update` is a
    general "this task was touched" stamp that the supervisor refreshes every
    tick — a task stuck at `ci_pending` since 2 August still carried a
    `last_update` of the current minute, so measuring against it would never
    call anything stale. `integration_recorded_at` is written only when the
    integration state itself is recorded, which is the thing being aged here.

    A record with no stamp is left alone. All 21 tasks carrying an in-flight
    integration status when this was written had the field set, so ageing them
    on a guess would only change behaviour for cases that do not occur, and
    "hold an in-progress task while its CI is pending" is the rule this
    function exists to enforce.
    """
    record = _task(record)
    recorded_at = record.raw.get("integration_recorded_at")
    if not recorded_at:
        return False
    try:
        stamped = datetime.fromisoformat(str(recorded_at).replace("Z", "+00:00"))
    except ValueError:
        return True
    if stamped.tzinfo is None:
        stamped = stamped.replace(tzinfo=timezone.utc)
    reference = now or datetime.now(timezone.utc)
    return (reference - stamped).total_seconds() > max_age_seconds


def rework_supersedes_integration(record: TaskRecord | Mapping[str, Any]) -> bool:
    """Whether a reviewer has explicitly sent an integration attempt back to owner.

    A rejected review can leave a real PR and its CI observation intact.  That
    evidence must remain visible, but it cannot suppress the repair worker that
    the reviewer explicitly requested.
    """
    raw = _task(record).raw
    rework_at = raw.get("rework_required_at")
    if not rework_at:
        return False
    try:
        rework_time = datetime.fromisoformat(str(rework_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    if rework_time.tzinfo is None:
        rework_time = rework_time.replace(tzinfo=timezone.utc)
    integration_at = raw.get("integration_recorded_at")
    if not integration_at:
        return True
    try:
        integration_time = datetime.fromisoformat(str(integration_at).replace("Z", "+00:00"))
    except ValueError:
        return True
    if integration_time.tzinfo is None:
        integration_time = integration_time.replace(tzinfo=timezone.utc)
    return rework_time >= integration_time


def has_external_integration_in_flight(
    record: TaskRecord | Mapping[str, Any],
    *,
    max_age_seconds: int | None = None,
    now: datetime | None = None,
) -> bool:
    """True when an owner should supervise external integration, not start coding again.

    A pushed branch or pending CI is already an active implementation attempt.
    Re-dispatching it to an isolated task branch creates duplicate patches and can
    overwrite the task's current PR evidence. CI failures deliberately remain
    dispatchable so the owner can fix them.

    Two ways this used to hold a task forever, both seen in production:

    * The failure escape hatch compared `ci_status` against exact tokens, but a
      worker had written "CI (integration trunk) failed on run 30918215661".
      The run had definitively failed and the task still waited on it.
    * Nothing refreshes these fields except a worker, and this function is what
      decides whether a worker is dispatched. A task left at `ci_pending` when
      its worker died waited on a change that could no longer happen — one sat
      that way for four days while its PR had been green and mergeable for three.

    So a failure is now recognised however it is worded, and an in-flight record
    is only believed while it is recent.
    """
    record = _task(record)
    if rework_supersedes_integration(record):
        return False
    ci_status = str(record.raw.get("ci_status") or "").strip().lower()
    # CI is the freshest execution signal. A delayed integration_status must not
    # trap a failed task in a permanent no-dispatch state.
    if ci_status_reports_failure(ci_status):
        return False

    integration_status = str(record.raw.get("integration_status") or "").strip().lower()
    in_flight = integration_status in EXTERNAL_INTEGRATION_IN_FLIGHT_STATUSES
    if not in_flight:
        pr_url = str(record.raw.get("pr_url") or "").strip()
        in_flight = bool(pr_url) and ci_status in {"pending", "queued", "in_progress", "running"}
    if not in_flight:
        return False

    if max_age_seconds is None:
        max_age_seconds = ReadyDispatchPolicy().integration_in_flight_max_age_seconds
    return not integration_record_is_stale(
        record, max_age_seconds=max_age_seconds, now=now
    )


def task_index(tasks: Mapping[str, Any] | list[Mapping[str, Any]]) -> dict[str, TaskRecord]:
    if isinstance(tasks, Mapping):
        values = tasks.values()
    else:
        values = tasks
    result: dict[str, TaskRecord] = {}
    for value in values:
        if not isinstance(value, Mapping):
            continue
        task = TaskRecord.from_mapping(value)
        if task.id:
            result[task.id] = task
    return result


def _task(value: TaskRecord | Mapping[str, Any]) -> TaskRecord:
    return value if isinstance(value, TaskRecord) else TaskRecord.from_mapping(value)


def _tasks(values: Mapping[str, TaskRecord | Mapping[str, Any]]) -> dict[str, TaskRecord]:
    return {task_id: _task(value) for task_id, value in values.items()}


def dependencies_satisfied(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
    done_statuses: set[str] | frozenset[str],
    integration_evidence: Mapping[str, bool] | None = None,
) -> bool:
    record = _task(task)
    index = _tasks(tasks_by_id)
    normalized_done = {str(status).strip().lower() for status in done_statuses}
    for dependency_id in record.depends_on:
        dependency = index.get(dependency_id)
        if dependency is not None and dependency.status not in normalized_done:
            return False
        if dependency is not None and dependency.status in normalized_done:
            raw = dependency.raw
            task_class = str(raw.get("task_class") or "").strip().lower()
            requires_integration = bool(
                raw.get("release_gate")
                or raw.get("mutates_canonical")
                or task_class in {"implementation", "runtime_fix"}
            )
            if requires_integration:
                integration = str(raw.get("integration_status") or "").strip().lower()
                if integration not in {"merged_to_dev", "dev_deployed", "not_applicable"}:
                    return False
                if integration == "merged_to_dev" and not str(raw.get("merge_commit") or "").strip():
                    return False
                # Reachability is resolved by infrastructure before this pure
                # policy is evaluated.  Every dispatch consumer receives the
                # same evidence instead of running its own Git check.
                if integration in {"merged_to_dev", "dev_deployed"} and integration_evidence is not None:
                    if integration_evidence.get(dependency_id) is not True:
                        return False
                if integration == "not_applicable" and raw.get("commit_hash"):
                    return False
    return True


def dependency_signature(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
) -> str:
    record = _task(task)
    index = _tasks(tasks_by_id)
    return "|".join(
        f"{dependency_id}:{str(index[dependency_id].raw.get('status') or 'missing') if dependency_id in index else 'archived'}"
        for dependency_id in record.depends_on
    )


def resolve_dispatch_target(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
    policy: ReadyDispatchPolicy,
    integration_evidence: Mapping[str, bool] | None = None,
) -> DispatchDecision | None:
    record = _task(task)
    if record.status in policy.review_statuses and record.reviewer:
        return DispatchDecision(record.id, record.reviewer, DispatchReason.REVIEW_READY)
    if record.status in policy.finalize_statuses and record.owner:
        return DispatchDecision(record.id, record.owner, DispatchReason.OWNED_FINALIZE)
    if not dependencies_satisfied(
        record,
        tasks_by_id,
        policy.dependency_done_statuses,
        integration_evidence,
    ):
        return None
    if record.status in policy.in_progress_statuses and record.owner:
        if has_external_integration_in_flight(
            record, max_age_seconds=policy.integration_in_flight_max_age_seconds
        ):
            return None
        return DispatchDecision(record.id, record.owner, DispatchReason.OWNED_IN_PROGRESS)
    # A blocked task with a live PR failure is an integration repair, not a
    # human/product blocker. Keep other blocked tasks gated.
    if record.status == "blocked" and record.owner and ci_status_reports_failure(
        str(record.raw.get("ci_status") or "")
    ):
        return DispatchDecision(record.id, record.owner, DispatchReason.OWNED_IN_PROGRESS)
    if record.status in policy.owned_statuses and record.owner:
        return DispatchDecision(record.id, record.owner, DispatchReason.OWNED_READY)
    return None


def ready_dispatch_signature(
    task: TaskRecord | Mapping[str, Any],
    reason: DispatchReason | str,
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
) -> str:
    record = _task(task)
    payload = {
        "dependency_signature": dependency_signature(record, tasks_by_id),
        "depends_on": list(record.depends_on),
        "ci_status": record.raw.get("ci_status"),
        "execution_branch": record.raw.get("execution_branch"),
        "integration_status": record.raw.get("integration_status"),
        "owner": record.owner or None,
        "reason": str(reason.value if isinstance(reason, DispatchReason) else reason),
        "reviewer": record.reviewer or None,
        "status": record.raw.get("status"),
        "task_id": record.id,
    }
    return json.dumps(payload, ensure_ascii=True, sort_keys=True)


def build_dispatch_event(
    task: TaskRecord | Mapping[str, Any],
    decision: DispatchDecision,
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
    *,
    source: str | None = None,
) -> dict[str, Any]:
    record = _task(task)
    signature = ready_dispatch_signature(record, decision.reason, tasks_by_id)
    reason = decision.reason.value
    task_payload: dict[str, Any] = {
        "id": record.id,
        "artifacts": list(record.artifacts),
        "next": record.next,
    }
    for key in (
        "task_class",
        "auto_generated",
        "helper_parent",
        "helper_kind",
        "mutates_canonical",
        "auto_created_by",
        "execution_branch",
    ):
        if key in record.raw:
            task_payload[key] = record.raw.get(key)
    event = {
        "key": f"dispatcher:{decision.target_agent}:{record.id}:{reason}:{signature}",
        "task_id": record.id,
        "target_agent": decision.target_agent,
        "reason": reason,
        "task": task_payload,
    }
    if source is not None:
        event["event_id"] = f"evt-{record.id.lower()}-{reason}"
        event["metadata"] = {"source": source, "mode": "execution"}
    return event


def dispatch_preview(
    task: TaskRecord | Mapping[str, Any],
    tasks_by_id: Mapping[str, TaskRecord | Mapping[str, Any]],
    policy: ReadyDispatchPolicy,
    *,
    source: str,
) -> dict[str, Any] | None:
    decision = resolve_dispatch_target(task, tasks_by_id, policy)
    if decision is None:
        return None
    return {
        "decision": {
            "task_id": decision.task_id,
            "target_agent": decision.target_agent,
            "reason": decision.reason.value,
        },
        "queue_event": build_dispatch_event(task, decision, tasks_by_id, source=source),
    }
