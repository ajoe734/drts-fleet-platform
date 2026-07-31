from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Mapping
from zoneinfo import ZoneInfo


class FailureKind(str, Enum):
    AUTH = "auth"
    QUOTA_TERMINAL = "quota_terminal"
    CAPACITY = "capacity"
    TRANSIENT = "transient"
    UNKNOWN_CRITICAL = "unknown_critical"
    TERMINAL = "terminal"


@dataclass(frozen=True)
class FailureDecision:
    kind: FailureKind
    transient: bool
    label: str

    def as_mapping(self) -> dict[str, Any]:
        return {
            "kind": self.kind.value,
            "transient": self.transient,
            "label": self.label,
        }


AUTH_MARKERS = frozenset(
    {
        "status: 401",
        "unauthorized",
        "authentication",
        "authentication_error",
        "failed to authenticate",
        "invalid authentication credentials",
        "auth failed",
        "invalid api key",
        "token_invalidated",
        "refresh_token_reused",
        "authentication token has been invalidated",
        "refresh_token_invalidated",
        "refresh token was revoked",
        "access token could not be refreshed",
        "forbidden",
        "permission denied",
        "ineligibletiererror",
        "not eligible for gemini code assist",
        "not eligible for antigravity",
        "eligibility check failed",
        "restricted_dasher_user",
    }
)
QUOTA_TERMINAL_MARKERS = frozenset(
    {
        "quota_exhausted",
        "terminalquotaerror",
        "you have exhausted your capacity",
        "exhausted your capacity",
        "status: 402",
        "you have no quota",
        "no quota remaining",
        "payment required",
        "free daily quota has been reached",
        "oauth quota exceeded",
        "daily quota",
        "individual quota reached",
        "hit your usage limit",
        "exceeded your monthly quota",
    }
)
CAPACITY_MARKERS = frozenset(
    {
        "status: 429",
        "resource_exhausted",
        "rate limit",
        "rate limited",
        "hit your limit",
        "no capacity available",
        "is at capacity",
        "retryablequotaerror",
    }
)
UNKNOWN_CRITICAL_MARKERS = frozenset(
    {"an unexpected critical error occurred", "[object object]"}
)

LOCAL_TZ = ZoneInfo("Asia/Taipei")
ISO_RESET_HINT_PATTERN = re.compile(
    r"\b(?:retry time(?: of)?|retry at|resets?(?: at)?)\s+"
    r"(?P<iso>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\b",
    re.IGNORECASE,
)
HUMAN_RESET_HINT_PATTERN = re.compile(
    # Providers write the day with an ordinal suffix and use "try again at" as
    # often as "retry at" (codex: "try again at Jul 31st, 2026 5:28 AM"), and the
    # comma after the day is optional. 6k+ occurrences in 4 days of logs went
    # unparsed before these were allowed.
    r"\b(?:retry time(?: of)?|retry at|try again at|resets?(?: at)?)\s+"
    r"(?P<month>[A-Z][a-z]+)\s+"
    r"(?P<day>\d{1,2})(?:st|nd|rd|th)?,?\s*"
    r"(?:(?P<year>\d{4})\s*,?\s+)?"
    r"(?P<hour>\d{1,2})"
    r"(?::(?P<minute>\d{2}))?\s*"
    r"(?P<ampm>[AaPp])\.?\s*[Mm]\.?"
    r"(?:\s*\(?(?P<tz>UTC|GMT)\)?)?",
    re.IGNORECASE,
)
# Duration form, which is what the Antigravity CLI and several web consoles emit:
#   "Resets in 29h35m13s"  "Resets in 5m3s"  "refreshes in 1 day, 5 hours"
# These are relative to when the failure was observed, so they resolve against
# ``paused_at`` when the caller supplies it.
DURATION_RESET_HINT_PATTERN = re.compile(
    r"\b(?:resets?|refreshes?|retry|try again)\s+in\s+"
    r"(?P<body>\d+\s*(?:d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)"
    r"(?:[\s,]*\d+\s*(?:d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?))*)",
    re.IGNORECASE,
)
_DURATION_UNIT_PATTERN = re.compile(
    r"(\d+)\s*(d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?|s(?:ec(?:ond)?s?)?)",
    re.IGNORECASE,
)
_DURATION_UNIT_SECONDS = {"d": 86400, "h": 3600, "m": 60, "s": 1}


def _parse_duration_seconds(body: str) -> int | None:
    """Sum a compact duration like '29h35m13s' or '1 day, 5 hours' into seconds."""
    total = 0
    matched = False
    for value, unit in _DURATION_UNIT_PATTERN.findall(body):
        try:
            amount = int(value)
        except ValueError:
            continue
        total += amount * _DURATION_UNIT_SECONDS[unit[0].lower()]
        matched = True
    return total if matched and total > 0 else None


