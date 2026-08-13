# IAM-IR-001 Incident Response Drill Evidence Report

Task: `IAM-IR-001`  
Phase: `stage1.5-identity-access-account-security-20260801`  
Execution Date: `2026-08-13T09:56:25.505758+00:00`  
Execution Mode: `tabletop_harness / rotate-auth-keys tool integrated`

---

## 1. Drill Execution Summary

| Drill Scenario | Target Principal / Credential | Session / Key Revocation SLA | Total Drill Time | Legal Hold Evidence Checksum | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Account Takeover (ATO)** | `usr_tenant_admin_001` | `0.4408s` (<60s) | `0.4412s` | `dd85694b07441439...` | **PASS** |
| **Credential Compromise** | `cred_partner_booking_001` | `0.7210s` (<60s) | `0.7212s` | `b65c01239e3b1e26...` | **PASS** |

---

## 2. Acceptance Criteria Matrix Verification

- [x] **Runbooks name commands, owners, evidence, and escalation**:
  - `docs/03-runbooks/account-takeover.md` and `docs/03-runbooks/credential-compromise.md` published.
- [x] **Staging revoke and rotation drills complete**:
  - Executed via `scripts/iam-incident-response-drill.py`. Verified remote session revocation, staging endpoint probe, and `scripts/rotate-auth-keys.py` key ring rotation.
- [x] **Evidence preservation and legal hold paths are defined**:
  - Append-only sidecar manifest created at `support/sidecars/IAM-IR-001/evidence_preservation_manifest.json` with verified file-level SHA-256 checksums matching on-disk bytes.
- [x] **Recovery does not weaken guards**:
  - Unauthenticated resets fail closed; replacement credentials enforce 90-day expiry and narrow scope presets.
- [x] **Residual risks and response times are recorded**:
  - Recorded in runbooks and drill evidence manifests.

---

## 3. Sidecar Artifact Inventory

- Manifest: [`evidence_preservation_manifest.json`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-uat-002/support/sidecars/IAM-IR-001/evidence_preservation_manifest.json)
- ATO Log: [`account_takeover_drill_log.json`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-uat-002/support/sidecars/IAM-IR-001/account_takeover_drill_log.json)
- Credential Compromise Log: [`credential_compromise_drill_log.json`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-iam-uat-002/support/sidecars/IAM-IR-001/credential_compromise_drill_log.json)
