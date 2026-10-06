#!/usr/bin/env bash
# Reproduce the enterprise Dockerfile build-stage inputs without Docker/servers.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
source_sha=$(git rev-parse "${1:-HEAD}^{commit}")
# A supervisor may recreate its isolated worker worktree between dispatches.
# Allow evidence to live in the canonical checkout's .local/ directory instead.
evidence_dir=${DRTS_BUILD_EVIDENCE_DIR:-"$repo_root/.local/ci-build-cross-app-import"}
mkdir -p "$evidence_dir"
context_dir=$(mktemp -d "$evidence_dir/context.XXXXXX")
echo "Source: $source_sha"
echo "Context (retained for inspection): $context_dir"

git archive "$source_sha" -- \
  package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json \
  packages apps/enterprise-dispatch-web | tar -x -C "$context_dir"
cd "$context_dir"
test "$(find apps -mindepth 1 -maxdepth 1 -type d | wc -l)" -eq 1
test ! -e apps/tenant-console-web
export CI=1 HUSKY=0 NEXT_TELEMETRY_DISABLED=1 DRTS_CANDIDATE_SHA="$source_sha"
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @drts/contracts build
pnpm --filter @drts/ui-tokens build
pnpm --filter @drts/ui-web build
pnpm --filter @drts/enterprise-dispatch-web build
