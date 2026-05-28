#!/usr/bin/env bash
# E2E-009 — Production deploy rail dry-run
#
# Workflow family: WF-PROD-001
#
# This scenario is intentionally NOT a live API or live GCP test. The production
# rail is operator-triggered and side-effecting (Cloud Run deploy, Cloud SQL
# migration, Secret Manager mounts), so the "E2E-009" role is to verify that
# the rail honours the documented contract before anyone dispatches the
# workflow.
#
# Phases mirror the four operator-facing stages of `deploy-prod.yml`:
#
#   1. validate-config — tag shape + required GitHub config are enforced
#   2. build-push      — all four service images are built and pushed
#   3. deploy dry-run  — Cloud Run services + IAP/ingress contract are wired
#   4. rollback by tag — same workflow accepts an older prod tag with
#                        `skip_migration=true` and serialises via the
#                        `deploy-prod` concurrency group
#
# Mode selection:
#
#   - FULL  mode is detected when `deploy-prod.yml` contains the full
#     prepare → build-push → migrate → deploy → health-check job graph from
#     PROD-RAIL-001. Every phase is asserted.
#   - SKELETON mode is detected when only the validate-config skeleton is
#     present (the pre-merge state on `dev`). The script asserts the minimum
#     contract from `docs/ops/branch-strategy.md` §7 and reports the missing
#     full-rail jobs as EXTERNAL-GATED rather than failing — this lets the
#     test live on `dev` ahead of the PROD-RAIL-001 merge.
#
# Pass criteria:
#   - The workflow file exists and parses as valid YAML.
#   - Tag input regex accepts `prod/v<YYYY.MM.DD>.<N>` and rejects a
#     deliberately malformed tag.
#   - All required PROD_* variables and secrets are referenced from the
#     workflow exactly as documented in the runbook.
#   - Concurrency is serialised on `deploy-prod` and never auto-cancels.
#   - `skip_migration=true` exists as a workflow input so rollback can reuse
#     the same rail without re-running migrations.
#   - In FULL mode, build-push references all four service Dockerfiles and
#     deploy targets the documented Cloud Run services with internal ingress.
#
# Cross-ref:
#   - docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md (operator path)
#   - docs/ops/branch-strategy.md §7 (rail contract)
#   - .github/workflows/deploy-prod.yml (workflow under test)
#
# Notes:
#   - This scenario does not source `lib/helpers.sh` because it has no HTTP
#     surface; helpers assume an `E2E_API_URL` reachable backend.
#   - The script never executes `gcloud` or contacts a remote. All checks are
#     static against the YAML + runbook in the working tree.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

SCENARIO="E2E-009"

# ── Colours ───────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'; MAGENTA='\033[0;35m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''; MAGENTA=''
fi

log_info()    { echo -e "${CYAN}[INFO]${RESET}   $*"; }
log_ok()      { echo -e "${GREEN}[PASS]${RESET}   $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${RESET}   $*"; }
log_fail()    { echo -e "${RED}[FAIL]${RESET}   $*" >&2; }
log_step()    { echo -e "\n${BOLD}──── $* ────${RESET}"; }
log_phase()   { echo -e "\n${MAGENTA}◆ PHASE: $* ◆${RESET}"; }

# Run-scoped evidence file (cooperates with run-e2e.sh when set).
_E2E_RUN_ID="${E2E_RUN_ID:-$$}"
EVIDENCE_FILE="${E2E_EVIDENCE_FILE:-/tmp/drts-e2e-evidence-${_E2E_RUN_ID}.log}"
save_evidence() {
  # save_evidence SCENARIO PHASE KEY VALUE
  local scenario="$1" phase="$2" key="$3" value="$4"
  printf '%s\t%s\t%s\t%s\n' "$scenario" "$phase" "$key" "$value" >> "$EVIDENCE_FILE"
}

WORKFLOW_FILE="${REPO_ROOT}/.github/workflows/deploy-prod.yml"
RUNBOOK_FILE="${REPO_ROOT}/docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md"
BRANCH_STRATEGY_FILE="${REPO_ROOT}/docs/ops/branch-strategy.md"

