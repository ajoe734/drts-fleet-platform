#!/usr/bin/env bash
set -euo pipefail

# Ensure PATH includes Android SDK tools and Maestro CLI binaries
export ANDROID_HOME="${ANDROID_HOME:-/home/edna/Android/Sdk}"
export PATH="${HOME}/.antigravity2-home/.maestro/bin:${HOME}/.maestro/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"

FLOW_FILE="${1:-apps/driver-app/e2e/sos-offline-replay.yaml}"

if ! command -v maestro &>/dev/null; then
  echo "Error: maestro CLI not found in PATH." >&2
  exit 1
fi

echo "Running Maestro E2E test: ${FLOW_FILE}..."
maestro test "${FLOW_FILE}"
