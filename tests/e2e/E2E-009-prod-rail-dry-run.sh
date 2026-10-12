#!/usr/bin/env bash
# E2E-009 — Production rail dry-run
#
# This is an offline governance E2E. It checks workflow/runbook wiring and runs
# the actual production plan, preflight and command-builder regressions with
# external cloud boundaries stubbed. It does not deploy or start product servers.
#
# Flow under test:
#   validate-config -> build-push contract -> deploy dry-run contract -> rollback by tag
#
# Cross-ref:
#   - .github/workflows/deploy-prod.yml
#   - .github/workflows/deploy-staging.yml
#   - docs/ops/branch-strategy.md §7-§8
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=lib/helpers.sh
source "${SCRIPT_DIR}/lib/helpers.sh"

SCENARIO="E2E-009"
WORKFLOW_PROD="${REPO_ROOT}/.github/workflows/deploy-prod.yml"
WORKFLOW_STAGING="${REPO_ROOT}/.github/workflows/deploy-staging.yml"
RAIL="${REPO_ROOT}/operations/verification/production-release-rail/rail.cjs"
BRANCH_STRATEGY="${REPO_ROOT}/docs/ops/branch-strategy.md"

chain_init

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-009 — Production rail dry-run${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

require_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    log_fail "Required file missing: $file"
    exit 1
  fi
}

assert_contains() {
  local file="$1"
  local needle="$2"
  local label="$3"
  if ! grep -Fq "$needle" "$file"; then
    log_fail "${label} missing from ${file}: ${needle}"
    exit 1
  fi
  log_ok "${label}"
}

save_check() {
  local surface="$1"
  local key="$2"
  local value="$3"
  chain_set "$surface" "$key" "$value"
  save_evidence "$SCENARIO" "$surface" "$key" "$value"
}

require_file "$WORKFLOW_PROD"
require_file "$WORKFLOW_STAGING"
require_file "$RAIL"
require_file "$BRANCH_STRATEGY"

log_surface "validate-config — production workflow gate"

assert_contains "$WORKFLOW_PROD" "validate-config:" "validate-config job exists"
assert_contains "$WORKFLOW_PROD" "name: production" "production environment gate is declared"
assert_contains "$WORKFLOW_PROD" "^prod/v[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}\\.[0-9]+$" "prod tag regex is enforced"
assert_contains "$WORKFLOW_PROD" 'git fetch --no-tags origin "refs/tags/${RELEASE_TAG}"' "explicit remote tag fetch is present"
assert_contains "$WORKFLOW_PROD" "FETCH_HEAD^{commit}" "tag is resolved to immutable commit"
assert_contains "$WORKFLOW_PROD" "vars.PROD_GCP_PROJECT_ID" "PROD_GCP_PROJECT_ID config gate is present"
assert_contains "$WORKFLOW_PROD" "vars.PROD_GCP_REGION" "PROD_GCP_REGION config gate is present"
assert_contains "$RAIL" "PROD_GCP_CLOUDSQL_INSTANCE" "PROD_GCP_CLOUDSQL_INSTANCE config gate is present"
assert_contains "$RAIL" "PROD_GCP_RUNTIME_SERVICE_ACCOUNT" "PROD_GCP_RUNTIME_SERVICE_ACCOUNT config gate is present"
assert_contains "$WORKFLOW_PROD" "secrets.PROD_WIF_SERVICE_ACCOUNT" "PROD_WIF_SERVICE_ACCOUNT config gate is present"
assert_contains "$WORKFLOW_PROD" "secrets.PROD_WIF_PROVIDER" "PROD_WIF_PROVIDER config gate is present"
assert_contains "$RAIL" "PROD_ARTIFACT_REGISTRY" "PROD_ARTIFACT_REGISTRY config gate is present"
assert_contains "$WORKFLOW_PROD" 'registry_host: ${{ steps.plan.outputs.registry_host }}' "preflight exports frozen registry host"
assert_contains "$WORKFLOW_PROD" 'REGISTRY_HOST: ${{ needs.validate-config.outputs.registry_host }}' "build receives the validated registry host"
assert_contains "$WORKFLOW_PROD" 'gcloud auth configure-docker "$REGISTRY_HOST" --quiet' "docker auth uses derived registry host"
assert_contains "$RAIL" "PROD_GCP_MIGRATION_JOB" "PROD_GCP_MIGRATION_JOB override is wired"