FAIL_COUNT=0
fail() {
  log_fail "$*"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

echo -e "\n${BOLD}════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  E2E-009 — Production deploy rail dry-run${RESET}"
echo -e "${BOLD}  Workflow under test: ${WORKFLOW_FILE#${REPO_ROOT}/}${RESET}"
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"

# ── Preflight ─────────────────────────────────────────────────────────────────
log_step "Preflight — workflow + runbook artifacts"

if [[ ! -f "$WORKFLOW_FILE" ]]; then
  fail "Missing workflow file: ${WORKFLOW_FILE}"
  exit 1
fi
log_ok "Workflow file present: ${WORKFLOW_FILE#${REPO_ROOT}/}"
save_evidence "$SCENARIO" "preflight" "workflowFile" "${WORKFLOW_FILE#${REPO_ROOT}/}"

if [[ ! -f "$BRANCH_STRATEGY_FILE" ]]; then
  fail "Missing branch-strategy doc: ${BRANCH_STRATEGY_FILE}"
fi

# Yaml parse — prefer python3 with PyYAML; degrade gracefully when absent.
HAS_PYYAML=false
if command -v python3 >/dev/null 2>&1 && python3 -c "import yaml" >/dev/null 2>&1; then
  HAS_PYYAML=true
  if ! python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1], encoding='utf-8'))" "$WORKFLOW_FILE" >/dev/null 2>&1; then
    fail "deploy-prod.yml is not valid YAML"
    exit 1
  fi
  log_ok "deploy-prod.yml parses as valid YAML"
  save_evidence "$SCENARIO" "preflight" "yamlValid" "true"
else
  log_warn "python3 + PyYAML not available; structural YAML checks degraded to grep"
  save_evidence "$SCENARIO" "preflight" "yamlValid" "skipped-no-pyyaml"
fi

# ── Mode detection: FULL (PROD-RAIL-001 merged) vs SKELETON (pre-merge) ──────
MODE="SKELETON"
if grep -qE "^[[:space:]]+build-push:" "$WORKFLOW_FILE" \
  && grep -qE "^[[:space:]]+deploy:" "$WORKFLOW_FILE" \
  && grep -qE "^[[:space:]]+health-check:" "$WORKFLOW_FILE"; then
  MODE="FULL"
fi
log_info "Rail contract mode: ${MODE}"
save_evidence "$SCENARIO" "preflight" "mode" "$MODE"

# ── PHASE 1 — validate-config ─────────────────────────────────────────────────
log_phase "1/4 validate-config"

log_step "1.1 — workflow_dispatch with tag + skip_migration inputs"
if ! grep -qE "^[[:space:]]+workflow_dispatch:" "$WORKFLOW_FILE"; then
  fail "Workflow is not manually-dispatched (workflow_dispatch missing)."
else
  log_ok "workflow_dispatch trigger present"
fi
if ! grep -qE "^[[:space:]]+tag:" "$WORKFLOW_FILE"; then
  fail "Workflow does not declare a 'tag' input."
else
  log_ok "Required 'tag' input declared"
  save_evidence "$SCENARIO" "validate-config" "tagInput" "present"
fi
if ! grep -qE "^[[:space:]]+skip_migration:" "$WORKFLOW_FILE"; then
  fail "Workflow does not declare 'skip_migration' input — rollback rail requires it."
else
  log_ok "skip_migration input declared (needed for tagged rollback without re-migration)"
  save_evidence "$SCENARIO" "validate-config" "skipMigrationInput" "present"
fi

log_step "1.2 — tag regex enforcement"
# Use the same regex the workflow enforces.
TAG_REGEX='^prod/v[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]+$'
GOOD_TAG="prod/v2026.05.18.0"
BAD_TAG="prod-2026-05-18"
if ! [[ "$GOOD_TAG" =~ $TAG_REGEX ]]; then
  fail "Documented good tag '${GOOD_TAG}' fails the tag regex (regex drift)."
