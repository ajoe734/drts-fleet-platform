#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

export ISOLATED_RESTORE_DB="${ISOLATED_RESTORE_DB:-drts_fleet_platform_isolated_proof}"
export CANDIDATE_SHA="${CANDIDATE_SHA:-$(git -C "${ROOT_DIR}" rev-parse HEAD)}"

MODE="${1:-all}"

node "${SCRIPT_DIR}/run-ops-proof.mjs" "$MODE"