assert_contains "$WORKFLOW_PROD" 'PROD_VARIABLES_JSON: ${{ toJSON(vars) }}' "all production variables reach the plan builder"
assert_contains "$WORKFLOW_PROD" 'buildPlan(JSON.parse(process.env.PROD_VARIABLES_JSON)' "actual builder validates configuration before build"
# Execute the existing production-function regressions; the read-only external
# cloud boundary is stubbed, while strict validators/factories remain real.
# The suite checks all ten service overrides, immutable arguments, public entry,
# durable providers, and missing/partial configuration before rollout.
(cd "$REPO_ROOT" && pnpm exec vitest run tests/unit/sr-prod-full-surface-rail-20261012/production-rail.test.ts)

save_check "validate_config" "status" "pass"
save_check "validate_config" "mode" "workflow_wiring_and_offline_production_functions"

log_surface "build-push — prod rail real implementation"

assert_contains "$WORKFLOW_STAGING" "build-push:" "staging build-push source job exists"
assert_contains "$WORKFLOW_STAGING" "Build & push — api" "staging api image build exists"
assert_contains "$WORKFLOW_STAGING" "Build & push — migrate" "staging migrate image build exists"
assert_contains "$WORKFLOW_STAGING" "Build & push — platform-admin-web" "staging platform-admin-web image build exists"
assert_contains "$WORKFLOW_STAGING" "Build & push — ops-console-web" "staging ops-console-web image build exists"
# PROD-RAIL-001 upgrade: deploy-prod.yml has real build-push job (no longer skeleton)
assert_contains "$WORKFLOW_PROD" "build-push:" "prod build-push job exists (non-skeleton)"
assert_contains "$WORKFLOW_PROD" "docker/build-push-action" "prod uses docker/build-push-action"

save_check "build_push" "status" "pass"
save_check "build_push" "mode" "real_implementation"

log_surface "deploy dry-run — workflow dispatch + real deploy graph"

assert_contains "$WORKFLOW_PROD" "workflow_dispatch:" "prod workflow is manually dispatchable"
assert_contains "$WORKFLOW_PROD" "concurrency:" "prod workflow serialises deployment runs"
assert_contains "$WORKFLOW_PROD" "group: deploy-prod" "prod concurrency group is fixed"
# PROD-RAIL-001 upgrade: real deploy / migrate / health-check jobs (not placeholder text)
assert_contains "$WORKFLOW_PROD" "migrate:" "prod migrate job exists (non-skeleton)"
assert_contains "$WORKFLOW_PROD" "deploy:" "prod deploy job exists (non-skeleton)"
assert_contains "$WORKFLOW_PROD" "health-check:" "prod health-check job exists (non-skeleton)"
assert_contains "$BRANCH_STRATEGY" "gh workflow run deploy-prod.yml -f tag=prod/v2026.05.18.0" "branch strategy documents deploy command"

save_check "deploy_dry_run" "status" "pass"
save_check "deploy_dry_run" "mode" "real_workflow_dispatch_contract"

log_surface "rollback by tag — operator command path"

assert_contains "$BRANCH_STRATEGY" "# Redeploy yesterday's prod tag (rollback)" "rollback heading is documented"
assert_contains "$BRANCH_STRATEGY" "gh workflow run deploy-prod.yml -f tag=prod/v2026.05.17.0" "rollback by tag command is documented"
assert_contains "$BRANCH_STRATEGY" "operator runs \`gh workflow run deploy-prod.yml -f tag=prod/v<date>\`" "operator-driven prod tag deploy is documented"

save_check "rollback" "status" "pass"
save_check "rollback" "mode" "tag_redeploy_contract"

log_step "Chain continuity assertions"
assert_chain "validate_config" "status"
assert_chain "build_push" "status"
assert_chain "deploy_dry_run" "status"
assert_chain "rollback" "status"

print_chain_summary

echo ""
log_warn "E2E-009 is an offline dry-run of workflow wiring and actual production functions. Live deployment, public IAM/OAuth policy, provider/storage/scanner evidence and protected production approval remain separate requirements."
log_ok "E2E-009 complete — production rail dry-run contract checks passed."
echo -e "Evidence log: ${EVIDENCE_FILE}"