else
  log_ok "Tag regex accepts canonical prod/v<date>.<N>: ${GOOD_TAG}"
  save_evidence "$SCENARIO" "validate-config" "tagRegexAccepts" "$GOOD_TAG"
fi
if [[ "$BAD_TAG" =~ $TAG_REGEX ]]; then
  fail "Tag regex incorrectly accepts malformed '${BAD_TAG}'."
else
  log_ok "Tag regex rejects malformed tag: ${BAD_TAG}"
  save_evidence "$SCENARIO" "validate-config" "tagRegexRejects" "$BAD_TAG"
fi
# Workflow must encode the same regex literal.
if ! grep -qE 'prod/v\[0-9\]\{4\}\\\.\[0-9\]\{2\}\\\.\[0-9\]\{2\}\\\.\[0-9\]\+' "$WORKFLOW_FILE"; then
  fail "Workflow body does not contain the prod/v<date>.<N> regex literal."
else
  log_ok "Workflow body enforces prod/v<date>.<N> tag regex"
fi

log_step "1.3 — required PROD_* variables and secrets are wired"
REQUIRED_VARS=(
  "PROD_GCP_PROJECT_ID"
  "PROD_GCP_REGION"
  "PROD_GCP_CLOUDSQL_INSTANCE"
  "PROD_GCP_RUNTIME_SERVICE_ACCOUNT"
)
REQUIRED_SECRETS=(
  "PROD_WIF_PROVIDER"
  "PROD_WIF_SERVICE_ACCOUNT"
)
FULL_MODE_REQUIRED_VARS=(
  "PROD_CONTROL_PLANE_API_ORIGIN"
  "PROD_PLATFORM_ADMIN_ORIGIN"
  "PROD_OPS_CONSOLE_ORIGIN"
  "PROD_IAP_CLIENT_ID"
)
for v in "${REQUIRED_VARS[@]}"; do
  if ! grep -q "vars.${v}" "$WORKFLOW_FILE"; then
    fail "Required variable not referenced in workflow: vars.${v}"
  else
    log_ok "vars.${v} referenced"
  fi
done
for s in "${REQUIRED_SECRETS[@]}"; do
  if ! grep -q "secrets.${s}" "$WORKFLOW_FILE"; then
    fail "Required secret not referenced in workflow: secrets.${s}"
  else
    log_ok "secrets.${s} referenced"
  fi
done
if [[ "$MODE" == "FULL" ]]; then
  for v in "${FULL_MODE_REQUIRED_VARS[@]}"; do
    if ! grep -q "vars.${v}" "$WORKFLOW_FILE"; then
      fail "[FULL] Required IAP/origin variable not referenced: vars.${v}"
    else
      log_ok "vars.${v} referenced"
    fi
  done
else
  log_warn "[SKELETON] IAP / control-plane origin variables not asserted (gated on PROD-RAIL-001 merge to dev)."
fi

log_step "1.4 — concurrency: deploy-prod, no cancel-in-progress"
if ! grep -qE "^[[:space:]]*group:[[:space:]]*deploy-prod" "$WORKFLOW_FILE"; then
  fail "concurrency.group is not 'deploy-prod' — production runs must serialise."
else
  log_ok "concurrency.group=deploy-prod"
fi
if ! grep -qE "cancel-in-progress:[[:space:]]*false" "$WORKFLOW_FILE"; then
  fail "concurrency.cancel-in-progress must be 'false' to protect in-flight migrations."
else
  log_ok "cancel-in-progress=false (in-flight migrations are not auto-cancelled)"
  save_evidence "$SCENARIO" "validate-config" "concurrencySerialised" "true"
fi

log_step "1.5 — production GitHub environment binding"
if ! grep -qE "^[[:space:]]+name:[[:space:]]*production" "$WORKFLOW_FILE"; then
  fail "Workflow does not bind to the 'production' GitHub environment (required for reviewer gate)."
else
  log_ok "Workflow binds to environment: production"
  save_evidence "$SCENARIO" "validate-config" "productionEnvironment" "bound"
fi

