#!/usr/bin/env bash
# apply-branch-protection.sh — set branch-protection rules on the long-lived
# branches per docs/ops/branch-strategy.md §6.
#
# DRY-RUN BY DEFAULT. Pass --apply to actually call the GitHub API.
#
# Usage:
#   scripts/branch-strategy/apply-branch-protection.sh           # dry-run
#   scripts/branch-strategy/apply-branch-protection.sh --apply   # do it
#
# Requires: gh CLI authenticated with admin permissions on the repo.

set -euo pipefail

APPLY=0
REPO="${REPO:-ajoe734/drts-fleet-platform}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

echo "==> Mode: $([ $APPLY -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo "==> Repo: $REPO"
echo

apply_protection() {
  local branch="$1"
  # v3: identical protection on main + *-dev:
  #   - 0 approvals (CI is the gate)
  #   - 3 required checks: Commit trailers, Runtime mirror guard, Smoke acceptance
  #   - linear history, no force-push, no delete
  #   - PR-only (handled by GitHub when contexts are set + no direct-push bypass)
  local payload
  payload=$(cat <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Commit trailers", "Runtime mirror guard", "Smoke acceptance"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "require_code_owner_reviews": false,
    "dismiss_stale_reviews": false
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": false
}
EOF
  )
  if [[ $APPLY -eq 1 ]]; then
    echo "  [apply] $branch"
    echo "$payload" | gh api -X PUT "repos/$REPO/branches/$branch/protection" --input - >/dev/null
  else
    echo "  [plan] $branch  reviews=0  checks=[Commit trailers, Runtime mirror guard, Smoke acceptance]"
  fi
}

# Per docs/ops/branch-strategy.md §6 (v4 nightly-publish / hourly-promote model).
apply_protection "main"
apply_protection "dev"

echo
echo "Done."
[[ $APPLY -eq 0 ]] && echo "Re-run with --apply to call the API."
