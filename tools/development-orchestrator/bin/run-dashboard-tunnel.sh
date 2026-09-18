#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-4174}"
LOCAL_HOST="${LOCAL_HOST:-127.0.0.1}"
# Third-party tools are user-local dependencies, not orchestrator runtime
# state. Keeping them out of .orchestrator makes state cleanup safe.
BIN_DIR="${CLOUDFLARED_BIN_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/drts-tools}"
CLOUDFLARED_VERSION="${CLOUDFLARED_VERSION:-2026.8.2}"
LOG_DIR="${DASHBOARD_TUNNEL_LOG_DIR:-$ROOT_DIR/.orchestrator/logs}"
DASHBOARD_LOG="$LOG_DIR/dashboard-${PORT}.log"
TUNNEL_LOG="$LOG_DIR/dashboard-tunnel.log"

STARTED_DASHBOARD=0
DASHBOARD_PID=""
TUNNEL_PID=""

cleanup() {
  local exit_code=$?

  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi

  if [[ "$STARTED_DASHBOARD" -eq 1 ]] && [[ -n "$DASHBOARD_PID" ]] && kill -0 "$DASHBOARD_PID" 2>/dev/null; then
    kill "$DASHBOARD_PID" 2>/dev/null || true
    wait "$DASHBOARD_PID" 2>/dev/null || true
  fi

  exit "$exit_code"
}

pick_cloudflared_asset() {
  case "$(uname -m)" in
    x86_64 | amd64) echo "cloudflared-linux-amd64" ;;
    aarch64 | arm64) echo "cloudflared-linux-arm64" ;;
    armv7l | armv6l) echo "cloudflared-linux-arm" ;;
    *)
      echo "Unsupported architecture: $(uname -m)" >&2
      return 1
      ;;
  esac
}

ensure_cloudflared() {
  if [[ -n "${CLOUDFLARED_BIN:-}" ]]; then
    if [[ -x "$CLOUDFLARED_BIN" ]]; then
      printf '%s\n' "$CLOUDFLARED_BIN"
      return 0
    fi
    echo "CLOUDFLARED_BIN is not executable: $CLOUDFLARED_BIN" >&2
    return 1
  fi

  if command -v cloudflared >/dev/null 2>&1; then
    command -v cloudflared
    return 0
  fi

  mkdir -p "$BIN_DIR"
  local bin_path="$BIN_DIR/cloudflared"

  if [[ -x "$bin_path" ]]; then
    echo "$bin_path"
    return 0
  fi

  local asset_name
  asset_name="$(pick_cloudflared_asset)"
  # Pinned rather than `latest`: this fetches an executable and runs it with the
  # developer's own privileges, so "whatever is newest at this moment" is not a
  # thing to resolve at runtime.
  local download_url="https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${asset_name}"

  echo "Downloading cloudflared ${CLOUDFLARED_VERSION} to $bin_path" >&2
  curl -fsSL "$download_url" -o "$bin_path.part"

  local actual
  actual="$(sha256sum "$bin_path.part" | awk '{print $1}')"
  # Cloudflare publishes no digests alongside these release assets, so there is
  # no upstream value to check against. Rather than pretend otherwise, verify
  # when the operator has pinned one and say plainly when nobody has.
  if [[ -n "${CLOUDFLARED_SHA256:-}" ]]; then
    if [[ "$actual" != "$CLOUDFLARED_SHA256" ]]; then
      rm -f "$bin_path.part"
      echo "cloudflared checksum mismatch for ${asset_name}" >&2
      echo "  expected $CLOUDFLARED_SHA256" >&2
      echo "  actual   $actual" >&2
      return 1
    fi
  else
    echo "WARNING: cloudflared was not verified -- upstream publishes no digest." >&2
    echo "  To pin this exact binary for future runs, re-run with:" >&2
    echo "    CLOUDFLARED_SHA256=$actual" >&2
  fi

  chmod +x "$bin_path.part"
  mv "$bin_path.part" "$bin_path"
  echo "$bin_path"
}

dashboard_ready() {
  curl -fsS --max-time 2 "http://${LOCAL_HOST}:${PORT}/index.html" >/dev/null 2>&1
}

ensure_dashboard() {
  mkdir -p "$LOG_DIR"

  if dashboard_ready; then
    echo "Reusing dashboard at http://${LOCAL_HOST}:${PORT}/index.html"
    return 0
  fi

  echo "Starting dashboard at http://${LOCAL_HOST}:${PORT}/index.html"
  HOST="$LOCAL_HOST" PORT="$PORT" bash "$ROOT_DIR/tools/development-orchestrator/bin/run-dashboard.sh" >"$DASHBOARD_LOG" 2>&1 &
  DASHBOARD_PID=$!
  STARTED_DASHBOARD=1

  for _ in $(seq 1 30); do
    if dashboard_ready; then
      echo "Dashboard is ready."
      return 0
    fi

    if ! kill -0 "$DASHBOARD_PID" 2>/dev/null; then
      echo "Dashboard failed to start. Recent log output:" >&2
      tail -n 40 "$DASHBOARD_LOG" >&2 || true
      return 1
    fi

    sleep 1
  done

  echo "Dashboard did not become ready in time. Recent log output:" >&2
  tail -n 40 "$DASHBOARD_LOG" >&2 || true
  return 1
}

wait_for_tunnel_url() {
  for _ in $(seq 1 30); do
    local url
    url="$(grep -Eo 'https://[-a-zA-Z0-9.]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)"

    if [[ -n "$url" ]]; then
      echo "$url"
      return 0
    fi

    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      break
    fi

    sleep 1
  done

  return 1
}

trap cleanup EXIT INT TERM

# A quick tunnel mints a public trycloudflare.com hostname with no login in
# front of it, and the dashboard authenticates nobody: whoever holds the URL
# reads the task board, the approval queue, and the full runtime state. That is
# a decision to take deliberately, not something to discover from the URL this
# script prints, so it has to be stated before the tunnel exists.
if [[ "${DASHBOARD_TUNNEL_PUBLIC_ACK:-}" != "1" ]]; then
  cat >&2 <<'ACK'
refusing to open a Cloudflare quick tunnel.

It publishes an unauthenticated page on a public trycloudflare.com URL. Anyone
with that URL can read ai-status.json, the approval queue, and the orchestrator
runtime state, and can POST /__refresh to trigger a sync on this machine.

If that is what you want, acknowledge it explicitly:

    DASHBOARD_TUNNEL_PUBLIC_ACK=1 bash tools/development-orchestrator/bin/run-dashboard-tunnel.sh

For anything beyond a one-off demo, put a named tunnel with Cloudflare Access
in front of the dashboard instead of a quick tunnel.
ACK
  exit 2
fi

CLOUDFLARED_BIN="$(ensure_cloudflared)"

ensure_dashboard

: >"$TUNNEL_LOG"
echo "Starting Cloudflare quick tunnel for http://${LOCAL_HOST}:${PORT}"
"$CLOUDFLARED_BIN" tunnel --no-autoupdate --url "http://${LOCAL_HOST}:${PORT}" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

PUBLIC_URL="$(wait_for_tunnel_url || true)"
if [[ -z "$PUBLIC_URL" ]]; then
  echo "Cloudflare tunnel failed to start. Recent log output:" >&2
  tail -n 80 "$TUNNEL_LOG" >&2 || true
  exit 1
fi

echo
echo "Public dashboard URL:"
echo "${PUBLIC_URL}/index.html"
echo
echo "Tunnel log: $TUNNEL_LOG"
echo "Press Ctrl-C to stop the tunnel."

wait "$TUNNEL_PID"
