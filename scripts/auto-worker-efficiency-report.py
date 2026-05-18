#!/usr/bin/env python3
from __future__ import annotations

import argparse
import heapq
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ACTIVITY_LOG = REPO_ROOT / "ai-activity-log.jsonl"


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def human_bytes(value: int) -> str:
    units = ["B", "KiB", "MiB", "GiB"]
    size = float(value)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{value} B"


def ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return numerator / denominator


def extract_prompt_text(command: Any) -> str | None:
    if not isinstance(command, list):
        return None
    tokens = [str(item) for item in command]
    for flag in ("--prompt", "-p"):
        if flag in tokens:
            index = tokens.index(flag)
            if index + 1 < len(tokens):
                return tokens[index + 1]
    if len(tokens) >= 2 and tokens[0] == "codex" and tokens[1] == "exec":
        return tokens[-1]
    return None


def prompt_chars_for_event(event: dict[str, Any]) -> int:
    summary = event.get("command_summary")
    if isinstance(summary, dict):
        value = summary.get("prompt_chars")
        if isinstance(value, int):
            return value
    prompt = extract_prompt_text(event.get("command"))
    return len(prompt) if prompt else 0


def is_chair_worker_started(event: dict[str, Any]) -> bool:
    if event.get("type") != "worker_started":
        return False
    message = str(event.get("message") or "")
    return "chair_review:" in message


def heap_push_largest(heap: list[tuple[int, int, dict[str, Any]]], size: int, item: dict[str, Any], *, limit: int = 10) -> None:
    if size <= 0:
        return
    entry = (size, id(item), item)
    if len(heap) < limit:
        heapq.heappush(heap, entry)
        return
    if size > heap[0][0]:
        heapq.heapreplace(heap, entry)


