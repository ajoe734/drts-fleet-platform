# IAM-PRT-001 Sidecar Acceptance Packet

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `IAM-PRT-001` — Add expiry ownership and dual rotation to partner credentials  
**Parent Owner:** `Gemini2`  
**Parent Reviewer:** `Gemini`  
**Sidecar Owner:** `Gemini`  
**Sidecar Reviewer:** `Gemini2`  
**Generated:** `2026-08-02` (UTC, packet rev1)  
**Snapshot anchor (parent `last_update`):** `2026-08-02T09:10:44Z`  
**Snapshot anchor (sidecar `last_update`):** `2026-08-02T10:28:19Z`  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` — support-only; does not modify canonical truth, runtime behavior, contract surface, or the parent task's implementation files.

---

## Executive Summary

This packet serves as the reviewer-facing support artifact and dependency map for `IAM-PRT-001` (Partner and Tenant Credential Governance). The parent task extends tenant API keys, partner ingress credentials, and webhook secrets with explicit ownership, scope, issuance/expiry timestamps, last-used tracking, hash-only authority, dual-key rotation overlap, and automatic old-key revocation.

This artifact pins:
1. Upstream dependencies on `IAM-ACC-001` (canonical identity authority) and `IAM-AUD-001` (append-only audit event persistence).
2. Security & governance invariants (hash-only authority, single-time plaintext delivery, fail-closed expiry, dual-rotation overlap window, cross-tenant rejection, and auditable last-used tracking).
3. The concrete acceptance walk for the designated reviewer (`Gemini`) to evaluate the implementation delivered by `Gemini2`.
4. Downstream integration boundaries for observability (`IAM-OBS-001`), tenant UI management (`IAM-UI-TEN-001`), and automated testing (`IAM-UAT-001`).

*Note on Machine Truth:* The metadata in this document reflects a snapshot taken at the generation timestamp above. `ai-status.json` remains the authoritative machine truth for live lifecycle states.

---

## 1. Scope Boundary

### In Scope for Support Sidecar
- Establishing the formal acceptance checklist for `IAM-PRT-001` mapped to `ai-status.json`.
- Mapping hard upstream dependencies (`IAM-ACC-001`, `IAM-AUD-001`, `IAM-SES-002`) and downstream consumers (`IAM-OBS-001`, `IAM-UI-TEN-001`, `IAM-UAT-001`).
- Restating security discipline rules (hash-only storage, one-time plaintext view, fail-closed evaluation, dual rotation lifecycle).
- Guiding reviewer verification across contracts, service/repository logic, database DDLs, and integration tests.

### Out of Scope for Support Sidecar
- Editing L1/L2 product specifications (`phase1_prd_detailed_v1.md`, `phase1_service_contracts_v1.md`).
- Modifying production runtime code or tests (`apps/api/src/modules/tenant-partner/`, `packages/contracts/src/`, `infra/migrations/`).
- Executing task lifecycle transitions for `IAM-PRT-001` (the parent task owner `Gemini2` owns canonical commits and handoffs).

---

## 2. Machine Truth Anchors

### 2.1 Sidecar Task — `IAM-PRT-001-SIDECAR-ACCEPTANCE`
- **ID:** `IAM-PRT-001-SIDECAR-ACCEPTANCE`
- **Title:** `Prepare IAM-PRT-001 acceptance packet and dependency map`
- **Owner:** `Gemini`
- **Reviewer:** `Gemini2`
- **Phase:** `stage1.5-identity-access-account-security-20260801`
- **Task Class:** `sidecar`
- **Helper Parent:** `IAM-PRT-001`
- **Helper Kind:** `acceptance_packet`
- **Mutates Canonical:** `false`
- **Artifacts:** `support/sidecars/IAM-PRT-001/IAM-PRT-001-SIDECAR-ACCEPTANCE.md`

### 2.2 Parent Task Snapshot — `IAM-PRT-001`
- **ID:** `IAM-PRT-001`
- **Title:** `Add expiry ownership and dual rotation to partner credentials`
- **Owner:** `Gemini2`
- **Reviewer:** `Gemini`
- **Status:** `in_progress`
- **Depends On:** `["IAM-ACC-001", "IAM-SES-002", "IAM-AUD-001"]`
- **Priority:** `P1` | **Wave:** `D` | **Workstream:** `partner-credentials`
- **Security Sensitive:** `true`
- **Planning Ref:** `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
- **Execution Ref:** `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
- **Target Artifact Paths:**
  - `apps/api/src/modules/tenant-partner/`
  - `apps/api/src/modules/webhooks/`
  - `packages/contracts/src/`
  - `infra/migrations/`
  - `tests/integration/`

### 2.3 Upstream Machine-Truth Dependencies
1. **`IAM-ACC-001` (Canonical Identity Authority)** — **Status:** `done` (`c1f02ae570e6`)
   - Provides `iam.identity_principals` and `iam.identity_memberships` (V0068 migration).
   - Establishes durable link between partner credentials/API keys and principal IDs (`issuer`/`subject`).
2. **`IAM-AUD-001` (Append-Only Security Event Audit)** — **Status:** `done` (`8713c34cde8b`)
   - Provides `admin.security_events` table (V0069 migration).
   - Emits structured security events for credential issuance, rotation, revocation, and auth failures with field masking.
3. **`IAM-SES-002` (Session & Authentication Guardrails)** — **Status:** `in_progress` / `review`
   - Defines session lifetime bounds and token validation pipeline.

---

## 3. Security & Governance Discipline Anchors

The implementation of `IAM-PRT-001` must adhere strictly to the following 7 core security discipline requirements:

1. **Hash-Only Authority**
   - Raw secrets (API keys, webhook signing secrets, ingress client secrets) must NEVER be persisted in plaintext in database tables or logs.
   - Database schemas store salted hashes (e.g. Argon2id or HMAC-SHA256 hashed secret values).
2. **Plaintext Returned Once**
   - The plaintext credential is returned exactly once in the HTTP response body of the `issue` or `rotate` action.
   - Subsequent `GET` or `list` calls return metadata only (masked secret, key ID, owner principal, scope, status, expiry, last used).
3. **Fail-Closed Expiry & Status Verification**
   - Credentials with `expired_at < NOW()`, `status != 'active'`, or `revoked_at IS NOT NULL` must immediately fail authentication (HTTP 401 Unauthorized / 403 Forbidden).
   - Clock skew drift protection must be bounded (max 5 seconds).
4. **Dual Rotation Overlap & Auto-Revoke**
   - During key rotation, a new key is issued in state `active` (or `pending_activation`) while the old key enters a grace window state `expiring_grace`.
   - Upon grace window expiration or explicit caller confirmation, the old key is set to `revoked` automatically.
5. **Named Owner & Auditability**
   - Every key must specify an `owner_principal_id` (foreign key to `iam.identity_principals`), `scope` array, `issued_at`, `expires_at`, and `last_used_at`.
   - `last_used_at` updates must be rate-throttled to prevent write contention (e.g., update at most once per 5 minutes per key).
6. **Audit Event Integration (`IAM-AUD-001`)**
   - Key operations (`credential.issued`, `credential.rotated`, `credential.revoked`, `credential.auth_failed`) emit records into `admin.security_events`.
   - IP address prefixes and user-agent hashes are masked per governance specs.
7. **Strict Scope & Cross-Tenant Isolation**
   - A tenant API key bound to `tenant_A` must fail validation if presented for resources belonging to `tenant_B`.
   - Scope checks enforce exact resource-level authorization.

---

## 4. Architectural & Dependency Map

```
                  ┌───────────────────────────────────────────────┐
                  │                IAM-ACC-001                    │
                  │   Canonical Principals & Memberships (V0068)  │
                  └───────────────────────┬───────────────────────┘
                                          │
                                          ▼
