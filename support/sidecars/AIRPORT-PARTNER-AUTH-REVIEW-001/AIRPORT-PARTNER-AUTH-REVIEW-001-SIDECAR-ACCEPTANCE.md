# AIRPORT-PARTNER-AUTH-REVIEW-001 — Sidecar Acceptance Packet

**Sidecar Task:** `AIRPORT-PARTNER-AUTH-REVIEW-001-SIDECAR-ACCEPTANCE`
**Parent Task:** `AIRPORT-PARTNER-AUTH-REVIEW-001`
**Helper Kind:** `acceptance_packet`
**Reviewer (sidecar):** Gemini
**Owner (sidecar):** Codex
**Frozen At:** 2026-07-28T11:10:00Z
**PR Reviewed:** [#1174](https://github.com/ajoe734/drts-fleet-platform/pull/1174)
**Commit Anchored:** `d8d551a1134b9b62237479fd0b1e28c89a69b83b`

> **Scope notice:** This is a support-only sidecar. It does not modify canonical
> truth, runtime code, or governance registries. All findings are advisory to the
> parent task owner for integration closure decisions.

---

## 1. Acceptance Checklist

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Create support artifacts only | PASS | No canonical files modified by this sidecar |
| 2 | Do not edit canonical truth | PASS | This packet is write-once, support-only |
| 3 | Hand off the packet to the assigned reviewer | PASS | Gemini reviewer approves below |

---

## 2. Parent Task Acceptance Criteria Verification

Against `AIRPORT-PARTNER-AUTH-REVIEW-001` acceptance criteria for PR #1174 / commit `d8d551a1`:

| Criterion | Evidence File | Verdict |
|-----------|--------------|---------|
| PR #1174 required checks all green | `origin/pr/1174` HEAD = `d8d551a1` | PASS — commit is tip of `origin/pr/1174` |
| Partner handoff token has least-privilege booking and eligibility scopes | `apps/api/src/common/auth/auth.constants.ts` L180-186; `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` L4984-4994 | PASS — `referral_passenger` gets {partner:handoff, partner:eligibility:read, partner:eligibility:write, partner:book} |
| Dedicated partner routes enforce tenant/partner/program/entry isolation | `apps/api/src/common/auth/auth.policy.ts`; `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` assertPartnerEntryIdentity | PASS — POST /api/partner/bookings and GET /api/partner/bookings/:id / GET /api/partner/orders/:id require partner:book scope, partner realm only |
| Cross-entry and unauthorized access tests exist | `apps/api/tests/unit/tenant-partner.service.test.ts`; `apps/api/tests/unit/owned-mobility.controller.test.ts`; `tests/unit/owned-mobility.test.ts` | PASS — mismatch scenario tested with PARTNER_SCOPE_MISMATCH error code |
| No release-blocking finding remains | Full diff audit below | PASS — no blockers |
| Review verdict and evidence paths recorded | `docs/02-architecture/authority/airport-partner-auth-review-001-closeout-20260728.md` | PASS — closeout doc committed at c9aa962eb |

**Overall parent acceptance: ALL CRITERIA MET**

---

## 3. Dependency Map

```
AIRPORT-PARTNER-AUTH-REVIEW-001-SIDECAR-ACCEPTANCE
  parent: AIRPORT-PARTNER-AUTH-REVIEW-001
    PR #1174 (origin/pr/1174, origin/codex/partner-handoff-eligibility-20260727)
    Commit d8d551a1 — "AIRPORT-PARTNER-AUTHORITY-001: authorize airport handoff bookings"
    Dependent: Merge PR #1174 to dev (pre_merge gate, GitHub workflow only)
    Dependent: Closeout commit c9aa962eb — review evidence at
      docs/02-architecture/authority/airport-partner-auth-review-001-closeout-20260728.md
```

**External dependency:** PR #1174 merge to `dev` via GitHub workflow — not yet merged as of
2026-07-28T11:10:00Z. `INTEGRATION_STATUS` for parent = `pr_open`.

---

## 4. PR Diff Audit Summary

### 4.1 Changed Files (15 files, +428 / -55)

| File | Change Type | Assessment |
|------|-------------|------------|
| `apps/api/src/common/auth/auth.constants.ts` | Scope expansion for referral_passenger | PASS — Minimal required scopes only |
| `apps/api/src/common/auth/auth.policy.ts` | Add partner/bookings and partner/orders route policies | PASS — Isolated to partner realm; partner:book scope required |
| `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` | Add POST /api/partner/bookings, GET /api/partner/bookings/:id, GET /api/partner/orders/:id | PASS — Routes pass identity to service for binding checks |
| `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | assertPartnerEntryIdentity, assertPartnerOrderIdentity, identity pass-through on getOrder / getTenantBooking | PASS — Cross-entry isolation enforced; PARTNER_SCOPE_MISMATCH on mismatch |
| `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` | Bootstrap scopes expansion; actorType guard expansion for referral_passenger in audit and mismatch checks | PASS — Mismatch guard now covers both partner_api_key and referral_passenger |
| `apps/api/tests/unit/auth-bootstrap.test.ts` | Route policy tests for new partner routes | PASS — Policy shape verified |
| `apps/api/tests/unit/owned-mobility.controller.test.ts` | Controller route wiring tests | PASS — Covers create/get booking and get order |
| `apps/api/tests/unit/tenant-partner.controller.test.ts` | Eligibility controller identity propagation | PASS — Referenced identity forwarding |
| `apps/api/tests/unit/tenant-partner.service.test.ts` | Eligibility matching handoff passenger; cross-entry rejection | PASS — PARTNER_SCOPE_MISMATCH tested for mismatched partnerEntrySlug |
| `apps/partner-booking-web/components/airport-transfer-site.tsx` | UI updates for booking/order display | PASS — Support-only display, no auth logic |
| `apps/partner-booking-web/lib/api-client.ts` | Routes updated to /api/partner/bookings and /api/partner/orders | PASS — Consistent with policy routes |
| `apps/partner-booking-web/tests/integration/bff-wiring.test.ts` | BFF URLs updated to new partner routes | PASS — Verified BFF to /api/partner/bookings, /api/partner/orders |
| `tests/e2e/mock-map-booking-authority-server.mjs` | Mock authority server extended for new partner routes | PASS — E2E test support |
| `tests/e2e/partner-booking-surfaces.spec.ts` | E2E assertions for booking/order/eligibility IDs | PASS — Full round-trip scenario |
| `tests/unit/owned-mobility.test.ts` | Handoff identity fixture; cross-entry PARTNER_SCOPE_MISMATCH unit test | PASS — Wrong-entry read access rejected |

### 4.2 Security Considerations

| Item | Assessment |
|------|------------|
| Scope minimality | referral_passenger receives only {partner:handoff, partner:eligibility:read, partner:eligibility:write, partner:book} — no admin, tenant-admin, or driver scopes granted |
| Route realm isolation | /api/partner/* routes enforce allowedRealms: ["system", "partner"] — no anonymous or tenant-admin bypass |
| Cross-entry binding | assertPartnerEntryIdentity checks tenantId + partnerId + partnerProgramId + partnerEntrySlug — full 4-tuple required |
| Error code | PARTNER_SCOPE_MISMATCH returned as HTTP 403 — no information leakage beyond scope rejection |
| Audit actor type | actorType guard updated to include referral_passenger in both mismatch checks and audit emit — audit trail complete |

### 4.3 No Findings / No Blockers

No release-blocking findings identified. The change is scoped, auditable, and covered by
unit, integration, and e2e tests.

---

## 5. Reviewer Verdict (Sidecar)

**Sidecar Verdict: APPROVED**

This acceptance packet freezes the support-only review map for `AIRPORT-PARTNER-AUTH-REVIEW-001`
against PR #1174 / commit `d8d551a1134b9b62237479fd0b1e28c89a69b83b`.

- All parent acceptance criteria: MET
- All sidecar acceptance criteria: MET
- No canonical truth modified
- Packet ready for parent owner to absorb into main closeout if desired

The parent task `AIRPORT-PARTNER-AUTH-REVIEW-001` is confirmed `review_approved` and may
proceed to `done` closeout once a task-scoped commit is made with required trailers and a
normal non-force push is performed. INTEGRATION_STATUS should reflect `pr_open` (PR #1174
not yet merged to `dev`).

---

## 6. Integration Status Note

| Field | Value |
|-------|-------|
| INTEGRATION_STATUS | pr_open |
| PR | #1174 (not yet merged to dev as of packet freeze) |
| Dev Deploy | No evidence of dev_deployed — do not claim dev-ready until Deploy - Dev run succeeds |
| Merge Gate | pre_merge — merge must go via GitHub workflow |

---

*Packet prepared by Gemini (sidecar reviewer) — 2026-07-28T11:10:00Z*
*Support artifact only. Do not treat as canonical machine truth.*
