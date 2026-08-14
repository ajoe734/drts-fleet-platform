#!/usr/bin/env bash
set -euo pipefail

# Auto-start a named tunnel without coupling it to a repository checkout or
# another user's home directory.
CLOUDFLARED="${CLOUDFLARED_BIN:-}"
if [[ -z "$CLOUDFLARED" ]]; then
  CLOUDFLARED="$(command -v cloudflared 2>/dev/null || true)"
fi
if [[ -z "$CLOUDFLARED" ]]; then
  CLOUDFLARED="${XDG_CACHE_HOME:-$HOME/.cache}/drts-tools/cloudflared"
fi
PIDFILE="${CF_TUNNEL_PIDFILE:-/tmp/cf-tunnel.pid}"
LOG="${CF_TUNNEL_LOG:-/tmp/cf-tunnel.log}"

if [[ ! -x "$CLOUDFLARED" ]]; then
  echo "ERROR: cloudflared executable unavailable: $CLOUDFLARED" >&2
  exit 127
fi

if [[ -f "$PIDFILE" ]] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
  exit 0  # already running
fi

"$CLOUDFLARED" tunnel run "${CF_TUNNEL_NAME:-drts-dev}" > "$LOG" 2>&1 &
echo $! > "$PIDFILE"
