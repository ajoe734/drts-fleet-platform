# SR-DEV-HEALTHCHECK-IDENTITY-20260915 — Dev Health Check Identity Authentication & Healthz Remediation

- **Task ID**: `SR-DEV-HEALTHCHECK-IDENTITY-20260915`
- **Owner**: `Gemini2`
- **Reviewer**: `Claude2`
- **Wave / Phase**: `system-remediation-20260906`
- **Base**: `dev`
- **Execution Branch**: `gemini2/sr-dev-healthcheck-identity-20260915`
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

### 3.1 Authenticated Health Check Probing (`curl_ready_auth`)

In `.github/workflows/deploy-dev.yml`, an authenticated probe function `curl_ready_auth` is introduced for private Cloud Run services:

```bash
declare -A ID_TOKENS=()

get_identity_token() {
  local audience="$1"
  if [[ -n "${ID_TOKENS[$audience]:-}" ]]; then
    printf '%s' "${ID_TOKENS[$audience]}"
    return 0
  fi

  local token=""
  # Attempt 1: gcloud auth print-identity-token (standard SDK path)
  token="$(gcloud auth print-identity-token --audiences="${audience}" 2>/dev/null || true)"

  # Attempt 2: IAM credentials API generateIdToken via WIF access token
  if [[ -z "${token}" ]]; then
    local sa="${DEV_WIF_SERVICE_ACCOUNT:-${WIF_SERVICE_ACCOUNT:-}}"
    if [[ -z "${sa}" ]]; then
      sa="$(gcloud config get-value account 2>/dev/null || true)"
    fi
    if [[ -n "${sa}" ]]; then
      local access_token
      access_token="$(gcloud auth print-access-token 2>/dev/null || true)"
      if [[ -n "${access_token}" ]]; then
        local resp
        resp="$(curl --silent --show-error --fail \
          --request POST \
          --header "Authorization: Bearer ${access_token}" \
          --header "Content-Type: application/json" \
          "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${sa}:generateIdToken" \
          --data "{\"audience\": \"${audience}\", \"includeEmail\": true}" 2>/dev/null || true)"
        token="$(echo "${resp}" | python3 -c "import sys, json; print(json.load(sys.stdin).get('token', ''))" 2>/dev/null || true)"
      fi
    fi
  fi

  if [[ -z "${token}" ]]; then
    echo "::error::Failed to obtain identity token for audience ${audience}" >&2
    return 1
  fi

  echo "::add-mask::${token}"
  ID_TOKENS["$audience"]="$token"
  printf '%s' "${token}"
  return 0
}

curl_ready_auth() {
  local target_url="$1"
  shift
  local audience="$(echo "$target_url" | sed -E 's#^(https?://[^/]+).*#\1#')"
  local id_token
  id_token="$(get_identity_token "$audience")"
  curl --fail --silent --show-error --location-trusted \
    --retry 10 --retry-all-errors --retry-delay 3 --max-time 30 \
    --header "Authorization: Bearer ${id_token}" \
    "$target_url" "$@"
}
```

Key features of this design:
- **Audience Derivation**: Extracts the Cloud Run origin (`https://<service-url>`), which matches Cloud Run's expected OIDC audience claim.
- **Dual Identity Token Acquisition**: Attempts native `gcloud auth print-identity-token --audiences` first, falling back to Google Cloud IAM Credentials REST API (`generateIdToken`) using the active WIF access token.
- **Log Masking**: Automatically registers tokens with GitHub Actions secret masking (`::add-mask::`).
- **In-Memory Caching**: Caches minted identity tokens by audience in `ID_TOKENS`, preventing redundant network calls across multiple probes to the same service.
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

---

## 6. Follow-On Fix: Identity Token Minting Still Failed After #2036 (2026-09-15, Owner `Claude`)

### 6.1 What Happened After Merge

