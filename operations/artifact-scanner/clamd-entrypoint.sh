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
# Sibling file: the exact on-disk signature file's own ClamAV-VDB version,
# published alongside the marker so the gateway (readiness.ts#createIsReady)
# can compare it against clamd's own live VERSION reply and require them to
# match before reporting ready -- a fresh file write alone is not proof the
# RUNNING engine has actually loaded it (R8, round 3).
READY_VERSION_FILE="${CLAMAV_READY_VERSION_FILE:-${READY_MARKER}.version}"
FRESHCLAM_INTERVAL_SECONDS="${FRESHCLAM_INTERVAL_SECONDS:-3600}"
# Must track clamd.conf's DatabaseDirectory -- this is where the real
# signature files freshclam writes (and clamd loads) actually live.
CLAMAV_DB_DIR="${CLAMAV_DB_DIR:-/var/lib/clamav}"
rm -f "$READY_MARKER" "$READY_VERSION_FILE"
mkdir -p "$(dirname "$READY_MARKER")"

# R8(a) (round 4): clamd's own live `VERSION` reply (clamd/session.c
# print_ver -> CL_ENGINE_DB_VERSION) only ever reports the DAILY database's
# version -- libclamav/cvd.c#cli_cvdload assigns engine->dbversion solely
# inside the daily filename branch; main and bytecode carry their own,
# independent version numbers that clamd never exposes over the wire. The
# round-3 fix picked whichever of main/daily/bytecode had the newest mtime,
# which answers a different question (which file was touched most recently)
# than the one readiness.ts actually needs to ask (what does clamd's own
# VERSION reply mean) -- so a newer main/bytecode write made every /health
# and /scan fail closed against a fully loaded, healthy daily engine. Only
# the daily database's own identity is ever published here now.
#
# A freshclam update that lands as an incremental patch produces/refreshes
# daily.cld from the prior daily.cvd+cdiffs; a full download instead
# (re)writes daily.cvd and removes any now-superseded daily.cld. When both
# exist, the .cld is the newer, currently-loaded local database -- the .cvd
# is a stale signed snapshot left on disk, not what clamd actually loaded.
daily_reference_file() {
  if [ -f "$CLAMAV_DB_DIR/daily.cld" ]; then
    printf '%s\n' "$CLAMAV_DB_DIR/daily.cld"
  elif [ -f "$CLAMAV_DB_DIR/daily.cvd" ]; then
    printf '%s\n' "$CLAMAV_DB_DIR/daily.cvd"
  fi
}

# R8 (round 2): a freshclam exit code of 0 is not proof that signatures are
# current. ClamAV's libfreshclam remembers a 403/429 rate-limit cooldown and
# returns success without touching any database file while that cooldown is
# in effect, and freshclam ignores a failed notify() to clamd on a genuine
# update. Trusting the exit code (or `touch`ing the marker with wall-clock
# "now") would let a stuck cooldown -- or a successful download clamd never
# actually reloaded -- renew readiness forever even though no real signature
# content changed. Instead, the marker's mtime is derived from the daily
# database file's own on-disk mtime by default, never from "now" or from
# freshclam's exit status alone.
#
# R8(b) (round 4): that file-mtime-only rule over-corrected. Real freshclam
# genuinely re-verifies the remote daily version on every run and, when the
# local copy is already current, takes an up-to-date path that -- correctly
# -- never rewrites any database file (see libfreshclam_internal.c's
# check_for_new_database_version up-to-date branch). Tying freshness solely
# to the file's mtime cannot tell that verified-current outcome apart from
# a stuck rate-limit cooldown that also exits 0 without writing anything,
# so a perfectly healthy, actively-maintained daily database older than
# `MAX_SIGNATURE_AGE_MS` would stay permanently not-ready. `daily_check_verified`
# greps freshclam's own captured output for ClamAV's documented per-database
# outcome lines (freshclam/manager.c's `logg("%s is up to date (version: ...",
# ...)` and `logg("%s updated (version: ...", ...)`) -- the only affirmative,
# text-level proof (short of re-implementing freshclam's own remote version
# check) that this particular invocation genuinely compared the daily
# database against the remote version, rather than silently no-op'ing
# through a remembered cooldown. Only that confirmed outcome is allowed to
# advance the marker to wall-clock "now" without a file rewrite; an
# unconfirmed exit 0 still falls back to the file's own (unchanged) mtime,
# so `readiness.ts#isMarkerFresh`'s existing `MAX_SIGNATURE_AGE_MS` bound
# still ages a genuinely stuck/unverified cooldown out.
daily_check_verified() {
  printf '%s\n' "$1" | grep -Eq '^daily\.(cvd|cld) (is up to date|updated)'
}


