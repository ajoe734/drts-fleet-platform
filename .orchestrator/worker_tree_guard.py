"""Tree-guard primitives shared by supervisor dispatch and the chatbox hook.

The guard refuses to proceed when the working tree has uncommitted edits on
fragile-surface paths (supervisor.py, docs, skills, workflow yml, etc.). It
was originally added in OPS-GIT-WORKFLOW-006 as a dispatch gate; this module
extracts the primitives so the Claude Code PreToolUse hook can apply the
same protection to chatbox-driven edits without importing the supervisor's
heavy dependency graph (adapters, github_bus, ...).

Two surfaces are exposed:

  * `check_worker_tree_guard(config, *, reason, ...)` — dispatch gate, gated
    by `branch_strategy.worker_tree_guard.enabled`.
  * `check_chatbox_tree_guard(config, *, tool_name, ...)` — PreToolUse gate,
    gated by `branch_strategy.worker_tree_guard.chatbox_enabled`.

Both share globs, porcelain parsing, and the block-payload shape.
"""

from __future__ import annotations

import fnmatch
import subprocess
from pathlib import Path
from typing import Any


THIS_DIR = Path(__file__).resolve().parent

DEFAULT_WORKER_TREE_GUARD_BLOCKING_GLOBS = [
    ".orchestrator/supervisor.py",
    ".orchestrator/skills/**",
    ".orchestrator/templates/*",
    ".orchestrator/config*.json",
    ".orchestrator/branch_routing.py",
    "docs/ops/branch-strategy.md",
    "docs/**",
    ".github/workflows/**",
    ".husky/**",
]

# Dispatch reasons that intentionally permit a dirty tree because the worker
# is about to convert it into a commit/push. The dispatch guard skips these.
WORKER_TREE_GUARD_SKIP_REASONS = {
    "owned_finalize_dispatch",
}

# Tools that the chatbox guard treats as "writing to the tree". Other tools
# (Bash, Read, Grep, ...) are out of scope — supervisor dispatch doesn't gate
# them either, and gating them would block routine read-only / test commands.
CHATBOX_WRITE_TOOLS = frozenset({
    "Edit",
    "Write",
    "MultiEdit",
    "NotebookEdit",
})


def worker_tree_guard_settings(config: dict[str, Any]) -> dict[str, Any]:
    """Resolve the `worker_tree_guard` config block with defaults.

    Schema (under top-level `branch_strategy.worker_tree_guard`):
        enabled: bool — dispatch guard, default False
        chatbox_enabled: bool — PreToolUse chatbox guard, default False
        blocking_globs: list[str] — fragile-surface globs that block
        log_only: bool — emit telemetry but do not actually block

    Both `enabled` and `chatbox_enabled` are opt-in independent migrations:
    dispatch and chatbox can be flipped on separately for staged canary.
    """
    branch_strategy = dict(config.get("branch_strategy", {}) or {})
    raw = dict(branch_strategy.get("worker_tree_guard", {}) or {})
    raw.setdefault("enabled", False)
    raw.setdefault("chatbox_enabled", False)
    raw.setdefault("log_only", False)
    globs = raw.get("blocking_globs")
    if not isinstance(globs, list) or not globs:
        globs = list(DEFAULT_WORKER_TREE_GUARD_BLOCKING_GLOBS)
    raw["blocking_globs"] = [str(g) for g in globs]
    return raw


def _worker_tree_guard_porcelain(workspace_root: Path) -> tuple[bool, list[str], str]:
    """Run `git status --porcelain` and return (ok, dirty_paths, error_text).

    Failure modes (returncode != 0, git missing, not-a-repo) yield
    `(False, [], "...")` so callers can fail open — the guard never blocks
    on its own diagnostic errors.
    """
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=str(workspace_root),
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        return False, [], f"{exc.__class__.__name__}: {exc}"
    if result.returncode != 0:
        return False, [], (result.stderr or result.stdout or "").strip()
    dirty: list[str] = []
    for line in result.stdout.splitlines():
        if len(line) < 4:
            continue
        # `git status --porcelain` format: XY<space>path[ -> new_path]
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        path = path.strip().strip('"')
        if path:
            dirty.append(path)
    return True, dirty, ""


