# SR-DEV-HEALTHCHECK-IDENTITY-20260915 — Dev Health Check Identity Authentication & Healthz Remediation

- **Task ID**: `SR-DEV-HEALTHCHECK-IDENTITY-20260915`
- **Owner**: `Gemini`
- **Reviewer**: `Claude2`
- **Wave / Phase**: `system-remediation-20260906`
- **Base**: `dev`
- **Execution Branch**: `gemini/sr-dev-healthcheck-identity-20260915`
- **Candidate Lifecycle Version**: 1

---

## 1. Context & Problem Statement

In DRTS dev environment deployment (`.github/workflows/deploy-dev.yml`), the post-deploy job `Dev health check` validates all deployed Cloud Run services in the `Verify dev endpoints` step before proceeding to `retired-service-cleanup` and `operational-candidate-acceptance`.

### 1.1 Root Cause Diagnosis

As audited following deploy run `34681171586` (deployed SHA `69e31e793489202c612c5f46dbc801099b5cf5c0`, project `drts-dev-devcc-20260825`, region `us-central1`):

1. **Private vs. Public Service Asymmetry**:
   Per the B9 security architecture and `GCP-TOS-REMEDIATION-20260707` (`commit 70355aba9`), services that handle sensitive enterprise/tenant/banking data (`tenant_console`, `bank_console`, and `enterprise_dispatch`) are deployed with `--no-allow-unauthenticated`. Their default exposure is fail-closed (`DEV_*_ALLOW_UNAUTHENTICATED` defaults to `false`). Public endpoints (`api`, `platform_admin`, `ops_console`, `fleet_partner_portal`, `channel_partner_portal`, and `referral_embed`) remain accessible without Google IAM credentials.
2. **Anonymous Probes Failing on Private Cloud Run Services**:
   The `Verify dev endpoints` step utilized an anonymous `curl_ready` probe against the root path of all 9 services. While public services returned HTTP 200, Google Frontend (GFE) rejected anonymous requests to `tenant_console`, `bank_console`, and `enterprise_dispatch` with **HTTP 403 Forbidden**.
3. **Pipeline Stoppage**:
   Because `curl` failed with exit code 22 (`403 Forbidden`), the `Dev health check` job failed. Consequently, subsequent downstream jobs `retired-service-cleanup` and `operational-candidate-acceptance` were skipped, preventing candidate SHA verification and locking candidate release.
4. **Historical `/healthz` 404 Issue**:
   During initial diagnostic attempts, requests to `/healthz` returned HTTP 404 because neither `apps/tenant-console-web` nor `apps/enterprise-dispatch-web` defined a `/healthz` route handler, leading to confusion over valid health endpoints.

---

## 2. Non-Negotiable Guardrails & Policy Constraints

The following constraints are strictly upheld:

1. **NO Relaxation of Service Exposure**:
   Under no circumstances may any private service (`tenant_console`, `bank_console`, `enterprise_dispatch`) be flipped to `--allow-unauthenticated`. The default in `deploy-dev.yml` remains `false`.
2. **NO Relaxation of Realm Ingress Rules**:
   Application-level session boundaries, middleware authorization rules, and cross-realm ingress protections remain intact.
3. **NO Reduction of Probe Rigor**:
   `curl` probes must continue to enforce `--fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 3 --max-time 30`. Probes must not ignore non-2xx HTTP status codes or mask errors.

---

## 3. Remediation Architecture

### 3.1 Authenticated Health Check Probing (`curl_ready_auth` & WIF Auth Actions)

In `.github/workflows/deploy-dev.yml`, dedicated steps mint Google Cloud identity tokens via `google-github-actions/auth@v2` for each private Cloud Run service audience before invoking `Verify dev endpoints`:

```yaml
- name: Mint Tenant Console ID token
  id: auth_tenant_console
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ env.DEV_WIF_PROVIDER || env.WIF_PROVIDER }}
    service_account: ${{ env.DEV_WIF_SERVICE_ACCOUNT || env.WIF_SERVICE_ACCOUNT }}
    token_format: id_token
    id_token_audience: ${{ steps.urls.outputs.tenant_console }}
    id_token_include_email: true

- name: Mint Bank Console ID token
  id: auth_bank_console
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ env.DEV_WIF_PROVIDER || env.WIF_PROVIDER }}
    service_account: ${{ env.DEV_WIF_SERVICE_ACCOUNT || env.WIF_SERVICE_ACCOUNT }}
    token_format: id_token
    id_token_audience: ${{ steps.urls.outputs.bank_console }}
    id_token_include_email: true

- name: Mint Enterprise Dispatch ID token
  id: auth_enterprise_dispatch
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ env.DEV_WIF_PROVIDER || env.WIF_PROVIDER }}
    service_account: ${{ env.DEV_WIF_SERVICE_ACCOUNT || env.WIF_SERVICE_ACCOUNT }}
    token_format: id_token
    id_token_audience: ${{ steps.urls.outputs.enterprise_dispatch }}
    id_token_include_email: true
```

The minted identity tokens are supplied to `Verify dev endpoints` via environment variables (`TENANT_CONSOLE_ID_TOKEN`, `BANK_CONSOLE_ID_TOKEN`, `ENTERPRISE_DISPATCH_ID_TOKEN`), and consumed by `curl_ready_auth`:

