#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-4174}"
HOST="${HOST:-127.0.0.1}"
PROBE_HOST="${PROBE_HOST:-127.0.0.1}"
LOCAL_HOST="${LOCAL_HOST:-127.0.0.1}"

STATE_DIR="${DASHBOARD_STATE_DIR:-$ROOT_DIR/.orchestrator}"
LOG_DIR="${DASHBOARD_LOG_DIR:-$STATE_DIR/logs}"

DASHBOARD_PIDFILE="${DASHBOARD_PIDFILE:-$STATE_DIR/dashboard-${PORT}.pid}"
DASHBOARD_LOG="${DASHBOARD_LOG:-$LOG_DIR/dashboard-${PORT}-service.log}"

TUNNEL_PIDFILE="${TUNNEL_PIDFILE:-$STATE_DIR/dashboard-tunnel-bg.pid}"
TUNNEL_LOG="${TUNNEL_LOG:-$LOG_DIR/dashboard-tunnel-bg.log}"
TUNNEL_URL_FILE="${TUNNEL_URL_FILE:-$STATE_DIR/dashboard-tunnel-url.txt}"
TUNNEL_METRICS_PORT="${TUNNEL_METRICS_PORT:-20244}"
TUNNEL_PROTOCOL="${TUNNEL_PROTOCOL:-http2}"
TUNNEL_BIN_DIR="${CLOUDFLARED_BIN_DIR:-$STATE_DIR/bin}"

ensure_dirs() {
  mkdir -p "$STATE_DIR" "$LOG_DIR"
}

local_url() {
  printf 'http://%s:%s/index.html\n' "$PROBE_HOST" "$PORT"
}

origin_url() {
  printf 'http://%s:%s\n' "$LOCAL_HOST" "$PORT"
}

read_pidfile() {
  local pidfile="$1"

  if [[ -f "$pidfile" ]]; then
    tr -d '[:space:]' <"$pidfile"
  fi
}

