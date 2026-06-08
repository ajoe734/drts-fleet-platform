"""Integration gate: keep branch-only completions out of terminal ``done``.

Enforces ``docs/ops/branch-strategy.md`` §11.6 — a task may not close as
``done`` unless its work is actually integrated into ``dev``. "Integrated" means
the task's ``INTEGRATION_STATUS`` is one of
``{merged_to_dev, dev_deployed, not_applicable}``. Branch-only completions
(``branch_pushed``, ``pr_open``, ``ci_pending``, ``ci_failed``,
``deploy_blocked``) are refused so the task stays visible at
``review_approved`` until its delivered commit reaches ``origin/dev`` — at which
point ``apply_git_merge_reconciliation`` flips it to ``done`` automatically.

Why this exists: the ``INTEGRATION_STATUS`` lifecycle was previously
convention-only (prose in worker handoffs and chair reviews) with nothing
enforcing it, so whole waves of work were marked ``done`` at branch level and
never PR'd/merged to ``dev`` — they stranded on worker branches and were lost.

Opt-in, mirroring ``worker_tree_guard.py``:

  * ``branch_strategy.integration_gate.enabled`` — default ``False``.
  * ``branch_strategy.integration_gate.log_only`` — when ``True`` the gate logs
    the would-block and ALLOWS the close (canary for staged rollout).
  * ``branch_strategy.integration_gate.exempt_task_patterns`` — list of regexes
    matched against the task id; matches are exempt (e.g. externally-held work).

The single primitive ``check_integration_gate`` returns a human-readable block
reason or ``None``; callers decide log-only vs enforce via
``integration_gate_settings``.
"""

from __future__ import annotations

import re
from typing import Any

# Statuses that mean the delivered commit is on dev (or no commit was owed).
INTEGRATED_STATUSES = frozenset({"merged_to_dev", "dev_deployed", "not_applicable"})

# Branch-only statuses — work exists but is NOT yet reachable from origin/dev.
UNINTEGRATED_STATUSES = frozenset(
    {"branch_pushed", "pr_open", "ci_pending", "ci_failed", "deploy_blocked"}
)


def integration_gate_settings(config: dict[str, Any] | None) -> dict[str, Any]:
    """Resolve ``branch_strategy.integration_gate`` with defaults (all off)."""
    branch_strategy = dict((config or {}).get("branch_strategy", {}) or {})
    raw = dict(branch_strategy.get("integration_gate", {}) or {})
    raw.setdefault("enabled", False)
    raw.setdefault("log_only", False)
    patterns = raw.get("exempt_task_patterns")
    if not isinstance(patterns, list):
        patterns = []
    raw["exempt_task_patterns"] = [str(p) for p in patterns]
    return raw


def is_integrated(integration_status: str | None) -> bool:
    """True when the status means the work is on dev (or no commit was owed)."""
    return str(integration_status or "").strip().lower() in INTEGRATED_STATUSES


def _task_exempt(task_id: str, patterns: list[str]) -> bool:
    for pattern in patterns:
        try:
            if re.search(pattern, task_id):
                return True
        except re.error:
            # A malformed exempt pattern must never make the gate crash; treat
            # it as non-matching (fail toward enforcement, not toward exemption).
            continue
    return False


def check_integration_gate(
    task: dict[str, Any] | None,
    integration_status: str | None,
    config: dict[str, Any] | None,
) -> str | None:
    """Return a block reason if ``done`` should be refused, else ``None``.

    Allows (returns ``None``) when the gate is disabled, the status is already
    integrated, or the task id matches an exempt pattern. The caller is
    responsible for honouring ``log_only`` (still call this, but downgrade an
    enforce to a log line).
    """
    settings = integration_gate_settings(config)
    if not settings.get("enabled"):
        return None
    if is_integrated(integration_status):
        return None
    task_id = str((task or {}).get("id") or "")
    if _task_exempt(task_id, settings.get("exempt_task_patterns", [])):
        return None
    status = str(integration_status or "").strip().lower() or "branch_pushed"
    return (
        f"{task_id or 'task'} cannot close as done with "
        f"INTEGRATION_STATUS={status}: branch-only work is not integrated to dev "
        f"and would strand on the worker branch. Merge the approved branch to "
        f"dev, then re-run done with INTEGRATION_STATUS=merged_to_dev (or "
        f"dev_deployed once Deploy-Dev lands). For sidecar/support/externally-"
        f"held work, pass INTEGRATION_STATUS=not_applicable. "
        f"See docs/ops/branch-strategy.md §11.6."
    )
