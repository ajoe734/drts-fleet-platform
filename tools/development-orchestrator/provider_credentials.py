from __future__ import annotations

import json
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


def copilot_plaintext_token() -> str | None:
    config_dir = Path(os.environ.get("COPILOT_CONFIG_DIR") or (Path.home() / ".copilot"))
    try:
        payload = json.loads((config_dir / "config.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    for key in ("copilot_tokens", "copilotTokens"):
        tokens = payload.get(key)
        if not isinstance(tokens, dict):
            continue
        for value in tokens.values():
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None
