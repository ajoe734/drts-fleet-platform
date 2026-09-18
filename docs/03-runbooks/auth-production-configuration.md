# Authentication Production Configuration Runbook

- **Task ID**: `IAM-P0-004`
- **Owner**: `Gemini`
- **Reviewer**: `Codex2`
- **Last Updated**: `2026-08-01`
- **Module**: `apps/api/src/config/auth-startup-config.ts`

---

## 1. Overview & Objectives

This runbook documents the environment-aware startup validation requirements for authentication, authorization, and secret management in the `drts-fleet-platform` API (`@drts/api`).

To enforce a strict security stance in staging and production environments, the application performs mandatory preflight validation during container startup before starting listeners or accepting traffic. If any security control is missing, weak, or improperly configured in a strict environment (`staging` or `production`), application startup fails immediately (fail-closed).

---

## 2. Environment Matrix & Modes

The startup validator automatically detects the active environment via `APP_ENV`, `NODE_ENV`, or `CI`.

| Environment (`AuthEnvironment`) | Strict Mode (`isStrictEnvironment`) | Startup Fail-Closed Policy                              | Explicit Dev Mode                                      |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `production`                    | **Yes**                             | Any missing or weak control halts container startup.    | Forbidden (`ALLOW_INSECURE_DEV_AUTH=true` is rejected) |
| `staging`                       | **Yes**                             | Identical strict fail-closed enforcement as production. | Forbidden (`ALLOW_INSECURE_DEV_AUTH=true` is rejected) |
| `test` / `ci`                   | **No**                              | Validates explicit mode; allows hermetic test fixtures. | Supported with explicit test harness settings          |
| `local`                         | **No**                              | Validates explicit mode; allows local dev fallbacks.    | Default local dev fallback active                      |

---

## 3. Mandatory Security Controls Matrix

In `staging` and `production`, all of the following security controls must be configured with safe values:

| Control Area         | Environment Variable(s)                                   | Strict Requirement / Validation Policy                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Issuer**           | `JWT_ISSUER` or `OIDC_ISSUER`                             | Must be a non-empty, valid `https://` URL. `http://`, `localhost`, or `127.0.0.1` are strictly rejected.                                                                                                                        |
| **Audience**         | `JWT_AUDIENCE` or `OIDC_AUDIENCE`                         | Must be a non-empty, specific audience string (e.g. `https://api.drts.internal`). Wildcard `*` is strictly rejected.                                                                                                            |
| **Algorithms**       | `JWT_ALGORITHMS` or `JWT_ALGORITHM`                       | Must be an approved secure algorithm (`HS256`, `HS384`, `HS512`, `RS256`, `RS384`, `RS512`, `ES256`, `ES384`, `ES512`, `PS256`, `PS384`, `PS512`). `none` is strictly forbidden in **all** environments. HS* algorithms require symmetric signing; RS*/ES*/PS* algorithms require asymmetric signing keys. |
| **Signing Key**      | `JWT_SECRET` (or `JWT_PRIVATE_KEY` + `JWT_PUBLIC_KEY`)    | Must be configured. Symmetric `JWT_SECRET` must be at least 32 characters long and not match weak default patterns (`secret`, `dev-secret`, `123456`, `change-me`, etc.). Asymmetric keys require both public and private keys, and startup rejects algorithm/key-type mismatches before the server listens. |
| **Cookie Key**       | `COOKIE_SECRET`                                           | Required, minimum 32 characters, non-weak secret.                                                                                                                                                                               |
| **CSRF Key**         | `CSRF_SECRET` or `SESSION_SECRET`                         | Required, minimum 32 characters, non-weak secret.                                                                                                                                                                               |
| **Allowed Origins**  | `AUTH_ALLOWED_ORIGINS` or `CORS_ALLOWED_ORIGINS`          | Required non-empty CSV of allowed origins. Wildcard `*` is forbidden in staging/prod. Non-HTTPS origins are forbidden in production.                                                                                            |
| **Session Store**    | `SESSION_STORE_URL`, `REDIS_URL`, or `DATABASE_URL`       | Required for durable, distributed session storage. In-memory session store (`SESSION_STORE_TYPE=memory`) is prohibited in staging/prod.                                                                                         |
| **Audit Store**      | `AUDIT_STORE_URL` or `DATABASE_URL`                       | Required for append-only audit persistence. Disabled audit store (`AUDIT_STORE_TYPE=none` / `noop`) is prohibited in staging/prod.                                                                                              |
| **Internal Key**     | `DRTS_INTERNAL_KEY`, `DRTS_INTERNAL_KEY_ENFORCED`         | `DRTS_INTERNAL_KEY` required (min 32 chars, non-weak). `DRTS_INTERNAL_KEY_ENFORCED` cannot be set to `false`.                                                                                                                   |
| **Security Peppers** | `PASSENGER_SUBJECT_PEPPER`, `PASSENGER_RIDE_TOKEN_PEPPER` | Required non-empty secrets, minimum 32 characters long.                                                                                                                                                                         |

