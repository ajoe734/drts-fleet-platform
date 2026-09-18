from __future__ import annotations

from copy import deepcopy
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

from common import config_path, load_json, utc_now, write_json


def default_approval_state() -> dict[str, Any]:
    return {
        "version": 1,
        "updated_at": None,
        "pending": [],
        "history": [],
    }


@dataclass(frozen=True)
class ApprovalRepository:
    path: Path
    history_keep: int = 300

    @contextmanager
    def lock(self):
        lock_path = self.path.with_suffix(".lock")
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with lock_path.open("a+", encoding="utf-8") as handle:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                if fcntl is not None:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def load(self) -> dict[str, Any]:
        raw = load_json(self.path, default=default_approval_state())
        state = deepcopy(default_approval_state())
        if isinstance(raw, dict):
            state.update(raw)
        state.setdefault("pending", [])
        state.setdefault("history", [])
        return state

    def save(self, state: dict[str, Any]) -> None:
        payload = deepcopy(state)
        payload["updated_at"] = utc_now()
        history = payload.get("history")
        if (
            isinstance(history, list)
            and self.history_keep >= 0
            and len(history) > self.history_keep
        ):
            payload["history"] = history[-self.history_keep :]
        write_json(self.path, payload)


def approval_repository(config: dict[str, Any]) -> ApprovalRepository:
    keep = int(config.get("supervisor", {}).get("approval_history_keep", 300))
    return ApprovalRepository(config_path(config, "approval_queue"), keep)


def load_approval_state(config: dict[str, Any]) -> dict[str, Any]:
    return approval_repository(config).load()


def save_approval_state(config: dict[str, Any], state: dict[str, Any]) -> None:
    approval_repository(config).save(state)


@contextmanager
def approval_transaction(config: dict[str, Any]):
    with approval_repository(config).lock():
        yield
