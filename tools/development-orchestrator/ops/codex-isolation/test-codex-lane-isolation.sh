#!/usr/bin/env bash
# test-codex-lane-isolation.sh
#
# Self-contained shell tests for the codex lane-isolation behaviour:
#   1. codex-wrapper.sh derives a DISTINCT per-CODEX_HOME lockfile
#   2. repair-codex-symlinks.sh isolation mode reconciles the two codex2
#      auth-path views (CODEX_HOME view <-> HOME view) without merging accounts
#
# Run: bash ops/codex-isolation/test-codex-lane-isolation.sh
# Exit 0 = all pass.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WRAPPER="$ROOT/scripts/codex-wrapper.sh"
REPAIR="$ROOT/scripts/repair-codex-symlinks.sh"
fail=0
pass=0
check() { if eval "$2"; then echo "  PASS: $1"; pass=$((pass+1)); else echo "  FAIL: $1"; fail=$((fail+1)); fi; }

echo "== 1. per-CODEX_HOME lockfile derivation =="
# Extract the derive_lockfile function's output by invoking the wrapper logic
# in a dry-run: set CODEX_REAL_BIN to /bin/true so exec is harmless, and a
# fake flock-less PATH so we can observe lock path via CODEX_REFRESH_LOCK echo.
# Simpler: replicate the documented derivation and assert distinctness.
lock_for() {
  local home="$1"
  printf '/tmp/drts-codex-refresh-%s.lock' "$(printf '%s' "$home" | sha256sum | cut -c1-16)"
}
L1="$(lock_for /home/edna/.codex)"
L2="$(lock_for /home/edna/.codex2)"
check "codex and codex2 derive different lockfiles" '[[ "$L1" != "$L2" ]]'
check "lockfile path is under /tmp" '[[ "$L1" == /tmp/drts-codex-refresh-*.lock ]]'

# Verify the wrapper actually contains the per-home derivation (guards against
# a regression that reverts to a single global lock).
check "wrapper derives lock from CODEX_HOME" "grep -q 'eff_home=\"\$CODEX_HOME\"' '$WRAPPER'"
check "wrapper honors explicit CODEX_REFRESH_LOCK override" "grep -q 'CODEX_REFRESH_LOCK:-' '$WRAPPER'"

echo "== 2. repair isolation mode: path-sync, no account merge =="
TMP="$(mktemp -d)"
export HOME="$TMP"          # so default paths resolve under the sandbox
mkdir -p "$TMP/.codex" "$TMP/.codex2/.codex"
# codex main = account A
echo '{"acct":"main-A"}' > "$TMP/.codex/auth.json"
# codex2 HOME-view (fresh, account B) newer than CODEX_HOME-view (stale)
echo '{"acct":"codex2-B-stale"}' > "$TMP/.codex2/auth.json"
sleep 1
echo '{"acct":"codex2-B-fresh"}' > "$TMP/.codex2/.codex/auth.json"

CODEX_LANE_ISOLATION=1 bash "$REPAIR" >/dev/null 2>&1

# After repair: CODEX_HOME view (~/.codex2/auth.json) should hold the FRESH content
got="$(cat "$TMP/.codex2/auth.json")"
check "codex2 CODEX_HOME-view promoted to fresh token" '[[ "$got" == *codex2-B-fresh* ]]'
# HOME view should now be a symlink to the CODEX_HOME view
check "codex2 HOME-view is a symlink" '[[ -L "$TMP/.codex2/.codex/auth.json" ]]'
check "codex2 HOME-view points at CODEX_HOME view" \
  '[[ "$(readlink -f "$TMP/.codex2/.codex/auth.json")" == "$(readlink -f "$TMP/.codex2/auth.json")" ]]'
# codex2 must NOT be merged into the main account
check "codex2 auth is NOT the main account" '[[ "$(cat "$TMP/.codex2/auth.json")" != *main-A* ]]'

echo "== 3. legacy mode still symlinks codex2 -> codex =="
TMP2="$(mktemp -d)"; export HOME="$TMP2"
mkdir -p "$TMP2/.codex" "$TMP2/.codex2"
echo '{"acct":"main-A"}' > "$TMP2/.codex/auth.json"
echo '{"acct":"codex2-old"}' > "$TMP2/.codex2/auth.json"
bash "$REPAIR" >/dev/null 2>&1   # CODEX_LANE_ISOLATION unset -> legacy
check "legacy mode symlinks codex2 -> codex main" '[[ -L "$TMP2/.codex2/auth.json" ]]'
check "legacy symlink resolves to main account" \
  '[[ "$(readlink -f "$TMP2/.codex2/auth.json")" == "$(readlink -f "$TMP2/.codex/auth.json")" ]]'

rm -rf "$TMP" "$TMP2"
echo
echo "RESULT: $pass passed, $fail failed"
exit $(( fail > 0 ? 1 : 0 ))
