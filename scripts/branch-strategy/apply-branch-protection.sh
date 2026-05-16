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
  local reviews="$2"
  local checks_json="$3"
  local payload
  payload=$(cat <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": $checks_json
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": $reviews,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
EOF
  )
  if [[ $APPLY -eq 1 ]]; then
    echo "  [apply] $branch"
    echo "$payload" | gh api -X PUT "repos/$REPO/branches/$branch/protection" --input - >/dev/null
  else
    echo "  [plan] $branch  reviews=$reviews  checks=$checks_json"
  fi
}

# Per docs/ops/branch-strategy.md §6.
apply_protection "main"                          2 '["ci-publish"]'
apply_protection "backend-dev-publish"           1 '["ci-publish"]'
apply_protection "frontend-dev-publish"          1 '["ci-publish"]'
apply_protection "merge/backend-dev-into-main"   1 '["ci-integ"]'
apply_protection "merge/frontend-dev-into-main"  1 '["ci-integ"]'

echo
echo "Done."
[[ $APPLY -eq 0 ]] && echo "Re-run with --apply to call the API."
