"""Persist concise evidence for terminal worker failures."""
from __future__ import annotations

import re
from typing import Any

from common import evidence_path, new_runtime_id, relpath, utc_now, write_json
from control_plane.domain.failure_policy import classify_failure


def brief_reason_text(text: str | None, max_length: int = 240) -> str:
    raw = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(raw) <= max_length:
        return raw
    clipped = raw[: max_length - 1].rstrip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped + "..."


def summarize_worker_failure(config: dict[str, Any], worker: dict[str, Any], reason: str) -> tuple[str, str]:
    failure = classify_failure(config, worker, reason).as_mapping()
    label = str(failure.get("label") or "worker failure").strip()
    summary = brief_reason_text(reason, max_length=220)
    if label and label.lower() not in summary.lower():
        summary = f"{label}: {summary}"
    return label or "worker failure", summary


def record_worker_evidence(config: dict[str, Any], worker: dict[str, Any], reason: str) -> str:
    run_id = str(worker.get("run_id") or new_runtime_id("worker")).strip()
    path = evidence_path(run_id, config)
    label, summary = summarize_worker_failure(config, worker, reason)
    payload = {
        "created_at": utc_now(),
        "provider": worker.get("provider"),
        "task_id": worker.get("task_id"),
        "worker_run_id": run_id,
        "queue_event_id": worker.get("queue_event_id"),
        "kind": label,
        "summary": summary,
        "log_path": worker.get("log_path"),
        "payload_path": worker.get("payload_path"),
        "raw_message": reason,
    }
    write_json(path, payload)
    return relpath(path)
