# Review Round 4 — Copilot

**Reviewer:** Copilot
**Baton received:** 2026-04-17T05:05:00Z
**Focus:** Contradiction detection, UAT scenario blockers, missing gaps, scope risks

---

## UAT Cross-Check — Which Scenarios Are Blocked?

Reviewing `docs/04-uat/phase1-uat-scenarios.md` against the gap list:

### TP-020 — View webhook delivery log (lines 396-408)

**Expected:** "List of past delivery attempts with HTTP status, timestamp, payload preview.
Failed attempts clearly marked."

**Current reality (GAP-002):** `sendTestWebhook()` creates a delivery record with
`status: "queued"` and `httpStatus: 202` (hardcoded). The log exists and is readable,
but every delivery shows as "queued/202" — no real delivery outcome.

**UAT verdict:** **Partially failing.** The log UI works, but all entries show fabricated
202 status. A UAT reviewer comparing expected vs. actual would see all deliveries as
"successful" regardless of actual endpoint availability. This **misleads** UAT sign-off.

**Recommendation:** GAP-P1-003 (webhook disclaimer) is critical for UAT integrity.
Without the disclaimer, a UAT reviewer could incorrectly sign off TP-020.

### Driver App UAT Scenarios

Checking `docs/04-uat/phase1-uat-scenarios.md` for driver app sections:
No explicit driver app UAT scenarios for trip completion proof — Phase 1 UAT focuses
on tenant portal, platform admin, and ops console. Driver app is tested via e2e scripts.

E2E scripts `tests/e2e/E2E-001-enterprise-dispatch.sh` call `completeTask` without proof.
This works because demo orders have `minPhotoCount: 0`. No UAT blockage there currently.

---

## Missing Gaps (Not in Starter Draft)

### MISS-001: Platform Admin `switchboard/page.tsx` — Functionality Unknown

`apps/platform-admin-web/app/switchboard/page.tsx` was not examined. This page
could be a stub or contain real functionality. **Recommend:** Codex should inspect this
in Sprint 1 to confirm it's not a hidden gap.

### MISS-002: Tenant Portal `platform_admin` Feature Flag Page Cross-Reference

`apps/tenant-portal-web/app/` has 15 pages. The gap analysis confirmed feature flag
enforcement is UI-only. However, the tenant portal itself has a notification page
and a webhook page — the webhook page's behavior is confirmed affected by GAP-002.

### MISS-003: No Audit Log Pagination / Retention Policy

`apps/api/src/modules/audit-notification/audit-notification.service.ts` —
audit logs grow unbounded in-memory. No pagination, no retention limit, no archival.
For Phase 1 demo this is acceptable, but a long-running staging environment will leak memory.

**Severity: Low.** Add as GAP-P2S1-008 (audit log pagination + in-memory cap).

### MISS-004: No Rate Limiting / Request Throttling

The API has no `ThrottlerModule` or rate limiting. Combined with GAP-004 (no auth),
the staging endpoint is fully open to abuse.

**Severity: Medium.** Should be part of GAP-P2S1-006 scope (alongside internal key).

---

## Scope Risk Flags

### Risk-1: GAP-003 (DEMO_TENANT_ID) Larger Than All Estimates

Codex Round 1 counted 30+ occurrences in tenant-partner.service.ts.
Adding billing-settlement.service.ts, the total is ~40 sites.
The correct fix is a **per-tenant in-memory store** (Map<tenantId, ...>) throughout
both services — this is architecturally similar to BUG-001 but 3-4x larger.

**Risk:** If GAP-P2-S1 tries to fix this in one task, it will create a sprawling PR
that is hard to review and likely to introduce regressions.

**Recommendation:** Split into 3 separate tasks:

- `GAP-P2S1-009`: billing-settlement per-tenant store (1 service)
- `GAP-P2S1-010`: tenant-partner per-tenant store (1 service, larger)
- `GAP-P2S1-011`: E2E test update for multi-tenant header assertions

### Risk-2: WebSocket → SSE (Gemini Round 3 Recommendation)

Gemini's SSE recommendation for Cloud Run is correct. Confirm: GAP-P2S2-008 should
be titled "NestJS SSE endpoint for driver task events" not "WebSocket gateway."
This also simplifies frontend integration (no socket.io client library needed).

### Risk-3: Driver Profile Contracts-First Dependency

Qwen Round 2 correctly flags that GAP-P2S1-004 requires new contracts types before
implementation. The dependency chain is:

1. Codex: define `DriverProfileRecord`, `CreateDriverProfileCommand`, `UpdateDriverProfileCommand` in contracts
2. Codex: implement `driver-profile` module in API
3. Qwen: wire `apps/driver-app/app/settings.tsx` to profile API

Without explicit sequencing, Qwen and Codex could both try to implement incompatible
versions simultaneously. **Add contracts-first subtask as unblocking prerequisite.**

---

## Final Critique Summary

1. **GAP-P1-003 (webhook disclaimer) is the most important P1 hotfix** — UAT scenario
   TP-020 would produce misleading sign-off without it. All other P1 hotfixes are lower risk.

2. **GAP-003 scope is underestimated** — requires 3 separate tasks and careful
   per-tenant Map refactoring across 2 large services (~40 sites total).

3. **Cloud Run constraints** validate Gemini's SSE-over-WebSocket recommendation.
   The current WebSocket entries should all be relabeled as SSE.

4. **2 missing low-risk gaps found:** audit log memory cap (P2-S1), rate limiting (P2-S1).
   Both are straightforward NestJS additions.

5. **Driver profile contracts-first dependency** must be explicitly sequenced to
   avoid parallel implementation conflicts between Codex and Qwen.

**Passing baton to Claude for final arbitration and consensus-packet.**
