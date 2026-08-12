# IAM Security Alert Response & Incident Operations Runbook

Task: `IAM-OBS-001`  
Planning Reference: `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`  
Execution Reference: `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`  

## 1. Overview & Operational Principles

This runbook defines the triage, containment, escalation, and post-incident recovery procedures for all IAM security alerts and telemetry signals emitted by the `drts-fleet-platform`.

### Core Principles
1. **Machine Truth & Audit Integrity First**: Never bypass or silence an alert without logging machine-truth audit evidence. If the audit logging pipeline fails on a privileged write, the system fails closed (blocks write).
2. **Zero PII in Metric Labels**: Metric labels contain only low-cardinality, safe labels (`event_type`, `outcome`, `severity`, `realm`, `change_type`, `action`). PII (emails, IPs, tokens) is scrubbed or hashed before logging.
3. **Automated Containment & Incident Response SLAs**:
   - `P1 Critical` (Refresh reuse, Audit pipeline failure): Response SLA < 15 minutes.
   - `P2 High` (Break-glass activation, Unapproved privilege change, Cross-tenant spike): Response SLA < 30 minutes.
   - `P3 Warning` (Auth brute-force, Dormant credential activation, IdP drift, Expiring credential): Response SLA < 4 hours.

---

## 2. Alert Signal & Playbook Catalog

### 1. `IAMRefreshTokenReuseDetected`

- **Metric**: `drts_iam_refresh_token_reuse_total`
- **Severity**: `P1 Critical`
- **Owner**: Security Ops On-Call
- **Route Channel**: `security-pager-p1`
- **Trigger**: Attempt to use an already rotated/revoked refresh token family (`>= 1` in 1 minute).
- **Triage & Response Steps**:
  1. Inspect `admin.security_events` for `eventType="driver_device_session.revoked"` or `refresh_token_reuse` audit logs.
  2. Identify the compromised session family ID (`sessionId`) and principal (`subjectIdHash`).
  3. Execute automated session family revocation:
     ```bash
     pnpm --filter api exec ts-node scripts/security-ops/revoke-session-family.ts --session-id <SESSION_ID> --reason "Refresh token reuse alert response"
     ```
  4. Verify that all child access tokens and refresh tokens in the family return HTTP `401 Unauthorized`.
  5. Check source IP prefix and user agent hash for brute-force or token theft patterns across other accounts.

---

### 2. `IAMAuditPipelineFailureBlocked`

- **Metric**: `drts_iam_audit_pipeline_failures_total{outcome="write_blocked"}`
- **Severity**: `P1 Critical`
- **Owner**: SRE & Security On-Call
- **Route Channel**: `security-pager-p1`
- **Trigger**: Database or persistence failure during a privileged security event audit append (`>= 1` in 1 minute).
- **Triage & Response Steps**:
  1. Confirm that fail-closed protection successfully blocked the privileged mutation (`AuditPipelineException` thrown).
  2. Inspect API & PostgreSQL database health logs:
     ```bash
     python3 scripts/ai_status.py get-task IAM-OBS-001
     docker logs drts-postgres-audit --tail 100
     ```
  3. Check disk space, database connection pool, and table lock status on `admin.security_events`.
  4. Once DB connectivity is restored, verify that standard writes resume and metrics clear.
  5. Do NOT bypass fail-closed protection or disable audit verification in production.

---

### 3. `IAMBreakGlassActivated`

- **Metric**: `drts_iam_break_glass_total{action="activated"}`
- **Severity**: `P2 High`
- **Owner**: Security Lead & Incident Commander
- **Route Channel**: `security-pager-p1`
- **Trigger**: Activation of an emergency short-lived break-glass administrative session (`>= 1` in 1 minute).
- **Triage & Response Steps**:
  1. Verify the requester and approver identity (must be distinct physical actors).
  2. Confirm break-glass approval ticket ID (`approvalId`) and reason code.
  3. Monitor active break-glass session duration (max 60 minutes, no refresh allowed).
  4. Verify that UI emergency banner is displayed for all requests carrying `breakGlassGrantId`.
  5. Initiate post-use review within 24 hours to determine if credential rotation or incident escalation is required.

---

### 4. `IAMCrossTenantAbuseSpike`