log_step "1.6 — id-token write permission for Workload Identity Federation"
if ! grep -qE "id-token:[[:space:]]*write" "$WORKFLOW_FILE"; then
  fail "Workflow does not grant id-token: write — WIF auth will fail at runtime."
else
  log_ok "id-token: write granted (WIF auth viable)"
fi

if [[ "$MODE" == "FULL" ]]; then
  log_step "1.7 — runtime ≠ deployer identity guard (FULL mode)"
  if ! grep -qE 'runtime_sa.*==.*deployer_sa|deployer_sa.*==.*runtime_sa' "$WORKFLOW_FILE"; then
    fail "[FULL] prepare job does not enforce runtime_sa ≠ deployer_sa."
  else
    log_ok "Runtime/deployer identity separation enforced in prepare"
    save_evidence "$SCENARIO" "validate-config" "identitySeparation" "enforced"
  fi
fi

# ── PHASE 2 — build-push ──────────────────────────────────────────────────────
log_phase "2/4 build-push"

if [[ "$MODE" != "FULL" ]]; then
  log_warn "[SKELETON] build-push job is not yet present on this branch."
  log_warn "[SKELETON] Reporting EXTERNAL-GATED on PROD-RAIL-001 merge to dev."
  save_evidence "$SCENARIO" "build-push" "status" "EXTERNAL-GATED-skeleton"
else
  log_step "2.1 — build-push job declared and depends on prepare"
  if ! grep -qE "^[[:space:]]+build-push:" "$WORKFLOW_FILE"; then
    fail "[FULL] build-push job missing."
  else
    log_ok "build-push job present"
  fi
  if ! grep -qE "needs:[[:space:]]*prepare|needs:[[:space:]]*\[[^]]*prepare" "$WORKFLOW_FILE"; then
    fail "[FULL] build-push must declare 'needs: prepare' (or include it in needs list)."
  else
    log_ok "build-push needs: prepare"
  fi

  log_step "2.2 — all four service Dockerfiles are pushed"
  REQUIRED_DOCKERFILES=(
    "apps/api/Dockerfile"
    "Dockerfile.migrate"
    "apps/platform-admin-web/Dockerfile"
    "apps/ops-console-web/Dockerfile"
  )
  for df in "${REQUIRED_DOCKERFILES[@]}"; do
    if ! grep -qF "$df" "$WORKFLOW_FILE"; then
      fail "[FULL] build-push does not reference Dockerfile: ${df}"
    else
      log_ok "Dockerfile referenced: ${df}"
      save_evidence "$SCENARIO" "build-push" "dockerfile" "${df}"
    fi
  done

  log_step "2.3 — images tagged with both git-sha tag and 'latest'"
  if ! grep -q ":latest" "$WORKFLOW_FILE"; then
    fail "[FULL] build-push does not publish a ':latest' tag for any service."
  else
    log_ok "build-push publishes ':latest' tag aliases"
  fi
fi

# ── PHASE 3 — deploy dry-run ──────────────────────────────────────────────────
log_phase "3/4 deploy dry-run"

if [[ "$MODE" != "FULL" ]]; then
  log_warn "[SKELETON] deploy job is not yet present on this branch."
  log_warn "[SKELETON] Reporting EXTERNAL-GATED on PROD-RAIL-001 merge to dev."
  save_evidence "$SCENARIO" "deploy" "status" "EXTERNAL-GATED-skeleton"