PR #2036 merged `curl_ready_auth` / `get_identity_token` (§3.1 above) to `dev`. The
next dev deploy dispatch after the merge — run
[`34943580004`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34943580004),
`source_ref` resolved to `de34d1ae303d8ea3c0a0248bf4e2601ae9dfb8b5` (the #2036 merge
commit itself) — still failed at the `Dev health check` job's `Verify dev endpoints`
step:

```
##[error]Failed to obtain identity token for audience https://drts-dev-tenant-console-web-r6ykdme3wa-uc.a.run.app
##[error]Process completed with exit code 1.
```

All prior jobs (`Build & push images`, `DB migration`, `Deploy services`, `Enforce
Partner Booking paused state`) were green; only the health check's own token-minting
logic was broken. `retired-service-cleanup` and `operational-candidate-acceptance`
were skipped again for the same reason as the original root cause — no candidate SHA
was produced, and the task remained `todo`/`in_progress` in `ai-status.json` despite
the code having merged.

### 6.2 Root Cause of the Second Failure

The `Dev health check` job authenticates via `google-github-actions/auth@v2` with a
`service_account:` input (Workload Identity Federation with direct impersonation).
Both token-acquisition attempts inside `get_identity_token()` failed silently
(stderr was redirected to `/dev/null`, masking the actual error) because of a
credential-type mismatch:

1. **Attempt 1** (`gcloud auth print-identity-token --audiences=...`): this gcloud
   subcommand does not mint ID tokens for the `external_account` /
   impersonated-service-account credential type that `google-github-actions/auth@v2`
   writes to the runner's ADC file. It returns an empty string rather than raising a
   catchable error, so the script silently fell through to attempt 2.
2. **Attempt 2** (manual `iamcredentials.googleapis.com...:generateIdToken` call):
   this used an access token obtained from `gcloud auth print-access-token`, which by
   that point already represents the *impersonated* runtime service account
   (`DEV_WIF_SERVICE_ACCOUNT`), not the original WIF principal. Calling
   `generateIdToken` on `serviceAccounts/${sa}:generateIdToken` with that access
   token is a **self-impersonation** request — it requires `${sa}` to hold
   `roles/iam.serviceAccountTokenCreator` on *itself*, which is not part of the
   normal WIF trust chain (only the original WIF principal is granted Token Creator
   on `${sa}`, not `${sa}` on itself). The call therefore failed (HTTP error was
   discarded by `--fail` combined with `2>/dev/null || true`), leaving `token` empty
   and both attempts exhausted.

### 6.3 Fix

Replaced both gcloud/curl-based attempts with the officially supported path: mint the
ID token directly from `google-github-actions/auth@v2` using `token_format: id_token`
and `id_token_audience: <service-url>`. This mints the token from the *original* WIF
federation exchange (the same trust chain already used to obtain the access-token
credential), so it does not require any additional self-impersonation IAM grant.

Because the action mints one ID token per invocation/audience, three new steps
(`Mint identity token — tenant console`, `— bank console`, `— enterprise dispatch`)
were added to the `health-check` job, each producing a `steps.<id>.outputs.id_token`
output. `Verify dev endpoints` now receives these three tokens via `env:` (masked
with `::add-mask::` and explicitly checked for emptiness before use) instead of
minting tokens inline. A `Re-authenticate to GCP` step restores the access-token
credential immediately after, since the downstream `Verify referral handoff session
lifecycle` step calls `gcloud secrets versions access`.

No guardrail from §2 was touched: private services remain
`--no-allow-unauthenticated`, probe rigor (`--fail`, `--retry-all-errors`, etc.) is
unchanged, and this is strictly a token-acquisition mechanism swap.

### 6.4 Verification Evidence (Follow-On Fix)

- **Local regression suite** (unchanged assertions, still pass against the new
  script since `curl_ready_auth()` and its `Authorization: Bearer ${id_token}`
  header remain intact):
  `pnpm vitest run tests/unit/system-remediation/sr-dev-healthcheck-identity-20260915/healthcheck-identity.test.ts`
  Result: 6 tests passed.
