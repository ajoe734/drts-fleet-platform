from __future__ import annotations

from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Mapping


def _strings(value: Any) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)):
        return ()
    return tuple(str(item) for item in value if str(item).strip())


@dataclass(frozen=True)
class TaskRecord:
    id: str
    status: str
    owner: str = ""
    reviewer: str = ""
    depends_on: tuple[str, ...] = ()
    artifacts: tuple[str, ...] = ()
    next: str | None = None
    last_update: str | None = None
    raw: Mapping[str, Any] = field(default_factory=dict, repr=False, compare=False)

    @classmethod
    def from_mapping(cls, value: Mapping[str, Any]) -> "TaskRecord":
        raw = dict(value)
        return cls(
            id=str(raw.get("id") or "").strip(),
            status=str(raw.get("status") or "").strip().lower(),
            owner=str(raw.get("owner") or "").strip(),
            reviewer=str(raw.get("reviewer") or "").strip(),
            depends_on=_strings(raw.get("depends_on")),
            artifacts=_strings(raw.get("artifacts")),
            next=str(raw["next"]) if raw.get("next") is not None else None,
            last_update=(
                str(raw["last_update"])
                if raw.get("last_update") is not None
                else None
            ),
            raw=MappingProxyType(raw),
        )

    def to_mapping(self) -> dict[str, Any]:
        return dict(self.raw)