- **Metric**: `drts_iam_cross_tenant_attempts_total`
- **Severity**: `P2 High`
- **Owner**: Security Ops On-Call
- **Route Channel**: `security-oncall`
- **Trigger**: `>= 3` cross-tenant or wrong realm authorization denials within 5 minutes.
- **Triage & Response Steps**:
  1. Query `admin.security_events` where `eventType="authz.denied"` or `tenant_bootstrap_session.denied`.
  2. Verify if the source actor is attempting tenant ID enumeration or cross-realm parameter tampering.
  3. Isolate the offending session and apply IP prefix throttling.
  4. Verify that zero cross-tenant data was exposed in API responses.

---

### 5. `IAMUnapprovedPrivilegedChange`

- **Metric**: `drts_iam_privileged_changes_total{outcome="unapproved_drill"}`
- **Severity**: `P2 High`
- **Owner**: Platform Security Owner
- **Route Channel**: `security-platform-owner`
- **Trigger**: Privileged role assignment or API key issuance/rotation without valid approval metadata or exceeding rate threshold (`>5` in 1 hour).
- **Triage & Response Steps**:
  1. Query audit log for recent `tenant_user.role_updated`, `tenant_api_key.issued`, or `tenant_api_key.rotated` events.
  2. Validate SoD (Segregation of Duties) rules and approval chain.
  3. If unapproved or unauthorized, immediately revoke the granted role or API key:
     ```bash
     pnpm --filter api exec ts-node scripts/security-ops/revoke-api-key.ts --key-id <KEY_ID>
     ```
  4. File incident report and initiate access review drill.

---

### 6. `IAMAuthBruteForceSpike`

- **Metric**: `drts_iam_auth_abuse_total`
- **Severity**: `P3 Warning`
- **Owner**: Security Ops
- **Route Channel**: `security-oncall`
- **Trigger**: `> 10` failed login or invitation abuse attempts within 5 minutes.
- **Triage & Response Steps**:
  1. Check rate-limiter and throttler counters on `/auth/token` and `/tenant/users/invite`.
  2. Confirm that account existence is NOT leaked in HTTP responses.
  3. Adjust IP prefix throttling threshold if automated botnet activity is detected.

---

### 7. `IAMCredentialExpiringSoon`

- **Metric**: `drts_iam_credential_expiry_warnings_total`
- **Severity**: `P3 Warning`
- **Owner**: Credential Owner & Ops
- **Route Channel**: `ops-ticket`
- **Trigger**: Tenant API key, partner key, or signing key within 30/14/7/1 days of expiration.
- **Triage & Response Steps**:
  1. Notify the recorded credential owner team (`security`, `platform`, or `tenant_admin`).
  2. Initiate dual-key rotation workflow prior to hard expiry.
  3. Verify old key is retired automatically upon expiry.

---

### 8. `IAMDormantCredentialUsed`

- **Metric**: `drts_iam_dormant_credential_usage_total`
- **Severity**: `P3 Warning`
- **Owner**: Security Ops
- **Route Channel**: `security-oncall`
- **Trigger**: Sudden activity on a credential or user account inactive for >30 days.
- **Triage & Response Steps**:
  1. Contact account owner to verify legitimate reactivation.
  2. Enforce step-up MFA challenge before allowing sensitive operations.
  3. Audit recent activity for suspicious access patterns.

---

### 9. `IAMIdPGroupDriftDetected`

- **Metric**: `drts_iam_idp_drift_total`
- **Severity**: `P3 Warning`
- **Owner**: IAM Security Engineering
- **Route Channel**: `iam-team`
- **Trigger**: Mismatch detected between Cloud IAP assertion groups and durable role mappings.
- **Triage & Response Steps**:
  1. Verify least-privilege fallback state was automatically applied.
  2. Sync Google Workspace / IAP Group definitions with durable platform role bindings.
  3. Re-run IAP subject resolution verification test.

---

## 3. Drills & Verification Playbook

To simulate and test alert signals in staging or CI test environment, use `IamObservabilityService.runDrill`:

```ts
import { iamObservabilityService } from "./observability";

// 1. Refresh Token Reuse Alert Drill
iamObservabilityService.runDrill("refresh_reuse");

// 2. Privileged Change Alert Drill
iamObservabilityService.runDrill("privileged_change");

// 3. Audit Pipeline Failure Drill
iamObservabilityService.runDrill("audit_failure");
```

Verification evidence is logged to `support/sidecars/IAM-OBS-001/IAM-OBS-001-FINAL-EVIDENCE.md`.
