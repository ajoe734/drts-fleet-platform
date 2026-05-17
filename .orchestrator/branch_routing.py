#!/usr/bin/env python3
"""Task-ID → integration track routing.

The three-layer branch strategy (docs/ops/branch-strategy.md) requires every
agent worker to land its branch into the correct integration trunk based on
the task ID rather than whichever branch happened to be checked out. This
module is the single source of truth for that mapping.

Used by the supervisor when dispatching workers, by adapters when opening
PRs, and by `scripts/branch-strategy/triage-branches.sh` indirectly via the
documented prefix rules.

Configuration shape (added under top-level key `branch_strategy` in
.orchestrator/config.json; falls back to DEFAULTS below if absent):

    {
      "branch_strategy": {
        "tracks": {
          "backend":  "backend-dev",
          "frontend": "frontend-dev"
        },
        "publish_branches": {
          "backend":  "backend-staging",
          "frontend": "frontend-staging"
        },
        "track_rules": [
          { "track": "backend",  "prefixes": ["BE-", "API-", "SC-", "OBS-", ...] },
          { "track": "frontend", "prefixes": ["UI-", "DS-", ...], "regex": ".*-UI-.*" },
          { "track": "backend",  "prefixes": ["DOC-"], "note": "fallback when track unknown" }
        ],
        "default_track": "backend"
      }
    }
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable


DEFAULTS: dict[str, Any] = {
    "tracks": {
        "backend": "backend-dev",
        "frontend": "frontend-dev",
    },
    # *-staging are the milestone-blessed branches that auto-deploy to
    # staging via deploy-staging.yml (workflow_run). Promotion from *-dev
    # to *-staging is dispatch-only via promote-to-staging.yml in v2 —
    # see docs/ops/branch-strategy.md §5.
    "publish_branches": {
        "backend": "backend-staging",
        "frontend": "frontend-staging",
    },
    # Order matters: first match wins.
    "track_rules": [
        {
            "track": "frontend",
            "prefixes": [
                "UI-", "DS-", "DRV-", "PA-", "PB-", "SBK-", "SYS-", "XS-",
                "ADM-UI-", "OPS-UI-", "TEN-UI-", "TN-",
            ],
            "regex": r".*-UI-.*",
        },
        {
            "track": "backend",
            "prefixes": [
                "BE-", "API-", "SC-", "OBS-", "EVD-", "FWD-", "TCH-",
                "PRT-", "INFRA-", "BE-INTEG-", "BE-APR-", "BE-CC-", "BE-APR-NOTIFY-",
            ],
        },
        # Docs typically follow their primary file change, but we need *some*
        # default. Land docs on the backend track to keep API doc / OpenAPI
        # changes adjacent to the backend they describe; reviewers can ask to
        # re-route if a doc-only change is purely UI-facing.
        {
            "track": "backend",
            "prefixes": ["DOC-", "DOCS-", "POST-"],
            "note": "default for docs / postmortems",
        },
    ],
    "default_track": "backend",
}


@dataclass(frozen=True)
class RouteDecision:
    """Result of routing a task ID to an integration track."""

    task_id: str
    track: str               # "backend" | "frontend" | other configured name
    base_branch: str         # the merge/* trunk this work lands into
    publish_branch: str      # the *-publish branch downstream of `base_branch`
    matched_rule_index: int  # 0-based index in track_rules, -1 if default fallback
    matched_pattern: str     # the prefix or regex that matched, "" if default

    def as_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "track": self.track,
            "base_branch": self.base_branch,
            "publish_branch": self.publish_branch,
            "matched_rule_index": self.matched_rule_index,
            "matched_pattern": self.matched_pattern,
            "gate_layer": "merge",
        }


def load_strategy(config: dict[str, Any] | None) -> dict[str, Any]:
    """Return the branch_strategy section from config, merged over DEFAULTS."""
    base = {
        "tracks": dict(DEFAULTS["tracks"]),
        "publish_branches": dict(DEFAULTS["publish_branches"]),
        "track_rules": list(DEFAULTS["track_rules"]),
        "default_track": DEFAULTS["default_track"],
    }
    if not config:
        return base
    override = config.get("branch_strategy") or {}
    if "tracks" in override:
        base["tracks"].update(override["tracks"])
    if "publish_branches" in override:
        base["publish_branches"].update(override["publish_branches"])
    if "track_rules" in override:
        base["track_rules"] = list(override["track_rules"])
    if "default_track" in override:
        base["default_track"] = override["default_track"]
    return base


def normalise_task_id(task_id: str) -> str:
    """Uppercase and trim — task IDs are case-insensitive for matching."""
    return (task_id or "").strip().upper()


def _matches(task_id: str, rule: dict[str, Any]) -> tuple[bool, str]:
    """Return (matched, pattern_that_matched)."""
    for prefix in rule.get("prefixes") or []:
        if task_id.startswith(prefix.upper()):
            return True, prefix
    regex = rule.get("regex")
    if regex and re.fullmatch(regex.upper(), task_id):
        return True, regex
    return False, ""


def route_task(task_id: str, config: dict[str, Any] | None = None) -> RouteDecision:
    """Map a task ID to its integration track and base branch.

    Falls back to the configured default_track if no rule matches. The default
    is deliberately not silent — `matched_rule_index == -1` lets callers and
    reviewers see that a manual decision happened.
    """
    strategy = load_strategy(config)
    norm = normalise_task_id(task_id)
    for idx, rule in enumerate(strategy["track_rules"]):
        ok, pattern = _matches(norm, rule)
        if not ok:
            continue
        track = rule["track"]
        base = strategy["tracks"].get(track)
        publish = strategy["publish_branches"].get(track)
        if not base or not publish:
            # Misconfigured rule; treat as no match and continue.
            continue
        return RouteDecision(
            task_id=norm,
            track=track,
            base_branch=base,
            publish_branch=publish,
            matched_rule_index=idx,
            matched_pattern=pattern,
        )
    fallback = strategy["default_track"]
    return RouteDecision(
        task_id=norm,
        track=fallback,
        base_branch=strategy["tracks"][fallback],
        publish_branch=strategy["publish_branches"][fallback],
        matched_rule_index=-1,
        matched_pattern="",
    )


def route_many(task_ids: Iterable[str], config: dict[str, Any] | None = None) -> list[RouteDecision]:
    """Bulk version, useful for triage scripts."""
    return [route_task(t, config) for t in task_ids]


def known_long_lived_branches(config: dict[str, Any] | None = None) -> list[str]:
    """All long-lived branches in the new model. Used by branch protection
    setup and triage scripts to know which names to never auto-delete."""
    s = load_strategy(config)
    return sorted({*s["tracks"].values(), *s["publish_branches"].values(), "main"})


def main() -> int:
    """CLI for ad-hoc queries: `python3 branch_routing.py BE-APR-NOTIFY-001`"""
    import json
    import sys

    if len(sys.argv) < 2:
        print("Usage: branch_routing.py <TASK-ID> [<TASK-ID> ...]", file=sys.stderr)
        return 2
    decisions = [route_task(t) for t in sys.argv[1:]]
    print(json.dumps([d.as_dict() for d in decisions], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