def summarize_activity_log(path: Path, *, since: datetime | None = None) -> dict[str, Any]:
    counts: Counter[str] = Counter()
    bytes_by_type: Counter[str] = Counter()
    prompt_chars_by_provider: Counter[str] = Counter()
    prompt_count_by_provider: Counter[str] = Counter()
    worker_started_by_reason: Counter[str] = Counter()
    chair_started_by_reason: Counter[str] = Counter()
    invalid_lines = 0
    scanned_lines = 0
    included_lines = 0
    total_bytes = 0
    first_ts: str | None = None
    last_ts: str | None = None
    top_prompts: list[tuple[int, int, dict[str, Any]]] = []
    top_permission_hooks: list[tuple[int, int, dict[str, Any]]] = []
    top_events: list[tuple[int, int, dict[str, Any]]] = []

    with path.open("rb") as handle:
        for raw_line in handle:
            scanned_lines += 1
            line_size = len(raw_line)
            try:
                text = raw_line.decode("utf-8")
                event = json.loads(text)
            except (UnicodeDecodeError, json.JSONDecodeError):
                invalid_lines += 1
                continue
            if not isinstance(event, dict):
                invalid_lines += 1
                continue

            event_ts = parse_timestamp(str(event.get("ts") or ""))
            if since is not None and event_ts is not None and event_ts < since:
                continue

            included_lines += 1
            total_bytes += line_size
            event_type = str(event.get("type") or "unknown")
            counts[event_type] += 1
            bytes_by_type[event_type] += line_size

            ts_text = str(event.get("ts") or "")
            if ts_text:
                first_ts = first_ts or ts_text
                last_ts = ts_text

            heap_push_largest(
                top_events,
                line_size,
                {
                    "ts": ts_text,
                    "type": event_type,
                    "task_id": event.get("task_id"),
                    "provider": event.get("provider") or event.get("target_agent"),
                    "message": str(event.get("message") or "")[:160],
                    "bytes": line_size,
                },
            )

            if event_type == "worker_started":
                reason = str(event.get("message") or "").split(":", 1)[-1].strip()
                worker_started_by_reason[reason] += 1
                prompt_chars = prompt_chars_for_event(event)
                provider = str(event.get("provider") or event.get("target_agent") or "unknown")
                if prompt_chars:
                    prompt_chars_by_provider[provider] += prompt_chars
                    prompt_count_by_provider[provider] += 1
                    heap_push_largest(
                        top_prompts,
                        prompt_chars,
                        {
                            "ts": ts_text,
                            "task_id": event.get("task_id"),
                            "provider": provider,
                            "reason": reason,
                            "prompt_chars": prompt_chars,
                            "bytes": line_size,
                        },
                    )
                if is_chair_worker_started(event):
                    chair_reason = reason.replace("chair_review:", "", 1).strip()
                    chair_started_by_reason[chair_reason] += 1

            if event_type == "permission_hook":
                heap_push_largest(
                    top_permission_hooks,
                    line_size,
                    {
                        "ts": ts_text,
                        "provider": event.get("provider") or event.get("target_agent"),
                        "hook_event": event.get("hook_event"),
                        "message": str(event.get("message") or "")[:160],
                        "bytes": line_size,
                    },
                )

    chair_started = sum(chair_started_by_reason.values())
    worker_started = counts["worker_started"]
    worker_completed = counts["worker_completed"]
    worker_failed = counts["worker_failed"]
    worker_superseded = counts["worker_superseded"]
    done_events = counts["done"]
    chair_invalid = counts["chair_review_invalid_schema"]

    return {
        "activity_log": str(path),
        "since": since.isoformat().replace("+00:00", "Z") if since else None,
        "first_ts": first_ts,
        "last_ts": last_ts,
        "scanned_lines": scanned_lines,
        "included_lines": included_lines,
        "invalid_lines": invalid_lines,
        "total_bytes": total_bytes,
        "counts": dict(counts),
        "bytes_by_type": dict(bytes_by_type),
        "worker": {
            "started": worker_started,
            "completed": worker_completed,
            "failed": worker_failed,
            "superseded": worker_superseded,
            "done_events": done_events,
            "started_per_worker_completed": ratio(worker_started, worker_completed),
            "started_per_done_event": ratio(worker_started, done_events),
            "failed_per_started": ratio(worker_failed, worker_started),
            "superseded_per_started": ratio(worker_superseded, worker_started),
        },
        "chair": {
            "started": chair_started,
            "applied": counts["chair_review_applied"],
            "queued": counts["chair_review_queued"],
            "invalid_schema": chair_invalid,
            "invalid_per_started": ratio(chair_invalid, chair_started),
            "started_by_reason": dict(chair_started_by_reason),
        },
        "prompt": {
            "total_chars": sum(prompt_chars_by_provider.values()),
            "count_with_prompt": sum(prompt_count_by_provider.values()),
            "chars_by_provider": dict(prompt_chars_by_provider),
            "count_by_provider": dict(prompt_count_by_provider),
            "top_prompts": [item for _, _, item in sorted(top_prompts, reverse=True)],
        },
        "worker_started_by_reason": dict(worker_started_by_reason),
        "permission_hooks": {
            "count": counts["permission_hook"],
            "bytes": bytes_by_type["permission_hook"],
            "top_events": [item for _, _, item in sorted(top_permission_hooks, reverse=True)],
        },
        "top_event_bytes": [item for _, _, item in sorted(top_events, reverse=True)],
        "top_bytes_by_type": bytes_by_type.most_common(12),
    }


