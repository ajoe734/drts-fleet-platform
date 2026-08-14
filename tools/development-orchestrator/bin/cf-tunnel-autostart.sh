#!/usr/bin/env bash
# Auto-start cloudflared tunnel on login
CLOUDFLARED="/home/edna/workspace/drts-fleet-platform/.orchestrator/bin/cloudflared"
PIDFILE="/tmp/cf-tunnel.pid"
LOG="/tmp/cf-tunnel.log"

if [[ -f "$PIDFILE" ]] && kill -0 "$(cat $PIDFILE)" 2>/dev/null; then
  exit 0  # already running
fi

"$CLOUDFLARED" tunnel run drts-dev > "$LOG" 2>&1 &
echo $! > "$PIDFILE"