- **Deployment architecture guard tests**:
  `pnpm vitest run tests/unit/deployment-architecture-guards.test.ts tests/unit/cloud-run-deploy-retry.test.ts tests/unit/dev-active-surface-contract.test.ts`
  Result: 19 tests passed.
- **YAML syntax**: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-dev.yml'))"` — OK.
- **Live dev deploy re-run**: pending — see candidate handoff for the dispatched run
  URL and resulting `deployed_sha` / `live_candidate_sha` once green.

---

## 7. Cloud Run `/healthz` Infrastructure Reservation & Root Path Strategy (2026-09-15, Owner `Gemini2`)

### 7.1 Root Cause Diagnosis: Google Cloud Run Interception of `/healthz`

In deploy run `34956809422` (commit `2af11cad3`), token minting via `google-github-actions/auth@v2` succeeded completely, eliminating the prior auth failure. However, the workflow failed with HTTP 404 on `curl_ready_auth "${{ steps.urls.outputs.tenant_console }}/healthz"`.

Diagnostic probing revealed:
1. **Google Frontend (GFE) Interception**:
   Requesting `https://<service-url>.a.run.app/healthz` returned `HTTP/2 404 Not Found` with Google's robot error page (`<title>Error 404 (Not Found)!!1</title>`) and no container tracing headers (`x-cloud-trace-context`, `x-drts-candidate-sha`).
2. **Infrastructure Reservation**:
   Per Google Cloud Run architecture, URL paths ending in `z` (specifically `/healthz`, `/livez`, `/readyz`) and paths starting with `/_ah/` are reserved for platform-internal infrastructure health checks. Public ingress requests sent to these paths on `*.run.app` or `*.a.run.app` are intercepted by Google Frontend (GFE) and rejected with HTTP 404 before traffic ever reaches the container runtime.
3. **Root Path Authentication Succeeds**:
   In contrast, requesting the root path `https://<service-url>.a.run.app/` with the minted identity token succeeded at the Cloud Run IAM layer, reached Next.js, executed middleware, set `x-drts-candidate-sha`, and returned `HTTP/2 307` redirecting to `/login?redirect_uri=%2F`. Following this redirect via `--location-trusted` resulted in HTTP 200 from the login page.

### 7.2 Remediation Decision per Task Brief

The task brief explicitly specified:
> "tenant/enterprise 的 /healthz 目前回 404，稽核明確指出那不是已驗證的替代健康路徑，可選擇補上真正的健康路由或改為帶身分探測根路徑，擇一但須在文件說明理由。"

Because `/healthz` is intercepted by Google Cloud Run's infrastructure layer and cannot receive external ingress, we adopted the **帶身分探測根路徑 (Probe Root Path with Identity)** strategy:
- `tenant_console`: Probed via `curl_ready_auth "${{ steps.urls.outputs.tenant_console }}" "${TENANT_CONSOLE_ID_TOKEN}"`.
- `bank_console`: Probed via `curl_ready_auth "${{ steps.urls.outputs.bank_console }}" "${BANK_CONSOLE_ID_TOKEN}"`.
- `enterprise_dispatch`: Probed via `curl_ready_auth "${{ steps.urls.outputs.enterprise_dispatch }}" "${ENTERPRISE_DISPATCH_ID_TOKEN}"` (along with its functional endpoints `/bookings/new` and `/embed/unsupported-host`).
- The probes for `/healthz` on external Cloud Run URLs are removed from `deploy-dev.yml`.

### 7.3 Rationale

1. **Superior Verification Depth**: Probing the root path `/` with `--location-trusted` exercises the full Next.js SSR compilation pipeline, middleware evaluation, and page rendering, guaranteeing that the web application container is genuinely operational rather than merely responding from an isolated static ping handler.
2. **Platform Compatibility**: Avoids conflict with Cloud Run's reserved internal infrastructure endpoints.
3. **Security Integrity**: Upholds all non-negotiable guardrails (§2) — services remain `--no-allow-unauthenticated`, tokens are minted via WIF federation, and probes maintain full rigor (`--fail`, `--retry 10`, `--retry-all-errors`).

