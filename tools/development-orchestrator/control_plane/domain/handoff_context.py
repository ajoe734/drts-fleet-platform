"""Keep current handoffs bounded while retaining full evidence separately."""
from __future__ import annotations

MAX_NEXT_CHARACTERS = 4000


def validate_next_text(value: object) -> None:
    """Reject new oversized handoffs; never shorten or archive evidence implicitly."""
    if not isinstance(value, str):
        raise ValueError("next must be a string")
    if len(value) > MAX_NEXT_CHARACTERS:
        raise ValueError(
            f"next exceeds {MAX_NEXT_CHARACTERS} characters ({len(value)} supplied). "
            "Preserve the full findings in an evidence artifact, link its path in the "
            "handoff or evidence_refs, and provide only the current action and blocker "
            "in next. No handoff text was truncated."
        )
