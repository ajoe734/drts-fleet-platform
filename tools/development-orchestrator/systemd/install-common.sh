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

orch_canonical_root() {
  # Where machine truth lives, resolved the way health.py resolves it: the
  # common git dir, so running an installer from a release worktree still
  # points the units at the real root instead of at the worktree.
  local from="$1" common
  common="$(git -C "$from" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [[ -n "$common" && "$(basename "$common")" == ".git" ]]; then
    dirname "$common"
  else
    echo "$from"
  fi
}

orch_release_root() {
  echo "$1/.artifacts/releases/active"
}

orch_require_release() {
  # A unit pointed at a release that is not there fails on every fire with a
  # bare exec error. Refusing here says which pointer is missing and how to
  # create it.
  if [[ ! -d "$1" ]]; then
    echo "ERROR: no active release at $1" >&2
    echo "       run: tools/development-orchestrator/bin/release-lifecycle.py activate --pointer-name active <release>" >&2
    return 1
  fi
}

orch_render_unit() {
  local src="$1" dst="$2" repo_root="$3" release_root="$4"
  if [[ ! -f "$src" ]]; then
    echo "ERROR: template missing at $src" >&2
    return 1
  fi
  sed -e "s|%h|$HOME|g" \
      -e "s|@REPO_ROOT@|$repo_root|g" \
      -e "s|@RELEASE_ROOT@|$release_root|g" "$src" > "$dst"
  chmod 0644 "$dst"
  echo "Installed: $dst"
}