# Extracts the ClamAV-VDB header's own version field -- the 3rd
# colon-delimited field of the first 512 bytes, the public, always-plaintext
# CVD/CLD header format libclamav/cvd.c itself parses -- directly from the
# on-disk signature file. No tool beyond the freshclam/clamd/clamdscan
# boundary this script already stubs in tests is required. A file that is
# missing or does not start with the documented header is never trusted as
# a real signature database (R8, round 3): readiness must never be
# published for a file whose identity cannot be confirmed.
cvd_version() {
  header=$(head -c 512 "$1" 2>/dev/null) || return 1
  case "$header" in
    ClamAV-VDB:*) ;;
    *) return 1 ;;
  esac
  version=$(printf '%s' "$header" | cut -d: -f3)
  [ -n "$version" ] || return 1
  printf '%s\n' "$version"
}

publish_marker_from_signatures() {
  # "1" only when this call's freshclam invocation affirmatively confirmed
  # the daily database against the remote version this round (R8, round 4);
  # empty/unset for the initial pre-clamd fetch or an unconfirmed exit 0.
  verified="${1:-}"
  reference_file=$(daily_reference_file)
  if [ -z "$reference_file" ]; then
    echo "No daily signature database found in $CLAMAV_DB_DIR; marking not ready" >&2
    rm -f "$READY_MARKER" "$READY_VERSION_FILE"
    return 1
  fi
  version=$(cvd_version "$reference_file") || {
    echo "$reference_file has no recognizable ClamAV-VDB header; marking not ready" >&2
    rm -f "$READY_MARKER" "$READY_VERSION_FILE"
    return 1
  }
  # Version file first: the gateway must never observe a fresh marker
  # mtime paired with a stale/missing expected-version file.
  printf '%s\n' "$version" > "$READY_VERSION_FILE"
  if [ "$verified" = "1" ]; then
    touch "$READY_MARKER"
  else
    touch -r "$reference_file" "$READY_MARKER"
  fi
  return 0
}

echo "Fetching ClamAV signatures..."
initial_freshclam_output=$(freshclam --stdout 2>&1)
printf '%s\n' "$initial_freshclam_output"

echo "Starting clamd..."
clamd --config-file=/etc/clamav/clamd.conf &
CLAMD_PID=$!

attempt=0
while [ "$attempt" -lt 60 ]; do
  if clamdscan --ping 1 --config-file=/etc/clamav/clamd.conf >/dev/null 2>&1; then
    initial_verified=""
    if daily_check_verified "$initial_freshclam_output"; then
      initial_verified=1
    fi
    publish_marker_from_signatures "$initial_verified" || echo "clamd is live but no signatures were found yet" >&2
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
    if refresh_output=$(freshclam --stdout 2>&1); then
      printf '%s\n' "$refresh_output"
      refresh_verified=""
      if daily_check_verified "$refresh_output"; then
        refresh_verified=1
      fi
      publish_marker_from_signatures "$refresh_verified" || true
    else
      printf '%s\n' "$refresh_output"
      echo "freshclam refresh failed; marking not ready" >&2
      rm -f "$READY_MARKER" "$READY_VERSION_FILE"
    fi
  done
) &
WATCHDOG_PID=$!
trap 'kill "$WATCHDOG_PID" 2>/dev/null || true' EXIT

wait "$CLAMD_PID"
