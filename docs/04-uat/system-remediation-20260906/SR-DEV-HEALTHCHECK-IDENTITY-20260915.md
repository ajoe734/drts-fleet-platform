# SR-DEV-HEALTHCHECK-IDENTITY-20260915 — Dev Health Check Identity Authentication & Healthz Remediation

- **Task ID**: `SR-DEV-HEALTHCHECK-IDENTITY-20260915`
- **Owner**: `Claude` (originally `Gemini`; reassigned by Chairman on 2026-09-15 after two capacity/unavailable 503 failure streaks, see §6)
- **Reviewer**: `Claude2`
- **Wave / Phase**: `system-remediation-20260906`
- **Base**: `dev`
- **Execution Branch**: `claude/sr-dev-healthcheck-identity-20260915` (follow-on fix; original merged as `gemini/sr-dev-healthcheck-identity-20260915` via #2036)
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
