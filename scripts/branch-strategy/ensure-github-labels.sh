#!/usr/bin/env bash
# ensure-github-labels.sh — provision the static GitHub labels used by the
# branch-strategy workflows.
#
# DRY-RUN BY DEFAULT. Pass --apply to create or update the labels.
#
# Usage:
#   scripts/branch-strategy/ensure-github-labels.sh
#   scripts/branch-strategy/ensure-github-labels.sh --apply
#   scripts/branch-strategy/ensure-github-labels.sh --apply --repo owner/repo
#
# Requires: gh CLI authenticated with permission to manage labels on the repo.

set -euo pipefail

APPLY=0
REPO="${REPO:-${GITHUB_REPOSITORY:-ajoe734/drts-fleet-platform}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

LABELS=(
  "automated|6f42c1|created by an automated workflow"
  "auto-publish|cfd3d7|auto-promotion PR from publish to main"
  "promotion|0e8a16|auto-generated promotion PR"
  "branch-strategy|1d76db|branch-strategy housekeeping"
  "hotfix-drift|e11d21|main ahead of *-publish; missed back-port"
)

repo_args=()
if [[ -n "$REPO" ]]; then
  repo_args=(--repo "$REPO")
fi

echo "==> Mode: $([ "$APPLY" -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo "==> Repo: ${REPO:-<gh default>}"
echo

for spec in "${LABELS[@]}"; do
  IFS='|' read -r name color description <<<"$spec"
  if [[ "$APPLY" -eq 1 ]]; then
    echo "  [apply] $name"
    gh label create "$name" \
      "${repo_args[@]}" \
      --color "$color" \
      --description "$description" \
      --force >/dev/null
  else
    echo "  [plan] $name  color=$color  desc=$description"
  fi
done

echo
echo "Done."
if [[ "$APPLY" -eq 0 ]]; then
  echo "Re-run with --apply to call the API."
fi
