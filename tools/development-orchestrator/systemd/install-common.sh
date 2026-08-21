# Shared by the DRTS unit installers. Sourced, never executed.
#
# A unit has two roots and they are not the same root. Machine truth --
# state.json, ai-status.json, the logs -- lives in the canonical root and must
# be read there whatever branch it is on. The code a unit runs must not: the
# canonical root is a working tree the orchestrator checks branches out of, so
# a unit pointed at it runs whatever happens to be checked out. On 2026-08-19 a
# fix merged to dev did not reach the running health probe, because the root
# was sitting on a docs branch seven commits behind.
#
# The supervisor was pinned to .artifacts/releases/active for this reason. The
# other three units were not. They are now, by the same rule, resolved here
# once rather than restated in each installer.

# The canonical-root rule is shared with the runtime scripts; keeping a second
# copy here is the fault this repository keeps finding in itself.
# shellcheck source=../bin/lib/orch-roots.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../bin/lib" && pwd)/orch-roots.sh"

orch_release_name() {
  # The name of the release a directory *is*, resolved physically. Deriving it
  # with a plain basename names it after whatever path was typed, so running an
  # installer through the `active` pointer asked the lifecycle tool to activate
  # a release called "active" and it refused, correctly, saying that no such
  # release exists. The pointer is the normal way to name the current release,
  # so the installers have to cope with being reached through it.
  basename "$(cd "$1" && pwd -P)"
}

orch_require_release() {
  # A unit pointed at a release that is not there fails on every fire with a
  # bare exec error. Refusing here says which pointer is missing and how to
  # create it.
  if [[ ! -d "$1" ]]; then
    echo "ERROR: no active release at $1" >&2
    echo "       run: tools/development-orchestrator/bin/release-lifecycle.py activate <release>" >&2
    return 1
  fi
}

orch_render_unit() {
  # Extra KEY=VALUE pairs after the four roots substitute @KEY@. A value that
  # appears in more than one unit -- the dashboard port is in three places
  # across two files -- then has one source instead of three that can drift.
  local src="$1" dst="$2" repo_root="$3" release_root="$4"
  shift 4
  if [[ ! -f "$src" ]]; then
    echo "ERROR: template missing at $src" >&2
    return 1
  fi
  local expr=(-e "s|%h|$HOME|g"
              -e "s|@REPO_ROOT@|$repo_root|g"
              -e "s|@RELEASE_ROOT@|$release_root|g")
  local pair
  for pair in "$@"; do
    expr+=(-e "s|@${pair%%=*}@|${pair#*=}|g")
  done
  sed "${expr[@]}" "$src" > "$dst"
  chmod 0644 "$dst"
  echo "Installed: $dst"
}
