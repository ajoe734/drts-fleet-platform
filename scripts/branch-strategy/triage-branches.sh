#!/usr/bin/env bash
# triage-branches.sh — inventory all remote branches and recommend an action
# per branch under the three-layer model. READ-ONLY by default. Writes a
# report to stdout and to .artifacts/branch-triage/<timestamp>.md.
#
# Actions emitted:
#   keep              long-lived branch that belongs in the new model
#   merge-into-track  branch with unmerged work — rebase/cherry-pick onto its track
#   delete-merged     short-lived branch already fully merged to main
#   delete-stale      no commit in 30+ days and not merged to main
#   review            ambiguous; needs human decision
#
# This script never mutates remote state. To act on its output, generate
# delete/rebase commands and review them before running.

set -euo pipefail

STALE_DAYS="${STALE_DAYS:-30}"
OUT_DIR=".artifacts/branch-triage"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$OUT_DIR/$STAMP.md"

git fetch origin --prune --quiet

now_epoch=$(date +%s)
stale_epoch=$(( now_epoch - STALE_DAYS * 86400 ))

# Keep set — branches that the v2 model needs.
keep_set='^(main|backend-dev|frontend-dev|backend-staging|frontend-staging)$'

# Track routing prefixes (mirrors .orchestrator/branch_routing.py defaults).
backend_re='^(be-|api-|sc-|obs-|evd-|fwd-|tch-|prt-|infra-)'
frontend_re='(^(ui-|ds-|drv-|pa-|pb-|sbk-|sys-|xs-|adm-ui-|ops-ui-|ten-ui-|tn-|adm-))|((^|/).*-ui-)'

{
  echo "# Branch triage report"
  echo ""
  echo "- Generated: $STAMP"
  echo "- Stale threshold: ${STALE_DAYS} days"
  echo ""
  echo "| Action | Branch | Last commit | Author | Track guess | Notes |"
  echo "|---|---|---|---|---|---|"
} > "$REPORT"

emit() { printf "| %s | \`%s\` | %s | %s | %s | %s |\n" "$1" "$2" "$3" "$4" "$5" "$6" >> "$REPORT"; }

while IFS=$'\t' read -r ref last_iso author; do
  branch="${ref#refs/remotes/origin/}"
  [[ "$branch" == "HEAD" ]] && continue

  # Categorise.
  if [[ "$branch" =~ $keep_set ]]; then
    emit "keep" "$branch" "$last_iso" "$author" "—" "long-lived per branch-strategy.md"
    continue
  fi

  if [[ "$branch" =~ ^merge/W ]]; then
    emit "review" "$branch" "$last_iso" "$author" "—" "legacy wave branch; per §9 freeze for history then delete"
    continue
  fi

  # Determine track from branch name suffix (case-insensitive on task-id-like part).
  short="${branch#*/}"   # strip first segment (codex/, claude/, feat/, etc.)
  lower="$(echo "$short" | tr '[:upper:]' '[:lower:]')"
  if [[ "$lower" =~ $frontend_re ]]; then
    track="frontend"
  elif [[ "$lower" =~ $backend_re ]]; then
    track="backend"
  else
    track="?"
  fi

  # Merged to main?
  if git merge-base --is-ancestor "origin/$branch" origin/main 2>/dev/null; then
    emit "delete-merged" "$branch" "$last_iso" "$author" "$track" "already in main"
    continue
  fi

  # Stale?
  last_epoch=$(date -d "$last_iso" +%s 2>/dev/null || echo 0)
  if (( last_epoch < stale_epoch )); then
    emit "delete-stale" "$branch" "$last_iso" "$author" "$track" "no commit in ${STALE_DAYS}+ days; not merged"
    continue
  fi

  # Active and unmerged — needs to flow into a track.
  if [[ "$track" == "?" ]]; then
    emit "review" "$branch" "$last_iso" "$author" "$track" "track ambiguous; assign manually"
  else
    emit "merge-into-track" "$branch" "$last_iso" "$author" "$track" "rebase onto ${track}-dev"
  fi
done < <(git for-each-ref --format='%(refname)%09%(committerdate:iso8601-strict)%09%(authorname)' refs/remotes/origin)

# Summary counts.
{
  echo ""
  echo "## Summary"
  echo ""
  for action in keep merge-into-track delete-merged delete-stale review; do
    n=$(grep -c "^| $action " "$REPORT" || true)
    echo "- **$action**: $n"
  done
} >> "$REPORT"

cat "$REPORT"
echo
echo "Report written to $REPORT"