def _worker_tree_guard_matches(path: str, globs: list[str]) -> str | None:
    """Return the first matching glob, or None.

    `**` is expanded so `.orchestrator/skills/**` matches both
    `.orchestrator/skills/foo.md` and `.orchestrator/skills/nested/bar.md`.
    """
    for glob in globs:
        if "**" in glob:
            prefix = glob.split("**", 1)[0].rstrip("/")
            if prefix and (path == prefix or path.startswith(prefix + "/")):
                return glob
            if not prefix:
                return glob
            continue
        if fnmatch.fnmatch(path, glob):
            return glob
    return None


def _collect_offenders(
    config: dict[str, Any],
    workspace_root: Path | None,
) -> dict[str, Any] | None:
    """Shared core: returns block payload or None.

    Returns None when:
      - `git status --porcelain` cannot run (fail-open on diagnostics)
      - no dirty path matches any blocking glob

    Returns a dict with `offenders`, `dirty_paths`, `matched_globs`, and
    `log_only` when the guard fires.
    """
    settings = worker_tree_guard_settings(config)
    root = workspace_root or THIS_DIR.parent
    ok, dirty_paths, _ = _worker_tree_guard_porcelain(root)
    if not ok:
        return None
    globs = settings["blocking_globs"]
    offenders: list[dict[str, str]] = []
    for path in dirty_paths:
        match = _worker_tree_guard_matches(path, globs)
        if match:
            offenders.append({"path": path, "glob": match})
    if not offenders:
        return None
    return {
        "offenders": offenders,
        "dirty_paths": [item["path"] for item in offenders],
        "matched_globs": sorted({item["glob"] for item in offenders}),
        "log_only": bool(settings.get("log_only", False)),
    }


def check_worker_tree_guard(
    config: dict[str, Any],
    *,
    reason: str | None,
    workspace_root: Path | None = None,
) -> dict[str, Any] | None:
    """Dispatch-time guard. Returns a block payload, or None to allow.

    Returns None when:
      - guard disabled (`enabled: false`)
      - dispatch `reason` is in WORKER_TREE_GUARD_SKIP_REASONS
        (e.g. `owned_finalize_dispatch` — closeout legitimately starts
        with a dirty tree)
      - `git status --porcelain` cannot run (fail-open on diagnostics)
      - no dirty path matches any blocking glob
    """
    settings = worker_tree_guard_settings(config)
    if not settings.get("enabled", False):
        return None
    if (reason or "") in WORKER_TREE_GUARD_SKIP_REASONS:
        return None
    return _collect_offenders(config, workspace_root)


def check_chatbox_tree_guard(
    config: dict[str, Any],
    *,
    tool_name: str,
    workspace_root: Path | None = None,
) -> dict[str, Any] | None:
    """PreToolUse-time guard for chatbox-driven edits.

    Returns None when:
      - guard disabled (`chatbox_enabled: false`)
      - `tool_name` is not a writing tool (Bash / Read / Grep / etc.)
      - `git status --porcelain` cannot run (fail-open on diagnostics)
      - no dirty path matches any blocking glob

    Returns a block payload with `dirty_paths`, `matched_globs`, and
    `log_only` when the guard fires. Caller decides how to surface it
    (deny vs. telemetry-only) based on `log_only`.

    Why a separate function instead of overloading the dispatch guard:
    chatbox and dispatch have different config flags so they can be
    flipped on independently for staged canary, and the chatbox check
    needs a tool-name filter that has no meaning at dispatch time.
    """
    settings = worker_tree_guard_settings(config)
    if not settings.get("chatbox_enabled", False):
        return None
    if tool_name not in CHATBOX_WRITE_TOOLS:
        return None
    return _collect_offenders(config, workspace_root)
