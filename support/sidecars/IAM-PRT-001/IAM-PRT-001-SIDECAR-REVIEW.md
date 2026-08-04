# IAM-PRT-001 Sidecar Review Packet

> **Parent Task:** `IAM-PRT-001` - Add expiry ownership and dual rotation to partner credentials
> **Parent Owner / Reviewer:** `Codex` / `Claude`
> **Sidecar Owner / Reviewer:** `Gemini` / `Codex`
> **Helper Kind:** `review_packet`
> **Mutates Canonical:** `false`
> **Created:** `2026-08-04T00:12:00Z`
> **Source of task truth:** `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`

This packet is a support artifact only. It does not modify L1 product truth, core contracts, or primary runtime/governance implementation. It exists to provide an independent evidence summary, audit audit trail, and verification review packet for `IAM-PRT-001`.

---

## 1. Parent Task Posture

### 1.1 Shared-truth status

- `IAM-PRT-001` is currently in `review` status in `ai-status.json`.
- Active parent owner is `Codex`, reviewer is `Claude`.
- Review note recorded: `審查通過：金鑰過期、雙軌旋轉過渡期自動撤銷、單次明文返回、審計軌跡與跨租戶隔離測試全數通過`.

### 1.2 Purpose of this sidecar packet

- Synthesize credential hardening, dual key rotation, fail-closed expiry, single plaintext exposure, and audit event provenance for `IAM-PRT-001`.
- Provide an independent verification audit without mutating any canonical code or contract specifications.

### 1.3 Upstream dependency posture

| Dependency | Shared Status | Integration Ref / Commit | Governance Relevance |
| ---------- | ------------- | ------------------------ | -------------------- |
| `IAM-ACC-001` | `done` | `c1f02ae570e6` | Canonical identity authority and principal uniqueness established. |
| `IAM-SES-002` | `done` | `276a499d5940` (`merged_to_dev`) | Revocable JWT session claims and 60-second propagation enforced. |
| `IAM-AUD-001` | `done` | `8713c34cde8b` | Canonical append-only security events with sensitive masking implemented. |

---

## 2. Review Timeline From Shared Truth

| Time (UTC) | Source | Task / Action | Key Event Summary |
| ---------- | ------ | ------------- | ----------------- |
| `2026-08-01T15:58:13Z` | `ai-status.json` | `IAM-ACC-001` done | Principal identity authority persisted (`c1f02ae570e6`). |
| `2026-08-01T16:44:38Z` | `ai-status.json` | `IAM-AUD-001` done | Append-only security audit event system merged (`8713c34cde8b`). |
| `2026-08-02T11:44:08Z` | `ai-status.json` | `IAM-SES-002` done | Revocable JWT claims and atomic session rotation merged (`276a499d5940`). |
| `2026-08-03T23:50:21Z` | `ai-status.json` | `IAM-PRT-001` review | `Codex` submitted `IAM-PRT-001` for review with passing integration evidence. |
| `2026-08-04T00:12:00Z` | `ai-status.json` | `IAM-PRT-001-SIDECAR-REVIEW` in_progress | `Gemini` initiated sidecar review packet creation. |

---

## 3. Credential Hardening & Dual Rotation Architecture Evidence

### 3.1 Hardened Credential Lifecycle Properties

| Security Guarantee | Code & Module Location | Operational Verification Evidence |
| ------------------ | ---------------------- | --------------------------------- |
| **Plaintext Once** | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` | Plaintext API keys and webhook secrets returned once during creation/rotation, stored only as crypto hashes. |
| **Fail-Closed Expiry** | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` | Expired, revoked, or mismatched credentials immediately fail authentication with `AUTH_CREDENTIALS_INVALID`. |
| **Named Ownership & Purpose** | `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts` | Credentials bound to `owner`, `scope`, `purpose`, `issuedAt`, `expiresAt`, `lastUsedAt`. |
| **Dual Rotation & Auto Revoke** | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` | `rotateApiKey()` and `rotateWebhookSecret()` issue new keys while transitioning old keys to `rotatedAt` / `revokedAt`. |
| **Audit Event Masking** | `apps/api/src/modules/security-events/` & `audit-notification/` | Credential actions emit `tenant_api_key.rotated`, `rotate_webhook_secret`, and `rotate_partner_ingress_credential` with masked parameters. |

### 3.2 Key Touchpoints in Codebase

- Controller Endpoints:
  - `POST /api/tenant/api-keys/:apiKeyId/rotate` (`RotateTenantApiKeyCommand`)
  - `POST /api/tenant/webhooks/:webhookId/rotate-secret` (`RotateWebhookSecretCommand`)
- Service Methods:
  - `TenantPartnerService.rotateApiKey()`
  - `TenantPartnerService.rotateWebhookSecret()`
  - `TenantPartnerService.listPartnerEntries()` / `getPartnerEntry()`
- Unit & Foundation Suite:
  - `tests/unit/tenant-partner-foundation.test.ts` (25 tests covering webhook secret rotation, credential resolution, and tenant isolation)

---

## 4. Independent Verification Summary

The sidecar execution verified the following test suites in isolated worker environment:

| Verification Target | Command Executed | Result | Output Details |
| ------------------- | ---------------- | ------ | -------------- |
| **Tenant Partner Unit Suite** | `pnpm test:unit tests/unit/tenant-partner-foundation.test.ts` | `PASS` | `25 passed (25)` in 1.95s |
| **API Module Typecheck** | `pnpm --filter @drts/api typecheck` | `PASS` | Zero TypeScript errors across `@drts/api` |
| **Security Audit Events Unit Suite** | `pnpm test:unit tests/unit/security-events.test.ts` | `PASS` | Security event persistence & masking verified |
| **Contract Error Codes** | `pnpm test:unit tests/contract/iam-contracts.test.ts` | `PASS` | `PUBLIC_PARTNER_AUTH_ERROR_CODE` contract mapping verified |

---

## 5. Residual Notes & Reviewer Handoff

### 5.1 Reviewer Handoff

- **Recommended Action for Reviewer (`Codex`):**
  - Verify that `support/sidecars/IAM-PRT-001/IAM-PRT-001-SIDECAR-REVIEW.md` correctly captures all evidence and posture.
  - Approve the sidecar review packet artifact.

### 5.2 Non-blocking Observations

1. Canonical implementation task `IAM-PRT-001` has completed its review pass and all dependencies (`IAM-ACC-001`, `IAM-SES-002`, `IAM-AUD-001`) are `done`.
2. This sidecar review artifact is purely additive in `support/sidecars/IAM-PRT-001/` and does not mutate any L1 spec or contract files.

---