---

## 4. Secret Leakage Prevention

The validator adheres to a strict secret leakage prevention discipline:

- Error messages and log outputs **must never print, log, or leak raw secret values or key contents**.
- Validation failure reports name the missing or failing control, the issue code (`MISSING_CONTROL`, `UNSAFE_VALUE`, `FORBIDDEN_MODE`, `WEAK_SECRET`, `INVALID_FORMAT`), and the structural constraint (e.g. `length (16) is below minimum requirement of 32 characters`).

---

## 5. Local & Test Harness Configuration

### Local Development

In local development (`APP_ENV=local` or default):

- Local defaults are automatically populated for `JWT_ISSUER` (`https://auth.local.drts.internal`) and `JWT_AUDIENCE` (`https://api.local.drts.internal`).
- Explicit auth mode markers can be set via `AUTH_MODE=local`.
- Unsafe `none` algorithms remain blocked even in local mode.
- JWT algorithm families must still match the configured signing material so local/test fixtures do not pass startup and then fail later during token issuance.

### Test & CI Harness

In test environments (`CI=true` or `NODE_ENV=test`):

- Hermetic unit/integration tests run without requiring external production secret stores.
- Explicit test harness controls ensure mock keys do not leak into staging/production build artifacts.

---

## 6. Verification & Troubleshooting

### Running Unit & Integration Tests

To verify auth startup validation logic:

```bash
# Run unit tests
pnpm test:unit tests/unit/auth-startup-config.test.ts

# Run integration tests
pnpm test:unit tests/integration/auth-startup-config.integration.test.ts
```

### Common Validation Error Resolutions

1. **`[FORBIDDEN_MODE] ALLOW_INSECURE_DEV_AUTH: ALLOW_INSECURE_DEV_AUTH=true is strictly forbidden...`**
   - **Fix**: Remove `ALLOW_INSECURE_DEV_AUTH=true` from your deployment environment variables or Helm/K8s secret maps.

2. **`[WEAK_SECRET] JWT_SECRET: set to a known insecure default pattern`**
   - **Fix**: Replace development secret values (`secret`, `dev-secret`, `123456`) with a cryptographically secure random string of at least 32 characters (e.g. `openssl rand -hex 32`).

3. **`[UNSAFE_VALUE] JWT_ISSUER: must use secure HTTPS protocol...`**
   - **Fix**: Configure `JWT_ISSUER` or `OIDC_ISSUER` to point to your canonical HTTPS IdP issuer endpoint (e.g. `https://auth.drts.internal`).

4. **`[MISSING_CONTROL] SESSION_STORE_URL...`**
   - **Fix**: Provide `REDIS_URL` or `SESSION_STORE_URL` in the environment to ensure sessions persist across process restarts.