┌──────────────────────────┐    ┌─────────────────────────────────┐    ┌──────────────────────────┐
│       IAM-AUD-001        │───►│           IAM-PRT-001           │◄───│       IAM-SES-002        │
│ Security Events (V0069)  │    │ Partner & Tenant Credentials    │    │ Session & Auth Pipeline  │
└──────────────────────────┘    └────────────────┬────────────────┘    └──────────────────────────┘
                                                 │
                  ┌──────────────────────────────┼──────────────────────────────┐
                  ▼                              ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│       IAM-OBS-001        │   │      IAM-UI-TEN-001       │   │       IAM-UAT-001        │
│ Dormant/Expiry Alerts    │   │ Tenant Key Lifecycle UI  │   │ Auth Negative Test Suite │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

---

## 5. Reviewer Acceptance Walk

The reviewer (`Gemini`) should walk through the following 5 acceptance criteria against the pull request / commit delivered by `Gemini2`:

| # | Acceptance Criterion | Verification Method / Location | Key Invariants to Check |
|---|----------------------|--------------------------------|-------------------------|
| **1** | **Plaintext credential returned once** | Check `issueTenantApiKey` / `issuePartnerIngressCredential` / `rotate` controller & service responses. | Plaintext key is in response payload of issue/rotate ONLY. Read/list APIs return `key_id`, `masked_key` (e.g. `pk_live_...a8f2`), `expires_at`, but NO raw key/hash. |
| **2** | **Expired, revoked, and wrong-entry credentials fail closed** | Check credential authentication middleware / guard logic in `apps/api/src/modules/tenant-partner/`. | Requests with expired timestamp, revoked status, or invalid signature return `401 Unauthorized` / `403 Forbidden` with stable IAM error codes (`CREDENTIAL_EXPIRED`, `CREDENTIAL_REVOKED`, `CREDENTIAL_INVALID`). |
| **3** | **Dual rotation overlap and old-key auto revoke work** | Review `rotateTenantApiKey` service methods and background expiration triggers. | Rotation creates Key B (`active`) and sets Key A to `expiring_grace` (with grace window e.g. 24h). Once grace expires or auto-revoke triggers, Key A becomes `revoked`. |
| **4** | **Owner, last-used, and expiry are auditable** | Inspect DB schema migration (`infra/migrations/`) & audit log calls (`admin.security_events`). | `owner_principal_id`, `expires_at`, `last_used_at` columns exist. Issuance/rotation/revocation emit security events via `IAM-AUD-001` integration. |
| **5** | **Cross-tenant and dormant-use tests pass** | Inspect `tests/integration/` test suites. | Integration tests verify: (a) Key from Tenant A rejected on Tenant B endpoints; (b) Dormant key usage triggers warning audit log/alert hook. |

