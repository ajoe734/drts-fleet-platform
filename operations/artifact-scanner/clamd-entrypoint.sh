#!/bin/sh
# Entrypoint for the ClamAV sidecar container: fetch genuine signatures
# before starting clamd, and only mark the shared readiness volume once
# clamd actually answers a live ping -- a container that merely started is
# not "ready", and this must never let the gateway treat a cold-start
# engine as available before it can serve a real verdict.
#
# This is exercised by the authorized hosted build/deploy pipeline for the
# real clamd/freshclam binaries, and -- for the freshness-provenance logic
# below -- by tests/unit/audit-gcp-artifact-infra-20261004/clamd-entrypoint.test.ts,
# which runs this unmodified script under `sh` with only the external
# freshclam/clamd/clamdscan commands stubbed on PATH (R8 regression; this VM
# does not run containers or a real engine).
set -eu

READY_MARKER="${CLAMAV_READY_MARKER:-/var/run/clamav-ready/ready}"
FRESHCLAM_INTERVAL_SECONDS="${FRESHCLAM_INTERVAL_SECONDS:-3600}"
# Must track clamd.conf's DatabaseDirectory -- this is where the real
# signature files freshclam writes (and clamd loads) actually live.
CLAMAV_DB_DIR="${CLAMAV_DB_DIR:-/var/lib/clamav}"
rm -f "$READY_MARKER"
mkdir -p "$(dirname "$READY_MARKER")"

# R8 (round 2): a freshclam exit code of 0 is not proof that signatures are
# current. ClamAV's libfreshclam remembers a 403/429 rate-limit cooldown and
# returns success without touching any database file while that cooldown is
# in effect, and freshclam ignores a failed notify() to clamd on a genuine
# update. Trusting the exit code (or `touch`ing the marker with wall-clock
# "now") would let a stuck cooldown -- or a successful download clamd never
# actually reloaded -- renew readiness forever even though no real signature
# content changed. Instead, the marker's mtime is always derived from the
# newest *actual* signature database file on disk, never from "now" or from
# freshclam's exit status alone: a cooldown that reports success without
# writing a new database file leaves the marker's effective age unchanged,
# so `readiness.ts#isMarkerFresh`'s existing `MAX_SIGNATURE_AGE_MS` bound
# still ages it out once real signature content is genuinely stale.
newest_signature_file() {
  newest=""
  newest_mtime=-1
  for name in main.cvd main.cld daily.cvd daily.cld bytecode.cvd bytecode.cld; do
    candidate="$CLAMAV_DB_DIR/$name"
    if [ -f "$candidate" ]; then
      candidate_mtime=$(stat -c %Y "$candidate" 2>/dev/null) || continue
      if [ "$candidate_mtime" -gt "$newest_mtime" ]; then
        newest_mtime="$candidate_mtime"
        newest="$candidate"
      fi
    fi
  done
  printf '%s\n' "$newest"
}

publish_marker_from_signatures() {
  reference_file=$(newest_signature_file)
  if [ -z "$reference_file" ]; then
    echo "No signature database files found in $CLAMAV_DB_DIR; marking not ready" >&2
    rm -f "$READY_MARKER"
    return 1
  fi
  touch -r "$reference_file" "$READY_MARKER"
  return 0
}

echo "Fetching ClamAV signatures..."
freshclam --stdout

echo "Starting clamd..."
clamd --config-file=/etc/clamav/clamd.conf &
CLAMD_PID=$!

attempt=0
while [ "$attempt" -lt 60 ]; do
  if clamdscan --ping 1 --config-file=/etc/clamav/clamd.conf >/dev/null 2>&1; then
    publish_marker_from_signatures || echo "clamd is live but no signatures were found yet" >&2
    break
  fi
  attempt=$((attempt + 1))
  sleep 1
done

# A long-lived instance must never keep serving verdicts against
# definitions that have gone stale (R8): this refreshes signatures on a
# bounded interval and only republishes the readiness marker from the real
# on-disk signature files (never on freshclam's exit status alone), so a
# cooldown-faked success, a failed refresh, or an overdue refresh all leave
# readiness to age out or be removed instead of silently continuing to scan.
# clamd.conf's `SelfCheck` bound independently guards against freshclam's
# update succeeding but its reload notification to clamd silently failing --
# clamd reloads a genuinely changed database directory on its own within
# that bound, well inside MAX_SIGNATURE_AGE_MS.
(
  while kill -0 "$CLAMD_PID" 2>/dev/null; do
    sleep "$FRESHCLAM_INTERVAL_SECONDS"
    if freshclam --stdout; then
      publish_marker_from_signatures || true
    else
      echo "freshclam refresh failed; marking not ready" >&2
      rm -f "$READY_MARKER"
    fi
  done
) &
WATCHDOG_PID=$!
trap 'kill "$WATCHDOG_PID" 2>/dev/null || true' EXIT

wait "$CLAMD_PID"
