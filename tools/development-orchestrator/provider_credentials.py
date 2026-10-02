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


# pi keeps logins, settings and sessions in one agent directory (default
# ~/.pi/agent, overridden by PI_CODING_AGENT_DIR). A lane points `agent_dir` at
# its own directory to run on a separate account; without it the lane shares
# the operator's `pi /login`, which is safe because pi locks auth.json around
# every token refresh. HOME is deliberately left alone so git and gh keep the
# operator's configuration.
PI_DEFAULT_PROVIDER = "openai-codex"


def pi_agent_dir(settings: dict | None = None) -> Path:
    configured = str((settings or {}).get("agent_dir") or "").strip()
    if configured:
        return Path(os.path.expandvars(os.path.expanduser(configured)))
    inherited = str(os.environ.get("PI_CODING_AGENT_DIR") or "").strip()
    return Path(os.path.expanduser(inherited)) if inherited else Path.home() / ".pi" / "agent"


def pi_env(settings: dict | None = None) -> dict[str, str]:
    env = os.environ.copy()
    env.update(runtime_env_overrides(settings))
    env["PI_CODING_AGENT_DIR"] = str(pi_agent_dir(settings))
    return env


def pi_model_provider(settings: dict | None = None) -> str:
    model = str((settings or {}).get("model") or "").strip()
    if "/" in model:
        return model.split("/", 1)[0]
    return str((settings or {}).get("provider") or PI_DEFAULT_PROVIDER).strip() or PI_DEFAULT_PROVIDER


def pi_model_ref(settings: dict | None = None, model: str | None = None) -> str | None:
    """`provider/model` for --model, so pi never resolves a bare id to another provider."""
    chosen = str(model or (settings or {}).get("model") or "").strip()
    if not chosen:
        return None
    if "/" in chosen:
        return chosen
    return f"{pi_model_provider(settings)}/{chosen}"
