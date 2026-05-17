#!/usr/bin/env bash
# bootstrap-branches.sh — create the four long-lived branches for the
# v2 AI-native dev/staging/prod model. Idempotent: skips any branch that
# already exists on the remote.
#
# DRY-RUN BY DEFAULT. Pass --apply to actually push.
#
# Usage:
#   scripts/branch-strategy/bootstrap-branches.sh             # dry-run
#   scripts/branch-strategy/bootstrap-branches.sh --apply     # do it
#   scripts/branch-strategy/bootstrap-branches.sh --apply --base origin/main
#
# Requires: git, gh (for verification), origin remote pointing at the repo.

set -euo pipefail

APPLY=0
BASE_REF="origin/main"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --base) BASE_REF="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

BRANCHES=(
  "backend-dev"
  "frontend-dev"
  "backend-staging"
  "frontend-staging"
)

echo "==> Mode: $([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo "==> Base: $BASE_REF"
echo

echo "Fetching origin..."
git fetch origin --quiet

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "ERROR: base ref $BASE_REF not found locally. Try: git fetch origin main" >&2
  exit 1
fi

BASE_SHA="$(git rev-parse "$BASE_REF")"
echo "Base SHA: $BASE_SHA"
echo

for branch in "${BRANCHES[@]}"; do
  if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    existing_sha=$(git ls-remote --heads origin "$branch" | awk '{print $1}')
    echo "  [skip] $branch already exists on origin at $existing_sha"
    continue
  fi
  if [[ $APPLY -eq 1 ]]; then
    echo "  [push] $branch <- $BASE_SHA"
    git push origin "$BASE_SHA:refs/heads/$branch"
  else
    echo "  [plan] would push $branch from $BASE_SHA"
  fi
done

echo
echo "Done."
[[ $APPLY -eq 0 ]] && echo "Re-run with --apply to actually push."
