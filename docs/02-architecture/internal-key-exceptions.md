# Temporary Internal Key Exception Inventory & Retirement Plan

**Task ID**: `IAM-SVC-002`  
**Status**: Active Exception Inventory & Retirement Lifecycle  
**Owner**: Gemini2  
**Reviewer**: Claude  
**Planning Reference**: `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`  
**Execution Reference**: `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`  
**Last Updated**: 2026-08-05  

---

## 1. Overview & Security Policy

As part of the DRTS Stage 1.5 Identity & Access Security Hardening Plan, shared static `DRTS_INTERNAL_KEY` and scoped internal keys are classified as **temporary transition exceptions**. The long-term production standard requires Workload Identity Federation (WIF) and short-lived audience-bound service tokens (`IAM-SVC-001`).

To prevent undocumented credential proliferation and unmonitored backdoor access:
1. **Machine-Readable Inventory**: Every active or transitional internal key MUST be registered with complete metadata in the machine-readable registry (`apps/api/src/common/auth/internal-key-exception-registry.ts`) and documented in this inventory.
2. **Metadata Completeness**: Every entry must include `exceptionId`, `owner`, `purpose`, `scope`, `ttl`, `expiresAt`, `networkBoundary`, `rotationCadence`, `usageSignal`, `removalDate`, and `removalPlan`.
3. **Fail-Closed Enforcement**: Any internal key presented without a matching documented active exception or past its `expiresAt` timestamp is immediately rejected with `INTERNAL_KEY_UNDOCUMENTED` or `INTERNAL_KEY_EXPIRED`.
4. **Dual-Key Rotation Overlap & Revocation**: Keys support dual-key rotation (`DRTS_*_KEY` primary and `DRTS_*_KEY_PREVIOUS` overlap window). Explicitly revoked keys in `DRTS_*_KEY_REVOKED_KEYS` fail immediately with `INTERNAL_KEY_REVOKED`.
5. **Usage & Drift Telemetry**: Every usage emits `AUTH_INTERNAL_KEY_USED` or `AUTH_SCOPED_INTERNAL_KEY_USED`. Uninventoried, expired, or revoked attempts trigger `AUTH_INTERNAL_KEY_DRIFT_ALERT` security events.

---

## 2. Production Internal Key Exception Inventory

| Exception ID | Owner | Purpose | Scope / Header | Network Boundary | TTL / ExpiresAt | Rotation Cadence | Usage Signal | Target Removal Date | Removal Plan |
|---|---|---|---|---|---|---|---|---|---|
| `INTERNAL_KEY_EXCP_001` | `referral-team` | Scoped server-to-server referral embed handoff artifact issuance and consumption | `x-drts-referral-handoff-key`<br>`POST partner/ingress/referral-embed-handoff`<br>`POST partner/ingress/referral-embed-handoff/consume`<br>`POST partner/ingress/referral-embed-handoff/consent` | `internal-vpc-to-api-ingress` | `2026-10-31T23:59:59Z` | `30d` | `AUTH_SCOPED_INTERNAL_KEY_USED` | `2026-10-31` | Migrate `referral-embed-web` BFF caller to IAM-SVC-001 WIF token exchange once WIF proxy is enabled on referral web app. |
| `INTERNAL_KEY_EXCP_002` | `control-plane-ops` | Legacy control-plane proxy serverless fallback key when GCP WIF identity assertion is absent | `x-drts-internal-key`<br>`POST partner/ingress/handoff`<br>`POST auth/token` | `control-plane-proxy-to-api` | `2026-09-15T23:59:59Z` | `14d` | `AUTH_LEGACY_INTERNAL_KEY_USED` | `2026-09-15` | Full deprecation of `DRTS_INTERNAL_KEY` fallback in favor of mandatory WIF workload identity assertion headers on all control-plane proxies. |
| `INTERNAL_KEY_EXCP_003` | `sre-ops` | Staging emergency break-glass local operations key | `x-drts-internal-key`<br>`GET health`<br>`POST ops/*` | `staging-break-glass-only` | `2026-08-31T23:59:59Z` | `7d` | `AUTH_BREAKGLASS_INTERNAL_KEY_USED` | `2026-08-31` | Replace with IAM-BG-001 break-glass two-person approval and short session token. |

