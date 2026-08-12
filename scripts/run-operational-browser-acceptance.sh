#!/usr/bin/env bash
set -euo pipefail

# Runs the candidate-bound Playwright gate.  A local git ref is deliberately
# not accepted: release evidence must name the immutable object deployed.
MANIFEST_PATH="${MANIFEST_PATH:-tests/e2e/fixtures/candidate-journey-manifest.json}"
CANDIDATE_SHA="${DRTS_CANDIDATE_SHA:-}"
DRY_RUN=false

usage() {
  echo "Usage: $0 --sha <40-hex-sha> [--manifest <path>] [--dry-run]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sha) CANDIDATE_SHA="${2:-}"; shift 2 ;;
    --manifest) MANIFEST_PATH="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
done

[[ -f "$MANIFEST_PATH" ]] || { echo "::error::manifest not found: $MANIFEST_PATH" >&2; exit 1; }
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "::error::--sha (or DRTS_CANDIDATE_SHA) must be a full lowercase Git SHA; mutable refs are forbidden." >&2
  exit 1
}

MATERIALIZED_MANIFEST="$(mktemp "${TMPDIR:-/tmp}/drts-candidate-manifest.XXXXXX.json")"
trap 'rm -f "$MATERIALIZED_MANIFEST"' EXIT
sed "s/__DRTS_CANDIDATE_SHA__/${CANDIDATE_SHA}/g" "$MANIFEST_PATH" > "$MATERIALIZED_MANIFEST"

node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const isSha = value => typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
const validSurface = (surface, retired) => surface && typeof surface.id === "string" &&
  typeof surface.urlEnv === "string" && surface.urlEnv.startsWith("DRTS_OPERATIONAL_") &&
  typeof surface.path === "string" && typeof surface.expectedStatus === "number" &&
  (retired || (surface.expectedStatus === 200 && (surface.kind === "api" || surface.kind === "web")));
if (manifest.schemaVersion !== 1 || manifest.taskId !== "S1F-REL-001-PREDEPLOY" ||
    !isSha(manifest.candidateSha) || manifest.responseHeader !== "x-drts-candidate-sha" ||
    !Array.isArray(manifest.activeSurfaces) || !Array.isArray(manifest.retiredSurfaces) ||
    !manifest.activeSurfaces.every(surface => validSurface(surface, false)) ||
    !manifest.retiredSurfaces.every(surface => validSurface(surface, true))) process.exit(1);
' "$MATERIALIZED_MANIFEST" || { echo "::error::manifest violates operational Playwright schema" >&2; exit 1; }

echo "Operational candidate: ${CANDIDATE_SHA}"
echo "Materialized manifest: ${MATERIALIZED_MANIFEST}"
if "$DRY_RUN"; then
  echo "Manifest is valid. Dry run intentionally executes no assertions."
  exit 0
fi

DRTS_OPERATIONAL_MANIFEST="$MATERIALIZED_MANIFEST" \
  pnpm exec playwright test -c playwright.operational-candidate.config.ts --reporter=list