### 7.4 Verification Evidence

- **Task Unit Test Suite**:
  `pnpm vitest run tests/unit/system-remediation/sr-dev-healthcheck-identity-20260915/healthcheck-identity.test.ts`
  Result: 6 tests passed (100% pass).
- **Deployment Architecture Guard Tests**:
  `pnpm vitest run tests/unit/deployment-architecture-guards.test.ts tests/unit/cloud-run-deploy-retry.test.ts tests/unit/dev-active-surface-contract.test.ts`
  Result: 19 tests passed (100% pass).
- **CI Test Coverage Gate**:
  `python3 tools/ci/check_test_coverage.py`
  Result: `check_test_coverage: all 74 test files yield tests CI runs.`
- **Workflow YAML Validation**:
  `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-dev.yml'))"` — Valid.

---

## 8. Candidate SHA Operational Acceptance Identity Remediation (2026-09-15, Owner `Gemini2`)

### 8.1 Post-Deploy Progress & Root Cause in Run 34965087961

In dev deploy run `34965087961`:
- All nine service builds, migrations, and deployments succeeded.
- The `Dev health check` job passed in 1m 14s using the WIF-minted ID tokens and root-path probes (§7), confirming that authenticated health checks function reliably.
- The `retired-service-cleanup` job completed cleanly.
- The pipeline halted at `operational-candidate-acceptance` (`Candidate SHA operational acceptance`).

#### Diagnostic Root Cause

1. **Private Services Ingress Rejection (HTTP 403)**:
   The Playwright suite `tests/e2e/operational-candidate.spec.ts` was issuing anonymous HTTP requests (`request.get(url, { failOnStatusCode: false })`) and browser navigations (`page.goto(url)`) to all surfaces declared in `candidate-journey-manifest.json`. For the three private Cloud Run services (`tenant_console`, `bank_console`, and `enterprise_dispatch`), Google Frontend (GFE) returned **HTTP 403 Forbidden** because no Google IAM identity token was attached. The tests expected `200`, causing the suite to fail.
2. **Bank Console Demo Login Timeout**:
   The test `bank console demo login remains on the deployed public origin` timed out at 30 seconds on `page.waitForURL`. Because `page.goto` to `${expectedOrigin}/login...` was received anonymously by Cloud Run, GFE returned the 403 error page. Consequently, the button `"方案管理員"` could not be activated and subsequent authentication requests failed, producing a timeout cascade.

### 8.2 Remediation Architecture

1. **Workflow Token Minting**:
   In `.github/workflows/deploy-dev.yml` under `operational-candidate-acceptance`, three new token-minting steps were introduced using `google-github-actions/auth@v2` with `token_format: id_token`:
   - `Mint identity token — tenant console (operational candidate)` (audience: `${{ needs.health-check.outputs.tenant_console }}`)
   - `Mint identity token — bank console (operational candidate)` (audience: `${{ needs.health-check.outputs.bank_console }}`)
   - `Mint identity token — enterprise dispatch (operational candidate)` (audience: `${{ needs.health-check.outputs.enterprise_dispatch }}`)
   These tokens are passed as environment variables (`DRTS_DEV_TENANT_CONSOLE_ID_TOKEN`, `DRTS_DEV_BANK_CONSOLE_ID_TOKEN`, `DRTS_DEV_ENTERPRISE_DISPATCH_ID_TOKEN`) into the test runner step.
2. **Acceptance Runner Propagation**:
   In `operations/verification/run-operational-browser-acceptance.sh`, the token environment variables are exported as both `DRTS_OPERATIONAL_*_ID_TOKEN` and `DRTS_DEV_*_ID_TOKEN`, ensuring downstream Playwright test processes receive them regardless of invocation style.
