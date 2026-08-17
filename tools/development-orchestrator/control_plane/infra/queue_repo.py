from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable

from common import (
    append_jsonl_line_unlocked,
    atomic_write_text,
    config_path,
    hold_jsonl_lock,
    load_jsonl,
)


def _event_identity(event: dict[str, Any]) -> str:
    return str(event.get("event_id") or event.get("key") or "").strip()


@dataclass(frozen=True)
class QueueRepository:
    path: Path

    def load(self) -> list[dict[str, Any]]:
        with hold_jsonl_lock(self.path):
            return load_jsonl(self.path)

    def enqueue(self, event: dict[str, Any], *, deduplicate: bool = True) -> bool:
        identity = _event_identity(event)
        with hold_jsonl_lock(self.path):
            if deduplicate and identity:
                if any(
                    _event_identity(current) == identity
                    for current in load_jsonl(self.path)
                ):
                    return False
            append_jsonl_line_unlocked(
                self.path,
                json.dumps(event, ensure_ascii=False),
            )
        return True

    def replace(self, events: Iterable[dict[str, Any]]) -> None:
        with hold_jsonl_lock(self.path):
            self._replace_unlocked(events)

    def update(
        self,
        transform: Callable[
            [list[dict[str, Any]]], tuple[Iterable[dict[str, Any]], bool]
        ],
    ) -> bool:
        """Atomically load, transform, and optionally replace the queue."""

        with hold_jsonl_lock(self.path):
            replacement, changed = transform(load_jsonl(self.path))
            if changed:
                self._replace_unlocked(replacement)
            return changed

    def _replace_unlocked(self, events: Iterable[dict[str, Any]]) -> None:
        payload = "".join(
            json.dumps(event, ensure_ascii=False) + "\n" for event in events
        )
        atomic_write_text(self.path, payload)


def queue_repository(config: dict[str, Any]) -> QueueRepository:
    return QueueRepository(config_path(config, "event_queue"))


def load_event_queue(config: dict[str, Any]) -> list[dict[str, Any]]:
    return queue_repository(config).load()


def enqueue_event(config: dict[str, Any], event: dict[str, Any]) -> bool:
    return queue_repository(config).enqueue(event)