def print_human_report(summary: dict[str, Any]) -> None:
    print("Auto Worker Efficiency Report")
    print(f"activity_log: {summary['activity_log']}")
    if summary["since"]:
        print(f"since: {summary['since']}")
    print(f"window: {summary['first_ts']} .. {summary['last_ts']}")
    print(
        "events: "
        f"{summary['included_lines']} included / {summary['scanned_lines']} scanned, "
        f"{summary['invalid_lines']} invalid, {human_bytes(summary['total_bytes'])}"
    )

    worker = summary["worker"]
    print("\nWorker churn")
    print(f"- worker_started: {worker['started']}")
    print(f"- worker_completed: {worker['completed']} ({worker['started_per_worker_completed']:.2f} started/completed)")
    print(f"- done events: {worker['done_events']} ({worker['started_per_done_event']:.2f} started/done-event)")
    print(f"- worker_failed: {worker['failed']} ({worker['failed_per_started']:.1%} of starts)")
    print(f"- worker_superseded: {worker['superseded']} ({worker['superseded_per_started']:.1%} of starts)")

    chair = summary["chair"]
    print("\nChair usage")
    print(f"- chair worker starts: {chair['started']}")
    print(f"- chair queued/applied: {chair['queued']} queued / {chair['applied']} applied")
    print(f"- chair invalid schema: {chair['invalid_schema']} ({chair['invalid_per_started']:.1%} of chair starts)")
    if chair["started_by_reason"]:
        print("- chair starts by reason:")
        for reason, count in sorted(chair["started_by_reason"].items(), key=lambda item: (-item[1], item[0])):
            print(f"  {count:5d}  {reason}")

    prompt = summary["prompt"]
    print("\nDispatch prompt payload")
    print(f"- prompts measured: {prompt['count_with_prompt']}")
    print(f"- prompt chars measured: {prompt['total_chars']:,}")
    if prompt["chars_by_provider"]:
        print("- prompt chars by provider:")
        for provider, chars in sorted(prompt["chars_by_provider"].items(), key=lambda item: (-item[1], item[0])):
            count = prompt["count_by_provider"].get(provider, 0)
            avg = int(chars / count) if count else 0
            print(f"  {provider:10s} {chars:12,d} chars across {count:5d} prompts, avg {avg:6,d}")
    if prompt["top_prompts"]:
        print("- largest prompts:")
        for item in prompt["top_prompts"][:10]:
            task_id = item.get("task_id") or "(chair)"
            print(
                f"  {item['prompt_chars']:8,d} chars  {item.get('provider')}  "
                f"{task_id}  {item.get('reason')}  {item.get('ts')}"
            )

    hooks = summary["permission_hooks"]
    print("\nPermission hook payload")
    print(f"- permission_hook events: {hooks['count']}")
    print(f"- permission_hook bytes: {human_bytes(hooks['bytes'])}")
    if hooks["top_events"]:
        print("- largest permission_hook events:")
        for item in hooks["top_events"][:10]:
            print(f"  {human_bytes(item['bytes']):>10s}  {item.get('hook_event')}  {item.get('ts')}  {item.get('message')}")

    print("\nTop bytes by event type")
    for event_type, byte_count in summary["top_bytes_by_type"]:
        count = summary["counts"].get(event_type, 0)
        print(f"- {event_type:28s} {human_bytes(byte_count):>10s} across {count:6d} events")

    print("\nLargest individual events")
    for item in summary["top_event_bytes"][:10]:
        task_id = item.get("task_id") or "(none)"
        print(f"- {human_bytes(item['bytes']):>10s}  {item.get('type')}  {item.get('provider')}  {task_id}  {item.get('ts')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize auto-worker dispatch efficiency metrics from ai-activity-log.jsonl.")
    parser.add_argument("--activity-log", default=str(DEFAULT_ACTIVITY_LOG), help="Path to ai-activity-log.jsonl.")
    parser.add_argument("--since", help="Only include events at or after this ISO timestamp, for example 2026-05-10T00:00:00Z.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON instead of the human report.")
    args = parser.parse_args()

    path = Path(args.activity_log)
    since = parse_timestamp(args.since) if args.since else None
    if args.since and since is None:
        raise SystemExit(f"Invalid --since timestamp: {args.since}")
    if not path.exists():
        raise SystemExit(f"Activity log not found: {path}")

    summary = summarize_activity_log(path, since=since)
    if args.json:
        print(json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print_human_report(summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
