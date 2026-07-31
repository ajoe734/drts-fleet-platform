from __future__ import annotations

import hashlib
import importlib.util
import io
import os
import sys
import threading
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any, Callable, Iterator, Mapping

from control_plane.infra.task_board_repo import task_board_transaction


TaskBoardHandler = Callable[[dict[str, Any], list[str]], Any]


@dataclass(frozen=True)
class TaskBoardCommandRuntime:
    status_file: Path
    load_state: Callable[[], dict[str, Any]]
    save_state: Callable[[dict[str, Any]], None]
    sync_all: Callable[[dict[str, Any]], None]
    read_only_commands: Mapping[str, TaskBoardHandler]
    mutation_commands: Mapping[str, TaskBoardHandler]


@dataclass(frozen=True)
class TaskBoardCommandResult:
    returncode: int
    stdout: str = ""
    stderr: str = ""
    payload: Any = None

    @property
    def ok(self) -> bool:
        return self.returncode == 0

    @property
    def error(self) -> str:
        return self.stderr.strip() or self.stdout.strip() or "unknown error"


class TaskBoardCommandExecutor:
    """Canonical transaction boundary for every task-board command."""

    def __init__(self, runtime: TaskBoardCommandRuntime) -> None:
        self.runtime = runtime

    def execute(self, command: str, args: list[str]) -> int:
        self.execute_with_result(command, args)
        return 0

    def execute_with_result(self, command: str, args: list[str]) -> Any:
        handler = self.runtime.read_only_commands.get(command)
        if handler is not None:
            with task_board_transaction(self.runtime.status_file):
                return handler(self.runtime.load_state(), args)

        handler = self.runtime.mutation_commands.get(command)
        if handler is None:
            raise SystemExit(f"Unknown command: {command}")

        with task_board_transaction(self.runtime.status_file):
            state = self.runtime.load_state()
            state_before = deepcopy(state)
            result = handler(state, args)
            try:
                self.runtime.sync_all(state)
            except Exception:
                self.runtime.save_state(state_before)
                raise
        return result


_MODULE_CACHE: dict[tuple[str, str], ModuleType] = {}
_MODULE_CACHE_LOCK = threading.Lock()


@contextmanager
def _temporary_environ(values: Mapping[str, str]) -> Iterator[None]:
    previous = {key: os.environ.get(key) for key in values}
    os.environ.update(values)
    try:
        yield
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def _load_task_board_module(status_root: Path, script: Path) -> ModuleType:
    key = (str(status_root.resolve()), str(script.resolve()))
    with _MODULE_CACHE_LOCK:
        cached = _MODULE_CACHE.get(key)
        if cached is not None:
            return cached

        digest = hashlib.sha256("\0".join(key).encode("utf-8")).hexdigest()[:16]
        module_name = f"_drts_task_board_{digest}"
        spec = importlib.util.spec_from_file_location(module_name, script)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Unable to load task-board module at {script}")
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            with _temporary_environ({"AI_STATUS_ROOT": str(status_root)}):
                spec.loader.exec_module(module)
        except Exception:
            sys.modules.pop(module_name, None)
            raise
        _MODULE_CACHE[key] = module
        return module


def run_task_board_command(
    config: dict[str, Any],
    command: str,
    args: list[str] | tuple[str, ...] = (),
    *,
    environ: Mapping[str, str] | None = None,
) -> TaskBoardCommandResult:
    """Invoke the canonical task-board command path without a subprocess."""

    paths = config.get("paths", {})
    status_value = paths.get("status_file")
    if not status_value:
        return TaskBoardCommandResult(2, stderr="Missing paths.status_file")
    status_file = Path(str(status_value)).expanduser().resolve()
    status_root = status_file.parent
    script = status_root / "scripts" / "ai_status.py"
    if not script.exists():
        return TaskBoardCommandResult(2, stderr=f"Status command module not found at {script}")

    command_env = {str(key): str(value) for key, value in (environ or {}).items()}
    try:
        module = _load_task_board_module(status_root, script)
        if hasattr(module, "execute_command"):
            with _temporary_environ(command_env):
                payload = module.execute_command(command, list(map(str, args)))
            return TaskBoardCommandResult(0, payload=payload)

        # Compatibility for older/custom command modules. The repository-owned
        # module exposes ``execute_command`` and never uses this process-global
        # output redirection path.
        stdout = io.StringIO()
        stderr = io.StringIO()
        with _temporary_environ(command_env), redirect_stdout(stdout), redirect_stderr(stderr):
            returncode = int(module.main([str(script), command, *map(str, args)]))
        return TaskBoardCommandResult(returncode, stdout.getvalue(), stderr.getvalue())
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 1
        message = str(exc.code) if exc.code and not isinstance(exc.code, int) else ""
        return TaskBoardCommandResult(code, stderr=message)
    except Exception as exc:
        return TaskBoardCommandResult(1, stderr=f"{type(exc).__name__}: {exc}")
