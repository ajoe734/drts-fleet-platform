#!/usr/bin/env python3
from __future__ import annotations

import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

TOOL_ROOT = Path(__file__).resolve().parent
SOURCE_ROOT = TOOL_ROOT.parents[1]


def _resolve_status_root() -> Path:
    """Locate the checkout that owns the live orchestrator state.

    SOURCE_ROOT answers "where does this code live", which is a different
    question. Everything now runs from an immutable release copy under
    .artifacts/releases/<name>, and `.orchestrator/` is gitignored, so a
    release checkout never carries runtime state -- falling back to SOURCE_ROOT
    there resolves the config to a path that cannot exist.

    That is not hypothetical: every permission-broker hook event has been dying
    on `KeyError: Missing config path for approval_queue` since the config left
    git in 30ac0542b. The supervisor was unaffected only because systemd
    exports ORCH_STATUS_ROOT and bin/run-supervisor.sh passes --config, while
    Claude Code spawns hooks with neither.

    Same resolution order as run-supervisor.sh, so an entry point that forgets
    to export the environment lands where one that remembers does. The git call
    is the last resort: a checkout that owns its own state never reaches it.
    """
    for name in ("ORCH_STATUS_ROOT", "AI_STATUS_ROOT"):
        raw = os.environ.get(name)
        if raw:
            return Path(raw).resolve()
    if (SOURCE_ROOT / ".orchestrator" / "config.json").exists():
        return SOURCE_ROOT.resolve()
    try:
        result = subprocess.run(
            [
                "git",
                "-C",
                str(SOURCE_ROOT),
                "rev-parse",
                "--path-format=absolute",
                "--git-common-dir",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return SOURCE_ROOT.resolve()
    common_dir = Path((result.stdout or "").strip())
    if result.returncode == 0 and common_dir.name == ".git":
        return common_dir.parent.resolve()
    return SOURCE_ROOT.resolve()


ROOT = _resolve_status_root()
ORCHESTRATOR_DIR = ROOT / ".orchestrator"
DEFAULT_CONFIG_PATH = ORCHESTRATOR_DIR / "config.json"
LOCAL_CONFIG_PATH = ORCHESTRATOR_DIR / "config.local.json"
# Task briefs are regenerated from canonical task state, so they must never
# overwrite the small set of authored briefs tracked alongside source code.
TASK_BRIEFS_DIR = ORCHESTRATOR_DIR / "generated" / "task-briefs"
EVIDENCE_DIR = ORCHESTRATOR_DIR / "evidence"
AI_GUIDE_PATH = ROOT / "AI_COLLABORATION_GUIDE.md"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso_utc(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def atomic_write_text(path: Path, content: str, *, encoding: str = "utf-8") -> None:
    ensure_parent(path)
    tmp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    tmp_path.write_text(content, encoding=encoding)
    tmp_path.replace(path)


def _jsonl_lock_path(path: Path) -> Path:
    return path.with_name(f".{path.name}.lock")


@contextmanager
def hold_jsonl_lock(path: Path):
    ensure_parent(path)
    handle = _jsonl_lock_path(path).open("a+", encoding="utf-8")
    try:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def append_jsonl_line_unlocked(path: Path, line: str) -> None:
    payload = (line + "\n").encode("utf-8")
    fd = os.open(path, os.O_APPEND | os.O_CREAT | os.O_WRONLY, 0o644)
    try:
        written = 0
        while written < len(payload):
            chunk = os.write(fd, payload[written:])
            if chunk == 0:
                raise OSError(f"short write while appending {path}")
            written += chunk
    finally:
        os.close(fd)


def _strip_js_comments(text: str) -> str:
    """Strip JS-style // and /* */ comments from JSON-with-comments, but NOT
    inside string literals.  A naive regex like r'//.*$' also eats '://' in
    URLs, producing unclosed strings and JSONDecodeErrors."""
    result: list[str] = []
    i = 0
    n = len(text)
    in_string = False
    while i < n:
        ch = text[i]
        if in_string:
            if ch == "\\" and i + 1 < n:
                result.append(ch)
                result.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_string = False
            result.append(ch)
            i += 1
        else:
            if ch == '"':
                in_string = True
                result.append(ch)
                i += 1
            elif ch == "/" and i + 1 < n and text[i + 1] == "/":
                # line comment — skip to end of line
                while i < n and text[i] != "\n":
                    i += 1
            elif ch == "/" and i + 1 < n and text[i + 1] == "*":
                # block comment — skip to */
                i += 2
                while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                    i += 1
                i += 2  # skip closing */
            else:
                result.append(ch)
                i += 1
    return "".join(result)


def load_json(path: Path, default: Any | None = None) -> Any:
    if not path.exists():
        return deepcopy(default)
    last_error: json.JSONDecodeError | None = None

    def parse_text(text: str) -> Any:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            sanitized = _strip_js_comments(text)
            sanitized = re.sub(r",(\s*[}\]])", r"\1", sanitized)
            try:
                return json.loads(sanitized)
            except json.JSONDecodeError as exc:
                if exc.msg != "Extra data":
                    raise
                decoder = json.JSONDecoder()
                payload, end = decoder.raw_decode(sanitized)
                trailing = sanitized[end:].strip()
                if trailing.startswith("{") or trailing.startswith("["):
                    return payload
                raise

    for attempt in range(3):
        text = path.read_text(encoding="utf-8").strip()
        if not text:
            return deepcopy(default)
        try:
            return parse_text(text)
        except json.JSONDecodeError as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.05)
                continue
            raise last_error

    return deepcopy(default)


def _json_text(payload: Any) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def write_json(path: Path, payload: Any) -> None:
    atomic_write_text(path, _json_text(payload))


def write_json_if_changed(path: Path, payload: Any) -> bool:
    """Write `payload` only when it differs from what is already on disk.

    Returns whether a write happened.

    For documents that are re-saved on a timer rather than on a change --
    runtime state is rewritten every tick -- an unconditional atomic write
    means a full-size temp file plus a rename for every no-op. Reading the
    existing bytes first costs one page-cache hit and skips all of it.

    Deliberately compares serialized text, not objects: the on-disk bytes are
    what the next reader gets, and equal objects that serialize differently
    still need writing.
    """
    text = _json_text(payload)
    try:
        if path.read_text(encoding="utf-8") == text:
            return False
    except (OSError, UnicodeDecodeError):
        pass  # missing, unreadable, or not text: fall through and write it
    atomic_write_text(path, text)
    return True


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def deep_merge(base: Any, overlay: Any) -> Any:
    if isinstance(base, dict) and isinstance(overlay, dict):
        merged = deepcopy(base)
        for key, value in overlay.items():
            if key in merged:
                merged[key] = deep_merge(merged[key], value)
            else:
                merged[key] = deepcopy(value)
        return merged
    if isinstance(base, list) and isinstance(overlay, list):
        return deepcopy(overlay)
    return deepcopy(overlay)


def resolve_path(value: str | Path | None) -> Path | None:
    if value is None:
        return None
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    return path


def resolve_source_path(value: str | Path | None) -> Path | None:
    if value is None:
        return None
    path = Path(value)
    if not path.is_absolute():
        path = SOURCE_ROOT / path
    return path


def task_board_cli_path() -> Path:
    return TOOL_ROOT / "bin" / "ai-status.sh"


def relpath(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def load_config(config_path: str | Path | None = None) -> dict[str, Any]:
    config_file = resolve_path(config_path) if config_path else DEFAULT_CONFIG_PATH
    if config_file is None:
        raise RuntimeError("Unable to resolve orchestrator config path")
    # A missing config used to load as `{}`, which is indistinguishable from a
    # configured-but-empty one. Callers ask it for a path immediately, so the
    # failure surfaced as `KeyError: Missing config path for approval_queue`
    # from somewhere far away, naming a config key instead of the file nobody
    # found. Fail here, where the path that was looked for is still in hand.
    if not config_file.exists() and not LOCAL_CONFIG_PATH.exists():
        raise FileNotFoundError(
            f"orchestrator config not found at {config_file} "
            f"(status root: {ROOT}). Pass --config, or export ORCH_STATUS_ROOT "
            "to the checkout that owns .orchestrator/."
        )
    config = load_json(config_file, default={})
    if LOCAL_CONFIG_PATH.exists():
        config = deep_merge(config, load_json(LOCAL_CONFIG_PATH, default={}))
    return config


def config_path(config: dict[str, Any], key: str, default: str | None = None) -> Path:
    value = config.get("paths", {}).get(key, default)
    path = resolve_path(value)
    if path is None:
        raise KeyError(f"Missing config path for {key}")
    return path


def canonical_workspace_root(config: dict[str, Any]) -> Path:
    """Return the workspace that owns canonical machine-truth files."""
    return config_path(config, "status_file").parents[0]


def delivery_workspace_root(config: dict[str, Any], metadata: dict[str, Any] | None = None) -> Path:
    """Return the cwd a worker should use for repository edits.

    Execution and coordination dispatch may run in isolated git worktrees,
    while fallback delivery continues to use the canonical workspace.
    """
    raw = (metadata or {}).get("workspace_root")
    if raw:
        return Path(str(raw)).expanduser().resolve()
    return canonical_workspace_root(config)


# --- Antigravity model rotation -------------------------------------------
#
# The `agy` CLI can drive either its default Gemini model or an explicit
# fallback model in the same non-interactive run. When a rotation-enabled
# Antigravity provider exhausts the model it is currently using (Gemini quota
# "hit your limit", capacity/quota walls), the supervisor records a short
# cooldown for that model in a shared state file and lets the SAME lane
# re-dispatch so this selector picks the other model instead of pausing the
# whole lane. The lane only truly pauses when both pools are cooling.
ANTIGRAVITY_ROTATION_DEFAULT_FALLBACK = "Claude Sonnet 4.6 (Thinking)"
ANTIGRAVITY_ROTATION_COOLDOWN_SECONDS = 900
ROTATION_PRIMARY_SLOT = "gemini"
ROTATION_FALLBACK_SLOT = "claude"
ANTIGRAVITY_ROTATION_PATH_DEFAULT = ".orchestrator/antigravity-rotation.json"


def antigravity_rotation_path(config: dict[str, Any]) -> Path:
    return config_path(config, "antigravity_rotation", ANTIGRAVITY_ROTATION_PATH_DEFAULT)


def antigravity_rotation_config(settings: dict[str, Any] | None) -> dict[str, Any]:
    """Normalize a provider's `antigravity.model_rotation` block.

    `primary` empty means "use the agy default model" (i.e. do not pass
    `--model`), which is Gemini.
    """
    raw = settings.get("model_rotation") if isinstance(settings, dict) else None
    raw = raw if isinstance(raw, dict) else {}
    try:
        cooldown = int(raw.get("cooldown_seconds") or ANTIGRAVITY_ROTATION_COOLDOWN_SECONDS)
    except (TypeError, ValueError):
        cooldown = ANTIGRAVITY_ROTATION_COOLDOWN_SECONDS
    return {
        "enabled": bool(raw.get("enabled", False)),
        "primary": str(raw.get("primary") or "").strip(),
        "fallback": str(raw.get("fallback") or ANTIGRAVITY_ROTATION_DEFAULT_FALLBACK).strip(),
        "cooldown_seconds": max(1, cooldown),
    }


def load_rotation_cooldowns(config: dict[str, Any], provider_key: str) -> dict[str, float]:
    """Return {gemini_until, claude_until} epoch seconds for a provider (0 = warm)."""
    data = load_json(antigravity_rotation_path(config), default={}) or {}
    entry = data.get(str(provider_key)) if isinstance(data, dict) else None
    entry = entry if isinstance(entry, dict) else {}
    result: dict[str, float] = {}
    for slot in (ROTATION_PRIMARY_SLOT, ROTATION_FALLBACK_SLOT):
        key = f"{slot}_until"
        try:
            result[key] = float(entry.get(key) or 0)
        except (TypeError, ValueError):
            result[key] = 0.0
    return result


def record_rotation_cooldown(
    config: dict[str, Any], provider_key: str, slot: str, until_ts: float
) -> dict[str, float]:
    """Persist a per-model cooldown and return the provider's full cooldown map."""
    path = antigravity_rotation_path(config)
    data = load_json(path, default={}) or {}
    if not isinstance(data, dict):
        data = {}
    entry = data.get(str(provider_key))
    if not isinstance(entry, dict):
        entry = {}
    entry[f"{slot}_until"] = float(until_ts)
    data[str(provider_key)] = entry
    write_json(path, data)
    result: dict[str, float] = {}
    for other in (ROTATION_PRIMARY_SLOT, ROTATION_FALLBACK_SLOT):
        key = f"{other}_until"
        try:
            result[key] = float(entry.get(key) or 0)
        except (TypeError, ValueError):
            result[key] = 0.0
    return result


def select_rotation_model(
    config: dict[str, Any],
    provider_key: str,
    rotation: dict[str, Any],
    *,
    now: float | None = None,
) -> tuple[str | None, str | None, bool]:
    """Pick the model to dispatch with.

    Returns (slot, model, both_cooling):
      - primary pool warm            -> (ROTATION_PRIMARY_SLOT, rotation.primary, False)
      - primary cooling, fallback ok -> (ROTATION_FALLBACK_SLOT, rotation.fallback, False)
      - both cooling                 -> (None, None, True)
    """
    now = now if now is not None else datetime.now(timezone.utc).timestamp()
    cooldowns = load_rotation_cooldowns(config, provider_key)
    if cooldowns.get(f"{ROTATION_PRIMARY_SLOT}_until", 0.0) <= now:
        return ROTATION_PRIMARY_SLOT, str(rotation.get("primary") or ""), False
    if cooldowns.get(f"{ROTATION_FALLBACK_SLOT}_until", 0.0) <= now:
        return ROTATION_FALLBACK_SLOT, str(rotation.get("fallback") or ""), False
    return None, None, True


def apply_orchestrator_runtime_env(
    env: dict[str, str],
    config: dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Stamp env vars that keep status writes pointed at machine truth."""
    canonical_root = canonical_workspace_root(config)
    workspace_root = delivery_workspace_root(config, metadata)
    env.update(
        {
            "ORCH_STATUS_ROOT": str(canonical_root),
            "AI_STATUS_ROOT": str(canonical_root),
            "ORCH_CANONICAL_ROOT": str(canonical_root),
            "ORCH_WORKSPACE_ROOT": str(workspace_root),
        }
    )
    task_branch = str((metadata or {}).get("task_branch") or "").strip()
    if task_branch:
        env["ORCH_TASK_BRANCH"] = task_branch
    return env


def run_command(
    command: list[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    timeout: float | None = None,
    check: bool = False,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd or ROOT),
        env=env,
        check=check,
        timeout=timeout,
        text=True,
        capture_output=True,
    )


def _cli_search_roots(extra_roots: Iterable[str | Path] | None = None) -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()
    if extra_roots is None:
        values: list[str | Path] = []
    elif isinstance(extra_roots, (str, Path)):
        values = [extra_roots]
    else:
        values = list(extra_roots)
    for value in [*values, ROOT]:
        path = Path(os.path.expandvars(os.path.expanduser(str(value))))
        if not path.is_absolute():
            path = ROOT / path
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        roots.append(path)
    return roots


def command_exists(name: str, *, search_roots: Iterable[str | Path] | None = None) -> str | None:
    candidate = str(name or "").strip()
    if not candidate:
        return None
    if os.path.sep in candidate:
        path = Path(os.path.expanduser(os.path.expandvars(candidate)))
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
        return None
    resolved = shutil.which(candidate)
    if resolved:
        return resolved
    local_candidates = []
    for root in _cli_search_roots(search_roots):
        local_candidates.extend(
            [
                root / ".orchestrator" / "bin" / "node_modules" / ".bin" / candidate,
                root / ".orchestrator" / "bin" / candidate,
            ]
        )
    for path in local_candidates:
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
    return None


def runtime_env_overrides(runtime: dict[str, Any] | None) -> dict[str, str]:
    if not isinstance(runtime, dict):
        return {}
    env: dict[str, str] = {}
    config_home = str(runtime.get("config_home") or "").strip()
    if config_home:
        home = os.path.expandvars(os.path.expanduser(config_home))
        env["HOME"] = home
        env.setdefault("XDG_CONFIG_HOME", str(Path(home) / ".config"))
        env.setdefault("XDG_CACHE_HOME", str(Path(home) / ".cache"))
        env.setdefault("XDG_DATA_HOME", str(Path(home) / ".local" / "share"))
    configured_env = runtime.get("env")
    if isinstance(configured_env, dict):
        for key, value in configured_env.items():
            if value is None:
                continue
            env[str(key)] = os.path.expandvars(os.path.expanduser(str(value)))
    return env


def shell_quote(parts: list[str]) -> str:
    return " ".join(subprocess.list2cmdline([part]) if os.name == "nt" else __import__("shlex").quote(part) for part in parts)


def normalize_agent_id(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def display_name_for(config: dict[str, Any], agent_id: str) -> str:
    agent = config.get("agents", {}).get(normalize_agent_id(agent_id), {})
    return agent.get("display_name") or agent.get("name") or agent_id


def agent_config_for(config: dict[str, Any], agent_id: str) -> dict[str, Any]:
    normalized = normalize_agent_id(agent_id)
    agent = config.get("agents", {}).get(normalized)
    if agent:
        merged = deepcopy(agent)
        merged.setdefault("id", normalized)
        merged.setdefault("display_name", agent_id)
        return merged
    return {"id": normalized, "display_name": agent_id, "provider": normalized, "adapter": "file_inbox"}


def render_template(path: Path, variables: dict[str, Any]) -> str:
    text = path.read_text(encoding="utf-8")
    for key, value in variables.items():
        text = text.replace("{{" + key + "}}", str(value))
    return text


# Activity-log size ceiling: when ai-activity-log.jsonl crosses this byte
# threshold, write_activity_log rotates it down to ACTIVITY_LOG_KEEP_LINES
# tail entries before appending the new payload. Without this bound the file
# grew to ~500 MB / 338k lines by the 2026-05-26 incident, slowing the
# dashboard's mirror fetch to the point of appearing dead. Per-call os.stat()
# is microseconds — cheaper than discovering the bloat after-the-fact.
ACTIVITY_LOG_MAX_BYTES = int(os.environ.get("ACTIVITY_LOG_MAX_BYTES", str(50 * 1024 * 1024)))
ACTIVITY_LOG_KEEP_LINES = int(os.environ.get("ACTIVITY_LOG_KEEP_LINES", "10000"))
# How many rotated archives to retain. JSONL compresses roughly 10x, so a 50 MB
# rotation lands near 5 MB and the default holds ~1 GB of history in ~20 files.
ACTIVITY_LOG_ARCHIVE_KEEP = int(os.environ.get("ACTIVITY_LOG_ARCHIVE_KEEP", "20"))


def activity_log_archive_dir(path: Path) -> Path:
    """Where rotated segments of `path` are kept."""
    return path.parent / f"{path.stem}-archive"


def _archive_activity_log(path: Path) -> Path:
    """Compress the whole current log into a timestamped archive beside it.

    Raises on failure, because the caller must not truncate what it could not
    preserve.
    """
    archive_dir = activity_log_archive_dir(path)
    archive_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    target = archive_dir / f"{path.stem}-{stamp}{path.suffix}.gz"
    partial = target.with_name(target.name + ".part")
    with path.open("rb") as source, gzip.open(partial, "wb") as sink:
        shutil.copyfileobj(source, sink)
    os.replace(partial, target)
    return target


def _prune_activity_log_archives(path: Path) -> None:
    """Drop the oldest archives past ACTIVITY_LOG_ARCHIVE_KEEP.

    Retention is bounded on purpose, but deciding how far back history goes is
    not the same act as dropping the current file's contents mid-rotation.
    """
    if ACTIVITY_LOG_ARCHIVE_KEEP <= 0:
        return
    archive_dir = activity_log_archive_dir(path)
    if not archive_dir.is_dir():
        return
    # Timestamped names sort chronologically.
    archives = sorted(archive_dir.glob(f"{path.stem}-*{path.suffix}.gz"))
    for stale in archives[: -ACTIVITY_LOG_ARCHIVE_KEEP]:
        try:
            stale.unlink()
        except OSError:
            continue


def _rotate_activity_log_if_oversize(path: Path) -> None:
    """If `path` exceeds ACTIVITY_LOG_MAX_BYTES, archive it whole, then keep
    only the last ACTIVITY_LOG_KEEP_LINES lines in the live file.

    The archive step is what makes this a rotation rather than a truncation.
    It used to write the tail and drop everything before it: at the configured
    50 MB / 10k lines that discarded ~93% of the record, while
    SUPERVISOR_OPERATING_MODEL.md told readers the file was append-only
    history. An audit trail does not get to be silently shorter than the
    document describing it.

    If archiving fails the live file is left alone. Growing past the ceiling is
    a problem an operator can see and fix; a rotation that destroyed the
    history it could not copy is not.

    Atomic via tempfile + os.replace so concurrent writers from other
    processes see either the pre-rotation file or the post-rotation file,
    never a half-truncated one. Concurrent rotations are safe — both write
    the same tail to their own tempfile; whichever rename wins, the other
    loses a few in-flight lines at worst. Returning silently when the file
    is missing or unreadable preserves write_activity_log's no-throw
    contract.
    """
    try:
        if not path.exists():
            return
        size = path.stat().st_size
        if size <= ACTIVITY_LOG_MAX_BYTES:
            return
    except OSError:
        return
    try:
        _archive_activity_log(path)
    except (OSError, ValueError):
        # Preserving the record outranks holding the size ceiling.
        return
    _prune_activity_log_archives(path)
    try:
        with path.open("rb") as handle:
            # tail by reading from the end. ACTIVITY_LOG_KEEP_LINES lines is
            # roughly a few MB given current per-line size; reading a 50+ MB
            # tail block once per rotation is acceptable.
            handle.seek(0, 2)
            file_size = handle.tell()
            # Read at most the last 20 MB (matches typical 10k * 1.5 KB lines
            # plus headroom for unusually wide records).
            read_back = min(file_size, 20 * 1024 * 1024)
            handle.seek(file_size - read_back)
            tail_bytes = handle.read()
        tail_lines = tail_bytes.decode("utf-8", errors="replace").splitlines()
        kept = tail_lines[-ACTIVITY_LOG_KEEP_LINES:]
        tmp = path.with_suffix(path.suffix + ".rotate.tmp")
        with tmp.open("w", encoding="utf-8") as handle:
            for line in kept:
                handle.write(line + "\n")
        os.replace(tmp, path)
    except (OSError, UnicodeDecodeError):
        # Don't surface rotation errors to the caller; activity logging
        # must be non-fatal. Worst case the file keeps growing until the
        # operator investigates.
        return


def write_activity_log(config: dict[str, Any], entry: dict[str, Any]) -> None:
    payload = {
        "ts": utc_now(),
        "agent": "Orchestrator",
        **entry,
    }
    log_path = config_path(config, "activity_log")
    encoded_payload = json.dumps(payload, ensure_ascii=False)
    with hold_jsonl_lock(log_path):
        # Rotation and append must share the same lock. Otherwise a rotator can
        # replace the file while another process appends, producing NUL-padded
        # or concatenated JSONL records that make the dashboard look broken.
        try:
            _rotate_activity_log_if_oversize(log_path)
        except Exception:
            pass
        append_jsonl_line_unlocked(log_path, encoded_payload)


def runtime_log_path(prefix: str, target: str) -> Path:
    slug = normalize_agent_id(target) or "unknown"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    suffix = uuid.uuid4().hex[:6]
    return ORCHESTRATOR_DIR / "logs" / f"{stamp}-{prefix}-{slug}-{suffix}.log"


def new_runtime_id(prefix: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{prefix}-{stamp}-{uuid.uuid4().hex[:8]}"


def worker_result_path(config: dict[str, Any], run_id: str) -> Path:
    directory = config_path(config, "state_file").parent / "worker-results"
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"{run_id}.json"


def worker_result_schema_path() -> Path:
    return TOOL_ROOT / "schemas" / "worker-result.schema.json"


def canonical_relpath(config: dict[str, Any], path: Path) -> str:
    try:
        return str(path.resolve().relative_to(canonical_workspace_root(config)))
    except ValueError:
        return str(path)


def worker_unit_name(run_id: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_.-]+", "-", str(run_id or "worker")).strip("-.")
    return f"drts-worker-{slug[:180]}.service"


def worker_unit_properties(config: dict[str, Any], metadata: dict[str, Any] | None = None) -> list[str]:
    settings = dict((config.get("supervisor") or {}).get("worker_units", {}) or {})
    metadata = metadata or {}
    role = str(metadata.get("control_role") or "").strip().lower()
    profile = "control" if role == "chair" else str(metadata.get("resource_profile") or "execution").strip().lower()
    profiles = settings.get("profiles") if isinstance(settings.get("profiles"), dict) else {}
    selected = dict(profiles.get(profile) or profiles.get("execution") or {})
    properties: list[str] = []
    for config_key, systemd_key in (("memory_high", "MemoryHigh"), ("memory_max", "MemoryMax"), ("cpu_quota", "CPUQuota")):
        value = str(selected.get(config_key) or "").strip()
        if value:
            properties.append(f"{systemd_key}={value}")
    return properties


def apply_worker_unit_env(
    env: dict[str, str],
    config: dict[str, Any],
    run_id: str,
    metadata: dict[str, Any] | None = None,
) -> str:
    unit_name = worker_unit_name(run_id)
    env["ORCH_WORKER_UNIT"] = unit_name
    env["ORCH_WORKER_UNIT_PROPERTIES"] = "\n".join(worker_unit_properties(config, metadata))
    return unit_name


def spawn_background_process(
    command: list[str],
    *,
    cwd: Path | None = None,
    log_path: Path,
    env: dict[str, str] | None = None,
) -> tuple[subprocess.Popen[str], Path]:
    ensure_parent(log_path)
    handle = log_path.open("w", encoding="utf-8")
    child_env = dict(env) if env is not None else os.environ.copy()
    for key in ("NOTIFY_SOCKET", "WATCHDOG_USEC", "WATCHDOG_PID"):
        child_env.pop(key, None)
    worker_unit = str(child_env.get("ORCH_WORKER_UNIT") or "").strip()
    worker_properties = [
        value
        for value in str(child_env.get("ORCH_WORKER_UNIT_PROPERTIES") or "").split("\n")
        if value.strip()
    ]
    launched_command = list(command)
    if worker_unit and shutil.which("systemd-run"):
        log_target = str(log_path.resolve())
        # `cwd=` below configures systemd-run itself. The transient service it
        # asks systemd to create does not inherit it -- a unit with no
        # WorkingDirectory starts in $HOME -- so every worker launched through
        # a unit began life outside the repository, whatever workspace the
        # supervisor had just built and recorded for it.
        #
        # Measured on 2026-08-21: 41 of 41 dispatched Claude workers reported
        # `cwd: /home/lupin` at init. Two consequences, both of which looked
        # like separate problems for days. The worker starts outside the
        # project, so .claude/settings.local.json never loads and it has no
        # PreToolUse hook at all -- the permission broker's deny list and
        # guards were inert for every dispatched worker, 0 events in a day of
        # dispatch. And it has to pick somewhere to work, with its assigned
        # worktree present only in the environment, so the canonical checkout
        # is the discoverable choice: HEAD on the shared tree moved four times
        # in the twenty-six minutes this was found.
        #
        # Taken from the same `cwd` the Popen call uses rather than from
        # metadata, so the unit cannot disagree with the launcher about where
        # the worker is supposed to stand.
        working_directory = str(Path(cwd).resolve()) if cwd else str(ROOT)
        launched_command = [
            "systemd-run",
            "--user",
            "--quiet",
            "--collect",
            "--service-type=exec",
            f"--unit={worker_unit}",
            f"--property=WorkingDirectory={working_directory}",
            f"--property=StandardOutput=append:{log_target}",
            f"--property=StandardError=append:{log_target}",
            *[f"--property={value}" for value in worker_properties],
            "--",
            *command,
        ]
    try:
        process = subprocess.Popen(
            launched_command,
            cwd=str(cwd or ROOT),
            stdout=handle,
            stderr=subprocess.STDOUT,
            text=True,
            env=child_env,
            start_new_session=True,
        )
    finally:
        handle.close()
    if worker_unit:
        worker_pid = transient_service_main_pid(worker_unit)
        if worker_pid is not None:
            setattr(process, "worker_pid", worker_pid)
    return process, log_path


def transient_service_main_pid(unit_name: str) -> int | None:
    if not unit_name or not shutil.which("systemctl"):
        return None
    deadline = time.monotonic() + 1.0
    while True:
        try:
            result = subprocess.run(
                ["systemctl", "--user", "show", unit_name, "--property=MainPID", "--value"],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        if result.returncode != 0:
            return None
        try:
            pid = int((result.stdout or "").strip())
        except ValueError:
            pid = 0
        if pid > 0:
            return pid
        if time.monotonic() >= deadline:
            return None
        time.sleep(0.05)


def background_process_pid(process: subprocess.Popen[str]) -> int:
    for candidate in (getattr(process, "worker_pid", None), getattr(process, "pid", None)):
        if isinstance(candidate, int) and candidate > 0:
            return candidate
    raise RuntimeError("background process did not expose a positive PID")


def snapshot_task(task: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "id": task.get(schema["task_id_field"]),
        "status": task.get(schema["status_field"]),
        "owner": task.get(schema["assignee_field"]),
        "reviewer": task.get(schema["reviewer_field"]),
        "artifacts": list(task.get(schema.get("artifacts_field", "artifacts"), []) or []),
        "depends_on": list(task.get("depends_on", []) or []),
        "next": task.get(schema.get("next_field", "next")),
        "last_update": task.get(schema.get("last_update_field", "last_update")),
    }
    for key in (
        "title",
        "summary_zh",
        "task_class",
        "auto_generated",
        "helper_parent",
        "helper_kind",
        "mutates_canonical",
        "auto_created_by",
        "planning_ref",
    ):
        if key in task:
            payload[key] = task.get(key)
    if "evidence_refs" in task:
        payload["evidence_refs"] = list(task.get("evidence_refs", []) or [])
    return payload


def load_status(config: dict[str, Any]) -> dict[str, Any]:
    return load_json(config_path(config, "status_file"), default={}) or {}


def _unique_paths(paths: list[Path]) -> list[Path]:
    unique: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        marker = str(path)
        if marker in seen or not path.exists():
            continue
        seen.add(marker)
        unique.append(path)
    return unique


def _status_tasks(config: dict[str, Any], status: dict[str, Any]) -> list[dict[str, Any]]:
    schema = config.get("schema", {})
    tasks_path = schema.get("tasks_path", "tasks")
    tasks = status.get(tasks_path, [])
    return tasks if isinstance(tasks, list) else []


def _status_task_by_id(config: dict[str, Any], status: dict[str, Any], task_id: str | None) -> dict[str, Any] | None:
    if not task_id:
        return None
    for task in _status_tasks(config, status):
        if str(task.get("id") or "") == str(task_id):
            return task
    return None


def _merge_task_payload(
    config: dict[str, Any],
    *,
    task: dict[str, Any] | None = None,
    task_id: str | None = None,
    status: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    if isinstance(status, dict):
        resolved_status = status
    elif config.get("paths", {}).get("status_file"):
        resolved_status = load_status(config)
    else:
        resolved_status = {}
    live_task = _status_task_by_id(config, resolved_status, task_id or ((task or {}).get("id")))
    if not live_task and not task:
        return None
    merged = deepcopy(live_task or {})
    if task:
        merged.update({key: value for key, value in task.items() if value not in (None, "", [], {})})
    return merged


def _normalize_summary(text: Any, max_length: int = 280) -> str:
    raw = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(raw) <= max_length:
        return raw
    clipped = raw[: max_length - 1].rstrip()
    if " " in clipped:
        clipped = clipped.rsplit(" ", 1)[0]
    return clipped + "…"


def _discussion_artifact_paths(status: dict[str, Any]) -> list[Path]:
    artifacts = status.get("discussion_artifacts")
    result: list[Path] = []
    if isinstance(artifacts, dict):
        candidates = artifacts.values()
    elif isinstance(artifacts, list):
        candidates = artifacts
    else:
        candidates = []
    for candidate in candidates:
        value = str(candidate).strip()
        if not value:
            continue
        path = resolve_path(value)
        if path is not None:
            result.append(path)

    workspace = str(status.get("discussion_workspace") or "").strip()
    if workspace:
        workspace_path = resolve_path(workspace)
        if workspace_path and workspace_path.exists():
            for name in ("planning-session.json", "starter-draft.md", "consensus-packet.md", "supervisor-queue.md"):
                result.append(workspace_path / name)
    return _unique_paths(result)


def task_brief_path(task_id: str, config: dict[str, Any] | None = None) -> Path:
    """Return the generated brief location, with an optional isolated runtime root."""
    if config and config.get("paths", {}).get("task_briefs_dir"):
        return config_path(config, "task_briefs_dir") / f"{task_id}.md"
    return TASK_BRIEFS_DIR / f"{task_id}.md"


def evidence_path(run_id: str, config: dict[str, Any] | None = None) -> Path:
    """Return the evidence location, with an optional isolated runtime root."""
    if config and config.get("paths", {}).get("evidence_dir"):
        return config_path(config, "evidence_dir") / f"{run_id}.json"
    return EVIDENCE_DIR / f"{run_id}.json"


def build_task_brief(
    config: dict[str, Any],
    task: dict[str, Any],
    *,
    runtime_state: dict[str, Any] | None = None,
) -> str:
    task_id = str(task.get("id") or "").strip() or "UNKNOWN"
    title = str(task.get("title") or task.get("summary_zh") or "").strip()
    status_value = str(task.get("status") or "").strip() or "-"
    owner = str(task.get("owner") or "").strip() or "-"
    reviewer = str(task.get("reviewer") or "").strip() or "-"
    next_text = _normalize_summary(task.get("next") or "No short handoff yet.")
    summary_zh = _normalize_summary(task.get("summary_zh") or "")
    planning_ref = str(task.get("planning_ref") or "").strip()
    artifacts = [str(item) for item in task.get("artifacts", []) if str(item).strip()]
    display_artifacts: list[str] = []
    external_artifacts: list[str] = []
    for artifact in artifacts:
        artifact_path = Path(artifact)
        if artifact_path.is_absolute():
            try:
                display_artifacts.append(str(artifact_path.relative_to(ROOT)))
            except ValueError:
                external_artifacts.append(artifact)
            continue
        display_artifacts.append(artifact)
    depends_on = [str(item) for item in task.get("depends_on", []) if str(item).strip()]
    acceptance = [str(item) for item in task.get("acceptance", []) if str(item).strip()]
    evidence_refs = [str(item) for item in task.get("evidence_refs", []) if str(item).strip()]
    pauses = [
        pause
        for pause in (runtime_state or {}).get("dispatch_pauses", [])
        if str(pause.get("task_id") or "") == task_id
    ]

    lines = [f"# Task Brief: {task_id}", ""]
    if title:
        lines.extend([title, ""])
    lines.extend(
        [
            f"- Status: `{status_value}`",
            f"- Owner: `{owner}`",
            f"- Reviewer: `{reviewer}`",
        ]
    )
    if planning_ref:
        lines.append(f"- Planning Ref: `{planning_ref}`")
    if task.get("last_update"):
        lines.append(f"- Last Update: `{task['last_update']}`")
    if summary_zh:
        lines.extend(["", "## 中文說明", "", summary_zh])
    lines.extend(["", "## Short Summary", "", next_text or "-", "", "## Dependencies", ""])
    if depends_on:
        lines.extend([f"- `{item}`" for item in depends_on])
    else:
        lines.append("- None")
    lines.extend(["", "## Acceptance", ""])
    if acceptance:
        lines.extend([f"- {item}" for item in acceptance])
    else:
        lines.append("- None listed")
    lines.extend(["", "## Artifacts", ""])
    if display_artifacts:
        lines.extend([f"- `{item}`" for item in display_artifacts])
    else:
        lines.append("- None listed")
    if external_artifacts:
        lines.extend(["", "## Repo-External Artifacts", ""])
        lines.extend([f"- `{item}`" for item in external_artifacts])
        lines.append(
            "- These paths are intentionally outside this repository. Operate inside their own repo/worktree only; "
            "do not stage repo-external paths from this repository."
        )
    if evidence_refs:
        lines.extend(["", "## Evidence Refs", ""])
        lines.extend([f"- `{item}`" for item in evidence_refs[:8]])
    if pauses:
        lines.extend(["", "## Runtime Pauses", ""])
        for pause in pauses[:5]:
            summary = _normalize_summary(pause.get("summary") or pause.get("failure_kind") or "Paused")
            raw_ref = str(pause.get("raw_ref") or "").strip()
            suffix = f" (`{raw_ref}`)" if raw_ref else ""
            lines.append(f"- {summary}{suffix}")
    brief_blob = " ".join([task_id, title, *display_artifacts]).lower()
    is_ui_task = ("-ui-" in f"-{task_id.lower()}-") or any(
        signal in brief_blob
        for signal in ("-web", ".tsx", ".css", "design-canvas", "ui-web", "screens.jsx")
    )
    if is_ui_task:
        lines.extend(
            [
                "",
                "## UI Design Contract (canonical — applies to EVERY lane)",
                "",
                "This task touches a UI surface. The visual design is NOT yours to invent.",
                "- The ONLY source of visual truth is `packages/ui-tokens` (realm colors) plus the",
                "  design canvas `docs/05-ui/drts-design-canvas/<App>.html` / `<app>-screens*.jsx`.",
                "  Read them BEFORE writing any UI.",
                "- Colors/typography MUST come from `@drts/ui-tokens` realm tokens (e.g. the `tenant`",
                "  realm is teal `#0F766E` / `#5EEAD4`). A raw hex palette hardcoded in `globals.css`",
                "  or components is a DEFECT, not a style choice — do not introduce one.",
                "- Do NOT redesign or \"improve\" the look. Match the canvas. If the canvas lacks a",
                "  screen, write a screen-requirements note and STOP — never substitute your own design.",
                "- Reskinning with Canvas/shadcn defaults instead of the realm tokens (套皮) fails the",
                "  task even if it \"looks fine\". Self-check the diff against the realm token + canvas.",
            ]
        )
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            f"- Use `{task_board_cli_path()}` for state changes.",
            "- Treat `current-work.md` as a human summary, not canonical machine context.",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def ensure_task_brief(
    config: dict[str, Any],
    *,
    task: dict[str, Any] | None = None,
    task_id: str | None = None,
    status: dict[str, Any] | None = None,
    runtime_state: dict[str, Any] | None = None,
) -> Path | None:
    merged_task = _merge_task_payload(config, task=task, task_id=task_id, status=status)
    if not merged_task:
        return None
    task_id_value = str(merged_task.get("id") or "").strip()
    if not task_id_value:
        return None
    path = task_brief_path(task_id_value, config)
    ensure_parent(path)
    path.write_text(build_task_brief(config, merged_task, runtime_state=runtime_state), encoding="utf-8")
    return path


def selected_shared_files(
    config: dict[str, Any],
    *,
    mode: str = "execution",
    task: dict[str, Any] | None = None,
    task_id: str | None = None,
    status: dict[str, Any] | None = None,
    runtime_state: dict[str, Any] | None = None,
) -> list[Path]:
    files: list[Path] = []
    if AI_GUIDE_PATH.exists():
        files.append(AI_GUIDE_PATH)

    if isinstance(status, dict):
        resolved_status = status
    elif config.get("paths", {}).get("status_file"):
        resolved_status = load_status(config)
    else:
        resolved_status = {}
    mode_value = str(mode or "execution").strip().lower()

    if mode_value == "planning":
        files.extend(_discussion_artifact_paths(resolved_status))
        return _unique_paths(files)

    if mode_value == "coordination":
        if config.get("paths", {}).get("status_file"):
            files.append(config_path(config, "status_file"))
        return _unique_paths(files)

    brief_path = ensure_task_brief(
        config,
        task=task,
        task_id=task_id or ((task or {}).get("id") if isinstance(task, dict) else None),
        status=resolved_status,
        runtime_state=runtime_state,
    )
    if brief_path is not None:
        files.append(brief_path)
    elif config.get("paths", {}).get("status_file"):
        files.append(config_path(config, "status_file"))
    return _unique_paths(files)


def serialize_shared_files(paths: list[Path]) -> str:
    return "\n".join(f"- {relpath(path)}" for path in paths)


def to_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


if __name__ == "__main__":
    print("This module is shared by the orchestrator scripts and is not meant to be run directly.", file=sys.stderr)
    raise SystemExit(1)