```bash
curl_ready_auth() {
  local target_url="$1"
  shift
  local id_token=""
  case "$target_url" in
    *"${{ steps.urls.outputs.tenant_console }}"*)
      id_token="${TENANT_CONSOLE_ID_TOKEN:-}"
      ;;
    *"${{ steps.urls.outputs.bank_console }}"*)
      id_token="${BANK_CONSOLE_ID_TOKEN:-}"
      ;;
    *"${{ steps.urls.outputs.enterprise_dispatch }}"*)
      id_token="${ENTERPRISE_DISPATCH_ID_TOKEN:-}"
      ;;
  esac
  if [[ -z "${id_token}" ]]; then
    echo "::error::Failed to obtain identity token for target ${target_url}" >&2
    return 1
  fi
  curl --fail --silent --show-error --location-trusted \
    --retry 10 --retry-all-errors --retry-delay 3 --max-time 30 \
    --header "Authorization: Bearer ${id_token}" \
    "$target_url" "$@"
}
```

Key features of this design:
- **Native GitHub Actions WIF Token Minting**: Directly leverages `google-github-actions/auth@v2` with `token_format: id_token` and `id_token_audience: <url>`, which reliably exchanges GitHub OIDC tokens for Google identity tokens without depending on external account gcloud CLI plugins or ad-hoc curl scripts.
- **Strict Error Handling**: Any failure in minting or resolving an identity token fails closed.
- **Log Masking**: Managed automatically by `google-github-actions/auth@v2`.
- **`--location-trusted` Redirect Support**: Ensures the `Authorization: Bearer <id_token>` header is preserved across HTTP redirects (e.g. from `/` to `/login` within the private Cloud Run service).

### 3.2 Resolution of `/healthz` 404 & Root Path Strategy

Per specification ("處理 /healthz 404（補真健康路由或帶身分打根路徑，擇一並說明）"):

Both aspects were resolved in an integrated manner:

1. **Authentic Health Route Implementation**:
   - Added `apps/tenant-console-web/app/healthz/route.ts` returning `{ status: "ok", service: "tenant-console-web" }`.
   - Added `apps/enterprise-dispatch-web/app/healthz/route.ts` returning `{ status: "ok", service: "enterprise-dispatch-web" }`.
   - Added `apps/bank-console-web/app/healthz/route.ts` returning `{ status: "ok", service: "bank-console-web" }`.
   - Updated `apps/tenant-console-web/lib/auth/constants.ts` to include `HEALTHCHECK_PATH = "/healthz"` within `PUBLIC_AUTH_PATHS`, allowing health checks to be served directly without tenant session redirects.
2. **Dual Verification in `deploy-dev.yml`**:
   - Probing the **root path `/`** is retained for all services because it exercises the real user-facing SSR rendering pipeline and middleware execution (verifying that the web app actually compiles and serves HTML).
   - Probing the **dedicated `/healthz` route** is added to verify that the application process is healthy without triggering full page renders.
   - For private services, both probes use `curl_ready_auth` with the identity token.

---

## 4. Artifacts & Code Changes

1. `.github/workflows/deploy-dev.yml`:
   - Updated `Verify dev endpoints` step with `curl_ready_auth`, token minting, and audience resolution.
   - Private services (`tenant_console`, `bank_console`, `enterprise_dispatch`) probed with identity token.
   - Explicit `/healthz` probes added for `tenant_console` and `enterprise_dispatch`.
   - Preserved anonymous probing for public endpoints (`api`, `platform_admin`, `ops_console`, `fleet_partner_portal`, `channel_partner_portal`, `referral_embed`).
2. `apps/tenant-console-web/app/healthz/route.ts`:
   - New standard Next.js App Router route handler.
3. `apps/tenant-console-web/lib/auth/constants.ts`:
   - Added `HEALTHCHECK_PATH` to `PUBLIC_AUTH_PATHS`.
4. `apps/tenant-console-web/tests/unit/middleware.test.ts`:
   - Added unit test asserting `/healthz` is permitted without session cookie.
5. `apps/enterprise-dispatch-web/app/healthz/route.ts`:
   - New standard Next.js App Router route handler.
6. `apps/bank-console-web/app/healthz/route.ts`:
   - New standard Next.js App Router route handler.
7. `tests/unit/system-remediation/sr-dev-healthcheck-identity-20260915/healthcheck-identity.test.ts`:
   - Comprehensive vitest regression suite testing workflow syntax, security flags, route handlers, and middleware public path exports.
8. `docs/04-uat/system-remediation-20260906/SR-DEV-HEALTHCHECK-IDENTITY-20260915.md`:
   - Canonical documentation of the remediation.

---

## 5. Verification Evidence

### 5.1 Local Automated Verification

- **Task Unit Test Suite**:
  `pnpm vitest run tests/unit/system-remediation/sr-dev-healthcheck-identity-20260915/healthcheck-identity.test.ts`
  Result: 6 tests passed (100% pass).
- **Tenant Middleware Unit Tests**:
  `pnpm --filter @drts/tenant-console-web exec vitest run tests/unit/middleware.test.ts`
  Result: 11 tests passed (100% pass).
- **Deployment Architecture Guard Tests**:
  `pnpm vitest run tests/unit/deployment-architecture-guards.test.ts tests/unit/cloud-run-deploy-retry.test.ts tests/unit/dev-active-surface-contract.test.ts`
  Result: 19 tests passed (100% pass).
- **TypeScript Static Verification**:
  `tsc --noEmit` on `@drts/tenant-console-web`, `@drts/enterprise-dispatch-web`, and `@drts/bank-console-web` completed with 0 errors.
- **CI Test Coverage Gate**:
  `python3 tools/ci/check_test_coverage.py`
  Result: `check_test_coverage: all 74 test files yield tests CI runs.`
