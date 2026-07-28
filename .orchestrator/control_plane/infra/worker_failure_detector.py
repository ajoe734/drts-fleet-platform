from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class WorkerFailureSignal:
    reason: str
    source: str
    provider_pause_authorized: bool


WORKER_FAILURE_PATTERNS = (
    re.compile(r"^Error when talking to gemini api\b", re.IGNORECASE),
    re.compile(r"^Error authenticating:\s*IneligibleTierError\b", re.IGNORECASE),
    re.compile(r"^reasonCode:\s*['\"]?RESTRICTED_DASHER_USER\b", re.IGNORECASE),
    re.compile(r'"error"\s*:\s*"rate_limit"', re.IGNORECASE),
    re.compile(r'"type"\s*:\s*"rate_limit_event"', re.IGNORECASE),
    re.compile(
        r"^reason:\s*.*\b(terminalquotaerror|retryablequotaerror|quota_exhausted|"
        r"resource_exhausted|you have exhausted your capacity|no capacity available for model|"
        r"timed out|etimedout|econnreset|unauthorized)\b",
        re.IGNORECASE,
    ),
    re.compile(r"^status:\s*(401|429)\b", re.IGNORECASE),
    re.compile(r"\[API Error:\s*401\b", re.IGNORECASE),
    re.compile(r"\bAPI Error:\s*401\b", re.IGNORECASE),
    re.compile(r"\bFailed to authenticate\b", re.IGNORECASE),
    re.compile(r"\bauthentication_error\b", re.IGNORECASE),
    re.compile(r"\bInvalid authentication credentials\b", re.IGNORECASE),
    re.compile(
        r"^(?:reason|code|error|error_code|type):\s*['\"]?(?:token_invalidated|refresh_token_reused)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"^(?:Error:\s*)?(?:Your\s+)?authentication token has been invalidated\b",
        re.IGNORECASE,
    ),
    re.compile(r"\bfailed to refresh token:\s*401\b", re.IGNORECASE),
    re.compile(r"\bresponses_websocket\b.*\bHTTP error:\s*401\b", re.IGNORECASE),
    re.compile(r"\brefresh_token_invalidated\b", re.IGNORECASE),
    re.compile(r"\brefresh token was revoked\b", re.IGNORECASE),
    re.compile(r"\baccess token could not be refreshed\b", re.IGNORECASE),
    re.compile(r'^Error:\s*Model\s+".+"\s+from --model flag is not available\.', re.IGNORECASE),
    re.compile(r"^402\b.*\byou have no quota\b", re.IGNORECASE),
    re.compile(
        r"^(?:error:\s*)?\b(?:you have no quota|no quota remaining|payment required)\b",
        re.IGNORECASE,
    ),
    re.compile(r"^(?:you(?:'ve| have)\s+)?hit your limit\b", re.IGNORECASE),
    re.compile(r"^An unexpected critical error occurred", re.IGNORECASE),
    re.compile(r"^fatal:", re.IGNORECASE),
)
JSON_WORKER_FAILURE_PATTERN = re.compile(
    r"quota_exhausted|oauth quota exceeded|free daily quota has been reached|"
    r"you have no quota|no quota remaining|payment required|"
    r"you have exhausted your capacity|exhausted your capacity|resource_exhausted|"
    r"rate limit|rate limited|hit your limit|an unexpected critical error occurred|"
    r"permission denied|invalid api key|auth failed|failed to authenticate|"
    r"authentication_error|invalid authentication credentials|status:\s*401|"
    r"\[api error:\s*401\b|api error:\s*401\b|invalid access token|"
    r"token_invalidated|refresh_token_reused|authentication token has been invalidated|"
    r"refresh_token_invalidated|refresh token was revoked|access token could not be refreshed|"
    r"ineligibletiererror|not eligible for gemini code assist|restricted_dasher_user",
    re.IGNORECASE,
)


def _iter_json_string_values(payload: Any) -> list[str]:
    values: list[str] = []
    if isinstance(payload, str):
        values.append(payload)
    elif isinstance(payload, dict):
        for key, item in payload.items():
            if key in {"thinking", "signature"}:
                continue
            values.extend(_iter_json_string_values(item))
    elif isinstance(payload, list):
        for item in payload:
            values.extend(_iter_json_string_values(item))
    return values


def _ignore_embedded_failure_line(stripped: str) -> bool:
    embedded_state_key = r"(?:summary|reason|last_error|last_failure_summary|next)"
    if stripped.startswith(("/bin/bash -lc ", "bash -lc ", "/bin/sh -c ", "sh -c ", "rg ", "grep ")):
        return True
    ignored_patterns = (
        r"^\d+\t",
        r"^\d+:\s+",
        r"^\d+-\s+",
        rf'^"{embedded_state_key}"\s*:',
        r"^(?:Error|error):\s*\{\s*[a-z]{2}\s*:",
        r"^\d+\.\s+",
        r"^[-*]\s+",
        r"^[-*]\s+`[^`]+`:",
        r"^(diff --git|index [0-9a-f]+\.\.[0-9a-f]+|@@|--- |\+\+\+ )",
        r"^[+-](?:\s|`|\*|$)",
        r"^[A-Za-z0-9_./-]+\.(?:md|json|jsonl|ya?ml|ts|tsx|js|jsx|py|sql|sh|log|txt):\d+[: -]",
    )
    if stripped.startswith("|") or any(re.match(pattern, stripped) for pattern in ignored_patterns):
        return True
    if stripped.startswith(("Reviewer note:", "Review Outcome:", "Impact On Consensus:", "Remaining Question:")):
        return True
    embedded_markers = (
        "current-work.md:",
        "shared L0",
        "machine truth",
        "task object `last_update=",
        "Auto-reassigned review from",
        "Auto-reassigned ownership from",
        "Owner finalized",
        "Handoff to ",
        "reviewer-routing",
    )
    return any(marker in stripped for marker in embedded_markers)


