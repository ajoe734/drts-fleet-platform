#!/bin/sh
# Entrypoint for the ClamAV sidecar container: fetch genuine signatures
# before starting clamd, and only mark the shared readiness volume once
# clamd actually answers a live ping -- a container that merely started is
# not "ready", and this must never let the gateway treat a cold-start
# engine as available before it can serve a real verdict.
#
# This is exercised by the authorized hosted build/deploy pipeline, not by
# the local unit tests (see tests/unit/audit-gcp-artifact-infra-20261004/):
# this VM does not run containers or engines, only the pure gateway
# protocol/validation functions are checked offline.
set -eu

READY_MARKER="${CLAMAV_READY_MARKER:-/var/run/clamav-ready/ready}"
FRESHCLAM_INTERVAL_SECONDS="${FRESHCLAM_INTERVAL_SECONDS:-3600}"
rm -f "$READY_MARKER"
mkdir -p "$(dirname "$READY_MARKER")"

echo "Fetching ClamAV signatures..."
freshclam --stdout

echo "Starting clamd..."
clamd --config-file=/etc/clamav/clamd.conf &
CLAMD_PID=$!

attempt=0
while [ "$attempt" -lt 60 ]; do
  if clamdscan --ping 1 --config-file=/etc/clamav/clamd.conf >/dev/null 2>&1; then
    touch "$READY_MARKER"
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

# A long-lived instance must never keep serving verdicts against
# definitions that have gone stale (R8): this refreshes signatures on a
# bounded interval and only bumps the readiness marker's mtime on a
# genuine freshclam success, so a failed or overdue refresh removes
# readiness instead of silently continuing to scan. The gateway's
# `readiness.ts#isMarkerFresh` independently rejects the marker once it is
# older than `MAX_SIGNATURE_AGE_MS`, so this loop and that age check are
# two bounded, fail-closed layers rather than one.
(
  while kill -0 "$CLAMD_PID" 2>/dev/null; do
    sleep "$FRESHCLAM_INTERVAL_SECONDS"
    if freshclam --stdout; then
      touch "$READY_MARKER"
    else
      echo "freshclam refresh failed; marking not ready" >&2
      rm -f "$READY_MARKER"
    fi
  done
) &
WATCHDOG_PID=$!
trap 'kill "$WATCHDOG_PID" 2>/dev/null || true' EXIT

wait "$CLAMD_PID"
