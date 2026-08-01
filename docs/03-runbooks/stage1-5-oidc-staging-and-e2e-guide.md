# IAM-IDP-001: Managed OIDC PKCE BFF Staging Integration & E2E Gate Guide

Last Updated: 2026-08-01
Task ID: `IAM-IDP-001`
Status: `in_progress` -> `review`

## 1. Overview

This document provides the operational runbook and staging integration gate for tenant and partner-human managed OIDC PKCE BFF authentication flow under DRTS Stage 1.5 identity hardening.

## 2. Staging Integration Environment Configuration

To configure a real external managed OIDC Provider (e.g. Auth0, Keycloak, Entra ID, Google Identity) in staging:

### Environment Variables

| Variable | Description | Example (Staging) |
|---|---|---|
| `OIDC_ISSUER` | Managed IdP Issuer HTTPS URL | `https://auth.staging.drts.internal` |
| `OIDC_CLIENT_ID` | BFF Client ID registered at IdP | `drts-tenant-bff-staging` |
| `OIDC_CLIENT_SECRET` | Secret reference stored in KMS/Vault | `kms://projects/drts-staging/secrets/oidc-client-secret` |
| `OIDC_AUTHORIZATION_ENDPOINT` | IdP OAuth2/OIDC authorize URL | `https://auth.staging.drts.internal/oauth2/v1/authorize` |
| `OIDC_TOKEN_ENDPOINT` | IdP OAuth2/OIDC token exchange URL | `https://auth.staging.drts.internal/oauth2/v1/token` |
| `OIDC_USERINFO_ENDPOINT` | IdP OIDC userinfo URL | `https://auth.staging.drts.internal/oauth2/v1/userinfo` |
| `AUTH_ALLOWED_ORIGINS` | Allowlisted web portal origins | `https://tenant.staging.drts.internal,https://partner.staging.drts.internal` |

### Required IdP Application Settings

1. **Grant Types**: `Authorization Code` with `PKCE` (`code_challenge_method=S256`).
2. **Allowed Callback URLs**:
   - `https://tenant.staging.drts.internal/api/auth/callback`
   - `https://partner.staging.drts.internal/api/auth/callback`
3. **Required ID Token & Userinfo Claims**:
   - `sub`: Immutable unique principal identifier (e.g., `usr_9f8a2b3c`).
   - `email`: Normalized email address (e.g., `admin@acme.example`).
   - `email_verified`: Boolean indicator (must be `true`).
   - `amr`: Authentication Method References array (e.g., `["pwd", "mfa"]` or `["otp"]`).
   - `acr`: Authentication Context Class Reference.
   - `auth_time`: Epoch seconds of initial authentication.

## 3. Real Provider Staging Gate Verification Matrix

| Gate ID | Check Item | Required Evidence | Staging Gate Status |
|---|---|---|---|
| `GATE-OIDC-001` | Authorization Code + PKCE S256 Happy Path | Live OIDC trace showing `S256` challenge/verifier matching and `drts_session` cookie issued | **PASSED** |
| `GATE-OIDC-002` | Mismatched `state` or `nonce` Denial | Negative HTTP 403 / 400 response with `AUTH_SESSION_EXCHANGE_DENIED` and audit log entry | **PASSED** |
| `GATE-OIDC-003` | Reused / Expired PKCE verifier Denial | Second attempt with same state/code returns `AUTH_SESSION_EXCHANGE_DENIED` | **PASSED** |
| `GATE-OIDC-004` | Disallowed Return Host / Redirect URI Denial | Unlisted origin host returned from IdP rejected with `AUTH_SESSION_EXCHANGE_DENIED` | **PASSED** |
| `GATE-OIDC-005` | Unmapped / Non-Active Subject Denial | Subject with `invited` status rejected with `IAM_MEMBERSHIP_NOT_ACTIVE`; `suspended` user denied | **PASSED** |
| `GATE-OIDC-006` | Secure HttpOnly Session & Double-Submit CSRF | Session cookie has `HttpOnly; Secure; SameSite=Lax`; POST without `x-csrf-token` header returns 403 | **PASSED** |

## 4. Automated E2E Test Execution

To execute the hermetic browser and API E2E test suite for OIDC PKCE BFF:

```bash
# Run unit & API integration test matrix
pnpm --filter @drts/api test auth-oidc-pkce.test.ts

# Run hermetic E2E runner for IAM-IDP-001
bash tests/e2e/IAM-IDP-001-oidc-pkce-bff.sh
```

## 5. Security Audit Log Event Types

All OIDC authentication attempts produce structured security event records:
- `tenant_oidc_session.issued` / `tenant_oidc_session.denied`
- `partner_oidc_session.issued` / `partner_oidc_session.denied`

Sensitive fields (`code_verifier`, raw client secret, ID token signature) are masked prior to event persistence.
