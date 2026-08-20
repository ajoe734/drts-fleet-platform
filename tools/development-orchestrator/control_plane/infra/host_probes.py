"""How the supervisor observes and signals the operating system it runs on.

cgroup and /proc reads, child reaping, worker signals, and the sd_notify
watchdog ping. None of it carries orchestration meaning: these answer "what is
this machine doing", not "what should the fleet do next", and they were the
part of supervisor_runtime.py that could be read without knowing anything about
tasks, agents, or dispatch.

Extracted verbatim from control_plane/runtime/supervisor_runtime.py, which had
grown to 8208 lines. Every function here had no dependency on anything else in
that module, so moving them cannot introduce an import cycle -- which is why
this layer is the first cut rather than the feature clusters above it.
"""

from __future__ import annotations

import os
import re
import socket
from pathlib import Path
from typing import Any


def _current_cgroup_path() -> Path | None:
    try:
        for line in Path("/proc/self/cgroup").read_text(encoding="utf-8").splitlines():
            if line.startswith("0::"):
                current = Path("/sys/fs/cgroup") / line.split("::", 1)[1].lstrip("/")
                return current.parent if current.name.endswith(".service") else current
    except OSError:
        return None
    return None


def _read_cgroup_number(path: Path | None, name: str) -> int | None:
    if path is None:
        return None
    try:
        value = (path / name).read_text(encoding="utf-8").strip()
        return None if value == "max" else int(value)
    except (OSError, ValueError):
        return None


def _read_memory_pressure_avg10(path: Path | None) -> float | None:
    if path is None:
        return None
    try:
        for line in (path / "memory.pressure").read_text(encoding="utf-8").splitlines():
            if line.startswith("some "):
                match = re.search(r"avg10=([0-9.]+)", line)
                return float(match.group(1)) if match else None
    except (OSError, ValueError):
        return None
    return None


def _host_available_memory_bytes() -> int | None:
    try:
        for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) * 1024
    except (OSError, ValueError, IndexError):
        return None
    return None


def parse_proc_stat_process_accounting(stat_text: str) -> tuple[int, int] | None:
    """Return a process's parent PID and accumulated CPU ticks from /proc."""
    closing_paren = stat_text.rfind(")")
    if closing_paren < 0:
        return None
    fields = stat_text[closing_paren + 1 :].strip().split()
    # Fields begin at Linux procfs field 3 (state): ppid=4, utime=14, stime=15.
    if len(fields) < 13:
        return None
    try:
        return int(fields[1]), int(fields[11]) + int(fields[12])
    except ValueError:
        return None


def reap_child_pid(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        reaped_pid, _status = os.waitpid(int(pid), os.WNOHANG)
    except (ChildProcessError, OSError, ValueError):
        return False
    return reaped_pid == int(pid)


def reap_finished_children(*, limit: int = 64) -> int:
    reaped = 0
    while reaped < limit:
        try:
            pid, _status = os.waitpid(-1, os.WNOHANG)
        except (ChildProcessError, OSError):
            break
        if pid == 0:
            break
        reaped += 1
    return reaped


def _signal_worker_pid(pid: int, sig: int) -> bool:
    """Signal a worker's process group, falling back to the bare pid."""
    try:
        os.killpg(pid, sig)
        return True
    except OSError:
        try:
            os.kill(pid, sig)
            return True
        except OSError:
            return False


def _sd_notify(message: str) -> None:
    """Send a state message to systemd via the sd_notify protocol.

    Used to deliver periodic WATCHDOG=1 heartbeats so a non-zero
    WatchdogSec in the unit file accurately detects a hung tick loop
    (instead of killing a healthy supervisor every interval — the
    failure mode that produced OPS-SUPERVISOR-WATCHDOG-OFF-001 #313).

    No-op when NOTIFY_SOCKET is unset (the supervisor is not running
    under systemd, e.g., interactive smoke tests or --once invocations).
    All socket / OS errors are swallowed so heartbeat delivery cannot
    take the supervisor down.
    """
    sock_path = os.environ.get("NOTIFY_SOCKET")
    if not sock_path:
        return
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        try:
            # systemd encodes abstract namespace sockets with a leading '@';
            # the kernel expects a leading NUL byte for those.
            if sock_path.startswith("@"):
                sock_path = "\0" + sock_path[1:]
            sock.connect(sock_path)
            sock.sendall(message.encode("utf-8"))
        finally:
            sock.close()
    except OSError:
        return