else
  log_step "3.1 — deploy job declared and gated on migrate result"
  if ! grep -qE "^[[:space:]]+deploy:" "$WORKFLOW_FILE"; then
    fail "[FULL] deploy job missing."
  else
    log_ok "deploy job present"
  fi
  if ! grep -qE "needs:[[:space:]]*\[[^]]*build-push" "$WORKFLOW_FILE"; then
    fail "[FULL] deploy must declare 'needs:' including build-push."
  else
    log_ok "deploy depends on build-push"
  fi
  if ! grep -qE "needs\.migrate\.result.*(success|skipped)" "$WORKFLOW_FILE"; then
    fail "[FULL] deploy does not gate on migrate result success-or-skipped."
  else
    log_ok "deploy honours migrate success-or-skipped (rollback can bypass migrate)"
    save_evidence "$SCENARIO" "deploy" "migrateGate" "success-or-skipped"
  fi

  log_step "3.2 — Cloud Run service names match runbook"
  EXPECTED_SERVICES=(
    "drts-api"
    "drts-platform-admin-web"
    "drts-ops-console-web"
    "drts-migrate"
  )
  for svc in "${EXPECTED_SERVICES[@]}"; do
    if ! grep -q "$svc" "$WORKFLOW_FILE"; then
      fail "[FULL] Expected Cloud Run name not present in workflow defaults: ${svc}"
    else
      log_ok "Cloud Run default name referenced: ${svc}"
    fi
  done

  log_step "3.3 — internal ingress on all three web/api services"
  INGRESS_LINES=$(grep -c -- "--ingress internal-and-cloud-load-balancing" "$WORKFLOW_FILE" || true)
  if [[ "$INGRESS_LINES" -lt 3 ]]; then
    fail "[FULL] Expected internal-and-cloud-load-balancing on 3 services, found ${INGRESS_LINES}."
  else
    log_ok "All 3 Cloud Run services configured with internal-and-cloud-load-balancing ingress"
    save_evidence "$SCENARIO" "deploy" "internalIngressCount" "$INGRESS_LINES"
  fi

  log_step "3.4 — Cloud SQL bound for api + migrate"
  CLOUDSQL_LINES=$(grep -c -- "--set-cloudsql-instances" "$WORKFLOW_FILE" || true)
  if [[ "$CLOUDSQL_LINES" -lt 2 ]]; then
    fail "[FULL] Cloud SQL must be bound to api deploy and migrate job (found ${CLOUDSQL_LINES} occurrences)."
  else
    log_ok "Cloud SQL bound to ${CLOUDSQL_LINES} Cloud Run targets"
  fi

  log_step "3.5 — IAP health-check job mints id_token and probes the three origins"
  if ! grep -q "token_format: id_token" "$WORKFLOW_FILE"; then
    fail "[FULL] health-check does not mint a Google ID token (required to call IAP)."
  else
    log_ok "health-check mints id_token via google-github-actions/auth@v2"
  fi
  for origin_var in "CONTROL_PLANE_API_ORIGIN" "PLATFORM_ADMIN_ORIGIN" "OPS_CONSOLE_ORIGIN"; do
    if ! grep -q "$origin_var" "$WORKFLOW_FILE"; then
      fail "[FULL] health-check does not probe ${origin_var}."
    else
      log_ok "health-check probes ${origin_var}"
    fi
  done
fi

# ── PHASE 4 — rollback by tag ─────────────────────────────────────────────────
log_phase "4/4 rollback by tag"

log_step "4.1 — rollback uses the same workflow_dispatch entry"
# The contract: rollback is dispatching deploy-prod.yml again with an older
# prod/v<date> tag, optionally with skip_migration=true. There is no separate
# rollback workflow file.
if [[ -f "${REPO_ROOT}/.github/workflows/rollback-prod.yml" ]]; then
  fail "Separate rollback workflow detected; production rollback must reuse deploy-prod.yml (single rail)."
else
  log_ok "No separate rollback workflow — rollback reuses deploy-prod.yml (single rail)"
  save_evidence "$SCENARIO" "rollback" "rail" "same-as-deploy-prod"
fi

log_step "4.2 — same tag regex accepts an older prod tag"
OLD_TAG="prod/v2026.05.17.0"
if ! [[ "$OLD_TAG" =~ $TAG_REGEX ]]; then
  fail "Tag regex rejects historical tag ${OLD_TAG} — rollback cannot select it."
else
  log_ok "Tag regex accepts historical prod tag for rollback: ${OLD_TAG}"
  save_evidence "$SCENARIO" "rollback" "historicalTagAccepted" "$OLD_TAG"
fi

