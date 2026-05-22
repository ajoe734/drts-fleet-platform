# PH1GC-PARTNER-001 SIDECAR ACCEPTANCE PACKET

- **Task ID:** PH1GC-PARTNER-001-SIDECAR-ACCEPTANCE
- **Status:** In Progress
- **Author:** Gemini2
- **Reviewer:** Codex2
- **Date:** 2026-05-22

## 1. Acceptance Checklist

- [x] Dependency Map drafted
- [x] Support Artifacts verified
- [x] No changes to canonical truth
- [ ] Handed off to reviewer

## 2. Dependency Map

### Backend Governance
- **Source:** `.ai-loop-outgoing/BACKEND_DELIVERY_NOTE.md`
- **Context:** Tenant Governance endpoints for booking, quotas, and approvals.
- **Contract Version:** `@drts/contracts@0.1.0` and `@drts/api-client@0.1.0`

### Contracts & Locks
- **Canonical Lock:** `.ai-loop-outgoing/contract-lock.json`
- **Version Lock:** `.ai-loop-outgoing/CONTRACT_VERSION.lock`

### Error Handling
- **Canonical Codes:**
  - `BOOKING_COST_CENTER_INVALID`
  - `BOOKING_COST_CENTER_UNKNOWN`
  - `BOOKING_COST_CENTER_DISABLED`
  - `QUOTA_INSUFFICIENT_AT_COMMIT`
  - `BOOKING_APPROVAL_PENDING`

## 3. Support Artifacts

- `BACKEND_DELIVERY_NOTE.md`: Defines backend-owned tenant governance, booking flow, and error codes.
- `contract-lock.json`: Authoritative lock for contract compatibility.
- `CONTRACT_VERSION.lock`: Compatibility mirror.

---
*Disclaimer: This is a support artifact for sidecar acceptance.*
