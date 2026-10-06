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
# R8(a) (round 5): "prefer .cld whenever it exists" over-corrected again.
# libclamav/readdb.c#cli_loaddbdir (clamav-1.4.6, lines 5179-5199) loads
# whichever of daily.cvd/daily.cld carries the HIGHER ClamAV-VDB header
# version; libclamav/cvd.c#cli_cvdload (lines 634-654) independently
# rejects loading a duplicate/older version. A .cld only wins on an EQUAL
# version against its sibling .cvd (the documented incremental-patch
# case) -- a freshly downloaded full .cvd that is NEWER than a stale,
# previously-loaded .cld is a supported case clamd actually loads, and
# mtime never enters clamd's own selection rule at all. Selection is by
# each file's own parsed header version, never by mtime or extension
# preference alone.
daily_reference_file() {
  cvd_file="$CLAMAV_DB_DIR/daily.cvd"
  cld_file="$CLAMAV_DB_DIR/daily.cld"
  have_cvd=0
  have_cld=0
  [ -f "$cvd_file" ] && have_cvd=1
  [ -f "$cld_file" ] && have_cld=1
  if [ "$have_cvd" = 1 ] && [ "$have_cld" = 1 ]; then
    cvd_ver=$(cvd_version "$cvd_file" 2>/dev/null) || cvd_ver=
    cld_ver=$(cvd_version "$cld_file" 2>/dev/null) || cld_ver=
    if [ -n "$cvd_ver" ] && [ -n "$cld_ver" ]; then
      # Equal versions: the .cld (incremental patch) wins, matching
      # cli_loaddbdir's documented tie rule. Otherwise the strictly
      # higher-version file wins, regardless of which extension it is.
      if [ "$cvd_ver" -gt "$cld_ver" ]; then
        printf '%s\n' "$cvd_file"
      else
        printf '%s\n' "$cld_file"
      fi
      return
    fi
    # One file's header could not be parsed/validated here -- prefer
    # whichever one actually has a readable version so a corrupt sibling
    # cannot hide a genuinely loadable database.
    if [ -n "$cld_ver" ]; then
      printf '%s\n' "$cld_file"
      return
    fi
    if [ -n "$cvd_ver" ]; then
      printf '%s\n' "$cvd_file"
      return
    fi
    # Neither header is readable; fall through to the .cld default so the
    # caller's own header check reports a clear "not recognizable" failure.
    printf '%s\n' "$cld_file"
    return
  fi
  if [ "$have_cld" = 1 ]; then
    printf '%s\n' "$cld_file"
    return
  fi
  if [ "$have_cvd" = 1 ]; then
    printf '%s\n' "$cvd_file"
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
# `MAX_SIGNATURE_AGE_MS` would stay permanently not-ready. Only a confirmed
# outcome naming the daily database is allowed to advance the marker to
# wall-clock "now" without a file rewrite; an unconfirmed exit 0 still
# falls back to the file's own (unchanged) mtime, so
# `readiness.ts#isMarkerFresh`'s existing `MAX_SIGNATURE_AGE_MS` bound
# still ages a genuinely stuck/unverified cooldown out.
#
# R8(b) (round 5): the prior match text ('^daily\.(cvd|cld) (is up to date|
# updated)') was invented, not the real freshclam wording, and so could
# never match genuine freshclam output. libfreshclam/libfreshclam_internal.c
# (clamav-1.4.6) actually logs, verbatim: `check_for_new_database_version`'s
# up-to-date branch (lines 2191-2196) emits
# "<local filename> database is up-to-date (version: N, sigs: N, f-level: N,
# builder: NAME)"; `updatedb` (lines 2519-2520) emits, on a genuine update,
# "<new local filename> updated (version: N, sigs: N, f-level: N,
# builder: NAME)". The up-to-date line includes the word "database" and a
# hyphenated "up-to-date"; the updated line has neither "database" nor a
# hyphen. Both lines name the actual local/new filename, so the match must
# also be bound to the SAME file `daily_reference_file()` selected this
# round (round 5's R8(a) fix) and its own parsed header version -- a
# verified confirmation naming a stale, non-selected sibling file must
# never be accepted as proof the selected database is current.
daily_check_verified() {
  output="$1"
  expected_name="$2"
  expected_version="$3"
  [ -n "$expected_name" ] && [ -n "$expected_version" ] || return 1
  name_pattern=$(printf '%s' "$expected_name" | sed 's/\./\\./g')
  printf '%s\n' "$output" | grep -Eq "^${name_pattern} (database is up-to-date|updated) \\(version: ${expected_version}[,)]"
}


# Extracts the ClamAV-VDB header's own version field -- the 3rd
# colon-delimited field of the first 512 bytes, the public, always-plaintext
# CVD/CLD header format libclamav/cvd.c itself parses -- directly from the
# on-disk signature file. No tool beyond the freshclam/clamd/clamdscan
# boundary this script already stubs in tests is required. A file that is
# missing or does not start with the documented header, or whose version
# field is not the plain integer libclamav itself requires, is never
# trusted as a real signature database (R8, round 3/5): readiness must
# never be published for a file whose identity cannot be confirmed, and
# an unvalidated version string must never reach a numeric comparison
# (R8(a), round 5) or a freshness regex (R8(b), round 5) unescaped.
cvd_version() {
  header=$(head -c 512 "$1" 2>/dev/null) || return 1
  case "$header" in
    ClamAV-VDB:*) ;;
    *) return 1 ;;
  esac
  version=$(printf '%s' "$header" | cut -d: -f3)
  case "$version" in
    '' | *[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$version"
}

# Resolves the selected daily reference file and its version once per
# freshclam invocation, checks whether THIS invocation's output
# affirmatively confirmed THAT SAME file/version (R8(b), round 5's fix
# boundary: bind the confirmation to the selected identity, not just any
# daily.cvd/daily.cld mention), and publishes the marker/version file
# accordingly. Returns non-zero (without publishing) when no recognizable
# daily database is on disk at all.
refresh_daily_readiness() {
  freshclam_output="$1"
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
  verified=""
  if daily_check_verified "$freshclam_output" "$(basename "$reference_file")" "$version"; then
    verified=1
  fi
  publish_marker_from_signatures "$verified" "$reference_file" "$version"
}

publish_marker_from_signatures() {
  # "1" only when this call's freshclam invocation affirmatively confirmed
  # the SELECTED daily database's own filename and version this round
  # (R8(b), round 4/5); empty/unset for the initial pre-clamd fetch or an
  # unconfirmed exit 0. $2/$3 are the reference file and version already
  # resolved by refresh_daily_readiness, so publication always uses the
  # exact same identity the verification check was bound to.
  verified="${1:-}"
  reference_file="$2"
  version="$3"
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
    refresh_daily_readiness "$initial_freshclam_output" || echo "clamd is live but no signatures were found yet" >&2
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
      refresh_daily_readiness "$refresh_output" || true
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
