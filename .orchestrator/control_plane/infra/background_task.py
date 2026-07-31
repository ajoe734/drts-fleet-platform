from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Callable, Generic, TypeVar


ResultT = TypeVar("ResultT")


@dataclass
class BackgroundTask(Generic[ResultT]):
    """Small daemon-thread future for bounded supervisor maintenance work."""

    target: Callable[[], ResultT]
    _done: threading.Event = field(default_factory=threading.Event, init=False)
    _result: ResultT | None = field(default=None, init=False)
    _error: BaseException | None = field(default=None, init=False)
    _thread: threading.Thread = field(init=False)

    def __post_init__(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)

    def start(self) -> "BackgroundTask[ResultT]":
        self._thread.start()
        return self

    def done(self) -> bool:
        return self._done.is_set()

    def result(self) -> ResultT:
        if not self.done():
            raise RuntimeError("Background task has not completed")
        if self._error is not None:
            raise self._error
        return self._result  # type: ignore[return-value]

    def _run(self) -> None:
        try:
            self._result = self.target()
        except BaseException as exc:  # Preserve failures for the polling tick.
            self._error = exc
        finally:
            self._done.set()
