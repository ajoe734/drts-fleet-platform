#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST_CODEX_HOME="${DRTS_OPENCLAW_CODEX_HOME:-${CODEX_HOME:-$HOME/.codex}}"
AUTH_BRIDGE_ROOT="${DRTS_OPENCLAW_AUTH_BRIDGE_ROOT:-${XDG_STATE_HOME:-$HOME/.local/state}/drts-openclaw}"
TARGET_AGENT_DIR="${1:?target agent dir is required}"

mkdir -p "$TARGET_AGENT_DIR" "$AUTH_BRIDGE_ROOT"

python3 - "$HOST_CODEX_HOME" "$AUTH_BRIDGE_ROOT" "$TARGET_AGENT_DIR" <<'PY'
import base64
import json
import os
import sys
from pathlib import Path

host_codex_home = Path(sys.argv[1]).expanduser()
bridge_root = Path(sys.argv[2]).expanduser()
target_agent_dir = Path(sys.argv[3]).expanduser()
auth_json = host_codex_home / "auth.json"
if not auth_json.exists():
    raise SystemExit(0)

payload = json.loads(auth_json.read_text(encoding="utf-8"))
tokens = payload.get("tokens") or {}
access = tokens.get("access_token")
refresh = tokens.get("refresh_token")
if not access or not refresh:
    raise SystemExit(0)

def decode_exp(jwt_token: str) -> int | None:
    try:
        parts = jwt_token.split(".")
        if len(parts) < 2:
            return None
        body = parts[1] + "=" * (-len(parts[1]) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(body.encode("ascii")))
        exp = decoded.get("exp")
        if isinstance(exp, int):
            return exp * 1000
    except Exception:
        return None
    return None

bridge_root.mkdir(parents=True, exist_ok=True)
bridge_path = bridge_root / "openai-codex-auth-profiles.json"
store = {
    "version": 1,
    "profiles": {
        "openai-codex:default": {
            "type": "oauth",
            "provider": "openai-codex",
            "access": access,
            "refresh": refresh,
        }
    },
}
expires = decode_exp(access)
if expires is not None:
    store["profiles"]["openai-codex:default"]["expires"] = expires
account_id = tokens.get("account_id")
if isinstance(account_id, str) and account_id:
    store["profiles"]["openai-codex:default"]["accountId"] = account_id
id_token = tokens.get("id_token")
if isinstance(id_token, str) and id_token:
    store["profiles"]["openai-codex:default"]["idToken"] = id_token

bridge_path.write_text(json.dumps(store, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
os.chmod(bridge_path, 0o600)
target_path = target_agent_dir / "auth-profiles.json"
if target_path.exists() or target_path.is_symlink():
    target_path.unlink()
target_path.symlink_to(bridge_path)
print(bridge_path)
PY