pid_is_running() {
  local pidfile="$1"
  local pid

  pid="$(read_pidfile "$pidfile")"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

clear_stale_pidfile() {
  local pidfile="$1"

  if [[ -f "$pidfile" ]] && ! pid_is_running "$pidfile"; then
    rm -f "$pidfile"
  fi
}

dashboard_ready() {
  curl -fsS --max-time 2 "$(local_url)" >/dev/null 2>&1
}

find_dashboard_pid() {
  pgrep -f "python3 .*/scripts/dashboard_server.py --host ${HOST} --port ${PORT}" | head -n 1 || true
}

adopt_dashboard_pid() {
  local pid

  pid="$(find_dashboard_pid)"
  if [[ -n "$pid" ]]; then
    printf '%s\n' "$pid" >"$DASHBOARD_PIDFILE"
  fi
}

find_tunnel_pid() {
  pgrep -f "cloudflared tunnel .*--url $(origin_url)" | head -n 1 || true
}

adopt_tunnel_pid() {
  local pid

  pid="$(find_tunnel_pid)"
  if [[ -n "$pid" ]]; then
    printf '%s\n' "$pid" >"$TUNNEL_PIDFILE"
  fi
}

stop_pidfile_process() {
  local pidfile="$1"
  local label="$2"
  local pid

  clear_stale_pidfile "$pidfile"
  pid="$(read_pidfile "$pidfile")"

  if [[ -z "$pid" ]]; then
    return 0
  fi

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true

    for _ in $(seq 1 10); do
      if ! kill -0 "$pid" 2>/dev/null; then
        rm -f "$pidfile"
        return 0
      fi

      sleep 1
    done

    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$pidfile"
  printf '%s stopped.\n' "$label"
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
  if command -v cloudflared >/dev/null 2>&1; then
    command -v cloudflared
    return 0
  fi

  mkdir -p "$TUNNEL_BIN_DIR"
  local bin_path="$TUNNEL_BIN_DIR/cloudflared"

  if [[ -x "$bin_path" ]]; then
    echo "$bin_path"
    return 0
  fi

  local asset_name
  asset_name="$(pick_cloudflared_asset)"
  local download_url="https://github.com/cloudflare/cloudflared/releases/latest/download/${asset_name}"

  echo "Downloading cloudflared to $bin_path" >&2
  curl -fsSL "$download_url" -o "$bin_path"
  chmod +x "$bin_path"
  echo "$bin_path"
}

tunnel_url_from_log() {
  if [[ -f "$TUNNEL_URL_FILE" ]]; then
    head -n 1 "$TUNNEL_URL_FILE"
    return 0
  fi

  if [[ -f "$TUNNEL_LOG" ]]; then
    grep -Eo 'https://[-a-zA-Z0-9.]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -n 1 || true
    return 0
  fi

  return 0
}

wait_for_dashboard() {
  for _ in $(seq 1 30); do
    if dashboard_ready; then
      adopt_dashboard_pid
      return 0
    fi

    if [[ -f "$DASHBOARD_PIDFILE" ]] && ! pid_is_running "$DASHBOARD_PIDFILE"; then
      break
    fi

    sleep 1
  done

  return 1
}

wait_for_tunnel_url() {
  for _ in $(seq 1 30); do
    local url
    url="$(tunnel_url_from_log)"

    if [[ -n "$url" ]]; then
      printf '%s\n' "$url" >"$TUNNEL_URL_FILE"
      echo "$url"
      return 0
    fi

    if [[ -f "$TUNNEL_PIDFILE" ]] && ! pid_is_running "$TUNNEL_PIDFILE"; then
      break
    fi

    sleep 1
  done

  return 1
}

start_dashboard() {
  ensure_dirs
  clear_stale_pidfile "$DASHBOARD_PIDFILE"

  if dashboard_ready; then
    adopt_dashboard_pid
    echo "Dashboard already running at $(local_url)"
    return 0
  fi

  if pid_is_running "$DASHBOARD_PIDFILE"; then
    stop_dashboard >/dev/null
  fi

  rm -f "$DASHBOARD_PIDFILE"
  : >"$DASHBOARD_LOG"

  setsid -f env \
    ROOT_DIR="$ROOT_DIR" \
    HOST="$HOST" \
    PORT="$PORT" \
    DASHBOARD_PIDFILE="$DASHBOARD_PIDFILE" \
    bash -lc '
      echo $$ > "$DASHBOARD_PIDFILE"
      exec bash "$ROOT_DIR/scripts/launch-docs-site.sh"
    ' >>"$DASHBOARD_LOG" 2>&1 < /dev/null

  if ! wait_for_dashboard; then
    echo "Dashboard failed to start. Recent log output:" >&2
    tail -n 80 "$DASHBOARD_LOG" >&2 || true
    return 1
  fi

  echo "Dashboard started at $(local_url)"
}

stop_dashboard() {
  stop_pidfile_process "$DASHBOARD_PIDFILE" "Dashboard"
}

start_tunnel() {
  ensure_dirs
  start_dashboard >/dev/null

  clear_stale_pidfile "$TUNNEL_PIDFILE"
  adopt_tunnel_pid

  local existing_url=""
  if pid_is_running "$TUNNEL_PIDFILE"; then
    existing_url="$(tunnel_url_from_log)"
    if [[ -n "$existing_url" ]]; then
      printf '%s\n' "$existing_url" >"$TUNNEL_URL_FILE"
      echo "Tunnel already running: ${existing_url}/index.html"
      return 0
    fi
  fi

  local cloudflared_bin
  cloudflared_bin="$(ensure_cloudflared)"

  rm -f "$TUNNEL_PIDFILE" "$TUNNEL_URL_FILE"
  : >"$TUNNEL_LOG"

  setsid -f "$cloudflared_bin" tunnel \
    --no-autoupdate \
    --protocol "$TUNNEL_PROTOCOL" \
    --metrics "127.0.0.1:${TUNNEL_METRICS_PORT}" \
    --pidfile "$TUNNEL_PIDFILE" \
    --logfile "$TUNNEL_LOG" \
    --url "$(origin_url)" >/dev/null 2>&1 < /dev/null

  local url=""
  url="$(wait_for_tunnel_url)" || {
    echo "Tunnel failed to start. Recent log output:" >&2
    tail -n 80 "$TUNNEL_LOG" >&2 || true
    return 1
  }

  echo "Public dashboard URL: ${url}/index.html"
}

stop_tunnel() {
  stop_pidfile_process "$TUNNEL_PIDFILE" "Tunnel"
  rm -f "$TUNNEL_URL_FILE"
}

status() {
  ensure_dirs
  clear_stale_pidfile "$DASHBOARD_PIDFILE"
  clear_stale_pidfile "$TUNNEL_PIDFILE"
  adopt_dashboard_pid
  adopt_tunnel_pid

  if dashboard_ready; then
    echo "Dashboard: up"
  else
    echo "Dashboard: down"
  fi
  echo "Local URL: $(local_url)"
  echo "Dashboard PID: $(read_pidfile "$DASHBOARD_PIDFILE")"
  echo "Dashboard log: $DASHBOARD_LOG"

  if pid_is_running "$TUNNEL_PIDFILE"; then
    echo "Tunnel: up"
  else
    rm -f "$TUNNEL_URL_FILE"
    echo "Tunnel: down"
  fi
  echo "Tunnel PID: $(read_pidfile "$TUNNEL_PIDFILE")"
  echo "Tunnel log: $TUNNEL_LOG"

  local url=""
  url="$(tunnel_url_from_log)"
  if [[ -n "$url" ]]; then
    echo "Public URL: ${url}/index.html"
  fi
}

print_url() {
  local url=""

  clear_stale_pidfile "$TUNNEL_PIDFILE"
  adopt_tunnel_pid
  if ! pid_is_running "$TUNNEL_PIDFILE"; then
    rm -f "$TUNNEL_URL_FILE"
    echo "No public tunnel URL found." >&2
    return 1
  fi

  url="$(tunnel_url_from_log)"
  if [[ -z "$url" ]]; then
    echo "No public tunnel URL found." >&2
    return 1
  fi

  echo "${url}/index.html"
}

usage() {
  cat <<'EOF'
Usage: bash scripts/dashboard-ctl.sh <command>

Commands:
  start            Start the local dashboard in the background
  stop             Stop the local dashboard background service
  restart          Restart the local dashboard background service
  status           Print dashboard and tunnel status
  start-tunnel     Start or reuse a detached Cloudflare quick tunnel
  stop-tunnel      Stop the detached Cloudflare quick tunnel
  restart-tunnel   Restart the detached Cloudflare quick tunnel
  start-public     Alias for start-tunnel
  stop-public      Alias for stop-tunnel
  restart-public   Alias for restart-tunnel
  url              Print the current public dashboard URL
EOF
}

command="${1:-status}"

case "$command" in
  start)
    start_dashboard
    ;;
  stop)
    stop_dashboard
    ;;
  restart)
    stop_dashboard >/dev/null
    start_dashboard
    ;;
  status)
    status
    ;;
  start-tunnel | start-public)
    start_tunnel
    ;;
  stop-tunnel | stop-public)
    stop_tunnel
    ;;
  restart-tunnel | restart-public)
    stop_tunnel >/dev/null
    start_tunnel
    ;;
  url)
    print_url
    ;;
  help | --help | -h)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