3. **Playwright Spec Authentication**:
   In `tests/e2e/operational-candidate.spec.ts`:
   - Added `getIdentityToken(surface)` helper to resolve the appropriate token for `tenant-console-web`, `bank-console-web`, and `enterprise-dispatch-web`.
   - Attached `Authorization: Bearer <idToken>` to `request.get` for private services.
   - Provided `await context.setExtraHTTPHeaders({ Authorization: `Bearer ${idToken}` })` on the Playwright browser context prior to `page.goto`, ensuring initial navigation, subsequent form submissions (such as POST `/api/auth/login`), and redirects pass Cloud Run GFE IAM checks.
   - Maintained **anonymous probing** for all public services (`api`, `platform-admin-web`, `ops-console-web`, `fleet-partner-portal-web`, `referral-embed-web`, `channel-partner-portal-web`).
   - Retained strict **HTTP 404** expectations for retired and paused surfaces (`partner-booking-web`, `concierge-portal-web`, `passenger-web`).
   - Preserved `x-drts-candidate-sha` header assertions across both HTTP and browser response pipelines.
4. **Configuration Robustness**:
   In `playwright.operational-candidate.config.ts`, increased test timeout to `60_000` ms to accommodate cold-start latency on Cloud Run without prematurely failing valid operational tests.
5. **Guardrail Compliance**:
   - Zero services converted to `--allow-unauthenticated`.
   - Zero realm ingress policies relaxed.
   - Zero probe assertions softened (`expectedStatus` remains 200, `failOnStatusCode` not suppressed).

### 8.3 Verification Evidence

- **Task Unit Test Suite**:
  `pnpm vitest run tests/unit/system-remediation/sr-dev-healthcheck-identity-20260915/healthcheck-identity.test.ts`
  Result: 9 tests passed (100% pass).
- **Deployment Architecture Guard Tests**:
  `pnpm vitest run tests/unit/deployment-architecture-guards.test.ts tests/unit/cloud-run-deploy-retry.test.ts tests/unit/dev-active-surface-contract.test.ts`
  Result: 19 tests passed (100% pass).
- **TypeScript Static Verification**:
  `pnpm exec tsc -p tsconfig.json --noEmit` verified 0 errors in `tests/e2e/operational-candidate.spec.ts` with `exactOptionalPropertyTypes: true` satisfied (using spread rather than passing explicit `undefined` to `headers`).
- **Code Style & Lint Verification**:
  `pnpm lint:root` and `pnpm prettier --check tests/e2e/operational-candidate.spec.ts` passed with 0 errors.
- **CI Test Coverage Gate**:
  `python3 tools/ci/check_test_coverage.py`
  Result: `check_test_coverage: all 74 test files yield tests CI runs.`
- **Workflow YAML Validation**:
  `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-dev.yml'))"` — Valid.

---

## 9. Operational Browser Acceptance Identity & Download Remediation (2026-09-16, Owner `Gemini2`)

### 9.1 Dev Deploy Run 35000817647 Audit & Root Cause Analysis

Following the merge of PR #2040 (`d853b7e4bd0db475cc451df06b01a4c0c214f280`), dev deploy run `35000817647` was executed on `dev`:
- **Build & Push Images**: Success
- **DB Migration**: Success
- **Deploy Services**: Success
- **Enforce Partner Booking Paused State**: Success
- **Dev Health Check**: Success (all 9 endpoints verified green with identity tokens for private services)
- **Fail-Closed Retired Service Cleanup**: Success
- **Candidate SHA Operational Acceptance**: Failed at step `Execute candidate-bound operational journeys` (job `104495816178`)

#### Detailed Root Cause Diagnosis

1. **`tests/e2e/operational-candidate.spec.ts` Passed (14/14)**:
   The identity token authentication introduced in PR #2040 was fully effective for `operational-candidate.spec.ts`, validating all 10 active surfaces, the bank console login, and retired surface contracts.