---

## 3. Dual-Key Rotation & Revocation Protocol

Internal key rotation follows a zero-downtime dual-key model:

```mermaid
sequenceDiagram
    autonumber
    participant Service as Caller (BFF / Proxy)
    participant Middleware as API InternalKeyMiddleware
    participant Env as Environment Variables

    Note over Service, Middleware: Step 1: Normal Execution (Active Key K1)
    Service->>Middleware: Header with K1
    Middleware->>Env: Match K1 against DRTS_INTERNAL_KEY
    Middleware-->>Service: Accepted (200/201)

    Note over Service, Middleware: Step 2: Rotation Initiated (Active Key K2, Previous Key K1)
    Service->>Middleware: Header with K1 (Grace Period)
    Middleware->>Env: Match K1 against DRTS_INTERNAL_KEY_PREVIOUS
    Middleware-->>Service: Accepted (200/201 - rotated_previous)

    Note over Service, Middleware: Step 3: Key Revoked (K1 in DRTS_INTERNAL_KEY_REVOKED_KEYS)
    Service->>Middleware: Header with K1
    Middleware->>Env: K1 found in DRTS_INTERNAL_KEY_REVOKED_KEYS
    Middleware-->>Service: Rejected (401 - INTERNAL_KEY_REVOKED)
```

### Environment Variable Scheme

- **Primary Active Key**: `DRTS_INTERNAL_KEY` / `DRTS_REFERRAL_EMBED_HANDOFF_KEY`
- **Rotation Previous Key**: `DRTS_INTERNAL_KEY_PREVIOUS` / `DRTS_REFERRAL_EMBED_HANDOFF_KEY_PREVIOUS`
- **Revoked Keys List**: `DRTS_INTERNAL_KEY_REVOKED_KEYS` / `DRTS_REFERRAL_EMBED_HANDOFF_KEY_REVOKED_KEYS` (CSV)

---

## 4. Verification & Audit Tooling

Automated verification is integrated at two layers:

1. **Startup Validation (`apps/api/src/config/auth-startup-config.ts`)**:
   - `buildAuthStartupConfigReport` validates that any configured internal key has a complete, non-expired, documented entry in `INTERNAL_KEY_EXCEPTION_REGISTRY`.
   - Incomplete metadata triggers `MISSING_CONTROL` / `INVALID_FORMAT`. Expired exceptions trigger `UNSAFE_VALUE`.

2. **Automated Audit Script (`scripts/verify-internal-key-exceptions.py`)**:
   - Executable verification tool that checks code registry against documentation and live environment configuration.
   - Detects undocumented keys, missing metadata fields, past expiration dates, and unmonitored routes.

```bash
python3 scripts/verify-internal-key-exceptions.py
```

---

## 5. Exception Retirement Roadmap

```mermaid
gantt
    title Internal Key Retirement Timeline (Stage 1.5 - Stage 2)
    dateFormat  YYYY-MM-DD
    section INTERNAL_KEY_EXCP_003
    SRE Break-Glass Key Expiry         :active, excp3, 2026-08-05, 2026-08-31
    Retire EXCP_003 to IAM-BG-001      :crit, 2026-08-31, 2026-08-31
    section INTERNAL_KEY_EXCP_002
    Control-Plane Fallback Key Expiry  :active, excp2, 2026-08-05, 2026-09-15
    Retire EXCP_002 to WIF Assertions  :crit, 2026-09-15, 2026-09-15
    section INTERNAL_KEY_EXCP_001
    Referral Handoff Key Expiry        :active, excp1, 2026-08-05, 2026-10-31
    Retire EXCP_001 to WIF Tokens      :crit, 2026-10-31, 2026-10-31
```
