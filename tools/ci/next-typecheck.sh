#!/usr/bin/env bash
set -euo pipefail

# Next route types can go stale after branch/worktree switches because `next typegen`
# rewrites current routes but does not remove old generated files.
rm -rf .next/types .next/dev/types

pnpm exec next typegen
pnpm exec tsc --noEmit "$@"