2. **`tests/e2e/operational-browser-acceptance.spec.ts` Failed (7 failed, 9 passed)**:
   Inspection of `report.json` and Playwright traces revealed two distinct root causes:
   - **Private Cloud Run Services Missing IAM Identity Token (403 Forbidden)**:
     - `enterprise-create-read-update-cancel`: Navigating to `DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL` returned HTTP 403 Forbidden from GFE, causing locator `[data-drt-intent='enterprise-review']` to not appear.
     - `tenant-ops-dispatch-intent`: Setup step 2 calling `/control-plane-proxy/tenant/bookings/{{tenantBookingId}}` on `DRTS_DEV_TENANT_CONSOLE_BASE_URL` returned HTTP 403 Forbidden.
     - `bank-statement-download`: Setup step calling `/api/auth/login` on `DRTS_DEV_BANK_CONSOLE_BASE_URL` returned HTTP 403 Forbidden.
     - Route tests for `enterprise`, `tenant-ops`, and `bank` all failed with HTTP 403 Forbidden.
   - **Chromium Download Event vs. `page.waitForResponse` Timeout**:
     - `channel-statement-download`: In `apps/channel-partner-portal-web/app/statements/[period]/page.tsx`, the download anchor includes the `download` HTML attribute. When clicked in Chromium, Chromium's download manager handles the transfer directly and does not emit a `Network.responseReceived` page response event to Playwright. `page.waitForResponse` timed out after 10 seconds despite the `download` event completing successfully.

### 9.2 Remediation Implementation

1. **Identity Token Resolution & Browser Context Authentication**:
   In `tests/e2e/operational-browser-acceptance.spec.ts`:
   - Added `getIdentityToken(baseUrlEnv)` helper to resolve `DRTS_OPERATIONAL_*_ID_TOKEN` / `DRTS_DEV_*_ID_TOKEN` for `tenant-console-web`, `bank-console-web`, and `enterprise-dispatch-web`.
   - In both journey contract tests and route verification tests, injected `Authorization: Bearer <idToken>` into the Playwright browser context via `await page.context().setExtraHTTPHeaders(...)` prior to navigation.
   - In `runSetup`, ensured setup requests to private services automatically attach `Authorization: Bearer <idToken>` if an application-level `authorization` header is not explicitly present.
   - In `assertReadback`, attached `Authorization: Bearer <idToken>` when reading back from private services.
2. **Clean Download Event & Artifact Verification**:
   - For `operation.responseKind === "download"`, removed the hanging `page.waitForResponse` call.
   - Awaited `page.waitForEvent("download")`, confirmed `download.failure()` is null and `download.createReadStream()` is readable.
   - Fetched the download URL directly via `page.context().request.get(downloadUrl)` with identity headers, asserting HTTP 200, `x-drts-candidate-sha`, `content-type`, and `content-disposition: attachment`.
3. **Strict Guardrail Compliance**:
   - Zero services exposed unauthenticated.
   - Zero probe or acceptance checks relaxed.
   - Full conformance to UI design contract and `@drts/ui-tokens`.

### 9.3 Verification Evidence

- **Regression Unit Test Suite**:
  `pnpm vitest run tests/unit/system-remediation/sr-dev-healthcheck-identity-20260915/healthcheck-identity.test.ts`
  Result: 10 tests passed (100% pass).
- **Deployment Architecture Guard Tests**:
  `pnpm vitest run tests/unit/deployment-architecture-guards.test.ts tests/unit/cloud-run-deploy-retry.test.ts tests/unit/dev-active-surface-contract.test.ts`
  Result: 19 tests passed (100% pass).
- **CI Test Coverage Gate**:
  `python3 tools/ci/check_test_coverage.py`
  Result: `check_test_coverage: all 74 test files yield tests CI runs.`
- **Code Style & Lint Verification**:
  `pnpm lint:root` and `pnpm prettier --check tests/e2e/operational-browser-acceptance.spec.ts tests/unit/system-remediation/sr-dev-healthcheck-identity-20260915/healthcheck-identity.test.ts` passed with 0 errors.



