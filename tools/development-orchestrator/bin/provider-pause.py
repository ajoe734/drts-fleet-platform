#!/usr/bin/env python3
"""List and clear provider pauses -- the repair flow the runtime assumes exists.

expire_provider_pauses refuses to clear an auth pause from a capability probe,
and says why: `claude auth status` reads stored credentials, so it can answer
"logged in" while the real call returns 401. That decision is right and tested.
What was missing is the other half it promises -- "until a human or explicit
repair flow clears it" -- because no such flow shipped. On 2026-08-17 an expired
OAuth token paused the account behind claude and claude2; the operator
re-authenticated and the fleet stayed down, because nothing in the tree could
remove the record and nothing said one had to.

Clearing matches through pause_covers_lane, the predicate the dispatcher uses.
Asking by lane name would not work here: the entry that stops claude is keyed
`identity:claude2:<fingerprint>` with lane_id claude2, so `clear claude` would
report success and change nothing -- the same lane-name assumption that once
hid this class of pause from the chair briefing.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_TOOL_ROOT = Path(__file__).resolve().parent.parent
if str(_TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(_TOOL_ROOT))

from common import config_path  # noqa: E402
from control_plane.infra.runtime_repo import load_runtime_state, save_runtime_state  # noqa: E402
from control_plane.runtime.supervisor_runtime import (  # noqa: E402
    _lane_probe_healthy,
    lanes_covered_by_pause,
    load_config,
    pause_covers_lane,
    provider_pause_registry,
)


def _report(config: dict) -> dict | None:
    """The cached capability report, read but never rebuilt.

    Rebuilding runs the provider CLIs and rewrites the cache, which a command
    the operator runs to inspect state has no business doing. The path comes
    from config_path so it resolves against the configured root; resolving it
    against the working directory made this tool report that nothing covered
    the lane it was looking at.

    None means unreadable. Without it an identity fingerprint cannot be
    resolved, every identity-scoped pause silently stops matching, and both
    commands would answer confidently and wrongly.
    """
    try:
        return json.loads(config_path(config, "provider_capabilities").read_text(encoding="utf-8"))
    except (OSError, ValueError, KeyError):
        return None


def command_list(config: dict, state: dict, report: dict) -> int:
    pauses = provider_pause_registry(state)
    if not pauses:
        print("no provider pauses recorded.")
        return 0
    for key, entry in pauses.items():
        covered = sorted(lanes_covered_by_pause(config, report, entry))
        print(f"{key}")
        print(f"  kind      {entry.get('kind') or '-'}")
        print(f"  paused_at {entry.get('paused_at') or '-'}")
        print(f"  resume_at {entry.get('resume_at') if entry.get('resume_at') is not None else 'none (indefinite)'}")
        # The lanes it stops, not the lane it is named after: an identity-scoped
        # entry stops every lane sharing the account, which is the whole reason
        # reading this off the key misleads.
        print(f"  stops     {', '.join(covered) or '(no lane resolves to it)'}")
        print(f"  reason    {str(entry.get('reason') or '-')[:160]}")
    return 0


def command_clear(config: dict, state: dict, report: dict, lane: str) -> int:
    pauses = provider_pause_registry(state)
    doomed = [key for key, entry in pauses.items()
              if isinstance(entry, dict) and pause_covers_lane(config, report, entry, lane)]
    if not doomed:
        print(f"no pause covers {lane}; nothing to clear.", file=sys.stderr)
        return 1

    freed: set[str] = set()
    for key in doomed:
        freed.update(lanes_covered_by_pause(config, report, pauses[key]))
        pauses.pop(key, None)
    save_runtime_state(config, state)

    for lane_id in sorted(freed):
        healthy = _lane_probe_healthy(config, report, lane_id)
        if healthy is False:
            # Better to say so now than to have the operator watch it re-pause.
            print(f"note: the capability probe still reports {lane_id} unhealthy; "
                  "expect it to pause again on the next real failure.", file=sys.stderr)
    print(f"cleared {len(doomed)} pause(s); released: {', '.join(sorted(freed)) or lane}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default=".orchestrator/config.json")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="show every pause and the lanes it stops")
    clear = sub.add_parser("clear", help="clear the pauses that stop a lane")
    clear.add_argument("lane", help="lane id, e.g. claude")
    args = parser.parse_args(argv)

    config = load_config(args.config)
    state = load_runtime_state(config)
    report = _report(config)
    if report is None:
        print("cannot read the provider capability report; identity-scoped pauses "
              "cannot be resolved and the answer would be wrong. Refusing.", file=sys.stderr)
        return 2
    if args.command == "list":
        return command_list(config, state, report)
    return command_clear(config, state, report, args.lane)


if __name__ == "__main__":
    raise SystemExit(main())