def _extract_failure_candidate(text: str) -> str | None:
    for line in reversed(text.splitlines() or [text]):
        stripped = line.strip()
        if not stripped or _ignore_embedded_failure_line(stripped):
            continue
        if any(pattern.search(stripped) for pattern in WORKER_FAILURE_PATTERNS):
            return stripped
        if JSON_WORKER_FAILURE_PATTERN.search(stripped) and re.match(
            r"^(reason:|status:|error:|fatal:|402\b|quota_exhausted\b|resource_exhausted\b|"
            r"token_invalidated\b|refresh_token_reused\b|qwen oauth quota exceeded\b|"
            r"you(?:'ve| have)\s+hit your limit\b|an unexpected critical error occurred\b)",
            stripped,
            re.IGNORECASE,
        ):
            return stripped
    return None


def _captured_tool_log_line_indexes(lines: list[str]) -> set[int]:
    ignored: set[int] = set()
    in_exec_block = False
    in_final_response = False
    runtime_log_pattern = re.compile(
        r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s+(?:DEBUG|INFO|WARN|ERROR)\b"
    )
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped == "tokens used":
            in_final_response = True
            ignored.add(index)
            continue
        if in_final_response:
            ignored.add(index)
            continue
        if stripped == "exec":
            in_exec_block = True
            ignored.add(index)
            continue
        if in_exec_block and runtime_log_pattern.match(stripped):
            in_exec_block = False
        if in_exec_block:
            ignored.add(index)
    return ignored


def _is_result_level_provider_blocker(candidate: str) -> bool:
    normalized = candidate.lower()
    markers = (
        "quota_exhausted",
        "resource_exhausted",
        "oauth quota exceeded",
        "free daily quota has been reached",
        "you have no quota",
        "no quota remaining",
        "payment required",
        "hit your limit",
        "exhausted your capacity",
        "rate limit",
        "rate limited",
        "invalid api key",
        "failed to authenticate",
        "authentication_error",
        "invalid authentication credentials",
        "auth failed",
        "invalid access token",
        "token_invalidated",
        "refresh_token_reused",
        "authentication token has been invalidated",
        "[api error: 401",
        "api error: 401",
        "ineligibletiererror",
        "not eligible for gemini code assist",
        "restricted_dasher_user",
    )
    return any(marker in normalized for marker in markers)


def _detect_json_worker_failure_signal(line: str) -> WorkerFailureSignal | None:
    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict) or payload.get("ts"):
        return None
    if payload.get("type") == "rate_limit_event":
        rate_info = payload.get("rate_limit_info") if isinstance(payload.get("rate_limit_info"), dict) else {}
        status = str(rate_info.get("status") or payload.get("status") or "").strip().lower()
        if status in {"allowed", "allowed_warning"}:
            return None
        detected = _extract_failure_candidate(line)
        return (
            WorkerFailureSignal(detected, "rate_limit_event", True)
            if detected
            else None
        )
    payload_type = str(payload.get("type") or "").strip().lower()
    if payload_type in {"assistant", "user"}:
        return None
    candidates = _iter_json_string_values(payload)
    candidates = [*candidates, line]
    for candidate in candidates:
        detected = _extract_failure_candidate(candidate.strip())
        if not detected:
            continue
        authorized = True
        source = "structured_json"
        if payload_type == "result":
            source = "json_result_error" if payload.get("is_error") else "json_result"
            authorized = bool(payload.get("is_error")) or _is_result_level_provider_blocker(detected)
        return WorkerFailureSignal(detected, source, authorized)
    return None


def _detect_json_worker_failure(line: str) -> str | None:
    signal = _detect_json_worker_failure_signal(line)
    return signal.reason if signal else None


def detect_failure_signal_in_lines(lines: list[str]) -> WorkerFailureSignal | None:
    ignored_indexes = _captured_tool_log_line_indexes(lines)
    fallback: WorkerFailureSignal | None = None
    for index, line in reversed(list(enumerate(lines))):
        if index in ignored_indexes:
            continue
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("{"):
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError:
                payload = None
            if isinstance(payload, dict) and payload.get("type") == "result" and not payload.get("is_error"):
                detected = _detect_json_worker_failure_signal(stripped)
                if detected and _is_result_level_provider_blocker(detected.reason):
                    return detected
                return None
            detected = _detect_json_worker_failure_signal(stripped)
            if detected:
                if "an unexpected critical error occurred" in detected.reason.lower():
                    fallback = fallback or detected
                    continue
                return detected
            if payload is not None:
                continue
        if '"ts":' in stripped and '"type":' in stripped:
            continue
        detected = _extract_failure_candidate(stripped)
        if detected:
            signal = WorkerFailureSignal(detected, "raw_process_line", True)
            if "an unexpected critical error occurred" in detected.lower():
                fallback = fallback or signal
                continue
            return signal
    return fallback


def detect_worker_failure_signal(worker: dict[str, Any]) -> WorkerFailureSignal | None:
    log_path_value = worker.get("log_path")
    if not log_path_value:
        return None
    log_path = Path(log_path_value)
    if not log_path.exists():
        return None
    try:
        lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except OSError:
        return None
    return detect_failure_signal_in_lines(lines)


def detect_worker_failure(worker: dict[str, Any]) -> str | None:
    signal = detect_worker_failure_signal(worker)
    return signal.reason if signal else None