def retry_settings(
    config: Mapping[str, Any], provider: str | None
) -> dict[str, Any]:
    retry = dict(config.get("worker_retry", {}) or {})
    if provider:
        retry.update(
            (config.get("providers", {}).get(provider, {}).get("retry", {}) or {})
        )
    retry.setdefault("enabled", True)
    retry.setdefault("max_attempts", 5)
    retry.setdefault("backoff_schedule_seconds", [5, 15, 30, 60, 120])
    retry.setdefault("jitter_seconds", 3)
    retry.setdefault("capacity_pause_seconds", 300)
    retry.setdefault(
        "transient_error_patterns",
        [
            "429",
            "resource_exhausted",
            "rate limit",
            "rate limited",
            "timed out",
            "etimedout",
            "econnreset",
            "temporarily unavailable",
            "try again later",
            "server overloaded",
            "deadline exceeded",
        ],
    )
    retry.setdefault("fallback_mode", "file_inbox")
    return retry


def classify_failure(
    config: Mapping[str, Any], worker: Mapping[str, Any], reason: str | None
) -> FailureDecision:
    provider = str(worker.get("provider") or worker.get("agent_id") or "").strip().lower()
    normalized = str(reason or "").lower()
    transient_patterns = [
        str(pattern).lower()
        for pattern in retry_settings(config, str(worker.get("provider") or "")).get(
            "transient_error_patterns", []
        )
    ]

    if any(marker in normalized for marker in AUTH_MARKERS):
        return FailureDecision(FailureKind.AUTH, False, "auth")
    if any(marker in normalized for marker in QUOTA_TERMINAL_MARKERS):
        return FailureDecision(FailureKind.QUOTA_TERMINAL, False, "quota/terminal")
    if any(marker in normalized for marker in CAPACITY_MARKERS):
        return FailureDecision(FailureKind.CAPACITY, True, "capacity/429")
    if provider == "gemini" and any(
        marker in normalized for marker in UNKNOWN_CRITICAL_MARKERS
    ):
        return FailureDecision(
            FailureKind.UNKNOWN_CRITICAL, False, "unknown critical error"
        )
    if any(pattern in normalized for pattern in transient_patterns):
        return FailureDecision(FailureKind.TRANSIENT, True, "transient")
    if any(marker in normalized for marker in UNKNOWN_CRITICAL_MARKERS):
        return FailureDecision(
            FailureKind.UNKNOWN_CRITICAL, False, "unknown critical error"
        )
    return FailureDecision(FailureKind.TERMINAL, False, "terminal")


def _parse_iso_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_month(value: str) -> int | None:
    for fmt in ("%b", "%B"):
        try:
            return datetime.strptime(value.strip(), fmt).month
        except ValueError:
            continue
    return None


def infer_pause_resume_at(
    reason: str | None, *, paused_at: datetime | None = None
) -> float | None:
    text = str(reason or "").strip()
    if not text:
        return None

    iso_match = ISO_RESET_HINT_PATTERN.search(text)
    if iso_match:
        parsed = _parse_iso_utc(iso_match.group("iso"))
        if parsed is not None:
            return parsed.timestamp()

    # Duration hints ("Resets in 29h35m13s") are relative to the moment the
    # failure was observed, so anchor them to paused_at when we have it.
    duration_match = DURATION_RESET_HINT_PATTERN.search(text)
    if duration_match:
        seconds = _parse_duration_seconds(duration_match.group("body"))
        if seconds is not None:
            anchor = paused_at or datetime.now(timezone.utc)
            return (anchor + timedelta(seconds=seconds)).timestamp()

    match = HUMAN_RESET_HINT_PATTERN.search(text)
    if not match:
        return None
    month = _parse_month(match.group("month"))
    if month is None:
        return None
    hour = int(match.group("hour")) % 12
    if str(match.group("ampm") or "").lower() == "p":
        hour += 12
    tz_name = str(match.group("tz") or "").upper()
    tzinfo = timezone.utc if tz_name in {"UTC", "GMT"} else LOCAL_TZ
    reference = (
        paused_at.astimezone(tzinfo) if paused_at is not None else datetime.now(tzinfo)
    )
    year_text = str(match.group("year") or "").strip()
    year = int(year_text) if year_text else reference.year
    try:
        parsed = datetime(
            year,
            month,
            int(match.group("day")),
            hour,
            int(match.group("minute") or 0),
            tzinfo=tzinfo,
        )
    except ValueError:
        return None
    if not year_text and parsed < reference - timedelta(days=180):
        try:
            parsed = parsed.replace(year=parsed.year + 1)
        except ValueError:
            return None
    return parsed.timestamp()
