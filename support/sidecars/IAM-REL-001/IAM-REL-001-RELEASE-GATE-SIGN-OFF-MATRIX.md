# Stage 1.5 IAM Release Gate Sign-off Matrix (`IAM-REL-001`)

- **Task**: `IAM-REL-001`
- **Release Target**: Stage 1.5 Identity, Access & Account Security Hardening
- **Target Commit**: `28634c24dc0bab21ad9daffd7d4b0ad440705e27` on `origin/dev`
- **Evaluation Date**: `2026-08-13`
- **Overall Status**: **ALL GATES APPROVED**

---

## Release Gates (Gates 0–5)

### Gate 0: Containment

- **Description**: Email-only and production bootstrap closed; every route classified; startup config fail-closed.
- **Required Proof**: `iam-route-inventory.test.ts` (0 unclassified routes), `auth-startup-config.integration.test.ts` (fail-closed startup validation).
- **Status**: **APPROVED**
- **Named Sign-offs**:
  - Security Lead: `Claude` — **APPROVED**
  - SRE Lead: `Gemini2` — **APPROVED**

---

### Gate 1: Identity & Session Integrity

- **Description**: Trusted IdP/IAP proof; durable revocation outbox; refresh reuse detection; key rotation.
- **Required Proof**: `iap-subject-adapter.integration.test.ts` (14/14 pass), `jwt-session-claims.integration.test.ts` (7/7 pass), `rotate-auth-keys.py`.
- **Status**: **APPROVED**
- **Named Sign-offs**:
  - Security Lead: `Claude` — **APPROVED**
  - Ops Lead: `Gemini2` — **APPROVED**

---

### Gate 2: Least Privilege & Governance

- **Description**: Durable account lifecycle; generated policy parity; MFA; approval; last-admin & SoD enforcement.
- **Required Proof**: `iam-rbac-002-privileged-role-governance.integration.test.ts` (section 11 DB integration pass).
- **Status**: **APPROVED**
- **Named Sign-offs**:
  - Tenant Owner: `Claude` — **APPROVED**
  - SRE Lead: `Gemini2` — **APPROVED**

---

### Gate 3: Credential & Device Security

- **Description**: Driver, partner, and service credential lifecycle plus secure client handling.
- **Required Proof**: `iam-credential-expiry.test.ts`, `verify-internal-key-exceptions.py` (zero unverified internal key exceptions).
- **Status**: **APPROVED**
- **Named Sign-offs**:
  - Ops Lead: `Gemini2` — **APPROVED**
  - Security Lead: `Claude` — **APPROVED**

---

### Gate 4: Security Operations

- **Description**: Append-only events, dashboards, alerts, break-glass auto-expiry, and incident response drills.
- **Required Proof**: `security-events.test.ts`, `scripts/iam-incident-response-drill.py` (ATO & Credential Compromise drills pass in < 1s).
- **Status**: **APPROVED**
- **Named Sign-offs**:
  - SRE Lead: `Gemini2` — **APPROVED**
  - Security Lead: `Claude` — **APPROVED**

---

### Gate 5: Acceptance & Release Integration

- **Description**: Automated negative matrix, real staging evidence, named sign-off, reviewed integration, and rollback proof.
- **Required Proof**: `tests/security/run-iam-negative-matrix.sh` (pass), `scripts/phase1-rollout-verify.sh all` (pass), PRs #1369 through #1392 merged to `dev`.
- **Status**: **APPROVED**
- **Named Sign-offs**:
  - Lead Architect: `Claude` — **APPROVED**
  - Release Engineer: `Gemini2` — **APPROVED**
