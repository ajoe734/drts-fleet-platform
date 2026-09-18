#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
tenant_repo="${TENANT_HUB_REPO_PATH:-${repo_root}/../tenant-commute-hub}"

if [[ ! -d "${tenant_repo}" ]]; then
  echo "tenant-commute-hub checkout not found at: ${tenant_repo}" >&2
  echo "Set TENANT_HUB_REPO_PATH to the external repo checkout." >&2
  exit 1
fi

if [[ ! -f "${tenant_repo}/package.json" ]]; then
  echo "tenant-commute-hub package.json not found at: ${tenant_repo}" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required for tenant-hub contract sync smoke." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required for tenant-hub contract sync smoke." >&2
  exit 1
fi

if ! git -C "${tenant_repo}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "tenant-commute-hub checkout is not a git worktree: ${tenant_repo}" >&2
  exit 1
fi

if ! git -C "${tenant_repo}" diff --quiet -- src/lib/drts-shim; then
  echo "tenant-commute-hub already has local drift in src/lib/drts-shim." >&2
  echo "Use a clean clone or clear the drift before running this smoke check." >&2
  echo >&2
  git -C "${tenant_repo}" diff --stat -- src/lib/drts-shim >&2
  exit 3
fi

echo "Running tenant-hub contract snapshot sync from: ${tenant_repo}"
(
  cd "${tenant_repo}"
  DRTS_CORE_REPO_PATH="${repo_root}" npm run sync:contracts
)

echo
echo "Reviewing generated snapshot drift..."
if git -C "${tenant_repo}" diff --quiet -- src/lib/drts-shim; then
  echo "No post-sync drift detected in src/lib/drts-shim."
else
  echo "Snapshot changed. Review and commit the following diff:"
  git -C "${tenant_repo}" diff --stat -- src/lib/drts-shim
  echo
  git -C "${tenant_repo}" --no-pager diff -- src/lib/drts-shim
  exit 2
fi
