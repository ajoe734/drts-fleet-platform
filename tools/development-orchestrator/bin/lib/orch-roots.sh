# Where machine truth lives, for shell that may be running out of a release
# worktree. Sourced, never executed.
#
# A DRTS process has two roots. The code it runs comes from the pinned release;
# state.json, ai-status.json and the logs live in the canonical root and must be
# read there whatever branch that tree is on. Deriving the second from the first
# is what breaks when the code moves: dashboard_server.py defaults its repo root
# to Path(__file__).parents[3], so serving it from a release would have served
# that worktree's ai-status.json, which does not exist.
#
# This is the same rule health.py applies in Python, and install-common.sh
# sources this file rather than keeping a second copy of it.

orch_canonical_root() {
  local from="$1" common
  if [[ -n "${ORCH_STATUS_ROOT:-}" ]]; then
    echo "$ORCH_STATUS_ROOT"
    return 0
  fi
  if [[ -n "${AI_STATUS_ROOT:-}" ]]; then
    echo "$AI_STATUS_ROOT"
    return 0
  fi
  # The common git dir is shared by every worktree and sits in the main
  # checkout, so it names the canonical root from anywhere inside the repo.
  common="$(git -C "$from" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [[ -n "$common" && "$(basename "$common")" == ".git" ]]; then
    dirname "$common"
  else
    echo "$from"
  fi
}
