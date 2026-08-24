from __future__ import annotations

import os
from pathlib import Path

from common import load_json, runtime_env_overrides, to_bool


def truthy_env(name: str, env: dict[str, str] | None = None) -> bool:
    source = env or os.environ
    return to_bool(source.get(name))


def gemini_paths(runtime: dict | None = None) -> tuple[Path, Path]:
    overrides = runtime_env_overrides(runtime)
    home = Path(overrides.get("HOME") or str(Path.home()))
    base = home / ".gemini"
    return base / "settings.json", base / "oauth_creds.json"


def gemini_settings(runtime: dict | None = None) -> dict:
    settings_path, _ = gemini_paths(runtime)
    return load_json(settings_path, default={}) or {}
