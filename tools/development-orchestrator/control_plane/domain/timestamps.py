"""The one way this control plane reads a timestamp."""
from __future__ import annotations

from datetime import datetime, timezone


def parse_utc_timestamp(value: object) -> datetime | None:
    """Parse an ISO-8601 timestamp, always returning a timezone-aware value.

    There were six of these, in three different behaviours: some returned a
    naive datetime when the string carried no offset, one raised instead of
    returning None, and two coerced to UTC. Two of them shared the name
    `_parse_iso_utc` while behaving differently, so which one you got depended
    on the module you were in. Comparing a naive result against an aware one
    raises TypeError, so the difference was a latent crash rather than a matter
    of taste -- reachable the moment any producer wrote a timestamp without an
    offset.

    Coercing to UTC is the behaviour that cannot surprise a caller: every
    timestamp this system persists is UTC, and a comparison never explodes.
    Returning None on malformed input keeps a corrupt state file from taking a
    tick down; every call site already handles None.
    """
    text = str(value or "").strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