log_step "4.3 — skip_migration=true is a supported rollback option"
# skip_migration input was asserted in 1.1; here we additionally require that
# the workflow actually gates the migrate job on it.
if [[ "$MODE" == "FULL" ]]; then
  if ! grep -qE "inputs\.skip_migration[[:space:]]*!=[[:space:]]*['\"]true['\"]" "$WORKFLOW_FILE"; then
    fail "[FULL] migrate job does not gate on inputs.skip_migration != 'true'."
  else
    log_ok "migrate job skipped when skip_migration=true (rollback can bypass schema motion)"
    save_evidence "$SCENARIO" "rollback" "skipMigrationGate" "honoured"
  fi
else
  log_warn "[SKELETON] migrate gating not asserted; gated on PROD-RAIL-001 merge."
fi

log_step "4.4 — runbook documents the rollback path"
if [[ ! -f "$RUNBOOK_FILE" ]]; then
  if [[ "$MODE" == "FULL" ]]; then
    fail "[FULL] runbook missing: docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md"
  else
    log_warn "[SKELETON] runbook missing (lands with PROD-RAIL-001); skipping runbook assertions."
  fi
else
  for needle in "Rollback Procedure" "skip_migration=true" "prod/v"; do
    if ! grep -q "$needle" "$RUNBOOK_FILE"; then
      fail "Runbook does not document '${needle}'."
    else
      log_ok "Runbook documents: ${needle}"
    fi
  done
  for stop_needle in "Stop Conditions" "schema"; do
    if ! grep -qi "$stop_needle" "$RUNBOOK_FILE"; then
      fail "Runbook does not document a stop condition mentioning '${stop_needle}'."
    else
      log_ok "Runbook documents stop condition: ${stop_needle}"
    fi
  done
  save_evidence "$SCENARIO" "rollback" "runbook" "documented"
fi

log_step "4.5 — branch-strategy §7 names the production rail and rollback contract"
if [[ -f "$BRANCH_STRATEGY_FILE" ]]; then
  # Either the full title ("Production deploy rail") or the pre-merge skeleton
  # variant ("Production deploy (skeleton)") is acceptable as long as the
  # section exists somewhere in §7.
  if ! grep -qE "^## 7\. Production deploy" "$BRANCH_STRATEGY_FILE"; then
    fail "branch-strategy.md does not declare a §7 Production deploy section."
  else
    SECTION_LINE=$(grep -nE "^## 7\. Production deploy" "$BRANCH_STRATEGY_FILE" | head -1 | cut -d: -f2-)
    log_ok "branch-strategy.md §7 present: ${SECTION_LINE}"
  fi
  if grep -qE "prod/v<date>|prod/v\[0-9\]|Rollback uses the same rail" "$BRANCH_STRATEGY_FILE"; then
    log_ok "branch-strategy.md describes tag-based rollback via the same rail"
  else
    if [[ "$MODE" == "FULL" ]]; then
      fail "[FULL] branch-strategy.md does not describe tag-based rollback on the same rail."
    else
      log_warn "[SKELETON] branch-strategy.md does not yet describe tag-based rollback; lands with PROD-RAIL-001."
    fi
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}════════════════════════════════════════════════════════${RESET}"
if [[ "$FAIL_COUNT" -eq 0 ]]; then
  if [[ "$MODE" == "FULL" ]]; then
    echo -e "${GREEN}${BOLD}E2E-009 PASS — production rail honours the documented contract.${RESET}"
  else
    echo -e "${GREEN}${BOLD}E2E-009 PASS (SKELETON) — minimum contract honoured.${RESET}"
    echo -e "${YELLOW}Full-rail assertions remain EXTERNAL-GATED until PROD-RAIL-001 merges to dev.${RESET}"
  fi
  save_evidence "$SCENARIO" "result" "verdict" "PASS"
  save_evidence "$SCENARIO" "result" "mode" "$MODE"
  exit 0
else
  echo -e "${RED}${BOLD}E2E-009 FAIL — ${FAIL_COUNT} assertion(s) failed.${RESET}"
  save_evidence "$SCENARIO" "result" "verdict" "FAIL"
  save_evidence "$SCENARIO" "result" "failureCount" "$FAIL_COUNT"
  exit 1
fi
