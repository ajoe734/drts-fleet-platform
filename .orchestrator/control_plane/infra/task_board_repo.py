from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None


_PROCESS_LOCKS: dict[str, threading.RLock] = {}
_PROCESS_LOCKS_GUARD = threading.Lock()


def task_board_lock_path(status_file: Path) -> Path:
    return status_file.with_name(f".{status_file.name}.control-plane.lock")


def _process_lock(path: Path) -> threading.RLock:
    key = str(path.resolve())
    with _PROCESS_LOCKS_GUARD:
        return _PROCESS_LOCKS.setdefault(key, threading.RLock())


@contextmanager
def task_board_transaction(status_file: Path) -> Iterator[None]:
    """Serialize a complete task-board read/decide/write transaction.

    ``ai-status.json`` is touched by workers, the supervisor, and operator CLI
    commands. Atomic rename prevents torn files, but it does not prevent two
    writers from both reading revision N and then overwriting each other. This
    lock covers the whole mutation transaction and works across both threads
    and processes.
    """

    status_file = status_file.resolve()
    lock_path = task_board_lock_path(status_file)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    process_lock = _process_lock(lock_path)
    with process_lock:
        descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            if fcntl is not None:
                fcntl.flock(descriptor, fcntl.LOCK_EX)
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
            os.close(descriptor)