---

## 6. Commit-Evidence Hazard & Delivery Compliance

As specified in `AI_COLLABORATION_GUIDE.md` §0.6 & §5:

1. **Task-Scoped Commit:** The parent task `IAM-PRT-001` implementation must be committed under a task-scoped commit with mandatory trailers:
   ```text
   feat(IAM-PRT-001): add expiry ownership and dual rotation to partner credentials

   LLM-Agent: Gemini2
   Task-ID: IAM-PRT-001
   Reviewer: Gemini
   ```
2. **Push & Integration Record:** The commit must be pushed to the remote branch (`origin/gemini/iam-prt-001...` or `origin/dev`) with non-force push, and recorded using:
   ```bash
   AI_NAME=Gemini2 COMMIT_HASH=<sha> COMMIT_SUBJECT="..." PUSH_REMOTE=origin PUSH_BRANCH=<branch> INTEGRATION_STATUS=branch_pushed scripts/ai-status.sh handoff IAM-PRT-001 Gemini "Ready for review"
   ```
3. **No Uncommitted Diffs:** All modified files (`apps/api/`, `packages/contracts/`, `infra/migrations/`, `tests/`) must be tracked and committed before handing off to the reviewer.

---

## 7. Reviewer Handoff & Approval Workflow

When `Gemini2` hands off `IAM-PRT-001` for review:

1. **Reviewer Action (`Gemini`):**
   - Verify git commit hash and pushed branch.
   - Run integration tests (`pnpm --filter @drts/api test`).
   - Execute the 5-point acceptance walk in §5.
   - If approved, execute:
     ```bash
     AI_NAME=Gemini REVIEW_NOTES_ZH="審查通過||金鑰生命週期、雙軌旋轉與審跡追蹤驗證符合規範" scripts/ai-status.sh approve IAM-PRT-001 "Review approved"
     ```
   - If changes are needed, execute:
     ```bash
     AI_NAME=Gemini scripts/ai-status.sh reopen IAM-PRT-001 "Requested changes: <reason>"
     ```

2. **Sidecar Closeout (`IAM-PRT-001-SIDECAR-ACCEPTANCE`):**
   - Hand off this sidecar packet to reviewer `Gemini2`:
     ```bash
     AI_NAME=Gemini NO_COMMIT_REQUIRED=1 INTEGRATION_STATUS=not_applicable scripts/ai-status.sh handoff IAM-PRT-001-SIDECAR-ACCEPTANCE Gemini2 "Prepared acceptance packet support artifact"
     ```
